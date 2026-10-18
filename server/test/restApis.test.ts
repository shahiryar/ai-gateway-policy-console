import { describe, expect, it } from 'vitest';
import { RestPolicyApis, modelArmorBase } from '../src/google/restApis.js';
import { GoogleApiError } from '../src/google/types.js';

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const ctx = { accessToken: 'user-token', projectId: 'p1' };

describe('RestPolicyApis', () => {
  it('uses the regional Model Armor endpoint and the user token', async () => {
    const { fn, calls } = fakeFetch([{ body: { templates: [{ name: 'a' }], nextPageToken: 'n' } }, { body: { templates: [{ name: 'b' }] } }]);
    const apis = new RestPolicyApis(fn);
    const result = await apis.listTemplates(ctx, 'us-central1');
    expect(result.map((t) => t.name)).toEqual(['a', 'b']);
    expect(calls[0]!.url).toBe('https://modelarmor.us-central1.rep.googleapis.com/v1/projects/p1/locations/us-central1/templates');
    expect(calls[1]!.url).toContain('pageToken=n');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer user-token');
  });

  it('uses the global endpoint for the global location', () => {
    expect(modelArmorBase('global')).toBe('https://modelarmor.googleapis.com/v1');
  });

  it('sends the update mask on patch', async () => {
    const { fn, calls } = fakeFetch([{ body: {} }]);
    await new RestPolicyApis(fn).updateTemplate(ctx, 'europe-west4', 't1', { filterConfig: {} }, ['filterConfig', 'templateMetadata']);
    expect(calls[0]!.init.method).toBe('PATCH');
    expect(calls[0]!.url).toContain('/templates/t1?updateMask=filterConfig%2CtemplateMetadata');
  });

  it('wraps the right DLP field on create', async () => {
    const { fn, calls } = fakeFetch([{ body: {} }]);
    await new RestPolicyApis(fn).createDlpTemplate(ctx, 'us-central1', 'deidentify', 'd1', { displayName: 'x' });
    expect(calls[0]!.url).toBe('https://dlp.googleapis.com/v2/projects/p1/locations/us-central1/deidentifyTemplates');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ deidentifyTemplate: { displayName: 'x' }, templateId: 'd1' });
  });

  it("surfaces Google's error status and message", async () => {
    const { fn } = fakeFetch([{ status: 403, body: { error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' } } }]);
    const err = await new RestPolicyApis(fn).getTemplate(ctx, 'us-central1', 't').catch((e) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe('Permission denied');
  });

  it('falls back to testing permissions one by one when the batch is rejected', async () => {
    const { fn } = fakeFetch([
      { status: 400, body: { error: { message: 'Permission x.y is not valid' } } },
      { body: { permissions: ['a.b'] } },
      { status: 400, body: { error: { message: 'invalid' } } },
    ]);
    const granted = await new RestPolicyApis(fn).testPermissions(ctx, ['a.b', 'x.y']);
    expect(granted).toEqual(['a.b']);
  });
});
