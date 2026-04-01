import { NextResponse } from 'next/server';
import { db } from '@/db';
import { user } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    const result = await db.select({ count: sql<number>`count(*)` }).from(user);
    const hasUsers = Number(result[0].count) > 0;
    return NextResponse.json({ hasUsers });
  } catch {
    return NextResponse.json({ hasUsers: false });
  }
}
