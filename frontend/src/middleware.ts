import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/'];
  
  // Check if the current path is a public route
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route));
  
  // Get session cookie
  const sessionId = request.cookies.get('session_id');
  
  // If trying to access login page while authenticated, redirect to home
  if (pathname === '/login' && sessionId) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  
  // If trying to access protected route without session, redirect to login
  if (!isPublicRoute && !sessionId) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
