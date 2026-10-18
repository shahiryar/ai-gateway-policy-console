#!/usr/bin/env bash
# Deploys the console into a GCP project. Run from the repository root, ideally in Cloud Shell,
# signed in as someone with Owner (or equivalent) on the project:
#
#   ./scripts/deploy.sh
#
# Reads project_id and region from terraform/terraform.tfvars. Safe to re-run: it updates in place.
set -euo pipefail

cd "$(dirname "$0")/.."
TFVARS=terraform/terraform.tfvars

if [[ ! -f "$TFVARS" ]]; then
  echo "Missing $TFVARS. Copy terraform/terraform.tfvars.example and fill it in first." >&2
  exit 1
fi

tfvar() {
  sed -nE "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\"([^\"]*)\".*/\1/p" "$TFVARS" | head -n1
}

PROJECT_ID="$(tfvar project_id)"
REGION="$(tfvar region)"
REGION="${REGION:-us-central1}"
SERVICE="$(tfvar service_name)"
SERVICE="${SERVICE:-ai-policy-console}"
STATE_BUCKET="${STATE_BUCKET:-${PROJECT_ID}-tfstate}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Set project_id in $TFVARS." >&2
  exit 1
fi

command -v gcloud >/dev/null || { echo "gcloud is not installed." >&2; exit 1; }

# Cloud Shell ships a `terraform` placeholder that only prints install instructions,
# so check for a working binary and install one into ~/bin when needed.
TF_VERSION="${TF_VERSION:-1.9.8}"
if ! terraform version 2>/dev/null | grep -q '^Terraform v'; then
  echo "==> Installing Terraform $TF_VERSION into ~/bin"
  case "$(uname -m)" in
    x86_64) TF_ARCH=amd64 ;;
    aarch64 | arm64) TF_ARCH=arm64 ;;
    *) echo "Unsupported CPU $(uname -m); install Terraform manually." >&2; exit 1 ;;
  esac
  mkdir -p "$HOME/bin"
  TMP_ZIP="$(mktemp)"
  curl -fsSL -o "$TMP_ZIP" "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_${TF_ARCH}.zip"
  unzip -o -q "$TMP_ZIP" terraform -d "$HOME/bin"
  rm -f "$TMP_ZIP"
  export PATH="$HOME/bin:$PATH"
  terraform version | grep -q '^Terraform v' || { echo "Terraform install failed." >&2; exit 1; }
fi

echo "==> Project $PROJECT_ID, region $REGION, service $SERVICE"
gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
EXPECTED_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
echo "    The console will be served at $EXPECTED_URL"
echo "    Make sure the OAuth client lists this redirect URI: ${EXPECTED_URL}/auth/callback"

echo "==> Enabling the APIs Terraform needs to start"
gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com \
  storage.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

echo "==> Terraform state bucket gs://$STATE_BUCKET"
if ! gcloud storage buckets describe "gs://$STATE_BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$STATE_BUCKET" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
  gcloud storage buckets update "gs://$STATE_BUCKET" --versioning
fi

echo "==> Applying Terraform"
# Terraform reads Application Default Credentials, which Cloud Shell does not always have.
# Fall back to the signed-in gcloud account's token (valid for an hour, enough for one apply).
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
  export GOOGLE_OAUTH_ACCESS_TOKEN
fi
terraform -chdir=terraform init -input=false -reconfigure \
  -backend-config="bucket=$STATE_BUCKET" -backend-config="prefix=$SERVICE"
terraform -chdir=terraform apply -input=false

IMAGE_REPO="$(terraform -chdir=terraform output -raw image_repository)"
if [[ "$IMAGE_REPO" != *-docker.pkg.dev/* ]]; then
  echo "Terraform did not report the image repository; check the apply output above." >&2
  exit 1
fi
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
IMAGE="$IMAGE_REPO/console:$TAG"

echo "==> Building $IMAGE with Cloud Build"
gcloud builds submit --tag "$IMAGE" .

echo "==> Rolling out to Cloud Run"
gcloud run services update "$SERVICE" --region="$REGION" --image="$IMAGE"

URL="$(terraform -chdir=terraform output -raw service_url)"
echo
echo "Done. Open $URL"
echo "If sign-in fails with redirect_uri_mismatch, add $(terraform -chdir=terraform output -raw oauth_redirect_uri) to the OAuth client."
