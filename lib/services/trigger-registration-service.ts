/**
 * @fileoverview Trigger Registration Service - Manages pg-boss cron schedules
 *
 * This service handles the registration, unregistration, and updating of
 * pg-boss cron schedules for automations with scheduled triggers. It provides
 * a clean interface for managing dynamic schedules and tracks them in the
 * database for persistence.
 *
 * @module lib/services/trigger-registration-service
 * @requires pg-boss - Job queue for schedule management
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { getQueue } from "@/lib/jobs/queue";
import { registerScheduledAutomationHandler } from "@/lib/jobs/register-workers";
import { db } from "@/db";
import { automationSchedules, type AutomationSchedule } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

/**
 * Logger interface for consistent logging across the service.
 * Uses console methods but can be replaced with a more sophisticated logger.
 */
const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`[TriggerRegistrationService] ${message}`, data ? JSON.stringify(data) : "");
  },
  error: (message: string, data?: Record<string, unknown>) => {
    console.error(`[TriggerRegistrationService] ${message}`, data ? JSON.stringify(data) : "");
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`[TriggerRegistrationService] ${message}`, data ? JSON.stringify(data) : "");
  },
};

/**
 * Result of a schedule registration operation.
 */
export interface ScheduleRegistrationResult {
  success: boolean;
  scheduleId?: string;
  error?: string;
}

/**
 * Result of a schedule unregistration operation.
 */
export interface ScheduleUnregistrationResult {
  success: boolean;
  error?: string;
}

/**
 * Result of a schedule update operation.
 */
export interface ScheduleUpdateResult {
  success: boolean;
  scheduleId?: string;
  error?: string;
}

