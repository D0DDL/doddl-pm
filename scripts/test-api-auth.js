// scripts/test-api-auth.js
// Tests for lib/apiAuth.js.
//
//   node scripts/test-api-auth.js
//
// No network and no Azure account required: the test generates its own RSA
// keypair, injects the public half as a JWKS, and mints tokens with it. That
// exercises the real signature path — importKey, subtle.verify, the lot — rather
// than stubbing the interesting part out.
//
// The forgery cases are the point. A JWT verifier that accepts a good token is
// trivial; one that rejects `alg: none`, an HMAC-signed token, a token from
// another tenant, and a token minted for Microsoft Graph is the actual control.

const path = require('path')
const { pathToFileURL } = require('url')
const { generateKeyPairSync, createSign, createHmac, randomUUID } = require('crypto')

const TENANT = '927d1e2c-7c8d-406f-8640-678dfce86b7d'
const CLIENT = 'bddcde1a-b104-4c96-8f67-9b40a1dfea3c'
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`

let pass = 0, fail = 0
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`) }
}

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const j64 = (obj) => b64u(Buffer.from(JSON.stringify(obj), 'utf8'))

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pubJwk = publicKey.export({ format: 'jwk' })
const KID = 'test-key-1'

function sign(header, claims, key = privateKey) {
  const h = j64({ typ: 'JWT', alg: 'RS256', kid: KID, ...header })
  const p = j64(claims)
  const signer = createSign('RSA-SHA256')
  signer.update(`${h}.${p}`)
  signer.end()
  return `${h}.${p}.${b64u(signer.sign(key))}`
}

const now = () => Math.floor(Date.now() / 1000)

function goodClaims(over = {}) {
  return {
    iss: ISSUER, aud: CLIENT, tid: TENANT,
    oid: randomUUID(), name: 'Jon Fawcett', preferred_username: 'jon@doddl.com',
    iat: now() - 60, nbf: now() - 60, exp: now() + 3600,
    ...over,
  }
}

