// lib/apiAuth.js
// Server-side validation of a Microsoft Entra ID (Azure AD) token for API routes.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// MSAL gates the PAGE, in the browser. Nothing gated the API underneath: the
// route paths are predictable, the repo is public, and `curl` does not run
// JavaScript. pages/api/audit-log.js already documents this gap in its header
// comment. This module closes it for the routes it wraps.
//
// WHY THE ID TOKEN, NOT AN ACCESS TOKEN
// -------------------------------------
// The textbook answer is: expose an API scope on the app registration and have
// the SPA request an access token for it. That requires changing the Azure app
// registration, which CLAUDE.md places out of scope ("NEVER do autonomously:
// Change Azure app registration").
//
// Without that change, the only token whose audience is *this application* is
// the ID token — `aud` equals our client ID, `iss` is our tenant's v2.0 issuer,
// and `tid` is our tenant. The Graph access token MSAL gets from
// `loginRedirect({scopes:['User.Read']})` is audienced to Microsoft Graph and
// must NOT be accepted here; a resource that accepts tokens minted for a
// different audience is the classic confused-deputy bug.
//
// So this validates ID tokens, cryptographically and completely. That is a real
// control — an attacker cannot mint one without authenticating against our
// single-tenant app registration — but it is not the final form. Using ID tokens
// as API credentials is a documented compromise, not a best practice; the proper
// fix is an app-registration API scope, and it is called out in the PR.
//
// NO NEW DEPENDENCIES
// -------------------
// RS256 verification runs on the WebCrypto API built into Node 18+ (and the
// Vercel Node runtime). No `jose`, no `jsonwebtoken`, no `jwks-rsa` — which also
// means no npm-package approval is needed under CLAUDE.md Hard Rule 6.

// Explicit .js extension (the rest of the repo omits it) so this module can be
// imported by plain `node` in scripts/test-api-auth.js as well as by webpack.
// Next resolves either form; Node's ESM loader only resolves this one.
import { MSAL_CONFIG } from './msal.js'

// Identifiers, not secrets — these are already public in the client bundle.
// Env vars win so a different tenant/app can be pointed at without a code change.
const TENANT_ID = process.env.NEXT_PUBLIC_AZURE_TENANT_ID || MSAL_CONFIG.tenantId
const CLIENT_ID = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || MSAL_CONFIG.clientId

