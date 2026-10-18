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

Run this from [Cloud Shell](https://shell.cloud.google.com) in the target project (it already has `gcloud`, Terraform and git), signed in as someone with Owner or equivalent on the project.

1. **Create the OAuth client.** In the Cloud console, open *Google Auth Platform*:
   - *Branding*: app name "AI Policy Console" and a support email.
   - *Audience*: **Internal**, so only accounts in the client's organization can sign in and Google verification is not needed.
   - *Clients* > *Create client* > **Web application**. Under *Authorized redirect URIs* add
     `https://ai-policy-console-PROJECT_NUMBER.REGION.run.app/auth/callback`
     (the deploy script prints the exact value). Keep the client ID and secret.
2. **Get the code and fill in the settings.**
   ```bash
   git clone https://github.com/shahiryar/ai-gateway-policy-console.git
   cd ai-gateway-policy-console
   cp terraform/terraform.tfvars.example terraform/terraform.tfvars
   nano terraform/terraform.tfvars   # project, region, OAuth client, Google groups per persona
   ```
3. **Deploy.**
   ```bash
   ./scripts/deploy.sh
   ```
   The script enables the bootstrap APIs, creates a versioned bucket for Terraform state (`PROJECT_ID-tfstate`), applies Terraform (APIs, Artifact Registry, service account, Firestore, secrets, Cloud Run with IAP, IAM), builds the image with Cloud Build, and rolls it out. Re-run it to ship updates.
4. Open the URL it prints. IAP signs you in, then the console asks for consent to call Google Cloud APIs on your behalf.

`policy_admins`, `app_owners` and `viewers` in the tfvars get the IAM roles for each persona and access through IAP; `iap_members` only gets access to the console. Terraform state holds the OAuth client secret, which is why the state bucket is private and versioned.

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
