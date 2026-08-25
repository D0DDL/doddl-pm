const MSAL_CONFIG = {
  clientId: 'bddcde1a-b104-4c96-8f67-9b40a1dfea3c',
  tenantId: '927d1e2c-7c8d-406f-8640-678dfce86b7d',
}

let _msal = null

export async function getMsal() {
  if (_msal) return _msal
  const { PublicClientApplication } = await import('@azure/msal-browser')
  _msal = new PublicClientApplication({
    auth: {
      clientId: MSAL_CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${MSAL_CONFIG.tenantId}`,
      redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  })
  await _msal.initialize()
  return _msal
}
