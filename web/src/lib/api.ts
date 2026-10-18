import type {
  Application,
  ApplicationInput,
  DlpKind,
  DlpTemplate,
  InfoType,
  Instructions,
  Me,
  ModelArmorTemplate,
  SanitizeResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-requested-with': 'policy-console',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && typeof data.loginUrl === 'string') {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `${data.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    throw new ApiError(401, 'Redirecting to sign-in');
  }
  if (!res.ok) {
    throw new ApiError(res.status, typeof data.error === 'string' ? data.error : `Request failed (${res.status})`, data);
  }
  return data as T;
}

const loc = (location: string) => `/api/locations/${encodeURIComponent(location)}`;

export const api = {
  me: (refresh = false) => request<Me>('GET', `/api/me${refresh ? '?refresh=1' : ''}`),
  logout: () => request<void>('POST', '/auth/logout'),

  listTemplates: (location: string) =>
    request<{ templates: ModelArmorTemplate[] }>('GET', `${loc(location)}/templates`).then((r) => r.templates),
  getTemplate: (location: string, id: string) => request<ModelArmorTemplate>('GET', `${loc(location)}/templates/${id}`),
  createTemplate: (location: string, id: string, template: ModelArmorTemplate) =>
    request<ModelArmorTemplate>('POST', `${loc(location)}/templates`, { id, template }),
  updateTemplate: (location: string, id: string, template: ModelArmorTemplate) =>
    request<ModelArmorTemplate>('PATCH', `${loc(location)}/templates/${id}`, template),
  deleteTemplate: (location: string, id: string, force = false) =>
    request<void>('DELETE', `${loc(location)}/templates/${id}${force ? '?force=1' : ''}`),
  sanitize: (location: string, id: string, body: { kind: 'prompt' | 'response'; text: string; userPrompt?: string }) =>
    request<SanitizeResponse>('POST', `${loc(location)}/templates/${id}/sanitize`, body),

  listDlp: (location: string, kind: DlpKind) =>
    request<{ templates: DlpTemplate[] }>('GET', `${loc(location)}/dlp/${kind}`).then((r) => r.templates),
  getDlp: (location: string, kind: DlpKind, id: string) => request<DlpTemplate>('GET', `${loc(location)}/dlp/${kind}/${id}`),
  createDlp: (location: string, kind: DlpKind, id: string, template: DlpTemplate) =>
    request<DlpTemplate>('POST', `${loc(location)}/dlp/${kind}`, { id, template }),
  updateDlp: (location: string, kind: DlpKind, id: string, template: DlpTemplate) =>
    request<DlpTemplate>('PATCH', `${loc(location)}/dlp/${kind}/${id}`, template),
  deleteDlp: (location: string, kind: DlpKind, id: string) => request<void>('DELETE', `${loc(location)}/dlp/${kind}/${id}`),
  infoTypes: (location: string) =>
    request<{ infoTypes: InfoType[] }>('GET', `${loc(location)}/info-types`).then((r) => r.infoTypes),

  listApps: () => request<{ applications: Application[] }>('GET', '/api/apps').then((r) => r.applications),
  getApp: (id: string) => request<Application>('GET', `/api/apps/${id}`),
  createApp: (input: ApplicationInput) => request<Application>('POST', '/api/apps', input),
  updateApp: (id: string, input: ApplicationInput) => request<Application>('PUT', `/api/apps/${id}`, input),
  deleteApp: (id: string) => request<void>('DELETE', `/api/apps/${id}`),
  instructions: (id: string) => request<Instructions>('GET', `/api/apps/${id}/instructions`),
};
