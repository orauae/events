/**
 * @fileoverview Scheduled Automation Worker
 *
 * Handles cron-scheduled automation execution. When fired, loads the
 * automation, finds all guests, and enqueues automation-execution jobs.
 *
 * Unlike the other cron workers, this one doesn't use a fixed cron.
 * Instead, schedules are attached dynamically via pg-boss.schedule()
 * through the TriggerRegistrationService.
 *
 * @module lib/jobs/workers/scheduled-automation
 */

import type { Job } from "pg-boss";
import { db } from "@/db";
import { automations, eventGuests, automationSchedules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendJob } from "@/lib/jobs/queue";

export const JOB_NAME = "scheduled-automation";

/**
 * Payload for scheduled-automation jobs. When created via pg-boss.schedule(),
 * the automationId is stored in the job data.
 */
export interface ScheduledAutomationPayload {
  automationId: string;
}

export async function handler(
  job: Job<ScheduledAutomationPayload>,
) {
  const automationId = job.data?.automationId;

  if (!automationId) {
    console.error(`[${JOB_NAME}] No automationId provided in job data`);
    return { success: false, error: "No automationId", guestsTriggered: 0 };
  }

  console.log(`[${JOB_NAME}] Starting scheduled automation execution`, {
    automationId,
  });

  // Load automation
  const automation = await db.query.automations.findFirst({
    where: eq(automations.id, automationId),
  });

  if (!automation) {
    return {
      success: false,
      error: `Automation "${automationId}" not found`,
      guestsTriggered: 0,
    };
  }

  if (automation.status !== "Active") {
    return {
      success: false,
      error: `Automation not active (status: ${automation.status})`,
      guestsTriggered: 0,
    };
  }

  // Find all guests for the event
  const guestList = await db.query.eventGuests.findMany({
    where: eq(eventGuests.eventId, automation.eventId),
  });

  if (guestList.length === 0) {
    return { success: true, message: "No guests to process", guestsTriggered: 0 };
  }

  console.log(`[${JOB_NAME}] Found ${guestList.length} guests for automation`);

  const triggerResults: Array<{
    eventGuestId: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const guest of guestList) {
    try {
      await sendJob("automation-execution", {
        automationId,
        eventGuestId: guest.id,
        triggerData: {
          triggerType: "scheduled",
          scheduledTime: new Date().toISOString(),
        },
      });

      triggerResults.push({ eventGuestId: guest.id, success: true });
    } catch (error) {
      triggerResults.push({
        eventGuestId: guest.id,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Update lastTriggeredAt
  try {
    await db
      .update(automationSchedules)
      .set({ lastTriggeredAt: new Date(), updatedAt: new Date() })
      .where(eq(automationSchedules.automationId, automationId));
  } catch {
    // Non-critical
  }

  const successCount = triggerResults.filter((r) => r.success).length;
  const failedCount = triggerResults.filter((r) => !r.success).length;

  console.log(`[${JOB_NAME}] Scheduled automation completed`, {
    automationId,
    guestsTriggered: successCount,
    failed: failedCount,
  });

  return {
    success: true,
    guestsTriggered: successCount,
    failed: failedCount,
    triggerResults,
  };
}
