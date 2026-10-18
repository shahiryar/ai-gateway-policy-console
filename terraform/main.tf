locals {
  locations          = length(var.model_armor_locations) > 0 ? var.model_armor_locations : [var.region]
  firestore_location = var.firestore_location != "" ? var.firestore_location : var.region

  services = [
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "dlp.googleapis.com",
    "firestore.googleapis.com",
    "iap.googleapis.com",
    "logging.googleapis.com",
    "modelarmor.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
  ]

  persona_roles = {
    admin = ["roles/modelarmor.admin", "roles/modelarmor.floorSettingsAdmin", "roles/dlp.admin"]
    owner = ["roles/modelarmor.user", "roles/dlp.reader"]
    viewer = [
      "roles/modelarmor.viewer",
      "roles/modelarmor.floorSettingsViewer",
      "roles/dlp.reader",
      "roles/logging.viewer",
    ]
  }

  persona_members = {
    admin  = var.policy_admins
    owner  = var.app_owners
    viewer = var.viewers
  }

  persona_bindings = merge([
    for persona, members in local.persona_members : {
      for pair in setproduct(members, local.persona_roles[persona]) :
      "${persona}/${pair[0]}/${pair[1]}" => { member = pair[0], role = pair[1] }
    }
  ]...)

  # Everyone with a persona can open the console, plus anyone listed only for IAP.
  console_users = toset(concat(var.iap_members, var.policy_admins, var.app_owners, var.viewers))
}

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "console" {
  location      = var.region
  repository_id = var.service_name
  format        = "DOCKER"
  description   = "Images for the AI policy console"

  depends_on = [google_project_service.apis]
}

# Runtime identity. It reads the app registry and its own secrets only;
# Model Armor and DLP calls use the signed-in user's token, never this account.
resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-run"
  display_name = "AI policy console runtime"
}

resource "google_project_iam_member" "runtime" {
  for_each = toset(["roles/datastore.user", "roles/logging.logWriter"])
  project  = var.project_id
  role     = each.value
  member   = google_service_account.runtime.member
}

resource "google_firestore_database" "registry" {
  name        = var.firestore_database_id
  location_id = local.firestore_location
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.apis]
}

resource "random_id" "session_key" {
  byte_length = 32
}

resource "google_secret_manager_secret" "oauth_client_secret" {
  secret_id = "${var.service_name}-oauth-client-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "oauth_client_secret" {
  secret      = google_secret_manager_secret.oauth_client_secret.id
  secret_data = var.oauth_client_secret
}

resource "google_secret_manager_secret" "session_key" {
  secret_id = "${var.service_name}-session-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "session_key" {
  secret      = google_secret_manager_secret.session_key.id
  secret_data = random_id.session_key.hex
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = {
    oauth   = google_secret_manager_secret.oauth_client_secret.secret_id
    session = google_secret_manager_secret.session_key.secret_id
  }
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_cloud_run_v2_service" "console" {
  provider            = google-beta
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  iap_enabled         = true
  deletion_protection = false

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "MODEL_ARMOR_LOCATIONS"
        value = join(",", local.locations)
      }
      env {
        name  = "OAUTH_CLIENT_ID"
        value = var.oauth_client_id
      }
      env {
        name  = "ALLOWED_DOMAIN"
        value = var.allowed_domain
      }
      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = google_firestore_database.registry.name
      }
      env {
        name  = "IAP_AUDIENCE"
        value = "/projects/${data.google_project.this.number}/locations/${var.region}/services/${var.service_name}"
      }
      env {
        name = "OAUTH_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.oauth_client_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "SESSION_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_key.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/healthz"
        }
      }
    }
  }

  lifecycle {
    # Cloud Build rolls out new images; Terraform should not roll them back.
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.runtime,
    google_secret_manager_secret_version.oauth_client_secret,
    google_secret_manager_secret_version.session_key,
  ]
}

# IAP's service agent invokes the service on behalf of signed-in users.
resource "google_project_service_identity" "iap" {
  provider = google-beta
  service  = "iap.googleapis.com"

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "iap_invoker" {
  name     = google_cloud_run_v2_service.console.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_project_service_identity.iap.email}"
}

resource "google_iap_web_cloud_run_service_iam_member" "users" {
  for_each               = local.console_users
  location               = var.region
  cloud_run_service_name = google_cloud_run_v2_service.console.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = each.value
}

resource "google_project_iam_member" "personas" {
  for_each = local.persona_bindings
  project  = var.project_id
  role     = each.value.role
  member   = each.value.member
}
