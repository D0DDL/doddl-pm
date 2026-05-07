#!/usr/bin/env python3
"""
Google OAuth flow — doddl AI OS Google Ads credentials.

Usage:
    python scripts/google_oauth.py

Steps:
  1. Finds client_secret_*.json in ~/Downloads
  2. Opens a browser for OAuth consent (localhost:8080 callback)
  3. Requests adwords + datamanager scopes
  4. Prints refresh_token, client_id, client_secret
  5. Temporarily adds local IP to Key Vault firewall (ARM API)
  6. Saves google-ads-client-id, google-ads-client-secret, google-ads-refresh-token
     to doddl-kv-staging and doddl-kv-prod via Key Vault REST API
  7. Removes local IP from firewall

Requirements (already installed via connectors/requirements.txt):
    google-ads==24.1.0  (ships google-auth-oauthlib)
    azure-identity==1.17.1
"""

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

# ── Config ─────────────────────────────────────────────────────────────────

DOWNLOADS = Path(r"C:\Users\JonFawcett\Downloads")

SCOPES = [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/datamanager",
]

SUBSCRIPTION_ID = "a674bfa5-c168-480b-9768-046585d01f5f"

VAULTS = {
    "doddl-kv-staging": "doddl-ai-os-staging",
    "doddl-kv-prod":    "doddl-ai-os-production",
}

KV_API_VERSION = "7.4"
ARM_API_VERSION = "2023-07-01"


# ── Helpers ─────────────────────────────────────────────────────────────────

def find_client_secret() -> Path:
    matches = sorted(DOWNLOADS.glob("client_secret_*.json"))
    if not matches:
        raise FileNotFoundError(
            f"No client_secret_*.json found in {DOWNLOADS}\n"
            "Download one from: console.cloud.google.com → APIs & Services → Credentials"
        )
    if len(matches) > 1:
        print(f"  Multiple files found — using most recent: {matches[-1].name}")
    return matches[-1]


def get_local_ip() -> str | None:
    try:
        with urllib.request.urlopen("https://api.ipify.org", timeout=5) as r:
            return r.read().decode().strip()
    except Exception as e:
        print(f"  WARNING: Could not determine local IP — {e}")
        return None


def get_azure_token(scope: str) -> str:
    from azure.identity import AzureCliCredential
    return AzureCliCredential().get_token(scope).token


def _arm_request(method: str, url: str, arm_token: str, body: dict | None = None):
    data = json.dumps(body).encode() if body else None
    headers = {"Authorization": f"Bearer {arm_token}"}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"ARM {method} {url} → {e.code}: {e.read().decode()}") from e


def update_kv_firewall(vault_name: str, rg: str, arm_token: str, ip: str, add: bool) -> None:
    url = (
        f"https://management.azure.com/subscriptions/{SUBSCRIPTION_ID}"
        f"/resourceGroups/{rg}/providers/Microsoft.KeyVault/vaults/{vault_name}"
        f"?api-version={ARM_API_VERSION}"
    )
    vault = _arm_request("GET", url, arm_token)
    current_rules = vault.get("properties", {}).get("networkAcls", {}).get("ipRules", [])

    if add:
        existing = {r.get("value", "").split("/")[0] for r in current_rules}
        if ip not in existing:
            current_rules.append({"value": f"{ip}/32"})
    else:
        current_rules = [r for r in current_rules if not r.get("value", "").startswith(ip)]

    _arm_request("PATCH", url, arm_token, body={
        "properties": {
            "networkAcls": {
                "bypass": "AzureServices",
                "defaultAction": "Deny",
                "ipRules": current_rules,
                "virtualNetworkRules": [],
            }
        }
    })


def set_kv_secret(vault_name: str, secret_name: str, value: str, kv_token: str) -> None:
    url = f"https://{vault_name}.vault.azure.net/secrets/{secret_name}?api-version={KV_API_VERSION}"
    data = json.dumps({"value": value}).encode()
    req = urllib.request.Request(
        url, data=data, method="PUT",
        headers={"Authorization": f"Bearer {kv_token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"KV PUT {secret_name} → {e.code}: {e.read().decode()}") from e


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    print("\n=== doddl AI OS — Google OAuth credential capture ===\n")

    # 1. Find client secret
    print("[1/4] Locating client_secret file...")
    secret_file = find_client_secret()
    print(f"  Using: {secret_file.name}")

    # 2. OAuth flow
    print("\n[2/4] Opening browser for OAuth consent (localhost:8080)...")
    flow = InstalledAppFlow.from_client_secrets_file(str(secret_file), scopes=SCOPES)
    creds = flow.run_local_server(port=8080, prompt="consent", access_type="offline")

    with open(str(secret_file)) as f:
        raw = json.load(f)
    client_data = raw.get("installed") or raw.get("web") or {}

    client_id     = client_data["client_id"]
    client_secret = client_data["client_secret"]
    refresh_token = creds.refresh_token

    print("\n" + "=" * 62)
    print("CREDENTIALS")
    print("=" * 62)
    print(f"  client_id:     {client_id}")
    print(f"  client_secret: {client_secret}")
    print(f"  refresh_token: {refresh_token}")
    print("=" * 62)

    if not refresh_token:
        print("\nERROR: No refresh_token received.")
        print("  → Re-run and ensure you click 'Allow' on the consent screen.")
        print("  → If you previously granted access, revoke it at:")
        print("    https://myaccount.google.com/permissions  then re-run.")
        sys.exit(1)

    # 3. Azure tokens
    print("\n[3/4] Acquiring Azure tokens...")
    arm_token = get_azure_token("https://management.azure.com/.default")
    kv_token  = get_azure_token("https://vault.azure.net/.default")
    print("  ARM + Key Vault tokens acquired.")

    # 4. Save to Key Vault
    print("\n[4/4] Saving secrets to Key Vault...")
    local_ip = get_local_ip()
    secrets = {
        "google-ads-client-id":     client_id,
        "google-ads-client-secret": client_secret,
        "google-ads-refresh-token": refresh_token,
    }

    for vault_name, rg in VAULTS.items():
        print(f"\n  ── {vault_name} ──")
        try:
            if local_ip:
                print(f"    Opening firewall for {local_ip}...")
                update_kv_firewall(vault_name, rg, arm_token, local_ip, add=True)
                print("    Waiting 15s for ACL propagation...")
                time.sleep(15)

            for name, value in secrets.items():
                set_kv_secret(vault_name, name, value, kv_token)
                print(f"    ✓  {name}")

        finally:
            if local_ip:
                try:
                    print(f"    Closing firewall for {local_ip}...")
                    update_kv_firewall(vault_name, rg, arm_token, local_ip, add=False)
                except Exception as e:
                    print(f"    WARNING: Failed to remove IP from firewall: {e}")
                    print(f"    Manually remove {local_ip}/32 from Key Vault network ACL.")

    print("\n✓  google-ads-client-id, google-ads-client-secret, google-ads-refresh-token")
    print("   saved to doddl-kv-staging and doddl-kv-prod.\n")


if __name__ == "__main__":
    main()
