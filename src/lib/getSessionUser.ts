import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { Payload } from 'payload';
import { verifySessionToken, SESSION_COOKIE_NAME } from './googleAuth';
import { ensurePayloadSchema } from './ensureSchema';
import { generateRandomPassword } from '../utils/crypto';

export const LOCAL_DEV_GOOGLE_ID = 'google|default_local_user_95';

export interface GoogleSessionInfo {
  googleId: string;
  googleEmail?: string;
  isAuthenticated: boolean;
}

/**
 * Resolves the current Google identity from our own signed session cookie.
 * Works both in Server Components (no `request`, cookie read via
 * `next/headers`) and in Route Handlers (`request` passed, cookie read via
 * `request.cookies`).
 * Falls back to a fixed local-dev identity when no session is available.
 * The `?userId=` override is only honored outside production, to avoid
 * letting anyone impersonate a googleId via query string in prod.
 */
export async function resolveGoogleSession(request?: NextRequest): Promise<GoogleSessionInfo> {
  let googleId: string | undefined;
  let googleEmail: string | undefined;

  const rawToken = request
    ? request.cookies.get(SESSION_COOKIE_NAME)?.value
    : (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    const session = await verifySessionToken(rawToken);
    googleId = session?.sub;
    googleEmail = session?.email;
  }

  if (!googleId && request && process.env.NODE_ENV !== 'production') {
    googleId = new URL(request.url).searchParams.get('userId') || undefined;
  }

  const isAuthenticated = !!googleId;
  return { googleId: googleId || LOCAL_DEV_GOOGLE_ID, googleEmail, isAuthenticated };
}

/**
 * Finds the Payload `users` record for a given Google id, self-healing the
 * database schema if the underlying tables don't exist yet (fresh
 * deployments against an empty Postgres/Supabase database).
 */
export async function findUserByGoogleId(payload: Payload, googleId: string) {
  const findUser = () =>
    payload.find({
      collection: 'users',
      where: { googleId: { equals: googleId } },
      limit: 1,
    });

  try {
    return await findUser();
  } catch (err: any) {
    // 42P01 = relation (table) does not exist, 42703 = column does not exist.
    // Both indicate a schema drift that ensurePayloadSchema can self-heal.
    const code = err?.cause?.code;
    const isSchemaDrift =
      code === '42P01' ||
      code === '42703' ||
      String(err?.message).includes('42P01') ||
      String(err?.message).includes('42703');
    if (!isSchemaDrift) throw err;

    console.log(`[Payload DB Init] Schema drift detected (${code}). Creating/updating tables via ensurePayloadSchema...`);
    await ensurePayloadSchema(payload);
    return await findUser();
  }
}

/**
 * Finds or provisions the Payload `users` record backing a Google identity,
 * applying the GEORIDE_EMAIL/GEORIDE_PASSWORD env override when present.
 */
export async function getOrCreateUser(payload: Payload, googleId: string, googleEmail?: string) {
  const userResult = await findUserByGoogleId(payload, googleId);
  let user = userResult.docs[0];

  const envEmail = process.env.GEORIDE_EMAIL;
  const envPassword = process.env.GEORIDE_PASSWORD;

  if (!user) {
    const sanitizedGoogleId = googleId.replace(/[^a-zA-Z0-9]/g, '_');
    const userEmail = googleEmail || `motard_${sanitizedGoogleId}@example.com`;

    user = await payload.create({
      collection: 'users',
      data: {
        email: userEmail,
        // Payload requires a password field for auth-enabled collections,
        // but this account is never logged into directly (Google OIDC
        // handles authentication) — so it must be a random, unguessable value.
        password: generateRandomPassword(),
        googleId,
        geoRideEmail: envEmail || userEmail,
        geoRidePassword: envPassword,
        trackingStartDate: process.env.GEORIDE_START_DATE
          ? new Date(process.env.GEORIDE_START_DATE).toISOString()
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  } else if (envEmail && envPassword && user.geoRideEmail !== envEmail) {
    // Dynamically update credentials if modified in env files
    user = await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        geoRideEmail: envEmail,
        geoRidePassword: envPassword,
        lastSyncDate: null, // Reset sync date to pull new history
      },
    });
  }

  return user;
}
