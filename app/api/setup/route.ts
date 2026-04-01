import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { user } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Check if any users exist — only allow setup when DB is empty
    const result = await db.select({ count: sql<number>`count(*)` }).from(user);
    if (Number(result[0].count) > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. Users already exist.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required.' },
        { status: 400 }
      );
    }

    // Use better-auth's internal API to create the user via sign-up
    const signUpResponse = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });

    if (!signUpResponse?.user?.id) {
      return NextResponse.json(
        { error: 'Failed to create user account.' },
        { status: 500 }
      );
    }

    // Set the first user as Admin
    await db
      .update(user)
      .set({ role: 'Admin' })
      .where(sql`${user.id} = ${signUpResponse.user.id}`);

    // Return the session info so the client can auto-login
    return NextResponse.json({
      success: true,
      user: { id: signUpResponse.user.id, name, email, role: 'Admin' },
    });
  } catch (error) {
    console.error('[Setup] Error:', error);
    return NextResponse.json(
      { error: 'Setup failed. Please try again.' },
      { status: 500 }
    );
  }
}
