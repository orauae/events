/**
 * @fileoverview Next.js Middleware - Authentication and Route Protection
 * 
 * This middleware handles authentication and authorization for all routes
 * in the ORA Events application. It enforces role-based access control
 * and redirects unauthenticated users to the login page.
 * 
 * ## Route Categories
 * 
 * ### Public Routes (no auth required)
 * - `/` - Landing page
 * - `/login`, `/signup` - Authentication pages
 * - `/about` - About page
 * - `/events/browse` - Public event browsing
 * - `/rsvp/*` - RSVP submission pages
 * - `/checkin/*` - Event check-in interface
 * - `/track/*` - Email tracking (opens and link clicks)
 * - `/api/auth/*` - Authentication API endpoints
 * 
 * ### Admin Routes (Admin role required)
 * - `/admin/*` - Admin dashboard and management
 * 
 * ### Manager Routes (EventManager role, Admins redirected)
 * - `/events/*` - Event management dashboard
 * - `/guests/*` - Guest management
 * - `/settings/*` - User settings
 * 
 * ### API Routes (auth handled by route handlers)
 * - `/api/*` - All API endpoints
 * 
 * ## Authentication Flow
 * 
 * 1. Check if route is public → Allow
 * 2. Check if route is API → Allow (API handles own auth)
 * 3. Check for session token → Redirect to login if missing
 * 4. Verify user role via `/api/me` endpoint
 * 5. Apply role-based redirects:
 *    - Non-admins on admin routes → Redirect to `/events`
 *    - Admins on manager routes → Redirect to `/admin`
 * 
 * @module middleware
 * @requires next/server - Next.js middleware utilities
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Routes that don't require authentication.
 * These are accessible to all users, including unauthenticated visitors.
 */
const publicRoutes = [
  '/',
  '/about',
  '/events/browse',
  '/api/auth',
  '/api/setup',
  '/rsvp',
  '/checkin',
  '/track',
];

/**
 * Routes that require Admin role.
 * Non-admin users are redirected to the manager dashboard.
 */
const adminRoutes = [
  '/admin',
];

/**
 * Routes for Event Managers.
 * Admin users are redirected to the admin panel instead.
 */
const managerRoutes = [
  '/events',
  '/guests',
  '/settings',
];

/**
 * API routes that handle their own authentication.
 * Middleware allows these through without auth checks.
 */
const apiRoutes = [
  '/api',
];

/**
 * Better Auth session cookie names
 * In production with HTTPS, Better Auth uses the __Secure- prefix
 */
const BETTER_AUTH_SESSION_COOKIE = 'better-auth.session_token';
const BETTER_AUTH_SESSION_COOKIE_SECURE = '__Secure-better-auth.session_token';

/**
 * Gets the session token from cookies, checking both regular and secure variants
 */
function getSessionToken(request: NextRequest): { token: string; cookieName: string } | null {
  const regularCookie = request.cookies.get(BETTER_AUTH_SESSION_COOKIE);
  const secureCookie = request.cookies.get(BETTER_AUTH_SESSION_COOKIE_SECURE);
  
  if (regularCookie?.value) {
    return { token: regularCookie.value, cookieName: BETTER_AUTH_SESSION_COOKIE };
  }
  if (secureCookie?.value) {
    return { token: secureCookie.value, cookieName: BETTER_AUTH_SESSION_COOKIE_SECURE };
  }
  return null;
}

/**
 * Checks if a pathname matches any public route.
 * Also allows system routes like /_next and /.well-known.
 * 
 * @param pathname - The URL pathname to check
 * @returns True if the route is public
 */
function isPublicRoute(pathname: string): boolean {
  // Always allow these patterns
  if (pathname.startsWith('/.well-known') || 
      pathname.startsWith('/sw.js') ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api/auth')) {
    return true;
  }
  
  return publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Checks if a pathname is an API route.
 * 
 * @param pathname - The URL pathname to check
 * @returns True if the route is an API endpoint
 */
function isApiRoute(pathname: string): boolean {
  return apiRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Checks if a pathname is an admin-only route.
 * 
 * @param pathname - The URL pathname to check
 * @returns True if the route requires Admin role
 */
function isAdminRoute(pathname: string): boolean {
  return adminRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Checks if a pathname is a manager route.
 * 
 * @param pathname - The URL pathname to check
 * @returns True if the route is for Event Managers
 */
function isManagerRoute(pathname: string): boolean {
  return managerRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Retrieves the user's role by calling the /api/me endpoint.
 * Uses the session token from cookies for authentication.
 * 
 * @param request - The incoming Next.js request
 * @param sessionToken - The session token from cookies
 * @param cookieName - The name of the cookie containing the session token
 * @returns The user's role ('Admin' or 'EventManager') or null if not found
 */
async function getUserRole(request: NextRequest, sessionToken: string, cookieName: string): Promise<'Admin' | 'EventManager' | null> {
  try {
    // Get the base URL from the request or environment
    // In production, prefer the environment variable to avoid issues with internal requests
    const baseUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    
    // Call the /api/me endpoint to get user info including role
    const response = await fetch(`${baseUrl}/api/me`, {
      headers: {
        'Cookie': `${cookieName}=${sessionToken}`,
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      return null;
    }
    
    const userData = await response.json();
    return userData.role as 'Admin' | 'EventManager';
  } catch (error) {
    console.error('[Middleware] Error getting user role:', error);
    return null;
  }
}

/**
 * Next.js middleware function.
 * 
 * Handles authentication and authorization for all matched routes.
 * Enforces role-based access control and redirects as needed.
 * 
 * @param request - The incoming Next.js request
 * @returns NextResponse to continue, redirect, or rewrite the request
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old auth routes to home
  if (pathname === '/login' || pathname === '/signup') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    // If user is authenticated and on home page, redirect to their dashboard
    if (pathname === '/') {
      const sessionData = getSessionToken(request);
      if (sessionData) {
        const userRole = await getUserRole(request, sessionData.token, sessionData.cookieName);
        if (userRole === 'Admin') {
          return NextResponse.redirect(new URL('/admin', request.url));
        } else if (userRole) {
          return NextResponse.redirect(new URL('/events', request.url));
        }
      }
    }
    return NextResponse.next();
  }

  // Allow API routes - they handle their own authentication
  if (isApiRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for session token in cookies (both regular and secure variants)
  const sessionData = getSessionToken(request);

  // If no session token and trying to access protected route, redirect to login
  if (!sessionData) {
    const url = new URL('/', request.url);
    return NextResponse.redirect(url);
  }

  const userRole = await getUserRole(request, sessionData.token, sessionData.cookieName);

  // If session cookie exists but session is invalid/expired, clear it and redirect to login
  if (!userRole) {
    const url = new URL('/', request.url);
    const response = NextResponse.redirect(url);
    // Clear the stale session cookie
    response.cookies.delete(BETTER_AUTH_SESSION_COOKIE);
    response.cookies.delete(BETTER_AUTH_SESSION_COOKIE_SECURE);
    return response;
  }

  // Check admin routes - require admin role
  if (isAdminRoute(pathname)) {
    if (userRole !== 'Admin') {
      // Redirect non-admin users to the manager dashboard
      const url = new URL('/events', request.url);
      return NextResponse.redirect(url);
    }
  }

  // Check manager routes - redirect admins to admin panel
  if (isManagerRoute(pathname)) {
    if (userRole === 'Admin') {
      const url = new URL('/admin', request.url);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

/**
 * Middleware configuration.
 * 
 * Defines which routes the middleware should run on.
 * Excludes static files, images, and other assets.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