// Optional defence in depth. Tenant membership is the real control; this narrows
// further to named domains if set, e.g. AUTH_ALLOWED_EMAIL_DOMAINS="doddl.com".
const ALLOWED_DOMAINS = (process.env.AUTH_ALLOWED_EMAIL_DOMAINS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

const JWKS_URI = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`

const CLOCK_SKEW_SEC = 120
const JWKS_TTL_MS = 60 * 60 * 1000 // Entra rotates signing keys roughly every 6 weeks
const JWKS_MIN_REFETCH_MS = 60 * 1000 // floor between forced refreshes

let jwksCache = { keys: null, fetchedAt: 0, lastForced: 0 }

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

function b64uToBuf(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function b64uToJson(s) {
  return JSON.parse(b64uToBuf(s).toString('utf8'))
}

// ---------------------------------------------------------------------------
// JWKS
// ---------------------------------------------------------------------------

async function loadJwks(force = false) {
  const now = Date.now()
  const fresh = jwksCache.keys && now - jwksCache.fetchedAt < JWKS_TTL_MS
  if (fresh && !force) return jwksCache.keys

  // An unknown `kid` is the one thing an attacker can trigger at will, so a
  // forced refetch is rate-limited. Otherwise a stream of garbage tokens becomes
  // a request amplifier against Microsoft's endpoint (and our own latency).
  if (force && now - jwksCache.lastForced < JWKS_MIN_REFETCH_MS && jwksCache.keys) {
    return jwksCache.keys
  }
  if (force) jwksCache.lastForced = now

  try {
    const resp = await fetch(JWKS_URI, { headers: { accept: 'application/json' } })
    if (!resp.ok) throw new Error(`JWKS fetch failed: HTTP ${resp.status}`)
    const body = await resp.json()
    if (!Array.isArray(body?.keys)) throw new Error('JWKS response had no keys array')

    jwksCache = { keys: body.keys, fetchedAt: now, lastForced: jwksCache.lastForced }
    return jwksCache.keys
  } catch (e) {
    // Keys we already hold stay valid for weeks. Throwing away a usable cache
    // because Microsoft's discovery endpoint had a bad minute would turn a
    // transient upstream blip into a total outage of every authenticated route.
    // Serve the cache and log; only fail when there is genuinely nothing to
    // verify against.
    if (jwksCache.keys) {
      console.error('[apiAuth] JWKS refresh failed, using cached keys:', e.message)
      return jwksCache.keys
    }
    throw e
  }
}

/** Test seam: inject a JWKS so the verifier can be tested without network access. */
export function __setJwksForTests(keys) {
  jwksCache = { keys, fetchedAt: Date.now(), lastForced: 0 }
}

async function importRsaKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

/**
 * Verify an Entra ID ID token. Resolves to the claims, or throws AuthError.
 *
 * Every check below is load-bearing; none is decorative:
 *   alg     — RS256 only. Accepting `none` or an HS* algorithm is the classic
 *             alg-confusion forgery, where the attacker signs with the public
 *             key as an HMAC secret.
 *   sig     — RSASSA-PKCS1-v1_5 / SHA-256 against the tenant's published JWKS.
 *   iss     — must be our tenant's v2.0 issuer, so a token from another tenant
 *             cannot be replayed here.
 *   aud     — must be our client ID. A Microsoft Graph access token has
 *             aud = Graph and is rejected.
 *   tid     — belt and braces with iss; single-tenant means one value.
 *   exp/nbf — with a small clock skew allowance.
 */
export async function verifyIdToken(token) {
  if (!token || typeof token !== 'string') throw new AuthError('No token supplied')

  const parts = token.split('.')
  if (parts.length !== 3) throw new AuthError('Malformed token')
  const [rawHeader, rawPayload, rawSig] = parts

  let header, claims
  try {
    header = b64uToJson(rawHeader)
    claims = b64uToJson(rawPayload)
  } catch {
    throw new AuthError('Token header or payload is not valid JSON')
  }

  if (header.alg !== 'RS256') throw new AuthError(`Unsupported token algorithm: ${header.alg}`)
  if (!header.kid) throw new AuthError('Token header has no kid')

  let keys = await loadJwks(false)
  let jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) {
    // Could be a legitimate key rotation — refetch once, rate-limited.
    keys = await loadJwks(true)
    jwk = keys.find((k) => k.kid === header.kid)
  }
  if (!jwk) throw new AuthError('Token signed by an unknown key')

  const key = await importRsaKey(jwk)
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64uToBuf(rawSig),
    Buffer.from(`${rawHeader}.${rawPayload}`, 'utf8')
  )
  if (!valid) throw new AuthError('Token signature is invalid')

  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SEC < now) throw new AuthError('Token has expired')
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SEC > now) throw new AuthError('Token is not yet valid')

  if (claims.iss !== ISSUER) throw new AuthError('Token issuer is not this tenant')
  if (claims.aud !== CLIENT_ID) throw new AuthError('Token audience is not this application')
  if (claims.tid && claims.tid !== TENANT_ID) throw new AuthError('Token tenant does not match')

  const email = String(claims.preferred_username || claims.email || '').toLowerCase()
  if (ALLOWED_DOMAINS.length) {
    const domain = email.split('@')[1] || ''
    if (!ALLOWED_DOMAINS.includes(domain)) throw new AuthError('Account domain is not permitted', 403)
  }

  return claims
}

function extractBearer(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null
  const m = authHeader.match(/^Bearer\s+(.+)$/)
  return m ? m[1].trim() : null
}

/**
 * Wrap a Next.js API handler so it runs only for a verified signed-in user.
 * Handler signature: async (req, res, { user }) => void
 *
 * Fails CLOSED. If the tenant or client ID is not configured the route returns
 * 500 rather than serving data — the opposite of lib/agentAuth.js's rate limiter,
 * which fails open on a transient Supabase blip. Different call: a rate limiter
 * failing open costs throughput, an authenticator failing open costs the data.
 */
export function withUserAuth(handler) {
  return async function wrapped(req, res) {
    if (!TENANT_ID || !CLIENT_ID) {
      console.error('[apiAuth] tenant/client id not configured — refusing all requests')
      return res.status(500).json({ error: 'Server misconfigured: authentication is not set up' })
    }

    const token = extractBearer(req.headers.authorization)
    if (!token) {
      res.setHeader('WWW-Authenticate', 'Bearer')
      return res.status(401).json({ error: 'Authentication required' })
    }

    let user
    try {
      user = await verifyIdToken(token)
    } catch (e) {
      if (e instanceof AuthError) {
        // The reason is safe to return: it tells a legitimate client whether to
        // refresh a stale token, and tells an attacker nothing they could not
        // determine by inspecting their own token.
        if (e.status === 401) res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"')
        return res.status(e.status).json({ error: e.message })
      }
      console.error('[apiAuth] verification error:', e.message)
      return res.status(503).json({ error: 'Could not verify credentials' })
    }

    return handler(req, res, {
      user: {
        oid: user.oid || null,
        email: user.preferred_username || user.email || null,
        name: user.name || null,
        tid: user.tid || null,
      },
    })
  }
}
