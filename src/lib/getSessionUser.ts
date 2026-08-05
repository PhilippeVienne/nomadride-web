import type { NextRequest } from 'next/server';
import type { Payload } from 'payload';
import { auth0 } from './auth0';
import { ensurePayloadSchema } from './ensureSchema';
import { generateRandomPassword } from '../utils/crypto';

export const LOCAL_DEV_AUTH0_ID = 'auth0|default_local_user_95';

export interface Auth0SessionInfo {
  auth0Id: string;
  auth0Email?: string;
  isAuthenticated: boolean;
}

/**
 * Resolves the current Auth0 identity. Works both in Server Components
 * (no `request`) and in Route Handlers (`request` passed, also allowing a
 * `?userId=` override for local development/testing).
 * Falls back to a fixed local-dev identity when no session is available.
 */
export async function resolveAuth0Session(request?: NextRequest): Promise<Auth0SessionInfo> {
  let auth0Id: string | undefined;
  let auth0Email: string | undefined;

  try {
    const session = request ? await auth0.getSession(request) : await auth0.getSession();
    auth0Id = session?.user?.sub;
    auth0Email = session?.user?.email;
  } catch {
    console.warn('[Auth] Auth0 not fully configured or no active session. Using local development fallback.');
  }

  if (!auth0Id && request) {
    auth0Id = new URL(request.url).searchParams.get('userId') || undefined;
  }

  const isAuthenticated = !!auth0Id;
  return { auth0Id: auth0Id || LOCAL_DEV_AUTH0_ID, auth0Email, isAuthenticated };
}

/**
 * Finds the Payload `users` record for a given Auth0 id, self-healing the
 * database schema if the underlying tables don't exist yet (fresh
 * deployments against an empty Postgres/Supabase database).
 */
export async function findUserByAuth0Id(payload: Payload, auth0Id: string) {
  const findUser = () =>
    payload.find({
      collection: 'users',
      where: { auth0Id: { equals: auth0Id } },
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
 * Finds or provisions the Payload `users` record backing an Auth0 identity,
 * applying the GEORIDE_EMAIL/GEORIDE_PASSWORD env override when present.
 */
export async function getOrCreateUser(payload: Payload, auth0Id: string, auth0Email?: string) {
  const userResult = await findUserByAuth0Id(payload, auth0Id);
  let user = userResult.docs[0];

  const envEmail = process.env.GEORIDE_EMAIL;
  const envPassword = process.env.GEORIDE_PASSWORD;

  if (!user) {
    const sanitizedAuth0Id = auth0Id.replace(/[^a-zA-Z0-9]/g, '_');
    const userEmail = auth0Email || `motard_${sanitizedAuth0Id}@example.com`;

    user = await payload.create({
      collection: 'users',
      data: {
        email: userEmail,
        // Payload requires a password field for auth-enabled collections,
        // but this account is never logged into directly (Auth0 handles
        // authentication) — so it must be a random, unguessable value.
        password: generateRandomPassword(),
        auth0Id,
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
