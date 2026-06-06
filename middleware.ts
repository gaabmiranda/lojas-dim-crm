import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

// Config "edge-light": só inicializa next-auth com session JWT, sem Drizzle/DB
// (que não roda em edge runtime). A validação de credentials é feita na rota
// /api/auth/[...nextauth] e o JWT criado é verificado aqui.
const { auth: middlewareAuth } = NextAuth({
  session: { strategy: 'jwt' },
  providers: [],
  trustHost: true,
});

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/webhooks',
  '/api/sync',
  '/api/cron',
  '/api/health',
  '/api/admin/fix-db',
  '/_next',
  '/favicon.ico',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export default middlewareAuth((req) => {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (!req.auth) {
    const url = new URL('/login', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
