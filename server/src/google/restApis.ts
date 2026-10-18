import {
  CallContext,
  DlpKind,
  DlpTemplate,
  GoogleApiError,
  InfoTypeDescription,
  ModelArmorTemplate,
  PolicyApis,
  SanitizeResponse,
  dlpTemplateName,
  templateName,
} from './types.js';

type FetchFn = typeof fetch;

const DLP_BASE = 'https://dlp.googleapis.com/v2';
const CRM_BASE = 'https://cloudresourcemanager.googleapis.com/v1';

export function modelArmorBase(location: string): string {
  // Templates are regional resources served from regional endpoints; "global" uses the global host.
  const host = location === 'global' ? 'modelarmor.googleapis.com' : `modelarmor.${location}.rep.googleapis.com`;
  return `https://${host}/v1`;
}

const enc = encodeURIComponent;

/**
 * Model Armor, Sensitive Data Protection and Resource Manager over REST,
 * always authenticated with the signed-in user's OAuth access token.
 */
export class RestPolicyApis implements PolicyApis {
  constructor(private readonly fetchFn: FetchFn = fetch) {}

  private async call<T>(ctx: CallContext, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.fetchFn(url, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${ctx.accessToken}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    if (!res.ok) {
      const err = (data as { error?: { message?: string; status?: string } } | undefined)?.error;
      throw new GoogleApiError(res.status, err?.message ?? `Request failed with status ${res.status}`, err?.status);
    }
    return (data ?? {}) as T;
  }

  private async listAll<T>(ctx: CallContext, url: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    do {
      const sep = url.includes('?') ? '&' : '?';
      const pageUrl = pageToken ? `${url}${sep}pageToken=${enc(pageToken)}` : url;
      const page = await this.call<Record<string, unknown>>(ctx, pageUrl);
      items.push(...((page[key] as T[] | undefined) ?? []));
      pageToken = page.nextPageToken as string | undefined;
    } while (pageToken);
    return items;
  }

  // Model Armor

  listTemplates(ctx: CallContext, location: string): Promise<ModelArmorTemplate[]> {
    return this.listAll(ctx, `${modelArmorBase(location)}/projects/${ctx.projectId}/locations/${location}/templates`, 'templates');
  }

  getTemplate(ctx: CallContext, location: string, id: string): Promise<ModelArmorTemplate> {
    return this.call(ctx, `${modelArmorBase(location)}/${templateName(ctx.projectId, location, id)}`);
  }

  createTemplate(ctx: CallContext, location: string, id: string, body: ModelArmorTemplate): Promise<ModelArmorTemplate> {
    return this.call(
      ctx,
      `${modelArmorBase(location)}/projects/${ctx.projectId}/locations/${location}/templates?templateId=${enc(id)}`,
      { method: 'POST', body },
    );
  }

  updateTemplate(
    ctx: CallContext,
    location: string,
    id: string,
    body: ModelArmorTemplate,
    updateMask: string[],
  ): Promise<ModelArmorTemplate> {
    return this.call(
      ctx,
      `${modelArmorBase(location)}/${templateName(ctx.projectId, location, id)}?updateMask=${enc(updateMask.join(','))}`,
      { method: 'PATCH', body },
    );
  }

  async deleteTemplate(ctx: CallContext, location: string, id: string): Promise<void> {
    await this.call(ctx, `${modelArmorBase(location)}/${templateName(ctx.projectId, location, id)}`, { method: 'DELETE' });
  }

  sanitize(
    ctx: CallContext,
    location: string,
    id: string,
    input: { kind: 'prompt' | 'response'; text: string; userPrompt?: string },
  ): Promise<SanitizeResponse> {
    const name = `${modelArmorBase(location)}/${templateName(ctx.projectId, location, id)}`;
    if (input.kind === 'prompt') {
      return this.call(ctx, `${name}:sanitizeUserPrompt`, {
        method: 'POST',
        body: { userPromptData: { text: input.text } },
      });
    }
    return this.call(ctx, `${name}:sanitizeModelResponse`, {
      method: 'POST',
      body: { modelResponseData: { text: input.text }, ...(input.userPrompt ? { userPrompt: input.userPrompt } : {}) },
    });
  }

  // Sensitive Data Protection

  listDlpTemplates(ctx: CallContext, location: string, kind: DlpKind): Promise<DlpTemplate[]> {
    const collection = kind === 'inspect' ? 'inspectTemplates' : 'deidentifyTemplates';
    return this.listAll(
      ctx,
      `${DLP_BASE}/projects/${ctx.projectId}/locations/${location}/${collection}?pageSize=1000`,
      collection,
    );
  }

  getDlpTemplate(ctx: CallContext, location: string, kind: DlpKind, id: string): Promise<DlpTemplate> {
    return this.call(ctx, `${DLP_BASE}/${dlpTemplateName(ctx.projectId, location, kind, id)}`);
  }

  createDlpTemplate(ctx: CallContext, location: string, kind: DlpKind, id: string, body: DlpTemplate): Promise<DlpTemplate> {
    const collection = kind === 'inspect' ? 'inspectTemplates' : 'deidentifyTemplates';
    const field = kind === 'inspect' ? 'inspectTemplate' : 'deidentifyTemplate';
    return this.call(ctx, `${DLP_BASE}/projects/${ctx.projectId}/locations/${location}/${collection}`, {
      method: 'POST',
      body: { [field]: body, templateId: id },
    });
  }

  updateDlpTemplate(
    ctx: CallContext,
    location: string,
    kind: DlpKind,
    id: string,
    body: DlpTemplate,
    updateMask: string[],
  ): Promise<DlpTemplate> {
    const field = kind === 'inspect' ? 'inspectTemplate' : 'deidentifyTemplate';
    return this.call(ctx, `${DLP_BASE}/${dlpTemplateName(ctx.projectId, location, kind, id)}`, {
      method: 'PATCH',
      body: { [field]: body, updateMask: updateMask.join(',') },
    });
  }

  async deleteDlpTemplate(ctx: CallContext, location: string, kind: DlpKind, id: string): Promise<void> {
    await this.call(ctx, `${DLP_BASE}/${dlpTemplateName(ctx.projectId, location, kind, id)}`, { method: 'DELETE' });
  }

  async listInfoTypes(ctx: CallContext, location: string): Promise<InfoTypeDescription[]> {
    const res = await this.call<{ infoTypes?: InfoTypeDescription[] }>(
      ctx,
      `${DLP_BASE}/infoTypes?locationId=${enc(location)}&filter=${enc('supported_by=INSPECT')}`,
    );
    return res.infoTypes ?? [];
  }

  // Resource Manager

  async testPermissions(ctx: CallContext, permissions: string[]): Promise<string[]> {
    const url = `${CRM_BASE}/projects/${ctx.projectId}:testIamPermissions`;
    try {
      const res = await this.call<{ permissions?: string[] }>(ctx, url, { method: 'POST', body: { permissions } });
      return res.permissions ?? [];
    } catch (err) {
      // A permission that does not exist in this environment fails the whole batch; retry one by one.
      if (err instanceof GoogleApiError && err.status === 400 && permissions.length > 1) {
        const results = await Promise.all(
          permissions.map((p) => this.testPermissions(ctx, [p]).catch(() => [] as string[])),
        );
        return results.flat();
      }
      throw err;
    }
  }
}
