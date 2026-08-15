import { NextResponse } from 'next/server';
import { getAppBaseUrl, SESSION_COOKIE_NAME } from '@/lib/googleAuth';

export async function GET() {
  const response = NextResponse.redirect(new URL('/', getAppBaseUrl()));
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
