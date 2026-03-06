/**
 * @fileoverview In-memory rate limiting middleware for Hono API routes.
 *
 * Uses a sliding-window counter stored in a Map. Suitable for single-process
 * deployments (Vercel serverless functions share memory within a single
 * invocation but not across cold starts, so this acts as a best-effort
 * guard). For multi-instance production deployments, swap the store for
 * Redis / Upstash.
 *
 * @module lib/middleware/rate-limit
 */

import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60 s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

export interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Optional prefix to namespace keys (e.g. "write", "send") */
  prefix?: string;
  /** Key generator – defaults to IP-based */
  keyGenerator?: (c: Context) => string;
}

/**
 * Extracts the client identifier from the request.
 * Prefers authenticated user ID (set by requireAuth), falls back to IP.
 */
function defaultKey(c: Context, prefix?: string): string {
  const userId = c.req.raw.headers.get('x-user-id');
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown';
  const base = userId ? `user:${userId}` : `ip:${ip}`;
  return prefix ? `${prefix}:${base}` : base;
}

/**
 * Creates a Hono middleware that enforces per-key rate limits.
 *
 * Returns 429 with a JSON body and standard rate-limit headers when the
 * limit is exceeded.
 */
export function rateLimit(opts: RateLimitOptions) {
  const { max, windowMs, prefix, keyGenerator } = opts;

  return async (c: Context, next: Next) => {
    const key = keyGenerator?.(c) ?? defaultKey(c, prefix);

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, max - entry.count);
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
        429,
      );
    }

    await next();
  };
}
