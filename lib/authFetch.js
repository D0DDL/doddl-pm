// lib/authFetch.js
// Browser-side fetch that attaches the signed-in user's Entra ID token.
//
// Pairs with lib/apiAuth.js on the server. Deliberately does NOT touch the MSAL
// configuration or the login/logout flow — it only reads a token for an account
// that is already signed in, so CLAUDE.md's "MSAL auth never modified" holds.
//
// The ID token is used because our app registration exposes no API scope of its
// own; see the long note at the top of lib/apiAuth.js.

import { getMsal } from './msal'

export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Reload the page to sign in again.') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

/**
 * Acquire a fresh ID token for the current account.
 *
 * acquireTokenSilent is what refreshes it — reading `account.idToken` from the
 * cache would eventually serve an expired token and produce a confusing 401
 * loop. If MSAL says interaction is required, that is surfaced as a distinct
 * error so the UI can tell the user to reload rather than showing a generic
 * failure.
 */
export async function getIdToken() {
  const msal = await getMsal()
  const account = msal.getAllAccounts()[0]
  if (!account) throw new SessionExpiredError('You are not signed in.')

  try {
    const result = await msal.acquireTokenSilent({ scopes: ['openid', 'profile'], account })
    if (!result?.idToken) throw new SessionExpiredError()
    return result.idToken
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e
    throw new SessionExpiredError()
  }
}

/**
 * fetch() with the Authorization header attached.
 *
 * A 401 from the server is translated into SessionExpiredError so every caller
 * does not have to special-case it.
 */
export async function authFetch(input, init = {}) {
  const token = await getIdToken()
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `Bearer ${token}`)

  const resp = await fetch(input, { ...init, headers })
  if (resp.status === 401) throw new SessionExpiredError()
  return resp
}
