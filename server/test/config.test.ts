import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('refuses a developer token on Cloud Run', () => {
    expect(() =>
      loadConfig({ K_SERVICE: 'console', GCP_PROJECT_ID: 'p', DEV_ACCESS_TOKEN: 't', SESSION_KEY: 'a'.repeat(64) }),
    ).toThrow(/DEV_ACCESS_TOKEN/);
  });

  it('requires OAuth credentials in live mode', () => {
    expect(() => loadConfig({ GCP_PROJECT_ID: 'p' })).toThrow(/OAUTH_CLIENT_ID/);
  });

  it('requires a 32-byte session key', () => {
    expect(() => loadConfig({ GOOGLE_API_MODE: 'mock', SESSION_KEY: 'abcd' })).toThrow(/SESSION_KEY/);
  });

  it('defaults to the memory store in mock mode', () => {
    const c = loadConfig({ GOOGLE_API_MODE: 'mock' });
    expect(c.store).toBe('memory');
    expect(c.projectId).toBe('demo-project');
  });
});

describe('allowed domains', () => {
  it('accepts a comma-separated list and the single-domain variable', () => {
    expect(loadConfig({ GOOGLE_API_MODE: 'mock', ALLOWED_DOMAINS: 'Acme.com, acme.co.uk' }).allowedDomains).toEqual([
      'acme.com',
      'acme.co.uk',
    ]);
    expect(loadConfig({ GOOGLE_API_MODE: 'mock', ALLOWED_DOMAIN: 'acme.com' }).allowedDomains).toEqual(['acme.com']);
    expect(loadConfig({ GOOGLE_API_MODE: 'mock' }).allowedDomains).toEqual([]);
  });
});