/**
 * TriggerRegistrationService - Manages Trigger.dev schedules for automations.
 *
 * This service provides methods for:
 * - Registering scheduled triggers when automations are activated
 * - Unregistering schedules when automations are paused or deleted
 * - Updating schedules when cron expressions change
 * - Tracking event date trigger registrations
 *
 * All operations handle errors gracefully and log failures without
 * propagating exceptions to callers.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export const TriggerRegistrationService = {
  /**
   * Register a scheduled trigger when an automation is activated.
   *
   * Creates a Trigger.dev schedule using `schedules.create()` with the
   * automation's cron expression. Uses the automationId as both externalId
   * and deduplicationKey to ensure uniqueness and enable management.
   *
   * @param automationId - The ID of the automation to register
   * @param cronExpression - The cron expression for the schedule
   * @param timezone - Optional timezone (defaults to UTC)
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await TriggerRegistrationService.registerScheduledTrigger(
   *   'auto123',
   *   '0 9 * * *', // Daily at 9am
   *   'America/New_York'
   * );
   * ```
   *
   * Requirements: 6.1, 6.2, 6.4, 6.5, 6.7
   */
  async registerScheduledTrigger(
    automationId: string,
    cronExpression: string,
    timezone: string = "UTC"
  ): Promise<ScheduleRegistrationResult> {
    logger.info("Registering scheduled trigger", {
      automationId,
      cronExpression,
      timezone,
    });

    try {
      // Check if a schedule already exists for this automation
      const existingSchedule = await db.query.automationSchedules.findFirst({
        where: eq(automationSchedules.automationId, automationId),
      });

      if (existingSchedule?.triggerDevScheduleId) {
        logger.info("Schedule already exists, updating instead", {
          automationId,
          existingScheduleId: existingSchedule.triggerDevScheduleId,
        });

        // Update the existing schedule if cron expression changed
        if (existingSchedule.cronExpression !== cronExpression) {
          return this.updateScheduledTrigger(automationId, cronExpression, timezone);
        }

        // Just activate the existing schedule in the database
        await db
          .update(automationSchedules)
          .set({
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(automationSchedules.id, existingSchedule.id));

        return {
          success: true,
          scheduleId: existingSchedule.triggerDevScheduleId,
        };
      }

      // Create a new schedule with pg-boss (Requirement 6.2)
      // Schedule name format: scheduled-automation__{automationId} for uniqueness
      const scheduleName = `scheduled-automation__${automationId}`;
      const boss = await getQueue();
      await boss.schedule(scheduleName, cronExpression, { automationId }, { tz: timezone });

      // Register a worker handler for this dynamic schedule name
      await registerScheduledAutomationHandler(scheduleName);

      logger.info("pg-boss schedule created", {
        automationId,
        scheduleName,
        cronExpression,
      });

      // Store the schedule in the database
      if (existingSchedule) {
        // Update existing record
        await db
          .update(automationSchedules)
          .set({
            triggerDevScheduleId: scheduleName,
            cronExpression,
            timezone,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(automationSchedules.id, existingSchedule.id));
      } else {
        // Create new record
        await db.insert(automationSchedules).values({
          id: createId(),
          automationId,
          triggerDevScheduleId: scheduleName,
          cronExpression,
          timezone,
          isActive: true,
        });
      }

      logger.info("Schedule registered successfully", {
        automationId,
        scheduleName,
      });

      return {
        success: true,
        scheduleId: scheduleName,
      };
    } catch (error) {
      // Handle errors gracefully and log (Requirement 6.7)
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to register scheduled trigger", {
        automationId,
        cronExpression,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Unregister a scheduled trigger when an automation is paused or deleted.
   *
   * Removes the Trigger.dev schedule using `schedules.del()` and updates
   * the database record to mark it as inactive.
   *
   * @param automationId - The ID of the automation to unregister
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await TriggerRegistrationService.unregisterScheduledTrigger('auto123');
   * ```
   *
   * Requirements: 6.1, 6.3, 6.7
   */
  async unregisterScheduledTrigger(
    automationId: string
  ): Promise<ScheduleUnregistrationResult> {
    logger.info("Unregistering scheduled trigger", { automationId });

    try {
      // Find the schedule in the database
      const schedule = await db.query.automationSchedules.findFirst({
        where: eq(automationSchedules.automationId, automationId),
      });

      if (!schedule) {
        logger.warn("No schedule found for automation", { automationId });
        return { success: true }; // Nothing to unregister
      }

      if (schedule.triggerDevScheduleId) {
        // Remove the schedule from pg-boss (Requirement 6.3)
        const boss = await getQueue();
        await boss.unschedule(schedule.triggerDevScheduleId);

        logger.info("pg-boss schedule removed", {
          automationId,
          scheduleName: schedule.triggerDevScheduleId,
        });
      }

      // Update the database record to mark as inactive
      await db
        .update(automationSchedules)
        .set({
          isActive: false,
          triggerDevScheduleId: null,
          updatedAt: new Date(),
        })
        .where(eq(automationSchedules.id, schedule.id));

      logger.info("Schedule unregistered successfully", { automationId });

      return { success: true };
    } catch (error) {
      // Handle errors gracefully and log (Requirement 6.7)
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to unregister scheduled trigger", {
        automationId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Update a scheduled trigger when the cron expression changes.
   *
   * Updates the existing Trigger.dev schedule with the new cron expression
   * using `schedules.update()`.
   *
   * @param automationId - The ID of the automation to update
   * @param cronExpression - The new cron expression
   * @param timezone - Optional timezone (defaults to UTC)
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await TriggerRegistrationService.updateScheduledTrigger(
   *   'auto123',
   *   '0 10 * * *' // Changed to 10am
   * );
   * ```
   *
   * Requirements: 6.1, 6.6, 6.7
   */
  async updateScheduledTrigger(
    automationId: string,
    cronExpression: string,
    timezone: string = "UTC"
  ): Promise<ScheduleUpdateResult> {
    logger.info("Updating scheduled trigger", {
      automationId,
      cronExpression,
      timezone,
    });

    try {
      // Find the existing schedule
      const schedule = await db.query.automationSchedules.findFirst({
        where: eq(automationSchedules.automationId, automationId),
      });

      if (!schedule || !schedule.triggerDevScheduleId) {
        logger.warn("No active schedule found, registering new one", { automationId });
        // If no schedule exists, register a new one
        return this.registerScheduledTrigger(automationId, cronExpression, timezone);
      }

      // Update the schedule in pg-boss (Requirement 6.6)
      // pg-boss schedule() is idempotent — calling with the same name overwrites
      const boss = await getQueue();
      await boss.schedule(schedule.triggerDevScheduleId, cronExpression, { automationId }, { tz: timezone });

      logger.info("pg-boss schedule updated", {
        automationId,
        scheduleName: schedule.triggerDevScheduleId,
        cronExpression,
      });

      // Update the database record
      await db
        .update(automationSchedules)
        .set({
          cronExpression,
          timezone,
          updatedAt: new Date(),
        })
        .where(eq(automationSchedules.id, schedule.id));

      logger.info("Schedule updated successfully", {
        automationId,
        scheduleId: schedule.triggerDevScheduleId,
      });

      return {
        success: true,
        scheduleId: schedule.triggerDevScheduleId,
      };
    } catch (error) {
      // Handle errors gracefully and log (Requirement 6.7)
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to update scheduled trigger", {
        automationId,
        cronExpression,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Register an event date trigger for an automation.
   *
   * Event date triggers don't create individual schedules - they rely on
   * the daily eventDateCheckerTask to check for matching events. This method
   * records the registration for tracking purposes.
   *
   * @param automationId - The ID of the automation to register
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await TriggerRegistrationService.registerEventDateTrigger('auto123');
   * ```
   */
  async registerEventDateTrigger(
    automationId: string
  ): Promise<ScheduleRegistrationResult> {
    logger.info("Registering event date trigger", { automationId });

    try {
      // Event date triggers don't need individual Trigger.dev schedules
      // They are handled by the daily eventDateCheckerTask
      // We just record the registration for tracking

      // Check if a record already exists
      const existing = await db.query.automationSchedules.findFirst({
        where: eq(automationSchedules.automationId, automationId),
      });

      if (existing) {
        // Update existing record
        await db
          .update(automationSchedules)
          .set({
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(automationSchedules.id, existing.id));
      } else {
        // Create new record (without Trigger.dev schedule ID)
        await db.insert(automationSchedules).values({
          id: createId(),
          automationId,
          cronExpression: "event_date", // Marker for event date triggers
          isActive: true,
        });
      }

      logger.info("Event date trigger registered successfully", { automationId });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to register event date trigger", {
        automationId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Unregister an event date trigger for an automation.
   *
   * Marks the event date trigger as inactive in the database.
   *
   * @param automationId - The ID of the automation to unregister
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await TriggerRegistrationService.unregisterEventDateTrigger('auto123');
   * ```
   */
  async unregisterEventDateTrigger(
    automationId: string
  ): Promise<ScheduleUnregistrationResult> {
    logger.info("Unregistering event date trigger", { automationId });

    try {
      // Find and update the schedule record
      const schedule = await db.query.automationSchedules.findFirst({
        where: eq(automationSchedules.automationId, automationId),
      });

      if (schedule) {
        await db
          .update(automationSchedules)
          .set({
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(automationSchedules.id, schedule.id));
      }

      logger.info("Event date trigger unregistered successfully", { automationId });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to unregister event date trigger", {
        automationId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Get the schedule for an automation.
   *
   * @param automationId - The ID of the automation
   * @returns The schedule record or null if not found
   */
  async getSchedule(automationId: string): Promise<AutomationSchedule | null> {
    const schedule = await db.query.automationSchedules.findFirst({
      where: eq(automationSchedules.automationId, automationId),
    });

    return schedule ?? null;
  },

  /**
   * Check if an automation has an active schedule.
   *
   * @param automationId - The ID of the automation
   * @returns True if the automation has an active schedule
   */
  async hasActiveSchedule(automationId: string): Promise<boolean> {
    const schedule = await this.getSchedule(automationId);
    return schedule?.isActive ?? false;
  },
};

export default TriggerRegistrationService;
