import { NextResponse } from 'next/server';
import { db } from '@/db';
import { user, account } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email') || 'admin@eventos.com';
  const password = searchParams.get('password') || 'Admin123!';

  try {
    // Find user
    const users = await db.select().from(user).where(eq(user.email, email));
    
    if (users.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
        email,
        allUsers: await db.select({ id: user.id, email: user.email, name: user.name }).from(user),
      });
    }

    const foundUser = users[0];

    // Find account
    const accounts = await db.select().from(account).where(eq(account.userId, foundUser.id));
    
    if (accounts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Account not found for user',
        user: { id: foundUser.id, email: foundUser.email },
        allAccounts: await db.select({ 
          id: account.id, 
          userId: account.userId, 
          providerId: account.providerId,
          accountId: account.accountId,
          hasPassword: account.password,
        }).from(account),
      });
    }

    const foundAccount = accounts[0];

    // Verify password
    let passwordValid = false;
    let passwordError = null;
    
    if (foundAccount.password) {
      try {
        passwordValid = await verifyPassword({
          hash: foundAccount.password,
          password: password,
        });
      } catch (err) {
        passwordError = err instanceof Error ? err.message : 'Unknown error';
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        role: foundUser.role,
        status: foundUser.status,
      },
      account: {
        id: foundAccount.id,
        providerId: foundAccount.providerId,
        accountId: foundAccount.accountId,
        hasPassword: !!foundAccount.password,
        passwordHashPreview: foundAccount.password?.substring(0, 30) + '...',
      },
      passwordVerification: {
        valid: passwordValid,
        error: passwordError,
        testedPassword: password,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
