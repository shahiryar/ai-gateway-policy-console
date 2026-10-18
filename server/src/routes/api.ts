import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import { resolveCaller, type Caller } from '../auth/session.js';
import { generateInstructions } from '../instructions/generate.js';
import { CallContext, DlpKind, ModelArmorTemplate, PolicyApis } from '../google/types.js';
import { applicationInput, type Application, type ApplicationStore } from '../store/registry.js';

export const PERMISSIONS = {
  templatesList: 'modelarmor.templates.list',
  templatesGet: 'modelarmor.templates.get',
  templatesCreate: 'modelarmor.templates.create',
  templatesUpdate: 'modelarmor.templates.update',
  templatesDelete: 'modelarmor.templates.delete',
  sanitizePrompt: 'modelarmor.templates.useToSanitizeUserPrompt',
  sanitizeResponse: 'modelarmor.templates.useToSanitizeModelResponse',
  inspectList: 'dlp.inspectTemplates.list',
  inspectCreate: 'dlp.inspectTemplates.create',
  inspectUpdate: 'dlp.inspectTemplates.update',
  inspectDelete: 'dlp.inspectTemplates.delete',
  deidentifyList: 'dlp.deidentifyTemplates.list',
  deidentifyCreate: 'dlp.deidentifyTemplates.create',
  deidentifyUpdate: 'dlp.deidentifyTemplates.update',
  deidentifyDelete: 'dlp.deidentifyTemplates.delete',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionMap = Record<PermissionKey, boolean>;

const PERMISSION_TTL_MS = 5 * 60 * 1000;

const templateId = z.string().regex(/^[a-zA-Z0-9_-]{1,63}$/, 'Use 1-63 letters, numbers, hyphens or underscores');
const dlpId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, 'Use 1-100 letters, numbers, hyphens or underscores');
const dlpKind = z.enum(['inspect', 'deidentify']);

const templateBody = z
  .object({
    filterConfig: z.record(z.unknown()).default({}),
    templateMetadata: z.record(z.unknown()).optional(),
    labels: z.record(z.string()).optional(),
  })
  .strip();

const sanitizeBody = z.object({
  kind: z.enum(['prompt', 'response']),
  text: z.string().min(1).max(50_000),
  userPrompt: z.string().max(50_000).optional(),
});

const dlpBody = z
  .object({
    displayName: z.string().max(256).optional(),
    description: z.string().max(256).optional(),
    inspectConfig: z.record(z.unknown()).optional(),
    deidentifyConfig: z.record(z.unknown()).optional(),
  })
  .strip();

export interface ApiDeps {
  config: Config;
  apis: PolicyApis;
  store: ApplicationStore;
}

