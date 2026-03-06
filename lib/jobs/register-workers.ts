/**
 * @fileoverview Worker Registration — registers all pg-boss handlers and cron schedules
 *
 * Call `registerAllWorkers()` once during app startup to wire up job handlers.
 *
 * @module lib/jobs/register-workers
 */

import { getQueue, scheduleCron, ensureQueue, DEFAULT_RETRY, MESSAGING_RETRY } from "./queue";
import type { Job } from "pg-boss";
import { db } from "@/db";
import { automationSchedules } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";

// Worker modules
import * as whatsappMessageSend from "./workers/whatsapp-message-send";
import * as conciergeRespond from "./workers/concierge-respond";
import * as bulkEmailSend from "./workers/bulk-email-send";
import * as bulkSmsSend from "./workers/bulk-sms-send";
import * as whatsappBroadcastSend from "./workers/whatsapp-broadcast-send";
import * as whatsappTemplateSync from "./workers/whatsapp-template-sync";
import * as campaignScheduler from "./workers/campaign-scheduler";
import * as eventDateChecker from "./workers/event-date-checker";
import * as scheduledAutomation from "./workers/scheduled-automation";
import * as automationExecution from "./workers/automation-execution";

// Adapter: wraps a single-job handler to match pg-boss v12 array signature
function forEach<T>(
  fn: (job: Job<T>) => Promise<unknown>,
): (jobs: Job<T>[]) => Promise<void> {
  return async (jobs) => {
    for (const job of jobs) {
      await fn(job);
    }
  };
}

// Guard against duplicate registration during HMR
const _g = globalThis as unknown as { __pgBossWorkersRegistered?: boolean };

/**
 * Register all job handlers with pg-boss and set up cron schedules.
 * Must be called once when the application starts.
 * Uses a globalThis guard to avoid duplicate registrations during HMR.
 */
