import type { FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import type { Config } from '../config.js';

export interface SessionUser {
  email: string;
  name?: string;
  picture?: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface PendingLogin {
  state: string;
  codeVerifier: string;
  returnTo: string;
}

declare module '@fastify/secure-session' {
  interface SessionData {
    user: SessionUser;
    pending: PendingLogin;
  }
}

export interface Caller {
  email: string;
  name?: string;
  picture?: string;
  accessToken: string;
}

export class UnauthenticatedError extends Error {
  constructor(message = 'Sign-in required') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export const OAUTH_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/cloud-platform'];

export function oauthClient(config: Config, redirectUri?: string): OAuth2Client {
  return new OAuth2Client({
    clientId: config.oauthClientId,
    clientSecret: config.oauthClientSecret,
    redirectUri,
  });
}

const REFRESH_MARGIN_MS = 60_000;

/**
 * Resolves the signed-in caller and a valid access token for them, refreshing it when it is about to expire.
 * In mock mode or with DEV_ACCESS_TOKEN, a local developer identity is used instead of a session.
 */
export async function resolveCaller(request: FastifyRequest, config: Config): Promise<Caller> {
  if (config.apiMode === 'mock') {
    return { email: request.iapEmail ?? config.devUserEmail, name: 'Demo user', accessToken: 'mock-token' };
  }
  if (config.devAccessToken) {
    return { email: config.devUserEmail, name: 'Local developer', accessToken: config.devAccessToken };
  }

  const user = request.session.get('user');
  if (!user) throw new UnauthenticatedError();

  // The OAuth identity must be the same person IAP let in.
  if (request.iapEmail && request.iapEmail.toLowerCase() !== user.email.toLowerCase()) {
    request.session.delete();
    throw new UnauthenticatedError('Signed-in account does not match the IAP identity');
  }

  if (user.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return { email: user.email, name: user.name, picture: user.picture, accessToken: user.accessToken };
  }
  if (!user.refreshToken) {
    request.session.delete();
    throw new UnauthenticatedError('Session expired');
  }

  const client = oauthClient(config);
  client.setCredentials({ refresh_token: user.refreshToken });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('No access token returned');
    const refreshed: SessionUser = {
      ...user,
      accessToken: token,
      expiresAt: client.credentials.expiry_date ?? Date.now() + 3_000_000,
      refreshToken: client.credentials.refresh_token ?? user.refreshToken,
    };
    request.session.set('user', refreshed);
    return { email: user.email, name: user.name, picture: user.picture, accessToken: token };
  } catch {
    request.session.delete();
    throw new UnauthenticatedError('Session expired');
  }
}
