variable "project_id" {
  description = "Project that holds the Model Armor and DLP templates and runs the console."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry and Firestore."
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name."
  type        = string
  default     = "ai-policy-console"
}

variable "model_armor_locations" {
  description = "Regions the console manages Model Armor and DLP templates in. Defaults to the deployment region."
  type        = list(string)
  default     = []
}

variable "oauth_client_id" {
  description = "Client ID of the OAuth web client created in APIs & Services > Credentials (see README)."
  type        = string
}

variable "oauth_client_secret" {
  description = "Client secret of that OAuth client. Stored in Secret Manager; it also lands in Terraform state, so keep state in a protected bucket."
  type        = string
  sensitive   = true
}

variable "allowed_domains" {
  description = "Optional Google Workspace / Cloud Identity domains that may sign in, for example [\"example.com\", \"example.co.uk\"]. Empty allows any account that IAP lets in."
  type        = list(string)
  default     = []
}

variable "allowed_domain" {
  description = "Single-domain form of allowed_domains, kept for existing tfvars files."
  type        = string
  default     = ""
}

variable "iap_members" {
  description = "Principals allowed through IAP to reach the console, for example [\"group:ai-platform@example.com\"]."
  type        = list(string)
  default     = []
}

variable "policy_admins" {
  description = "Principals granted the security / policy admin roles (Model Armor Admin, Floor Settings Admin, DLP Administrator)."
  type        = list(string)
  default     = []
}

variable "app_owners" {
  description = "Principals granted the app owner roles (Model Armor User, DLP Reader)."
  type        = list(string)
  default     = []
}

variable "viewers" {
  description = "Principals granted the auditor / viewer roles (Model Armor Viewer, Floor Settings Viewer, DLP Reader, Logs Viewer)."
  type        = list(string)
  default     = []
}

variable "image" {
  description = "Container image. The default placeholder lets the first apply succeed before Cloud Build pushes the real image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "firestore_database_id" {
  description = "Firestore database for the application registry. A dedicated named database avoids touching an existing (default) one."
  type        = string
  default     = "policy-console"
}

variable "firestore_location" {
  description = "Firestore location. Defaults to the deployment region."
  type        = string
  default     = ""
}
