import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CodeChallengeMethod } from 'google-auth-library';
import type { Config } from '../config.js';
import { OAUTH_SCOPES, oauthClient } from './session.js';

function redirectUri(request: FastifyRequest, config: Config): string {
  if (config.publicUrl) return `${config.publicUrl}/auth/callback`;
  return `${request.protocol}://${request.host}/auth/callback`;
}

/** Only allow same-site relative paths as post-login destinations. */
function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function registerAuthRoutes(app: FastifyInstance, config: Config) {
  const oauthEnabled = config.apiMode === 'live' && !config.devAccessToken;

  app.get('/auth/login', async (request, reply) => {
    const returnTo = safeReturnTo((request.query as Record<string, unknown>).returnTo);
    if (!oauthEnabled) return reply.redirect(returnTo);

    const client = oauthClient(config, redirectUri(request, config));
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomBytes(16).toString('hex');
    request.session.set('pending', { state, codeVerifier, returnTo });

    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: OAUTH_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      ...(request.iapEmail ? { login_hint: request.iapEmail } : {}),
      ...(config.allowedDomain ? { hd: config.allowedDomain } : {}),
    });
    return reply.redirect(url);
  });

  app.get('/auth/callback', async (request, reply) => {
    if (!oauthEnabled) return reply.redirect('/');
    const query = request.query as Record<string, string | undefined>;
    const pending = request.session.get('pending');
    request.session.set('pending', undefined);

    if (query.error) {
      return reply.code(400).type('text/plain').send(`Sign-in was cancelled or failed: ${query.error}`);
    }
    if (!pending || !query.code || query.state !== pending.state) {
      return reply.code(400).type('text/plain').send('Sign-in session expired. Go back and try again.');
    }

    const client = oauthClient(config, redirectUri(request, config));
    const { tokens } = await client.getToken({ code: query.code, codeVerifier: pending.codeVerifier });
    if (!tokens.id_token || !tokens.access_token) {
      return reply.code(400).type('text/plain').send('Google did not return the expected tokens.');
    }
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.oauthClientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      return reply.code(403).type('text/plain').send('Your Google account email is not verified.');
    }
    if (config.allowedDomain && payload.hd !== config.allowedDomain) {
      return reply.code(403).type('text/plain').send(`Only ${config.allowedDomain} accounts can use this console.`);
    }
    if (request.iapEmail && request.iapEmail.toLowerCase() !== payload.email.toLowerCase()) {
      return reply
        .code(403)
        .type('text/plain')
        .send(`You are signed in to IAP as ${request.iapEmail}. Sign in to Google with the same account.`);
    }

    request.session.set('user', {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ?? Date.now() + 3_000_000,
    });
    return reply.redirect(pending.returnTo);
  });

  app.post('/auth/logout', async (request, reply) => {
    request.session.delete();
    return reply.send({ ok: true });
  });
}
