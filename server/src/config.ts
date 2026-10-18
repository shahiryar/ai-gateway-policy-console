import { randomBytes } from 'node:crypto';

export type ApiMode = 'live' | 'mock';
export type StoreKind = 'firestore' | 'memory';

export interface Config {
  port: number;
  projectId: string;
  locations: string[];
  apiMode: ApiMode;
  store: StoreKind;
  firestoreDatabaseId: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  sessionKey: Buffer;
  iapAudience?: string;
  /** Google Workspace / Cloud Identity domains allowed to sign in; empty allows any. */
  allowedDomains: string[];
  publicUrl?: string;
  devAccessToken?: string;
  devUserEmail: string;
  webDist?: string;
  secureCookies: boolean;
}

function list(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiMode: ApiMode = env.GOOGLE_API_MODE === 'mock' ? 'mock' : 'live';
  const onCloudRun = Boolean(env.K_SERVICE);

  const projectId = env.GCP_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? (apiMode === 'mock' ? 'demo-project' : '');
  if (!projectId) {
    throw new Error('GCP_PROJECT_ID is required');
  }

  if (env.DEV_ACCESS_TOKEN && onCloudRun) {
    throw new Error('DEV_ACCESS_TOKEN must not be set on Cloud Run');
  }

  let sessionKey: Buffer;
  if (env.SESSION_KEY) {
    sessionKey = Buffer.from(env.SESSION_KEY, 'hex');
    if (sessionKey.length !== 32) {
      throw new Error('SESSION_KEY must be 64 hex characters (32 bytes)');
    }
  } else if (onCloudRun) {
    throw new Error('SESSION_KEY is required on Cloud Run');
  } else {
    // Local development only: sessions do not survive a restart.
    sessionKey = randomBytes(32);
  }

  const needsOAuth = apiMode === 'live' && !env.DEV_ACCESS_TOKEN;
  if (needsOAuth && (!env.OAUTH_CLIENT_ID || !env.OAUTH_CLIENT_SECRET)) {
    throw new Error('OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET are required (or set DEV_ACCESS_TOKEN for local development)');
  }

  return {
    port: Number(env.PORT ?? 8080),
    projectId,
    locations: list(env.MODEL_ARMOR_LOCATIONS, ['us-central1']),
    apiMode,
    store: env.STORE === 'memory' || (apiMode === 'mock' && env.STORE !== 'firestore') ? 'memory' : 'firestore',
    firestoreDatabaseId: env.FIRESTORE_DATABASE_ID ?? '(default)',
    oauthClientId: env.OAUTH_CLIENT_ID,
    oauthClientSecret: env.OAUTH_CLIENT_SECRET,
    sessionKey,
    iapAudience: env.IAP_AUDIENCE || undefined,
    allowedDomains: list(env.ALLOWED_DOMAINS || env.ALLOWED_DOMAIN, []).map((d) => d.toLowerCase()),
    publicUrl: env.PUBLIC_URL?.replace(/\/$/, '') || undefined,
    devAccessToken: env.DEV_ACCESS_TOKEN || undefined,
    devUserEmail: env.DEV_USER_EMAIL ?? 'developer@localhost',
    webDist: env.WEB_DIST,
    secureCookies: onCloudRun || env.SECURE_COOKIES === 'true',
  };
}
