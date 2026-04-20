import { timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Agent auth layer uses the service_role key so it can read/write agent_audit_log
// (anon is denied on that table under RLS migration 04) and mutate tasks without
// depending on anon-role policies. Server-side only; never exposed to the client.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set — agent endpoints will fail')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const RATE_LIMIT_PER_MINUTE = 60
const RATE_LIMIT_WINDOW_MS  = 60_000
const MAX_AGENT_ID_LEN      = 128

function constantTimeEqual(a, b) {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

function extractBearer(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null
  const m = authHeader.match(/^Bearer\s+(.+)$/)
  return m ? m[1] : null
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (fwd && typeof fwd === 'string') return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress || null
}

function pathOnly(reqUrl) {
  if (!reqUrl) return null
  const i = reqUrl.indexOf('?')
  return i === -1 ? reqUrl : reqUrl.slice(0, i)
}

// Validate bearer + X-Agent-Id. Returns { agent_id } on success, { error } on failure.
function authenticate(req) {
  const expected = process.env.AGENT_SERVICE_KEY
  if (!expected) {
    console.error('AGENT_SERVICE_KEY is not configured')
    return { error: { status: 500, body: { error: 'Server misconfigured: missing AGENT_SERVICE_KEY' } } }
  }

  const provided = extractBearer(req.headers.authorization)
  if (!provided) {
    return { error: { status: 401, body: { error: 'Missing or malformed Authorization header (expected "Bearer <key>")' } } }
  }
  if (!constantTimeEqual(provided, expected)) {
    return { error: { status: 401, body: { error: 'Invalid agent service key' } } }
  }

  const raw = req.headers['x-agent-id']
  const agent_id = Array.isArray(raw) ? raw[0] : raw
  if (!agent_id || typeof agent_id !== 'string' || agent_id.trim().length === 0) {
    return { error: { status: 400, body: { error: 'Missing X-Agent-Id header' } } }
  }
  if (agent_id.length > MAX_AGENT_ID_LEN) {
    return { error: { status: 400, body: { error: `X-Agent-Id too long (max ${MAX_AGENT_ID_LEN} chars)` } } }
  }

  return { agent_id: agent_id.trim() }
}

// Returns true if the agent is under the rate limit, false if over.
// Fails open on DB error to avoid blocking legitimate traffic during transient Supabase blips.
async function isUnderRateLimit(agent_id) {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count, error } = await supabase
    .from('agent_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agent_id)
    .gte('created_at', cutoff)
  if (error) {
    console.error('Rate limit check failed; failing open:', error.message)
    return true
  }
  return (count ?? 0) < RATE_LIMIT_PER_MINUTE
}

// Best-effort audit log write. Does not throw.
async function logAgentRequest(entry) {
  try {
    const { error } = await supabase.from('agent_audit_log').insert([{
      agent_id:      entry.agent_id,
      method:        entry.method,
      path:          entry.path,
      status_code:   entry.status_code,
      request_body:  entry.request_body  ?? null,
      response_body: entry.response_body ?? null,
      ip_address:    entry.ip_address    ?? null,
      user_agent:    entry.user_agent    ?? null,
    }])
    if (error) console.error('Audit log insert failed:', error.message)
  } catch (e) {
    console.error('Audit log insert threw:', e?.message || e)
  }
}

// Wrap a Next.js API handler with auth + rate limit + audit logging.
// Handler signature: async (req, res, { agent_id }) => void
export function withAgentAuth(handler) {
  return async function wrapped(req, res) {
    const auth = authenticate(req)
    if (auth.error) {
      // Unauthenticated requests are intentionally NOT audited — keeps the table clean
      return res.status(auth.error.status).json(auth.error.body)
    }
    const { agent_id } = auth

    const underLimit = await isUnderRateLimit(agent_id)
    if (!underLimit) {
      const body = { error: 'Rate limit exceeded', limit: RATE_LIMIT_PER_MINUTE, windowSeconds: RATE_LIMIT_WINDOW_MS / 1000 }
      await logAgentRequest({
        agent_id,
        method:       req.method,
        path:         pathOnly(req.url),
        status_code:  429,
        request_body: req.body || null,
        response_body: body,
        ip_address:   getClientIp(req),
        user_agent:   req.headers['user-agent'] || null,
      })
      return res.status(429).json(body)
    }

    // Capture status/body for the audit log by wrapping res.status/res.json
    let capturedStatus = 200
    let capturedBody   = null
    const origStatus = res.status.bind(res)
    const origJson   = res.json.bind(res)
    res.status = (code) => { capturedStatus = code; return origStatus(code) }
    res.json   = (body) => { capturedBody = body;  return origJson(body) }

    try {
      await handler(req, res, { agent_id })
    } catch (e) {
      console.error('Agent handler threw:', e)
      if (!res.headersSent) {
        capturedStatus = 500
        capturedBody   = { error: 'Internal server error' }
        res.status(500).json(capturedBody)
      }
    }

    await logAgentRequest({
      agent_id,
      method:       req.method,
      path:         pathOnly(req.url),
      status_code:  capturedStatus,
      request_body: req.body || null,
      response_body: capturedBody,
      ip_address:   getClientIp(req),
      user_agent:   req.headers['user-agent'] || null,
    })
  }
}
