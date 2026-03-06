/**
 * @fileoverview Campaign Scheduler Worker
 *
 * Runs every minute to check for scheduled campaigns that are due.
 * Transitions them from Scheduled → Queued and enqueues bulk-email-send jobs.
 *
 * @module lib/jobs/workers/campaign-scheduler
 */

import type { Job } from "pg-boss";
import { db } from "@/db";
import { campaigns, campaignSchedules } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { sendJob } from "@/lib/jobs/queue";

export const JOB_NAME = "campaign-scheduler";
export const CRON = "* * * * *";

export async function handler(_job: Job) {
  const now = new Date();

  console.log(`[${JOB_NAME}] Campaign scheduler running`, {
    timestamp: now.toISOString(),
  });

  // Find all campaign schedules that are due
  const dueSchedules = await db
    .select({
      scheduleId: campaignSchedules.id,
      campaignId: campaignSchedules.campaignId,
      scheduledAt: campaignSchedules.scheduledAt,
      isRecurring: campaignSchedules.isRecurring,
      recurrencePattern: campaignSchedules.recurrencePattern,
      recurrenceEndDate: campaignSchedules.recurrenceEndDate,
    })
    .from(campaignSchedules)
    .innerJoin(campaigns, eq(campaignSchedules.campaignId, campaigns.id))
    .where(
      and(
        lte(campaignSchedules.scheduledAt, now),
        eq(campaigns.status, "Scheduled"),
      ),
    );

  if (dueSchedules.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const schedule of dueSchedules) {
    try {
      // Transition campaign to Queued
      await db
        .update(campaigns)
        .set({ status: "Queued", updatedAt: new Date() })
        .where(
          and(
            eq(campaigns.id, schedule.campaignId),
            eq(campaigns.status, "Scheduled"), // Optimistic lock
          ),
        );

      // Enqueue the bulk email send job
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await sendJob("bulk-email-send", {
        campaignId: schedule.campaignId,
        baseUrl,
      });

      // Handle recurring schedules
      if (schedule.isRecurring && schedule.recurrencePattern) {
        const nextDate = calculateNextOccurrence(
          schedule.scheduledAt,
          schedule.recurrencePattern,
        );

        if (
          !schedule.recurrenceEndDate ||
          nextDate <= schedule.recurrenceEndDate
        ) {
          await db
            .update(campaignSchedules)
            .set({ scheduledAt: nextDate })
            .where(eq(campaignSchedules.id, schedule.scheduleId));

          await db
            .update(campaigns)
            .set({ status: "Scheduled", updatedAt: new Date() })
            .where(eq(campaigns.id, schedule.campaignId));
        }
      }

      processed++;
    } catch (error) {
      failed++;
      console.error(`[${JOB_NAME}] Failed to process scheduled campaign`, {
        campaignId: schedule.campaignId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  console.log(`[${JOB_NAME}] Campaign scheduler completed`, {
    processed,
    failed,
  });
  return { processed, failed };
}

function calculateNextOccurrence(
  currentDate: Date,
  pattern: string,
): Date {
  const next = new Date(currentDate);

  switch (pattern) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }

  return next;
}
