/**
 * @fileoverview Signup Page - New user registration
 * 
 * This page handles new user account creation with:
 * - Name, email, and password collection
 * - Form validation with error handling
 * - User-friendly error messages
 * - Automatic login after successful registration
 * 
 * @module app/(auth)/signup/page
 * @route /signup
 * @access Public
 * 
 * @example
 * ```
 * // URL: /signup
 * // Creates new user account and redirects to /events
 * ```
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth-client';
import { toast } from 'sonner';
import { AuthPageLayout } from '@/components/auth';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await signUp.email({ name, email, password });

      if (result.error) {
        let errorMessage = 'Failed to create account';
        if (result.error.code === 'USER_ALREADY_EXISTS') {
          errorMessage = 'An account with this email already exists.';
        } else if (result.error.code === 'INVALID_EMAIL') {
          errorMessage = 'Please enter a valid email address.';
        } else if (result.error.code === 'WEAK_PASSWORD') {
          errorMessage = 'Password is too weak. Please use a stronger password.';
        } else if (result.error.message) {
          errorMessage = result.error.message;
        }
        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      toast.success('Account created! Welcome to EventOS.');
      router.push('/events');
      router.refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMessage);
      setIsLoading(false);
    }
  }

  return (
    <AuthPageLayout
      title="Create your account"
      subtitle="Join thousands of event professionals who trust EventOS to manage their events seamlessly."
    >
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '16px', 
        padding: '32px',
        border: '1px solid #E8E4DF'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 500, color: '#2C2C2C', marginBottom: '24px' }}>
          Create an account
        </h2>

        {error && (
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px 16px', 
            backgroundColor: 'rgba(184, 92, 92, 0.1)', 
            borderRadius: '8px',
            fontSize: '14px',
            color: '#B85C5C'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="name"
              style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#4A4A4A', marginBottom: '8px' }}
            >
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="John Doe"
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
              autoComplete="new-password"
              placeholder="••••••••"
              required
              minLength={8}
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
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#9A9A9A' }}>
              Must be at least 8 characters
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
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
            }}
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#6B6B6B' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#B8956B', textDecoration: 'none', fontWeight: 500 }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </AuthPageLayout>
  );
}
