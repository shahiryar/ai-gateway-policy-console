import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { MockPolicyApis } from '../src/google/mockApis.js';
import type { PolicyApis } from '../src/google/types.js';
import { MemoryApplicationStore, type ApplicationStore } from '../src/store/registry.js';

export const HEADERS = { 'x-requested-with': 'policy-console' };

export async function testApp(opts: { email?: string; apis?: PolicyApis; store?: ApplicationStore } = {}) {
  const config = loadConfig({
    GOOGLE_API_MODE: 'mock',
    GCP_PROJECT_ID: 'demo-project',
    MODEL_ARMOR_LOCATIONS: 'us-central1,europe-west4',
    DEV_USER_EMAIL: opts.email ?? 'alice@example.com',
  });
  const apis = opts.apis ?? new MockPolicyApis('demo-project', 'us-central1');
  const store = opts.store ?? new MemoryApplicationStore();
  const app = await buildApp({ ...config, webDist: '/nonexistent' }, { apis, store, logger: false });
  return { app, apis, store };
}

export const sampleApp = {
  name: 'Support bot',
  description: 'Customer support assistant',
  owner: 'support-team@example.com',
  environment: 'prod',
  integrationType: 'api',
  location: 'us-central1',
  promptTemplateId: 'baseline-safety',
};
