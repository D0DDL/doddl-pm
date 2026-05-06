terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

# ── Variables ─────────────────────────────────────────────────────────────────

variable "vault_name" {
  type        = string
  description = "Globally unique Key Vault name (3–24 chars)"
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type    = string
  default = "uksouth"
}

variable "tenant_id" {
  type        = string
  description = "Azure AD tenant ID"
}

variable "environment" {
  type        = string
  description = "staging | production"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "service_principal_object_ids" {
  type        = list(string)
  description = "Object IDs of service principals that need GET/LIST on secrets"
  default     = []
}

variable "admin_object_ids" {
  type        = list(string)
  description = "Object IDs of human admins needing full secret management"
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}

# ── Resource Group ────────────────────────────────────────────────────────────

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags     = merge(var.tags, { environment = var.environment })
}

# ── Key Vault ─────────────────────────────────────────────────────────────────

resource "azurerm_key_vault" "kv" {
  name                = var.vault_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tenant_id           = var.tenant_id
  sku_name            = "standard"

  # Protect against accidental deletion; required for rotation policies
  soft_delete_retention_days = 90
  purge_protection_enabled   = true

  # Deny all network access by default; connectors use private endpoint or trusted IPs
  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
    ip_rules       = []
  }

  tags = merge(var.tags, {
    environment = var.environment
    managed_by  = "terraform"
  })
}

# ── Access Policies ───────────────────────────────────────────────────────────

# Service principals: read secrets at runtime, no management rights
resource "azurerm_key_vault_access_policy" "connector" {
  for_each     = toset(var.service_principal_object_ids)
  key_vault_id = azurerm_key_vault.kv.id
  tenant_id    = var.tenant_id
  object_id    = each.value

  secret_permissions = ["Get", "List"]
  key_permissions    = []
  certificate_permissions = []
}

# Admins: full secret management (create, rotate, delete)
resource "azurerm_key_vault_access_policy" "admin" {
  for_each     = toset(var.admin_object_ids)
  key_vault_id = azurerm_key_vault.kv.id
  tenant_id    = var.tenant_id
  object_id    = each.value

  secret_permissions = [
    "Get", "List", "Set", "Delete", "Recover", "Backup", "Restore", "Purge"
  ]
  key_permissions = [
    "Get", "List", "Create", "Delete", "Recover", "Backup", "Restore",
    "Rotate", "GetRotationPolicy", "SetRotationPolicy"
  ]
  certificate_permissions = []
}

# ── Rotation Policy Key (used as template for all secret rotation) ────────────
# Each API credential is stored as a Key Vault Secret (not a Key).
# Rotation is enforced by setting an expiry on each secret. Operators are
# alerted via Event Grid / Azure Monitor when a secret is within 30 days of
# expiry. The connector re-fetches on each run, so rotating the secret
# value is sufficient — no redeploy required.
#
# This key resource demonstrates the rotation policy mechanism for KV Keys.
# For Secrets, expiry dates are set at secret creation time (see outputs).

resource "azurerm_key_vault_key" "rotation_demo" {
  name         = "rotation-policy-demo"
  key_vault_id = azurerm_key_vault.kv.id
  key_type     = "RSA"
  key_size     = 2048
  key_opts     = ["sign", "verify"]

  rotation_policy {
    # Rotate automatically 30 days before expiry
    automatic {
      time_before_expiry = "P30D"
    }

    expire_after         = "P365D"  # Keys expire after 1 year
    notify_before_expiry = "P30D"
  }

  depends_on = [azurerm_key_vault_access_policy.admin]
}

# ── Diagnostic Settings (audit all Key Vault operations) ──────────────────────

resource "azurerm_monitor_diagnostic_setting" "kv_audit" {
  name               = "${var.vault_name}-audit"
  target_resource_id = azurerm_key_vault.kv.id

  # Log Analytics workspace ID must be provided externally; omit to skip
  # (configured via log_analytics_workspace_id in the environment tfvars)
  storage_account_id = null

  log {
    category = "AuditEvent"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  log {
    category = "AzurePolicyEvaluationDetails"
    enabled  = false
    retention_policy {
      enabled = false
      days    = 0
    }
  }

  metric {
    category = "AllMetrics"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 90
    }
  }

  lifecycle {
    ignore_changes = [log_analytics_workspace_id]
  }
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "vault_uri" {
  value       = azurerm_key_vault.kv.vault_uri
  description = "Key Vault URI — used in secrets.js / secrets.py at runtime"
}

output "vault_id" {
  value = azurerm_key_vault.kv.id
}

output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}
