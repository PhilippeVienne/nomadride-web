import { Auth0Client } from '@auth0/nextjs-auth0/server';

// APP_BASE_URL can't be a single fixed value across environments: Vercel mints a
// unique URL per preview deployment (and a branch alias), so a static env var
// would either be wrong for every preview or (worse) silently reuse whatever
// domain it was last set to — e.g. leaking the production callback URL into a
// preview build and getting rejected by Auth0 ("Callback URL mismatch").
// Vercel's own env vars are populated fresh per-deployment, so derive from
// those whenever an explicit APP_BASE_URL isn't set.
function resolveAppBaseUrl(): string | undefined {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;

  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  const previewHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (previewHost) return `https://${previewHost}`;

  return undefined;
}

export const auth0 = new Auth0Client({ appBaseUrl: resolveAppBaseUrl() });
