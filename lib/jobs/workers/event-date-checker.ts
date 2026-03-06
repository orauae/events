/**
 * @fileoverview Event Date Checker Worker
 *
 * Daily check for event date triggers. Runs at midnight UTC to find
 * active automations with event_date_approaching triggers and fires
 * automation-execution jobs for matching events.
 *
 * @module lib/jobs/workers/event-date-checker
 */

import type { Job } from "pg-boss";
import { db } from "@/db";
import {
  automations,
  eventGuests,
  eventDateTriggerExecutions,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendJob } from "@/lib/jobs/queue";

export const JOB_NAME = "event-date-checker";
export const CRON = "0 0 * * *";

// ============================================================================
// HELPERS
// ============================================================================

interface EventDateTriggerConfig {
  daysBefore: number;
}

export function calculateTargetEventDate(daysBefore: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + daysBefore);
  return targetDate;
}

export function eventDateMatches(
  eventStartDate: Date,
  targetDate: Date,
): boolean {
  const eventDate = new Date(eventStartDate);
  eventDate.setHours(0, 0, 0, 0);

  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  return (
    eventDate.getFullYear() === target.getFullYear() &&
    eventDate.getMonth() === target.getMonth() &&
    eventDate.getDate() === target.getDate()
  );
}

// ============================================================================
// HANDLER
// ============================================================================

export async function handler(_job: Job) {
  console.log(`[${JOB_NAME}] Starting event date checker task`);

  const results: Array<{
    automationId: string;
    eventId: string;
    guestsTriggered: number;
    skipped: boolean;
    reason?: string;
  }> = [];

  try {
    // Find all active automations with their nodes + event
    const activeAutomations = await db.query.automations.findMany({
      where: eq(automations.status, "Active"),
      with: { nodes: true, event: true },
    });

    // Filter to event_date_approaching triggers
    const eventDateAutomations = activeAutomations.filter((a) =>
      a.nodes.some(
        (n) => n.type === "trigger" && n.subType === "event_date_approaching",
      ),
    );

    console.log(
      `[${JOB_NAME}] Found ${eventDateAutomations.length} automations with event_date_approaching triggers`,
    );

    for (const automation of eventDateAutomations) {
      const triggerNode = automation.nodes.find(
        (n) =>
          n.type === "trigger" && n.subType === "event_date_approaching",
      );
      if (!triggerNode) continue;

      const config = triggerNode.config as EventDateTriggerConfig;
      const daysBefore = config.daysBefore;

      if (daysBefore === undefined || typeof daysBefore !== "number") {
        results.push({
          automationId: automation.id,
          eventId: automation.eventId,
          guestsTriggered: 0,
          skipped: true,
          reason: "Invalid daysBefore configuration",
        });
        continue;
      }

      const targetDate = calculateTargetEventDate(daysBefore);
      const eventStartDate = new Date(automation.event.startDate);

      if (!eventDateMatches(eventStartDate, targetDate)) {
        results.push({
          automationId: automation.id,
          eventId: automation.eventId,
          guestsTriggered: 0,
          skipped: true,
          reason: "Event date does not match",
        });
        continue;
      }

      // Deduplication check
      const existingTrigger =
        await db.query.eventDateTriggerExecutions.findFirst({
          where: and(
            eq(eventDateTriggerExecutions.automationId, automation.id),
            eq(eventDateTriggerExecutions.eventId, automation.eventId),
          ),
        });

      if (existingTrigger) {
        results.push({
          automationId: automation.id,
          eventId: automation.eventId,
          guestsTriggered: 0,
          skipped: true,
          reason: "Already triggered (deduplication)",
        });
        continue;
      }

      // Get all guests for this event
      const guestList = await db.query.eventGuests.findMany({
        where: eq(eventGuests.eventId, automation.eventId),
      });

      if (guestList.length === 0) {
        results.push({
          automationId: automation.id,
          eventId: automation.eventId,
          guestsTriggered: 0,
          skipped: true,
          reason: "No guests in event",
        });
        continue;
      }

      // Record deduplication BEFORE triggering
      await db.insert(eventDateTriggerExecutions).values({
        automationId: automation.id,
        eventId: automation.eventId,
      });

      // Trigger automation-execution job for each guest
      let triggeredCount = 0;
      for (const guest of guestList) {
        try {
          await sendJob("automation-execution", {
            automationId: automation.id,
            eventGuestId: guest.id,
            triggerData: {
              triggerType: "event_date_approaching",
              daysBefore,
              eventDate: eventStartDate.toISOString(),
              triggeredAt: new Date().toISOString(),
            },
          });
          triggeredCount++;
        } catch (error) {
          console.error(
            `[${JOB_NAME}] Failed to trigger automation for guest`,
            {
              automationId: automation.id,
              eventGuestId: guest.id,
              error:
                error instanceof Error ? error.message : "Unknown error",
            },
          );
        }
      }

      results.push({
        automationId: automation.id,
        eventId: automation.eventId,
        guestsTriggered: triggeredCount,
        skipped: false,
      });
    }

    const totalTriggered = results.reduce(
      (sum, r) => sum + r.guestsTriggered,
      0,
    );
    console.log(`[${JOB_NAME}] Event date checker completed`, {
      automationsChecked: eventDateAutomations.length,
      totalGuestsTriggered: totalTriggered,
    });

    return { success: true, results };
  } catch (error) {
    console.error(`[${JOB_NAME}] Event date checker failed`, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: String(error), results };
  }
}
