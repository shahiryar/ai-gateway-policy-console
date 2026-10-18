import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifySecureSession from '@fastify/secure-session';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { Config } from './config.js';
import { registerIapVerification } from './auth/iap.js';
import { registerAuthRoutes } from './auth/routes.js';
import { UnauthenticatedError } from './auth/session.js';
import { MockPolicyApis } from './google/mockApis.js';
import { RestPolicyApis } from './google/restApis.js';
import { GoogleApiError, type PolicyApis } from './google/types.js';
import { registerApiRoutes } from './routes/api.js';
import { FirestoreApplicationStore, MemoryApplicationStore, type ApplicationStore } from './store/registry.js';

export interface BuildOptions {
  apis?: PolicyApis;
  store?: ApplicationStore;
  logger?: boolean;
}

const SESSION_MAX_AGE_S = 8 * 60 * 60;

export async function buildApp(config: Config, options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true, trustProxy: true });

  const apis =
    options.apis ??
    (config.apiMode === 'mock' ? new MockPolicyApis(config.projectId, config.locations[0]!) : new RestPolicyApis());
  const store =
    options.store ??
    (config.store === 'memory'
      ? new MemoryApplicationStore()
      : new FirestoreApplicationStore(config.projectId, config.firestoreDatabaseId));

  await app.register(fastifySecureSession, {
    key: config.sessionKey,
    cookieName: 'pc_session',
    expiry: SESSION_MAX_AGE_S,
    cookie: {
      path: '/',
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_S,
    },
  });

  registerIapVerification(app, config);

  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'same-origin');
    reply.header(
      'content-security-policy',
      "default-src 'self'; img-src 'self' https://*.googleusercontent.com data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    );
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof UnauthenticatedError) {
      return reply.code(401).send({ error: error.message, loginUrl: '/auth/login' });
    }
    if (error instanceof GoogleApiError) {
      // Pass Google's own status and message through: a 403 here means the user's IAM roles do not allow it.
      return reply.code(error.status).send({ error: error.message, googleStatus: error.googleStatus });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      return reply.code(statusCode).send({ error: (error as Error).message });
    }
    request.log.error({ err: error }, 'Unhandled error');
    return reply.code(500).send({ error: 'Internal error' });
  });

  app.get('/healthz', async () => ({ ok: true }));

  registerAuthRoutes(app, config);
  registerApiRoutes(app, { config, apis, store });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(config.webDist ?? path.join(here, '../../web/dist'));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/') || request.url.startsWith('/auth/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