export function registerApiRoutes(app: FastifyInstance, { config, apis, store }: ApiDeps) {
  const permissionCache = new Map<string, { at: number; perms: PermissionMap }>();

  async function caller(request: FastifyRequest): Promise<{ caller: Caller; ctx: CallContext }> {
    const c = await resolveCaller(request, config);
    return { caller: c, ctx: { accessToken: c.accessToken, projectId: config.projectId } };
  }

  async function permissions(c: Caller, ctx: CallContext, fresh = false): Promise<PermissionMap> {
    const key = c.email.toLowerCase();
    const cached = permissionCache.get(key);
    if (!fresh && cached && Date.now() - cached.at < PERMISSION_TTL_MS) return cached.perms;
    const granted = new Set(await apis.testPermissions(ctx, Object.values(PERMISSIONS)));
    const perms = Object.fromEntries(
      Object.entries(PERMISSIONS).map(([k, p]) => [k, granted.has(p)]),
    ) as PermissionMap;
    permissionCache.set(key, { at: Date.now(), perms });
    return perms;
  }

  function location(request: FastifyRequest): string {
    const loc = (request.params as { location: string }).location;
    if (!config.locations.includes(loc)) {
      throw Object.assign(new Error(`Location ${loc} is not enabled for this console`), { statusCode: 400 });
    }
    return loc;
  }

  function forbid(reply: FastifyReply, message: string) {
    return reply.code(403).send({ error: message });
  }

  // CSRF guard: browsers cannot send this custom header cross-site without a CORS preflight, which we never allow.
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (request.method === 'GET' || request.method === 'HEAD') return;
    if (request.headers['x-requested-with'] !== 'policy-console') {
      return reply.code(403).send({ error: 'Missing x-requested-with header' });
    }
  });

  app.get('/api/me', async (request) => {
    const { caller: c, ctx } = await caller(request);
    const fresh = (request.query as Record<string, string>).refresh === '1';
    return {
      email: c.email,
      name: c.name,
      picture: c.picture,
      projectId: config.projectId,
      locations: config.locations,
      mode: config.apiMode,
      permissions: await permissions(c, ctx, fresh),
    };
  });

  // Model Armor templates

  app.get('/api/locations/:location/templates', async (request) => {
    const { ctx } = await caller(request);
    return { templates: await apis.listTemplates(ctx, location(request)) };
  });

  app.get('/api/locations/:location/templates/:id', async (request) => {
    const { ctx } = await caller(request);
    const { id } = request.params as { id: string };
    return apis.getTemplate(ctx, location(request), templateId.parse(id));
  });

  app.post('/api/locations/:location/templates', async (request, reply) => {
    const { ctx } = await caller(request);
    const body = z.object({ id: templateId, template: templateBody }).parse(request.body);
    const created = await apis.createTemplate(ctx, location(request), body.id, body.template as ModelArmorTemplate);
    return reply.code(201).send(created);
  });

  app.patch('/api/locations/:location/templates/:id', async (request) => {
    const { ctx } = await caller(request);
    const { id } = request.params as { id: string };
    const body = templateBody.parse(request.body);
    const mask = ['filterConfig', ...(body.templateMetadata ? ['templateMetadata'] : []), ...(body.labels ? ['labels'] : [])];
    return apis.updateTemplate(ctx, location(request), templateId.parse(id), body as ModelArmorTemplate, mask);
  });

  app.delete('/api/locations/:location/templates/:id', async (request, reply) => {
    const { ctx } = await caller(request);
    const { id } = request.params as { id: string };
    const loc = location(request);
    const inUse = (await store.list()).filter(
      (a) => a.location === loc && (a.promptTemplateId === id || a.responseTemplateId === id),
    );
    if (inUse.length && (request.query as Record<string, string>).force !== '1') {
      return reply.code(409).send({
        error: `Template is assigned to ${inUse.length} application(s): ${inUse.map((a) => a.name).join(', ')}`,
        applications: inUse.map((a) => ({ id: a.id, name: a.name })),
      });
    }
    await apis.deleteTemplate(ctx, loc, templateId.parse(id));
    return reply.code(204).send();
  });

  app.post('/api/locations/:location/templates/:id/sanitize', async (request) => {
    const { ctx } = await caller(request);
    const { id } = request.params as { id: string };
    return apis.sanitize(ctx, location(request), templateId.parse(id), sanitizeBody.parse(request.body));
  });

  // Sensitive Data Protection templates

  app.get('/api/locations/:location/dlp/:kind', async (request) => {
    const { ctx } = await caller(request);
    const kind = dlpKind.parse((request.params as { kind: string }).kind);
    return { templates: await apis.listDlpTemplates(ctx, location(request), kind) };
  });

  app.get('/api/locations/:location/dlp/:kind/:id', async (request) => {
    const { ctx } = await caller(request);
    const params = request.params as { kind: string; id: string };
    return apis.getDlpTemplate(ctx, location(request), dlpKind.parse(params.kind), dlpId.parse(params.id));
  });

  app.post('/api/locations/:location/dlp/:kind', async (request, reply) => {
    const { ctx } = await caller(request);
    const kind = dlpKind.parse((request.params as { kind: string }).kind);
    const body = z.object({ id: dlpId, template: dlpBody }).parse(request.body);
    const created = await apis.createDlpTemplate(ctx, location(request), kind, body.id, body.template);
    return reply.code(201).send(created);
  });

  app.patch('/api/locations/:location/dlp/:kind/:id', async (request) => {
    const { ctx } = await caller(request);
    const params = request.params as { kind: string; id: string };
    const kind: DlpKind = dlpKind.parse(params.kind);
    const body = dlpBody.parse(request.body);
    const mask = ['displayName', 'description', kind === 'inspect' ? 'inspectConfig' : 'deidentifyConfig'];
    return apis.updateDlpTemplate(ctx, location(request), kind, dlpId.parse(params.id), body, mask);
  });

  app.delete('/api/locations/:location/dlp/:kind/:id', async (request, reply) => {
    const { ctx } = await caller(request);
    const params = request.params as { kind: string; id: string };
    await apis.deleteDlpTemplate(ctx, location(request), dlpKind.parse(params.kind), dlpId.parse(params.id));
    return reply.code(204).send();
  });

  app.get('/api/locations/:location/info-types', async (request) => {
    const { ctx } = await caller(request);
    return { infoTypes: await apis.listInfoTypes(ctx, location(request)) };
  });

  // Application registry. Stored by the console; access is still decided by the caller's GCP permissions:
  // anyone who can read templates can register an app, and only its creator or a template editor can change it.

  async function canEdit(c: Caller, ctx: CallContext, appRecord: Application): Promise<boolean> {
    if (appRecord.createdBy.toLowerCase() === c.email.toLowerCase()) return true;
    return (await permissions(c, ctx)).templatesUpdate;
  }

  app.get('/api/apps', async (request, reply) => {
    const { caller: c, ctx } = await caller(request);
    if (!(await permissions(c, ctx)).templatesList) return forbid(reply, 'You need permission to list Model Armor templates');
    return { applications: await store.list() };
  });

  app.get('/api/apps/:id', async (request, reply) => {
    const { caller: c, ctx } = await caller(request);
    if (!(await permissions(c, ctx)).templatesList) return forbid(reply, 'You need permission to list Model Armor templates');
    const found = await store.get((request.params as { id: string }).id);
    if (!found) return reply.code(404).send({ error: 'Application not found' });
    return { ...found, canEdit: await canEdit(c, ctx, found) };
  });

  app.post('/api/apps', async (request, reply) => {
    const { caller: c, ctx } = await caller(request);
    if (!(await permissions(c, ctx)).templatesGet) return forbid(reply, 'You need permission to read Model Armor templates');
    const input = applicationInput.parse(request.body);
    if (!config.locations.includes(input.location)) return reply.code(400).send({ error: 'Unknown location' });
    // Fail early with a clear message if the template does not exist or the caller cannot see it.
    await apis.getTemplate(ctx, input.location, input.promptTemplateId);
    if (input.responseTemplateId) await apis.getTemplate(ctx, input.location, input.responseTemplateId);
    return reply.code(201).send(await store.create(input, c.email));
  });

  app.put('/api/apps/:id', async (request, reply) => {
    const { caller: c, ctx } = await caller(request);
    const id = (request.params as { id: string }).id;
    const existing = await store.get(id);
    if (!existing) return reply.code(404).send({ error: 'Application not found' });
    if (!(await canEdit(c, ctx, existing))) {
      return forbid(reply, 'Only the creator or a Model Armor template editor can change this application');
    }
    const input = applicationInput.parse(request.body);
    if (!config.locations.includes(input.location)) return reply.code(400).send({ error: 'Unknown location' });
    await apis.getTemplate(ctx, input.location, input.promptTemplateId);
    if (input.responseTemplateId) await apis.getTemplate(ctx, input.location, input.responseTemplateId);
    return store.update(id, input, c.email);
  });

  app.delete('/api/apps/:id', async (request, reply) => {
    const { caller: c, ctx } = await caller(request);
    const id = (request.params as { id: string }).id;
    const existing = await store.get(id);
    if (!existing) return reply.code(404).send({ error: 'Application not found' });
    if (!(await canEdit(c, ctx, existing))) {
      return forbid(reply, 'Only the creator or a Model Armor template editor can delete this application');
    }
    await store.delete(id);
    return reply.code(204).send();
  });

  app.get('/api/apps/:id/instructions', async (request, reply) => {
    const { caller: c, ctx } = await caller(request);
    if (!(await permissions(c, ctx)).templatesList) return forbid(reply, 'You need permission to list Model Armor templates');
    const found = await store.get((request.params as { id: string }).id);
    if (!found) return reply.code(404).send({ error: 'Application not found' });
    return generateInstructions({
      projectId: config.projectId,
      location: found.location,
      promptTemplateId: found.promptTemplateId,
      responseTemplateId: found.responseTemplateId,
      integrationType: found.integrationType,
      appName: found.name,
      workloadServiceAccount: found.workloadServiceAccount,
      model: found.model,
    });
  });
}
