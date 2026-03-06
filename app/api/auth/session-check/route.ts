import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { auth } from '@/lib/auth';

export async function GET() {
  try {
    const headersList = await headers();
    const cookieStore = await cookies();
    
    // Get all cookies
    const allCookies = cookieStore.getAll();
    
    // Get session using Better Auth
    const session = await auth.api.getSession({
      headers: headersList,
    });

    return NextResponse.json({
      success: true,
      hasSession: !!session,
      session: session ? {
        id: session.session.id,
        userId: session.session.userId,
        expiresAt: session.session.expiresAt,
      } : null,
      user: session?.user ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      } : null,
      cookies: allCookies.map(c => ({
        name: c.name,
        hasValue: !!c.value,
        valueLength: c.value?.length || 0,
      })),
      environment: process.env.NODE_ENV,
      baseURL: process.env.BETTER_AUTH_URL,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      environment: process.env.NODE_ENV,
      baseURL: process.env.BETTER_AUTH_URL,
    }, { status: 500 });
  }
}
