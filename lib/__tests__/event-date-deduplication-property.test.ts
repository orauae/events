import { describe, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { db } from "@/db";
import {
  events,
  automations,
  automationNodes,
  eventDateTriggerExecutions,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

/**
 * @fileoverview Property-based tests for event date deduplication
 *
 * Feature: automation-trigger-dev-integration, Property 15: Event Date Deduplication
 *
 * For any event and automation combination, the event date trigger SHALL fire
 * at most once, tracked by a unique record in the `event_date_trigger_executions` table.
 *
 * **Validates: Requirements 5.6**
 */

/**
 * Helper to create test event
 */
async function createTestEvent(uniqueId: string) {
  const [event] = await db
    .insert(events)
    .values({
      name: `Test Event ${uniqueId}`,
      type: "Conference",
      description: "Test description",
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-02-02"),
      location: "Test Location",
      hostName: "Test Host",
      hostEmail: `host-${uniqueId}@test.com`,
    })
    .returning();
  return event;
}

/**
 * Helper to create test automation
 */
async function createTestAutomation(eventId: string, uniqueId: string) {
  const [automation] = await db
    .insert(automations)
    .values({
      eventId,
      name: `Test Automation ${uniqueId}`,
      description: "Test automation for deduplication",
      status: "Active",
    })
    .returning();

  // Add a trigger node
  await db.insert(automationNodes).values({
    automationId: automation.id,
    type: "trigger",
    subType: "event_date_approaching",
    label: "Event Date Trigger",
    positionX: "100",
    positionY: "100",
    config: { daysBefore: 7 },
  });

  return automation;
}

/**
 * Helper to clean up test data
 */
async function cleanupTestData(eventId: string, automationId: string) {
  // Delete deduplication records
  await db
    .delete(eventDateTriggerExecutions)
    .where(eq(eventDateTriggerExecutions.automationId, automationId));

  // Delete automation nodes
  await db
    .delete(automationNodes)
    .where(eq(automationNodes.automationId, automationId));

  // Delete automation
  await db.delete(automations).where(eq(automations.id, automationId));

  // Delete event
  await db.delete(events).where(eq(events.id, eventId));
}

/**
 * Feature: automation-trigger-dev-integration, Property 15: Event Date Deduplication
 * **Validates: Requirements 5.6**
 */
describe("Property 15: Event Date Deduplication", () => {
  // Arbitrary for number of trigger attempts
  const triggerAttemptsArb = fc.integer({ min: 1, max: 5 });

  test.prop([triggerAttemptsArb], { numRuns: 3 })(
    "only the first trigger attempt creates a deduplication record",
    async (attemptCount) => {
      const uniqueId = createId();
      const event = await createTestEvent(uniqueId);
      const automation = await createTestAutomation(event.id, uniqueId);

      try {
        // Attempt to insert deduplication records multiple times
        let successfulInserts = 0;
        let failedInserts = 0;

        for (let i = 0; i < attemptCount; i++) {
          try {
            await db.insert(eventDateTriggerExecutions).values({
              automationId: automation.id,
              eventId: event.id,
            });
            successfulInserts++;
          } catch (error) {
            // Unique constraint violation expected for subsequent attempts
            failedInserts++;
          }
        }

        // Property: Only one insert should succeed
        expect(successfulInserts).toBe(1);
        expect(failedInserts).toBe(attemptCount - 1);

        // Verify only one record exists
        const records = await db.query.eventDateTriggerExecutions.findMany({
          where: and(
            eq(eventDateTriggerExecutions.automationId, automation.id),
            eq(eventDateTriggerExecutions.eventId, event.id)
          ),
        });

        expect(records.length).toBe(1);
      } finally {
        await cleanupTestData(event.id, automation.id);
      }
    }
  );

  test.prop([fc.integer({ min: 2, max: 3 })], { numRuns: 2 })(
    "different automation/event combinations can each have one record",
    async (combinationCount) => {
      const testData: Array<{ event: typeof events.$inferSelect; automation: typeof automations.$inferSelect }> = [];

      try {
        // Create multiple event/automation combinations
        for (let i = 0; i < combinationCount; i++) {
          const uniqueId = createId();
          const event = await createTestEvent(uniqueId);
          const automation = await createTestAutomation(event.id, uniqueId);
          testData.push({ event, automation });
        }

        // Insert deduplication record for each combination
        for (const { event, automation } of testData) {
          await db.insert(eventDateTriggerExecutions).values({
            automationId: automation.id,
            eventId: event.id,
          });
        }

        // Verify each combination has exactly one record
        for (const { event, automation } of testData) {
          const records = await db.query.eventDateTriggerExecutions.findMany({
            where: and(
              eq(eventDateTriggerExecutions.automationId, automation.id),
              eq(eventDateTriggerExecutions.eventId, event.id)
            ),
          });

          expect(records.length).toBe(1);
        }

        // Verify total record count matches combination count
        // Each automation should have exactly one record
        for (const { automation } of testData) {
          const automationRecords = await db.query.eventDateTriggerExecutions.findMany({
            where: eq(eventDateTriggerExecutions.automationId, automation.id),
          });
          expect(automationRecords.length).toBe(1);
        }
      } finally {
        // Cleanup all test data
        for (const { event, automation } of testData) {
          await cleanupTestData(event.id, automation.id);
        }
      }
    }
  );

  test.prop([triggerAttemptsArb], { numRuns: 2 })(
    "checking for existing record before insert prevents duplicates",
    async (attemptCount) => {
      const uniqueId = createId();
      const event = await createTestEvent(uniqueId);
      const automation = await createTestAutomation(event.id, uniqueId);

      try {
        let triggeredCount = 0;

        // Simulate the deduplication check pattern used in eventDateCheckerTask
        for (let i = 0; i < attemptCount; i++) {
          // Check if already triggered (as done in the task)
          const existingTrigger = await db.query.eventDateTriggerExecutions.findFirst({
            where: and(
              eq(eventDateTriggerExecutions.automationId, automation.id),
              eq(eventDateTriggerExecutions.eventId, event.id)
            ),
          });

          if (!existingTrigger) {
            // Record the trigger
            await db.insert(eventDateTriggerExecutions).values({
              automationId: automation.id,
              eventId: event.id,
            });
            triggeredCount++;
          }
        }

        // Property: Only one trigger should occur
        expect(triggeredCount).toBe(1);

        // Verify only one record exists
        const records = await db.query.eventDateTriggerExecutions.findMany({
          where: and(
            eq(eventDateTriggerExecutions.automationId, automation.id),
            eq(eventDateTriggerExecutions.eventId, event.id)
          ),
        });

        expect(records.length).toBe(1);
      } finally {
        await cleanupTestData(event.id, automation.id);
      }
    }
  );

  test.prop([fc.integer({ min: 2, max: 3 })], { numRuns: 2 })(
    "same automation can trigger for different events",
    async (eventCount) => {
      const uniqueId = createId();
      const testEvents: Array<typeof events.$inferSelect> = [];

      // Create one automation
      const firstEvent = await createTestEvent(uniqueId);
      const automation = await createTestAutomation(firstEvent.id, uniqueId);
      testEvents.push(firstEvent);

      // Create additional events
      for (let i = 1; i < eventCount; i++) {
        const event = await createTestEvent(createId());
        testEvents.push(event);
      }

      try {
        // Insert deduplication record for each event with the same automation
        for (const event of testEvents) {
          await db.insert(eventDateTriggerExecutions).values({
            automationId: automation.id,
            eventId: event.id,
          });
        }

        // Verify each event has exactly one record for this automation
        for (const event of testEvents) {
          const records = await db.query.eventDateTriggerExecutions.findMany({
            where: and(
              eq(eventDateTriggerExecutions.automationId, automation.id),
              eq(eventDateTriggerExecutions.eventId, event.id)
            ),
          });

          expect(records.length).toBe(1);
        }

        // Verify total records for this automation equals event count
        const allRecords = await db.query.eventDateTriggerExecutions.findMany({
          where: eq(eventDateTriggerExecutions.automationId, automation.id),
        });

        expect(allRecords.length).toBe(eventCount);
      } finally {
        // Cleanup
        for (const event of testEvents) {
          await db
            .delete(eventDateTriggerExecutions)
            .where(
              and(
                eq(eventDateTriggerExecutions.automationId, automation.id),
                eq(eventDateTriggerExecutions.eventId, event.id)
              )
            );
        }

        await db
          .delete(automationNodes)
          .where(eq(automationNodes.automationId, automation.id));
        await db.delete(automations).where(eq(automations.id, automation.id));

        for (const event of testEvents) {
          await db.delete(events).where(eq(events.id, event.id));
        }
      }
    }
  );

  // Edge case tests
  describe("edge cases", () => {
    test("duplicate insert throws unique constraint error", async () => {
      const uniqueId = createId();
      const event = await createTestEvent(uniqueId);
      const automation = await createTestAutomation(event.id, uniqueId);

      try {
        // First insert should succeed
        await db.insert(eventDateTriggerExecutions).values({
          automationId: automation.id,
          eventId: event.id,
        });

        // Second insert should fail with unique constraint error
        await expect(
          db.insert(eventDateTriggerExecutions).values({
            automationId: automation.id,
            eventId: event.id,
          })
        ).rejects.toThrow();
      } finally {
        await cleanupTestData(event.id, automation.id);
      }
    });

    test("deduplication record contains triggeredAt timestamp", async () => {
      const uniqueId = createId();
      const event = await createTestEvent(uniqueId);
      const automation = await createTestAutomation(event.id, uniqueId);
      const beforeInsert = new Date();

      try {
        await db.insert(eventDateTriggerExecutions).values({
          automationId: automation.id,
          eventId: event.id,
        });

        const afterInsert = new Date();

        const record = await db.query.eventDateTriggerExecutions.findFirst({
          where: and(
            eq(eventDateTriggerExecutions.automationId, automation.id),
            eq(eventDateTriggerExecutions.eventId, event.id)
          ),
        });

        expect(record).not.toBeNull();
        expect(record!.triggeredAt).toBeDefined();

        // Timestamp should be between before and after insert
        const triggeredAt = new Date(record!.triggeredAt);
        expect(triggeredAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 1000);
        expect(triggeredAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime() + 1000);
      } finally {
        await cleanupTestData(event.id, automation.id);
      }
    });
  });
});
