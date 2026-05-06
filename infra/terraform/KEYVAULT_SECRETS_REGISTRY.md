# Key Vault Secrets Registry

All API credentials for the doddl AI OS are stored in Azure Key Vault.
No credential lives in code, `.env` files, or Vercel environment variables
(except `AZURE_KEYVAULT_URI` itself, which is the vault address — not a credential).

## Secret Naming Convention

`{service}-{credential-type}`

Examples: `klaviyo-api-key`, `shopify-admin-api-token`, `amazon-sp-api-refresh-token`

## Registered Secrets

| Secret Name                         | Service           | Rotation Period | Owner        |
|-------------------------------------|-------------------|-----------------|--------------|
| `klaviyo-api-key`                   | Klaviyo           | 90 days         | Jon Fawcett  |
| `shopify-admin-api-token`           | Shopify           | 90 days         | Jon Fawcett  |
| `shopify-shop-domain`               | Shopify           | Static          | Jon Fawcett  |
| `amazon-sp-api-client-id`           | Amazon SP-API     | 365 days        | Jon Fawcett  |
| `amazon-sp-api-client-secret`       | Amazon SP-API     | 90 days         | Jon Fawcett  |
| `amazon-sp-api-refresh-token`       | Amazon SP-API     | 365 days        | Jon Fawcett  |
| `google-ads-developer-token`        | Google Ads        | 365 days        | Jon Fawcett  |
| `google-ads-client-id`              | Google Ads        | 365 days        | Jon Fawcett  |
| `google-ads-client-secret`          | Google Ads        | 180 days        | Jon Fawcett  |
| `google-ads-refresh-token`          | Google Ads        | 365 days        | Jon Fawcett  |
| `google-ads-customer-id`            | Google Ads        | Static          | Jon Fawcett  |
| `meta-ads-access-token`             | Meta Ads          | 60 days         | Jon Fawcett  |
| `meta-ads-account-id`               | Meta Ads          | Static          | Jon Fawcett  |
| `supabase-scheduler-db-url`         | Supabase          | Manual          | Jon Fawcett  |
| `microsoft-graph-client-secret`     | Microsoft Graph   | 180 days        | Jon Fawcett  |
| `anthropic-api-key`                 | Anthropic         | 90 days         | Jon Fawcett  |
| `supabase-service-role-key-staging` | Supabase staging  | Manual          | Jon Fawcett  |
| `supabase-service-role-key-prod`    | Supabase prod     | Manual          | Jon Fawcett  |
| `zoho-crm-client-secret`            | Zoho CRM          | 90 days         | Jon Fawcett  |

## Rotation Policy

- Secrets have an expiry date set at creation matching the rotation period above.
- Azure Monitor alerts fire 30 days before expiry to jon@doddl.com.
- To rotate: create a new secret version in Key Vault. The connector fetches the
  latest active version on every run — no redeploy required.
- Old versions are disabled, not deleted, for 90 days.

## Environments

| Environment | Vault Name        | URI pattern                                      |
|-------------|-------------------|--------------------------------------------------|
| Staging     | `doddl-kv-staging`| `https://doddl-kv-staging.vault.azure.net/`      |
| Production  | `doddl-kv-prod`   | `https://doddl-kv-prod.vault.azure.net/`         |

Staging and production vaults are completely separate. A staging credential
never touches the production vault and vice versa.
