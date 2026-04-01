/**
 * @fileoverview Login Page - User authentication
 * 
 * This page handles user authentication with:
 * - Email/password login
 * - Error handling with user-friendly messages
 * - Redirect after successful login
 * - "Just registered" notification support
 * 
 * @module app/(auth)/login/page
 * @route /login
 * @access Public
 * 
 * @example
 * ```
 * // URL: /login
 * // URL: /login?registered=true (after signup)
 * ```
 */

'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
import { toast } from 'sonner';
import { AuthPageLayout } from '@/components/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registered = searchParams.get('registered') === 'true';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn.email({ email, password });

      if (result.error) {
        // Use generic message for all auth failures to prevent user enumeration
        setError('Invalid email or password. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      toast.success('Welcome back!');
      
      // Fetch user role to determine redirect
      try {
        const meResponse = await fetch('/api/me');
        if (meResponse.ok) {
          const userData = await meResponse.json();
          if (userData.role === 'Admin') {
            router.push('/admin');
          } else {
            router.push('/events');
          }
        } else {
          // Fallback to events if role check fails
          router.push('/events');
        }
      } catch {
        // Fallback to events if role check fails
        router.push('/events');
      }
      router.refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMessage);
      setIsLoading(false);
    }
  }

  return (
    <AuthPageLayout
      title="Welcome back"
      subtitle="Sign in to continue managing your events, guests, and create memorable experiences."
    >
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '16px', 
        padding: '32px',
        border: '1px solid #E8E4DF'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 500, color: '#2C2C2C', marginBottom: '24px' }}>
          Sign in to your account
        </h2>

        {registered && (
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px 16px', 
            backgroundColor: 'rgba(92, 138, 107, 0.1)', 
            borderRadius: '8px',
            fontSize: '14px',
            color: '#5C8A6B'
          }}>
            Account created successfully! Please sign in.
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{ 
              marginBottom: '16px', 
              padding: '12px 16px', 
              backgroundColor: 'rgba(184, 92, 92, 0.1)', 
              borderRadius: '8px',
              fontSize: '14px',
              color: '#B85C5C'
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#4A4A4A', marginBottom: '8px' }}
            >
              Email address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                border: '1px solid #E8E4DF',
                borderRadius: '8px',
                backgroundColor: 'white',
                color: '#2C2C2C',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="password"
              style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#4A4A4A', marginBottom: '8px' }}
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                border: '1px solid #E8E4DF',
                borderRadius: '8px',
                backgroundColor: 'white',
                color: '#2C2C2C',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            style={{
              width: '100%',
              padding: '14px 24px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'white',
              backgroundColor: isLoading ? '#6B6B6B' : '#2C2C2C',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isLoading && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            )}
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#6B6B6B' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" style={{ color: '#B8956B', textDecoration: 'none', fontWeight: 500 }}>
              Create one
            </Link>
          </p>
        </div>

        {/* Demo Credentials */}
        <div style={{ 
          marginTop: '24px', 
          padding: '16px',
          backgroundColor: '#F5F5F0',
          borderRadius: '12px',
          border: '1px dashed #E8E4DF'
        }}>
          <p style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: '#6B6B6B', 
            marginBottom: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Demo Credentials
          </p>
          
          <DemoCredential 
            role="Admin" 
            email="admin@eventos.com" 
            password="Admin123!"
            onFill={(email, password) => {
              setEmail(email);
              setPassword(password);
            }}
          />
          
          <DemoCredential 
            role="Event Manager" 
            email="manager@eventos.com" 
            password="Manager123!"
            onFill={(email, password) => {
              setEmail(email);
              setPassword(password);
            }}
          />
        </div>
      </div>
    </AuthPageLayout>
  );
}

function DemoCredential({ 
  role, 
  email, 
  password, 
  onFill 
}: { 
  role: string; 
  email: string; 
  password: string;
  onFill: (email: string, password: string) => void;
}) {
  const [copied, setCopied] = useState<'email' | 'password' | null>(null);

  const copyToClipboard = async (text: string, type: 'email' | 'password') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={{ 
      marginBottom: '8px',
      padding: '10px 12px',
      backgroundColor: 'white',
      borderRadius: '8px',
      border: '1px solid #E8E4DF'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '6px'
      }}>
        <span style={{ 
          fontSize: '11px', 
          fontWeight: 600, 
          color: '#B8956B',
          textTransform: 'uppercase',
          letterSpacing: '0.03em'
        }}>
          {role}
        </span>
        <button
          type="button"
          onClick={() => onFill(email, password)}
          style={{
            fontSize: '11px',
            color: '#5C8A6B',
            backgroundColor: 'rgba(92, 138, 107, 0.1)',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Fill Form
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => copyToClipboard(email, 'email')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            fontSize: '12px',
            color: '#4A4A4A',
            backgroundColor: '#FAFAFA',
            border: '1px solid #E8E4DF',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
          <span style={{ fontSize: '10px', color: copied === 'email' ? '#5C8A6B' : '#9A9A9A', marginLeft: '4px' }}>
            {copied === 'email' ? '✓' : '📋'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => copyToClipboard(password, 'password')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 8px',
            fontSize: '12px',
            color: '#4A4A4A',
            backgroundColor: '#FAFAFA',
            border: '1px solid #E8E4DF',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          <span>{password}</span>
          <span style={{ fontSize: '10px', color: copied === 'password' ? '#5C8A6B' : '#9A9A9A' }}>
            {copied === 'password' ? '✓' : '📋'}
          </span>
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#FAFAFA'
      }}>
        <p style={{ color: '#6B6B6B' }}>Loading...</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
