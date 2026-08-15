import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomPKCECodeVerifier,
  randomState,
  randomNonce,
} from 'openid-client';
import {
  getGoogleConfig,
  getRedirectUri,
  PKCE_COOKIE_NAME,
  STATE_COOKIE_NAME,
  NONCE_COOKIE_NAME,
  RETURN_TO_COOKIE_NAME,
  pkceCookieOptions,
} from '@/lib/googleAuth';

export async function GET(request: NextRequest) {
  const config = await getGoogleConfig();

  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const state = randomState();
  const nonce = randomNonce();

  // Preserve where the user was trying to go, e.g. /auth/login?returnTo=/pitstop
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/';

  const authorizationUrl = buildAuthorizationUrl(config, {
    redirect_uri: getRedirectUri(),
    scope: 'openid email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(PKCE_COOKIE_NAME, codeVerifier, pkceCookieOptions);
  response.cookies.set(STATE_COOKIE_NAME, state, pkceCookieOptions);
  response.cookies.set(NONCE_COOKIE_NAME, nonce, pkceCookieOptions);
  response.cookies.set(RETURN_TO_COOKIE_NAME, returnTo, pkceCookieOptions);
  return response;
}