export async function registerAllWorkers(): Promise<void> {
  if (_g.__pgBossWorkersRegistered) {
    console.log("[pg-boss] Workers already registered (HMR guard), skipping");
    return;
  }

  const boss = await getQueue();

  console.log("[pg-boss] Registering workers…");

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE QUEUES (pg-boss v12 requires explicit queue creation)
  // ──────────────────────────────────────────────────────────────────────────

  await Promise.all([
    ensureQueue(whatsappMessageSend.JOB_NAME, MESSAGING_RETRY),
    ensureQueue(conciergeRespond.JOB_NAME, DEFAULT_RETRY),
    ensureQueue(bulkEmailSend.JOB_NAME, { ...DEFAULT_RETRY, expireInSeconds: 3600 }),
    ensureQueue(bulkEmailSend.SINGLE_JOB_NAME, DEFAULT_RETRY),
    ensureQueue(bulkSmsSend.JOB_NAME, { ...DEFAULT_RETRY, expireInSeconds: 3600 }),
    ensureQueue(bulkSmsSend.SINGLE_JOB_NAME, DEFAULT_RETRY),
    ensureQueue(whatsappBroadcastSend.JOB_NAME, { ...DEFAULT_RETRY, expireInSeconds: 3600 }),
    ensureQueue(automationExecution.JOB_NAME, DEFAULT_RETRY),
    ensureQueue(whatsappTemplateSync.JOB_NAME),
    ensureQueue(campaignScheduler.JOB_NAME),
    ensureQueue(eventDateChecker.JOB_NAME),
  ]);

  // ──────────────────────────────────────────────────────────────────────────
  // ONE-OFF JOB HANDLERS
  // ──────────────────────────────────────────────────────────────────────────

  // WhatsApp message send (simple, high retry)
  await boss.work(
    whatsappMessageSend.JOB_NAME,
    { localConcurrency: 10 },
    forEach(whatsappMessageSend.handler),
  );

  // Concierge AI response
  await boss.work(
    conciergeRespond.JOB_NAME,
    { localConcurrency: 5 },
    forEach(conciergeRespond.handler),
  );

  // Bulk email send (long-running, limited concurrency)
  await boss.work(
    bulkEmailSend.JOB_NAME,
    { localConcurrency: 2 },
    forEach(bulkEmailSend.handler),
  );

  // Single email send
  await boss.work(
    bulkEmailSend.SINGLE_JOB_NAME,
    { localConcurrency: 10 },
    forEach(bulkEmailSend.singleEmailHandler),
  );

  // Bulk SMS send (long-running, limited concurrency)
  await boss.work(
    bulkSmsSend.JOB_NAME,
    { localConcurrency: 2 },
    forEach(bulkSmsSend.handler),
  );

  // Single SMS send
  await boss.work(
    bulkSmsSend.SINGLE_JOB_NAME,
    { localConcurrency: 10 },
    forEach(bulkSmsSend.singleSmsHandler),
  );

  // WhatsApp broadcast send (long-running)
  await boss.work(
    whatsappBroadcastSend.JOB_NAME,
    { localConcurrency: 2 },
    forEach(whatsappBroadcastSend.handler),
  );

  // Automation execution
  await boss.work(
    automationExecution.JOB_NAME,
    { localConcurrency: 5 },
    forEach(automationExecution.handler),
  );

  // Scheduled automation: Dynamic schedules are registered per-automation.
  // On startup, re-register handlers for all existing active schedules.
  await registerExistingScheduledAutomationHandlers();

  // ──────────────────────────────────────────────────────────────────────────
  // CRON SCHEDULES
  // ──────────────────────────────────────────────────────────────────────────

  // WhatsApp template sync — every 30 minutes
  await scheduleCron(
    whatsappTemplateSync.JOB_NAME,
    whatsappTemplateSync.CRON,
  );
  await boss.work(
    whatsappTemplateSync.JOB_NAME,
    { localConcurrency: 1 },
    forEach(whatsappTemplateSync.handler),
  );

  // Campaign scheduler — every minute
  await scheduleCron(
    campaignScheduler.JOB_NAME,
    campaignScheduler.CRON,
  );
  await boss.work(
    campaignScheduler.JOB_NAME,
    { localConcurrency: 1 },
    forEach(campaignScheduler.handler),
  );

  // Event date checker — daily at midnight UTC
  await scheduleCron(
    eventDateChecker.JOB_NAME,
    eventDateChecker.CRON,
  );
  await boss.work(
    eventDateChecker.JOB_NAME,
    { localConcurrency: 1 },
    forEach(eventDateChecker.handler),
  );

  console.log("[pg-boss] All workers registered");
  _g.__pgBossWorkersRegistered = true;
}

// ============================================================================
// DYNAMIC SCHEDULED-AUTOMATION HELPERS
// ============================================================================

/**
 * Register a pg-boss worker for a single dynamic scheduled-automation queue.
 * Called by TriggerRegistrationService when creating a new schedule.
 */
export async function registerScheduledAutomationHandler(
  scheduleName: string,
): Promise<void> {
  await ensureQueue(scheduleName, DEFAULT_RETRY);
  const boss = await getQueue();
  await boss.work(
    scheduleName,
    { localConcurrency: 1 },
    forEach(scheduledAutomation.handler),
  );
  console.log(`[pg-boss] Registered handler for dynamic schedule: ${scheduleName}`);
}

/**
 * On startup, query all active automation schedules from the DB and
 * register a handler for each one so pg-boss can dispatch cron-created jobs.
 */
async function registerExistingScheduledAutomationHandlers(): Promise<void> {
  try {
    const activeSchedules = await db.query.automationSchedules.findMany({
      where: and(
        eq(automationSchedules.isActive, true),
        isNotNull(automationSchedules.triggerDevScheduleId),
      ),
    });

    for (const schedule of activeSchedules) {
      if (schedule.triggerDevScheduleId?.startsWith("scheduled-automation__")) {
        await registerScheduledAutomationHandler(schedule.triggerDevScheduleId);
      }
    }

    console.log(
      `[pg-boss] Registered ${activeSchedules.length} existing scheduled-automation handlers`,
    );
  } catch (error) {
    console.error("[pg-boss] Failed to register existing scheduled-automation handlers:", error);
  }
}
