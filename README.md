# AI Gateway Policy Console

A web console, deployed in your own Google Cloud project, for managing [Model Armor](https://cloud.google.com/security-command-center/docs/model-armor-overview) templates and [Sensitive Data Protection](https://cloud.google.com/sensitive-data-protection/docs) (DLP) templates, testing them, assigning them to AI applications, and generating the steps to enforce them on Vertex AI, application code, GKE gateways, Apigee or Gemini Enterprise.

People sign in with their own Google account. Every Model Armor and DLP call is made with **their** OAuth token, so Google Cloud IAM decides what each person can do and Cloud Audit Logs record who changed what. The console's own service account cannot touch Model Armor or DLP.

## What it does

| Area | What you can do |
| --- | --- |
| Model Armor templates | Create, edit, duplicate and delete templates per region: Responsible AI filters, prompt injection and jailbreak, malicious URLs, Sensitive Data Protection (basic or advanced), enforcement type and logging |
| DLP templates | Inspect templates (built-in infoTypes, custom regexes, word lists, likelihood) and de-identify templates (replace with infoType, mask, fixed value, remove) |
| Policy playground | Screen a prompt or model response against a template and see each filter's result and the de-identified text |
| Applications | Register an AI app, assign prompt and response templates, and get copy-ready integration steps with the real project, region and template names filled in |

Buttons for actions your IAM roles do not allow are disabled, based on `testIamPermissions`.

## Architecture

```
Browser ──> IAP ──> Cloud Run (Fastify API + React UI)
                       │  user's OAuth token        │  runtime service account
                       ├──> Model Armor API          ├──> Firestore (application registry)
                       ├──> DLP API                  └──> Secret Manager
                       └──> Resource Manager (testIamPermissions)
```

- `server/`: Node.js 22, Fastify, TypeScript. OAuth 2.0 authorization code flow with PKCE; tokens live in an encrypted, HTTP-only session cookie and never reach the browser. Verifies IAP's signed header on every request.
- `web/`: React, Vite, Tailwind, TanStack Query.
- `terraform/`: everything around the service.
- `e2e/`: Playwright tests that run the built app in demo mode.

The application registry is the only data the console stores. Anyone who can read Model Armor templates can register an app; only its creator or someone with `modelarmor.templates.update` can change or remove it.

## Deploy

You need `gcloud`, Terraform 1.5+, and Owner (or equivalent) on the target project.

1. **Create the OAuth client.** In the Cloud console, open *Google Auth Platform*. Set the audience to **Internal** (no Google verification needed), then create a **Web application** client. You will add the redirect URI after step 3.
2. **Configure Terraform.**
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars   # fill in project, OAuth client, groups
   ```
   `policy_admins`, `app_owners` and `viewers` get the IAM roles for each persona and access through IAP. `iap_members` only gets access to the console. Keep Terraform state in a protected bucket, since it contains the OAuth client secret.
3. **Apply.**
   ```bash
   terraform init
   terraform apply
   ```
   The first apply deploys a placeholder image.
4. **Add the redirect URI.** Copy the `oauth_redirect_uri` output into the OAuth client's *Authorized redirect URIs*.
5. **Build and roll out the console.**
   ```bash
   cd ..
   gcloud builds submit --config cloudbuild.yaml \
     --substitutions=_REGION=us-central1,_SERVICE=ai-policy-console,_REPOSITORY=ai-policy-console
   ```
6. Open `service_url`. IAP signs you in, then the console asks for consent to call Google Cloud APIs on your behalf.

### IAM by persona

| Persona | Roles granted by Terraform |
| --- | --- |
| Security / policy admin | Model Armor Admin, Model Armor Floor Settings Admin, DLP Administrator |
| App owner / developer | Model Armor User, DLP Reader |
| Auditor / viewer | Model Armor Viewer, Model Armor Floor Settings Viewer, DLP Reader, Logs Viewer |

All of them also get *IAP-secured Web App User* on the service. The runtime service account has only Firestore User, Log Writer, and access to its two secrets.

### Configuration

| Variable | Purpose |
| --- | --- |
| `GCP_PROJECT_ID` | Project holding the templates |
| `MODEL_ARMOR_LOCATIONS` | Comma-separated regions the console manages |
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | OAuth web client |
| `SESSION_KEY` | 64 hex characters; encrypts the session cookie |
| `IAP_AUDIENCE` | Turns on IAP header verification (`/projects/NUMBER/locations/REGION/services/NAME`) |
| `ALLOWED_DOMAIN` | Optional Workspace domain restriction |
| `FIRESTORE_DATABASE_ID` | Registry database (default `(default)`; Terraform uses `policy-console`) |
| `STORE` | `firestore` (default) or `memory` |
| `GOOGLE_API_MODE` | `live` (default) or `mock` for a self-contained demo |
| `PUBLIC_URL` | Override the URL used for the OAuth redirect |

## Develop

```bash
npm install

# Demo mode: simulated Model Armor and DLP, no credentials.
GOOGLE_API_MODE=mock npm run dev --workspace server
npm run dev --workspace web          # http://localhost:5173

# Against a real project with your own gcloud identity (local only; refused on Cloud Run).
GCP_PROJECT_ID=my-project STORE=memory DEV_ACCESS_TOKEN=$(gcloud auth print-access-token) \
  npm run dev --workspace server

npm run typecheck
npm test            # server and web unit tests
npm run e2e         # builds, starts in demo mode, runs Playwright
```

Demo mode screens text with simple pattern rules, not Google's classifiers, so use it to try the workflow rather than to judge a policy.

## Notes and limits

- Model Armor templates are regional, and a template in Advanced mode must reference DLP templates in the same region.
- Floor settings, an audit view from Cloud Audit Logs, approval workflows and multi-project views are planned next.
- The generated integration steps for GKE service extensions, Apigee and Gemini Enterprise follow Google's published guides; check them against the linked documentation for your product versions.
