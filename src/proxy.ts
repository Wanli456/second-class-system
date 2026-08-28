import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = `/api${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: '/uploads/:path*' };
