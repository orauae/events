/**
 * @fileoverview pg-boss Job Queue - Central queue service
 *
 * Provides a singleton pg-boss instance for background job processing.
 * Uses the existing DATABASE_URL for its backing store (creates its own
 * schema `pgboss` in the same Postgres database).
 *
 * @module lib/jobs/queue
 */

import { PgBoss } from "pg-boss";
import type { SendOptions, ScheduleOptions } from "pg-boss";

// ============================================================================
// SINGLETON (survives HMR in dev via globalThis)
// ============================================================================

const g = globalThis as unknown as {
  __pgBoss?: PgBoss;
  __pgBossStarting?: Promise<PgBoss>;
  __pgBossQueues?: Set<string>;
};

/**
 * Returns the shared pg-boss instance, creating & starting it on first call.
 * Safe to call multiple times — subsequent calls return the same instance.
 * Uses globalThis to survive Next.js HMR reloads in development.
 */
export async function getQueue(): Promise<PgBoss> {
  if (g.__pgBoss) return g.__pgBoss;

  // Prevent double-start during concurrent calls
  if (g.__pgBossStarting) return g.__pgBossStarting;

  g.__pgBossStarting = (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for pg-boss");
    }

    const boss = new PgBoss(connectionString);

    boss.on("error", (error: Error) => {
      console.error("[pg-boss] Error:", error);
    });

    await boss.start();
    console.log("[pg-boss] Started successfully");

    g.__pgBoss = boss;
    g.__pgBossStarting = undefined;
    return boss;
  })();

  return g.__pgBossStarting;
}

/**
 * Gracefully stop pg-boss (call on app shutdown).
 */
export async function stopQueue(): Promise<void> {
  if (g.__pgBoss) {
    await g.__pgBoss.stop({ graceful: true, timeout: 10_000 });
    g.__pgBoss = undefined;
    console.log("[pg-boss] Stopped");
  }
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/** Standard retry options matching the old Trigger.dev defaults */
export const DEFAULT_RETRY = {
  retryLimit: 3,
  retryDelay: 2, // seconds
  retryBackoff: true,
};

/** High-retry options for messaging tasks */
export const MESSAGING_RETRY = {
  retryLimit: 5,
  retryDelay: 1,
  retryBackoff: true,
};

// Track which queues have already been created this process
if (!g.__pgBossQueues) g.__pgBossQueues = new Set<string>();

/**
 * Ensure a pg-boss queue exists. Idempotent — safe to call repeatedly.
 * pg-boss v12 requires queues to be explicitly created before use.
 */
export async function ensureQueue(
  name: string,
  options?: { retryLimit?: number; retryDelay?: number; retryBackoff?: boolean; expireInSeconds?: number },
): Promise<void> {
  if (g.__pgBossQueues!.has(name)) return;
  const boss = await getQueue();
  try {
    await boss.createQueue(name, options);
  } catch (err: unknown) {
    // Queue already exists from a previous boot — that's fine
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists") && !msg.includes("duplicate key")) {
      throw err;
    }
  }
  g.__pgBossQueues!.add(name);
}

/**
 * Send a job to the queue. Thin wrapper around boss.send() that
 * auto-starts the queue and ensures it exists.
 */
export async function sendJob<T extends object>(
  name: string,
  data: T,
  options?: SendOptions,
): Promise<string | null> {
  await ensureQueue(name, DEFAULT_RETRY);
  const boss = await getQueue();
  return boss.send(name, data, {
    ...DEFAULT_RETRY,
    ...options,
  });
}

/**
 * Schedule a recurring job (cron). Idempotent — safe to call on every
 * app boot; pg-boss deduplicates by job name.
 */
export async function scheduleCron(
  name: string,
  cron: string,
  data?: object,
  options?: ScheduleOptions,
): Promise<void> {
  await ensureQueue(name);
  const boss = await getQueue();
  await boss.schedule(name, cron, data ?? {}, options);
}

export type { PgBoss };
