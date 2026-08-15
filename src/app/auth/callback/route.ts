import { NextRequest, NextResponse } from 'next/server';
import { authorizationCodeGrant } from 'openid-client';
import {
  getGoogleConfig,
  signSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  PKCE_COOKIE_NAME,
  STATE_COOKIE_NAME,
  NONCE_COOKIE_NAME,
  RETURN_TO_COOKIE_NAME,
} from '@/lib/googleAuth';

export async function GET(request: NextRequest) {
  const codeVerifier = request.cookies.get(PKCE_COOKIE_NAME)?.value;
  const expectedState = request.cookies.get(STATE_COOKIE_NAME)?.value;
  const expectedNonce = request.cookies.get(NONCE_COOKIE_NAME)?.value;
  const returnTo = request.cookies.get(RETURN_TO_COOKIE_NAME)?.value || '/';

  const clearTempCookies = (response: NextResponse) => {
    response.cookies.delete(PKCE_COOKIE_NAME);
    response.cookies.delete(STATE_COOKIE_NAME);
    response.cookies.delete(NONCE_COOKIE_NAME);
    response.cookies.delete(RETURN_TO_COOKIE_NAME);
    return response;
  };

  if (!codeVerifier || !expectedState || !expectedNonce) {
    console.error('[Auth Callback] Missing PKCE/state/nonce cookies (expired or cleared).');
    return clearTempCookies(
      NextResponse.redirect(new URL('/?authError=missing_state', request.url)),
    );
  }

  try {
    const config = await getGoogleConfig();

    const tokens = await authorizationCodeGrant(config, request.nextUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState,
      expectedNonce,
    });

    const claims = tokens.claims();
    const sub = claims?.sub;
    const email = typeof claims?.email === 'string' ? claims.email : undefined;

    if (!sub) {
      throw new Error('Google ID token did not contain a `sub` claim.');
    }

    const sessionToken = await signSessionToken({ sub, email });

    const response = clearTempCookies(
      NextResponse.redirect(new URL(returnTo, request.url)),
    );
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions);
    return response;
  } catch (error) {
    console.error('[Auth Callback] Google authorization code exchange failed:', error);
    return clearTempCookies(
      NextResponse.redirect(new URL('/?authError=exchange_failed', request.url)),
    );
  }
}
