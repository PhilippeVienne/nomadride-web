import { discovery, type Configuration } from 'openid-client';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// APP_BASE_URL is the single source of truth for this app's own origin (used to
// build the Google redirect_uri). Coolify sets it explicitly per environment, so
// no dynamic per-preview derivation (unlike the old Vercel-era Auth0 setup) is
// needed here.
export function getAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error('APP_BASE_URL environment variable is not set.');
  }
  return url;
}

const GOOGLE_ISSUER = new URL('https://accounts.google.com');

// discovery() fetches Google's well-known OIDC configuration once and is cached
// for the lifetime of this module — fine for Coolify's single long-lived Docker
// instance (no per-request serverless cold start to worry about).
let configurationPromise: Promise<Configuration> | undefined;

export function getGoogleConfig(): Promise<Configuration> {
  if (!configurationPromise) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET environment variables are not set.');
    }
    configurationPromise = discovery(GOOGLE_ISSUER, clientId, clientSecret);
  }
  return configurationPromise;
}

export function getRedirectUri(): string {
  return `${getAppBaseUrl()}/auth/callback`;
}

// ---------------------------------------------------------------------
// Application session (JWT, HS256, signed with SESSION_SECRET).
// Deliberately decoupled from Google's ID token lifetime: Google OIDC only
// establishes identity at login time (sub + email), we never call Google APIs
// afterwards, so there is no refresh token to manage.
// ---------------------------------------------------------------------

export const SESSION_COOKIE_NAME = 'nomadride_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AppSessionPayload extends JWTPayload {
  sub: string; // Google `sub` claim, stored as googleId on the Payload user
  email?: string;
}

function getSessionSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is not set.');
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: AppSessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecretKey());
}

export async function verifySessionToken(token: string): Promise<AppSessionPayload | null> {
  try {
    const { payload } = await jwtVerify<AppSessionPayload>(token, getSessionSecretKey());
    return payload;
  } catch {
    // Expired, tampered, or signed with a rotated secret — treat as anonymous.
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};

// ---------------------------------------------------------------------
// Short-lived PKCE/state/nonce cookies, alive only during the redirect
// round-trip to Google (a few minutes). Coolify runs a single Docker
// instance, so no cross-instance shared state is needed for this.
// ---------------------------------------------------------------------

export const PKCE_COOKIE_NAME = 'nomadride_pkce_verifier';
export const STATE_COOKIE_NAME = 'nomadride_oauth_state';
export const NONCE_COOKIE_NAME = 'nomadride_oauth_nonce';
export const RETURN_TO_COOKIE_NAME = 'nomadride_return_to';

export const pkceCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 10, // 10 minutes is ample for a login redirect round-trip
};