async function rejects(fn, fragment) {
  try { await fn(); return { rejected: false, message: 'resolved instead of throwing' } }
  catch (e) { return { rejected: true, message: e.message, matches: !fragment || e.message.toLowerCase().includes(fragment.toLowerCase()) } }
}

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'apiAuth.js')).href)
  const { verifyIdToken, withUserAuth, __setJwksForTests, AuthError } = mod

  __setJwksForTests([{ kty: 'RSA', kid: KID, use: 'sig', alg: 'RS256', n: pubJwk.n, e: pubJwk.e }])

  // Block real network calls to the tenant JWKS endpoint. The "unknown kid"
  // case below forces a refetch (loadJwks(force=true)) — on a machine with
  // internet access that refetch previously succeeded against the real
  // login.microsoftonline.com, evicting the injected test key and turning
  // every later assertion in this file into a false failure. lib/apiAuth.js's
  // loadJwks() already falls back to the cached keys when a fetch fails, so
  // blocking the call is sufficient — it exercises that real fallback path
  // instead of needing a second copy of the same logic here. Same fix as
  // doddl-reports/scripts/test-api-auth.js, applied there first 2026-08-25.
  const realFetch = global.fetch
  global.fetch = async (url, ...rest) => {
    if (typeof url === 'string' && url.includes('login.microsoftonline.com')) {
      throw new Error('network blocked in tests — see comment above')
    }
    return realFetch(url, ...rest)
  }

  console.log('\nA valid token is accepted')
  const claims = await verifyIdToken(sign({}, goodClaims()))
  ok('verifies and returns claims', claims.preferred_username === 'jon@doddl.com')
  ok('tenant claim preserved', claims.tid === TENANT)

  console.log('\nForgery and confusion attempts are rejected')

  // alg: none — the oldest JWT bug there is.
  const noneTok = `${j64({ typ: 'JWT', alg: 'none', kid: KID })}.${j64(goodClaims())}.`
  let r = await rejects(() => verifyIdToken(noneTok), 'algorithm')
  ok('alg: none rejected', r.rejected && r.matches, r.message)

  // HS256 signed with the RSA public key as the HMAC secret — alg confusion.
  const hh = j64({ typ: 'JWT', alg: 'HS256', kid: KID })
  const hp = j64(goodClaims())
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' })
  const hsig = b64u(createHmac('sha256', pubPem).update(`${hh}.${hp}`).digest())
  r = await rejects(() => verifyIdToken(`${hh}.${hp}.${hsig}`), 'algorithm')
  ok('HS256 alg-confusion rejected', r.rejected && r.matches, r.message)

  // Signed by a key we do not publish.
  const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  r = await rejects(() => verifyIdToken(sign({}, goodClaims(), otherKey)), 'signature')
  ok('token signed by a foreign key rejected', r.rejected && r.matches, r.message)

  // Payload tampered after signing — classic "change the email, keep the sig".
  const good = sign({}, goodClaims())
  const [gh, , gs] = good.split('.')
  const tampered = `${gh}.${j64(goodClaims({ preferred_username: 'attacker@evil.com' }))}.${gs}`
  r = await rejects(() => verifyIdToken(tampered), 'signature')
  ok('tampered payload rejected', r.rejected && r.matches, r.message)

  // A Microsoft Graph access token: correctly signed, wrong audience.
  r = await rejects(() => verifyIdToken(sign({}, goodClaims({ aud: '00000003-0000-0000-c000-000000000000' }))), 'audience')
  ok('Graph-audienced token rejected', r.rejected && r.matches, r.message)

  // Another tenant's token, correctly signed by that tenant's key — here
  // simulated as our key but a foreign issuer, which is strictly easier to pass.
  r = await rejects(() => verifyIdToken(sign({}, goodClaims({ iss: 'https://login.microsoftonline.com/other-tenant/v2.0' }))), 'issuer')
  ok('foreign issuer rejected', r.rejected && r.matches, r.message)

  r = await rejects(() => verifyIdToken(sign({}, goodClaims({ tid: 'some-other-tenant' }))), 'tenant')
  ok('foreign tenant claim rejected', r.rejected && r.matches, r.message)

  r = await rejects(() => verifyIdToken(sign({ kid: 'unknown-kid' }, goodClaims())), 'unknown key')
  ok('unknown kid rejected', r.rejected && r.matches, r.message)

  console.log('\nLifetime')
  r = await rejects(() => verifyIdToken(sign({}, goodClaims({ exp: now() - 3600 }))), 'expired')
  ok('expired token rejected', r.rejected && r.matches, r.message)
  r = await rejects(() => verifyIdToken(sign({}, goodClaims({ nbf: now() + 3600, exp: now() + 7200 }))), 'not yet valid')
  ok('not-yet-valid token rejected', r.rejected && r.matches, r.message)

  // Clock skew tolerance: a token that expired 30s ago still passes, because
  // client and server clocks disagree in the real world.
  const slightlyStale = await verifyIdToken(sign({}, goodClaims({ exp: now() - 30 })))
  ok('120s clock skew tolerated', !!slightlyStale)

  console.log('\nMalformed input')
  for (const [label, tok] of [['empty', ''], ['not a jwt', 'hello'], ['two parts', 'a.b'], ['garbage base64', '!!!.!!!.!!!']]) {
    r = await rejects(() => verifyIdToken(tok))
    ok(`${label} rejected`, r.rejected, r.message)
  }

  console.log('\nwithUserAuth wrapper')
  const mkRes = () => {
    const res = { statusCode: null, body: null, headers: {} }
    res.status = (c) => { res.statusCode = c; return res }
    res.json = (b) => { res.body = b; return res }
    res.setHeader = (k, v) => { res.headers[k] = v }
    return res
  }

  let called = false
  const wrapped = withUserAuth(async (req, res, ctx) => { called = true; res.status(200).json({ who: ctx.user.email }) })

  let res = mkRes()
  await wrapped({ headers: {} }, res)
  ok('no Authorization header -> 401', res.statusCode === 401)
  ok('handler not reached without a token', called === false)
  ok('WWW-Authenticate challenge sent', res.headers['WWW-Authenticate'] === 'Bearer')

  res = mkRes()
  await wrapped({ headers: { authorization: 'Bearer garbage' } }, res)
  ok('garbage bearer -> 401', res.statusCode === 401)

  res = mkRes()
  await wrapped({ headers: { authorization: sign({}, goodClaims()) } }, res)
  ok('token without the Bearer prefix -> 401', res.statusCode === 401)

  res = mkRes()
  await wrapped({ headers: { authorization: `Bearer ${sign({}, goodClaims({ exp: now() - 9999 }))}` } }, res)
  ok('expired token -> 401', res.statusCode === 401)
  ok('handler still not reached', called === false)

  res = mkRes()
  await wrapped({ headers: { authorization: `Bearer ${sign({}, goodClaims())}` } }, res)
  ok('valid token -> 200', res.statusCode === 200)
  ok('handler reached', called === true)
  ok('identity passed to the handler', res.body?.who === 'jon@doddl.com')

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
