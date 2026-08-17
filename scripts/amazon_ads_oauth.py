"""
Amazon Advertising API OAuth helper — generate and store the LWA refresh token.

The Advertising API uses a SINGLE refresh token per app (unlike SP-API which
needs one per seller account). One token grants access to all profiles (EU,
NA, FE) that were authorised during the consent flow.

Usage:
    python scripts/amazon_ads_oauth.py

What this script does:
  1. Reads your Advertising API client_id and client_secret from Key Vault.
  2. Prints an authorization URL — open it in a browser while logged in to
     the Amazon account that manages your Advertising Console.
  3. After you click "Allow", Amazon redirects to your registered callback URL
     with ?code=... in the query string. Paste the full redirect URL here.
  4. Exchanges the code for an access token + refresh token via LWA.
  5. Stores the refresh token in Key Vault as 'amazon-ads-refresh-token'.

Pre-requisites:
  - AZURE_KEYVAULT_URI must point to doddl-kv-prod.
  - amazon-ads-client-id and amazon-ads-client-secret must already be in
    Key Vault (from advertising.amazon.com → Manage Applications → your app).
  - A redirect URI must be registered in your Advertising API app. It can be
    anything you control — even https://localhost — the script only reads the
    code from the browser address bar, no server needed.

Set AZURE_KEYVAULT_URI before running:
    $env:AZURE_KEYVAULT_URI = "https://doddl-kv-prod.vault.azure.net/"

Where to find your Advertising API credentials:
  1. Go to https://advertising.amazon.com/API/index.html
  2. Click "Login" → then "Manage your applications"
  3. Select your app (or create one if you haven't yet)
  4. Copy the "Client ID" and "Client Secret"
  5. Add both to Key Vault before running this script:
       az keyvault secret set --vault-name doddl-kv-prod --name amazon-ads-client-id --value "<paste>"
       az keyvault secret set --vault-name doddl-kv-prod --name amazon-ads-client-secret --value "<paste>"
"""

import argparse
import os
import sys
import secrets
import urllib.parse

import httpx

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# ── LWA / Advertising API constants ─────────────────────────────────────────
LWA_TOKEN_URL    = "https://api.amazon.com/auth/o2/token"
LWA_AUTH_URL     = "https://www.amazon.com/ap/oa"
ADS_API_SCOPE    = "advertising::campaign_management"

# Secret names in Key Vault
SECRET_CLIENT_ID     = "amazon-ads-client-id"
SECRET_CLIENT_SECRET = "amazon-ads-client-secret"
SECRET_REFRESH_TOKEN = "amazon-ads-refresh-token"


