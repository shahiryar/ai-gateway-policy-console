output "service_url" {
  description = "Console URL."
  value       = google_cloud_run_v2_service.console.uri
}

output "oauth_redirect_uri" {
  description = "Add this as an authorized redirect URI on the OAuth client."
  value       = "${google_cloud_run_v2_service.console.uri}/auth/callback"
}

output "image_repository" {
  description = "Push console images here (cloudbuild.yaml does this)."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.console.repository_id}"
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}
