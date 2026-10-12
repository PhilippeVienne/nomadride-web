import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * On AWS the app is reachable through two addresses: the public domain
 * (CloudFront) and the raw Lambda function URL behind it. CloudFront adds a
 * secret header to every request it forwards (see infra/aws/site.tf); anything
 * arriving without it came straight to the function URL and is refused, so
 * CloudFront stays the only way in. Without ORIGIN_VERIFY_SECRET (local dev,
 * any other host) every request passes.
 */
export function proxy(request: NextRequest) {
  const secret = process.env.ORIGIN_VERIFY_SECRET;
  if (secret && request.headers.get('x-origin-verify') !== secret) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return NextResponse.next();
}
