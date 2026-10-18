import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import type { Config } from '../config.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Email of the principal IAP authenticated, when IAP verification is on. */
    iapEmail?: string;
  }
}

const IAP_ISSUER = 'https://cloud.google.com/iap';
const KEY_TTL_MS = 60 * 60 * 1000;

/**
 * Verifies the signed header IAP adds to every request (x-goog-iap-jwt-assertion).
 * This guards against traffic that bypasses IAP; it is enabled when IAP_AUDIENCE is set.
 */
export function registerIapVerification(app: FastifyInstance, config: Config) {
  app.decorateRequest('iapEmail', undefined);
  if (!config.iapAudience) return;

  const client = new OAuth2Client();
  let keys: { pubkeys: Record<string, string>; fetchedAt: number } | undefined;

  async function publicKeys() {
    if (!keys || Date.now() - keys.fetchedAt > KEY_TTL_MS) {
      const res = await client.getIapPublicKeys();
      keys = { pubkeys: res.pubkeys as unknown as Record<string, string>, fetchedAt: Date.now() };
    }
    return keys.pubkeys;
  }

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/healthz') return;
    const assertion = request.headers['x-goog-iap-jwt-assertion'];
    if (typeof assertion !== 'string') {
      return reply.code(401).send({ error: 'Missing IAP assertion' });
    }
    try {
      const ticket = await client.verifySignedJwtWithCertsAsync(assertion, await publicKeys(), config.iapAudience, [
        IAP_ISSUER,
      ]);
      const email = ticket.getPayload()?.email;
      if (!email) throw new Error('No email in IAP assertion');
      request.iapEmail = email;
    } catch (err) {
      request.log.warn({ err }, 'IAP assertion rejected');
      return reply.code(401).send({ error: 'Invalid IAP assertion' });
    }
  });
}