def main() -> None:
    vault_uri = os.environ.get("AZURE_KEYVAULT_URI")
    if not vault_uri:
        print("ERROR: AZURE_KEYVAULT_URI is not set.")
        print('  Run:  $env:AZURE_KEYVAULT_URI = "https://doddl-kv-prod.vault.azure.net/"')
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="Generate Amazon Advertising API refresh token and store in Key Vault"
    )
    # No --account flag — Ads API uses a single token for all regions
    args = parser.parse_args()

    # ── Load credentials from Key Vault ────────────────────────────────────
    from connectors.lib.secrets import get_secret

    print(f"\n{'='*60}")
    print("Amazon Advertising API OAuth")
    print(f"{'='*60}")
    print("\nFetching Advertising API credentials from Key Vault...")

    try:
        client_id     = get_secret(SECRET_CLIENT_ID)
        client_secret = get_secret(SECRET_CLIENT_SECRET)
    except Exception as exc:
        print(f"\nERROR: Could not load credentials from Key Vault: {exc}")
        print("\nYou need to add these secrets first:")
        print(f"  {SECRET_CLIENT_ID}")
        print(f"  {SECRET_CLIENT_SECRET}")
        print("\nWhere to find them:")
        print("  1. Go to https://advertising.amazon.com/API/index.html")
        print("  2. Click Login → Manage your applications")
        print("  3. Open your app (or create one)")
        print("  4. Copy the Client ID and Client Secret")
        print("\nThen add to Key Vault:")
        print(f"  az keyvault secret set --vault-name doddl-kv-prod \\")
        print(f"    --name {SECRET_CLIENT_ID} --value \"<client_id>\"")
        print(f"  az keyvault secret set --vault-name doddl-kv-prod \\")
        print(f"    --name {SECRET_CLIENT_SECRET} --value \"<client_secret>\"")
        sys.exit(1)

    print("  client_id loaded OK")

    # ── Prompt for redirect URI ─────────────────────────────────────────────
    print("\nWhat redirect URI is registered in your Advertising API app?")
    print("  (Go to advertising.amazon.com → Manage Applications → your app → OAuth2 Redirect URI)")
    print("  Common values: https://localhost  or  https://doddl.com/callback")
    redirect_uri = input("  Redirect URI: ").strip()
    if not redirect_uri:
        redirect_uri = "https://localhost"
        print(f"  Using default: {redirect_uri}")

    # ── Build authorization URL ─────────────────────────────────────────────
    state = secrets.token_urlsafe(16)
    params = {
        "client_id":     client_id,
        "scope":         ADS_API_SCOPE,
        "response_type": "code",
        "redirect_uri":  redirect_uri,
        "state":         state,
    }
    auth_url = LWA_AUTH_URL + "?" + urllib.parse.urlencode(params)

    print(f"\n{'─'*60}")
    print("STEP 1 — Open this URL in your browser:")
    print(f"\n  {auth_url}")
    print(f"\n  Log in with the Amazon account that owns your Advertising Console.")
    print(f"  Click 'Allow' to grant campaign management access.")
    print(f"{'─'*60}")

    # ── Collect redirect URL ────────────────────────────────────────────────
    print("\nSTEP 2 — After clicking Allow, your browser redirects to:")
    print(f"  {redirect_uri}?code=...&scope=...&state=...")
    print("\n  Paste the full redirect URL here (even if the page doesn't load):")
    redirect_received = input("  URL: ").strip()

    parsed = urllib.parse.urlparse(redirect_received)
    qs     = urllib.parse.parse_qs(parsed.query)

    if "code" not in qs:
        print("\nERROR: Could not find 'code' in the redirect URL.")
        print("  Make sure you pasted the full URL including the query string.")
        print("  The URL should contain ?code=Atc... or similar.")
        sys.exit(1)

    auth_code      = qs["code"][0]
    returned_state = qs.get("state", [""])[0]

    if returned_state != state:
        print(f"\nWARNING: state mismatch (expected {state}, got {returned_state})")
        print("  This could indicate a CSRF attempt — make sure you used the URL above.")
        confirm = input("  Continue anyway? [y/N]: ").strip().lower()
        if confirm != "y":
            sys.exit(1)

    print(f"\n  Code received: {auth_code[:20]}...")

    # ── Exchange code for refresh token ─────────────────────────────────────
    print("\nSTEP 3 — Exchanging code for refresh token...")
    resp = httpx.post(
        LWA_TOKEN_URL,
        data={
            "grant_type":    "authorization_code",
            "code":          auth_code,
            "redirect_uri":  redirect_uri,
            "client_id":     client_id,
            "client_secret": client_secret,
        },
        timeout=15.0,
    )

    if not resp.is_success:
        print(f"\nERROR: LWA token exchange failed: HTTP {resp.status_code}")
        print(f"  {resp.text}")
        sys.exit(1)

    token_data    = resp.json()
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        print(f"\nERROR: No refresh_token in response: {token_data}")
        sys.exit(1)

    print("  Refresh token obtained.")

    # ── Verify: call /v2/profiles to confirm access ─────────────────────────
    print("\n  Verifying token by fetching Advertising profiles...")
    access_token = token_data.get("access_token")
    if access_token:
        try:
            probe = httpx.get(
                "https://advertising-api-eu.amazon.com/v2/profiles",
                headers={
                    "Authorization":         f"Bearer {access_token}",
                    "Amazon-Advertising-API-ClientId": client_id,
                },
                timeout=10.0,
            )
            if probe.is_success:
                profiles = probe.json()
                print(f"  EU profiles found: {len(profiles)}")
                for p in profiles[:5]:
                    country = p.get("countryCode", "?")
                    pid     = p.get("profileId", "?")
                    name    = p.get("accountInfo", {}).get("name", "")
                    print(f"    [{country}] profileId={pid}  {name}")
                if len(profiles) > 5:
                    print(f"    ... and {len(profiles)-5} more")
            else:
                print(f"  (Could not probe EU profiles: HTTP {probe.status_code} — token is still valid)")
        except Exception as probe_err:
            print(f"  (Profile probe skipped: {probe_err})")

    # ── Store in Key Vault ──────────────────────────────────────────────────
    print(f"\nSTEP 4 — Storing refresh token in Key Vault as '{SECRET_REFRESH_TOKEN}'...")

    from azure.keyvault.secrets import SecretClient
    from azure.identity import DefaultAzureCredential

    kv_client = SecretClient(vault_url=vault_uri, credential=DefaultAzureCredential())
    kv_client.set_secret(SECRET_REFRESH_TOKEN, refresh_token)

    print(f"  Stored: {SECRET_REFRESH_TOKEN}")
    print(f"\n{'='*60}")
    print("SUCCESS — Amazon Advertising API is now configured.")
    print(f"  Secret: {SECRET_REFRESH_TOKEN}")
    print(f"  The connector will use this token on its next scheduled run.")
    print(f"{'='*60}")
    print()
    print("Optional: if you want to restrict syncing to specific profiles,")
    print("add a comma-separated list of profile IDs to Key Vault:")
    print()
    print("  az keyvault secret set --vault-name doddl-kv-prod \\")
    print("    --name amazon-ads-profile-ids --value \"<id1>,<id2>,...\"")
    print()
    print("If that secret is absent (default), ALL profiles linked to the token are synced.")
    print()
    print("Run a backfill when ready:")
    print("  python scripts/run_backfill.py --connector amazon_ads")


if __name__ == "__main__":
    main()
