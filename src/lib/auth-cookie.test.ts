import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie } from './auth';

function cookieHeader(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  setSessionCookie(response, 'test-user', 'test-token', request);
  return response.headers.get('set-cookie') || '';
}

const originalCookieSecure = process.env.AUTH_COOKIE_SECURE;

try {
  delete process.env.AUTH_COOKIE_SECURE;
  assert.match(cookieHeader(new NextRequest('http://189.24.79.239/api/auth')), /HttpOnly/);
  assert.doesNotMatch(cookieHeader(new NextRequest('http://189.24.79.239/api/auth')), /Secure/);
  assert.match(cookieHeader(new NextRequest('https://example.test/api/auth')), /Secure/);

  const forwardedRequest = new NextRequest('http://internal:5000/api/auth', {
    headers: { 'x-forwarded-proto': 'https' },
  });
  assert.match(cookieHeader(forwardedRequest), /Secure/);

  process.env.AUTH_COOKIE_SECURE = 'true';
  assert.match(cookieHeader(new NextRequest('http://189.24.79.239/api/auth')), /Secure/);
  process.env.AUTH_COOKIE_SECURE = 'false';
  assert.doesNotMatch(cookieHeader(new NextRequest('https://example.test/api/auth')), /Secure/);

  console.log('auth cookie protocol tests passed');
} finally {
  if (originalCookieSecure === undefined) delete process.env.AUTH_COOKIE_SECURE;
  else process.env.AUTH_COOKIE_SECURE = originalCookieSecure;
}
