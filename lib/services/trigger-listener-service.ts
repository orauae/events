/**
 * @fileoverview Trigger Listener Service - Event-driven automation triggers
 * 
 * This service listens for events in the system (RSVP changes, check-ins, etc.)
 * and triggers matching automations. It acts as the bridge between system events
 * and Trigger.dev tasks for durable execution.
 * 
 * @module lib/services/trigger-listener-service
 * @requires drizzle-orm - Database ORM
 * @requires pg-boss - Job queue for durable execution
 * 
 * @example
 * ```typescript
 * import { TriggerListenerService } from '@/lib/services';
 * 
 * // Called when a guest RSVPs
 * await TriggerListenerService.onRsvpChanged(
 *   eventGuestId,
 *   'Attending',
 *   'Pending'
 * );
 * 
 * // Called when a guest checks in
 * await TriggerListenerService.onGuestCheckedIn(eventGuestId);
 * ```
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import { db } from '@/db';
import {
  automations,
  automationNodes,
  eventGuests,
  type AutomationNode,
  type RSVPStatus,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { AutomationService, type AutomationWithDetails } from './automation-service';
import { sendJob } from '@/lib/jobs';

/**
 * Types of trigger events that can start automations.
 * 
 * - guest_rsvp_received: Guest responded to invitation
 * - guest_checked_in: Guest checked in at event
 * - guest_added_to_event: Guest was added to event
 * - guest_tag_changed: Tag was added/removed from guest
 */
export type TriggerEventType =
  | 'guest_rsvp_received'
  | 'guest_checked_in'
  | 'guest_added_to_event'
  | 'guest_tag_changed';

/**
 * Data passed with trigger events
 */
export interface TriggerEventData {
  eventId: string;
  eventGuestId: string;
  guestId: string;
  // Additional data specific to trigger type
  rsvpStatus?: RSVPStatus;
  previousRsvpStatus?: RSVPStatus;
  tagId?: string;
  tagAction?: 'added' | 'removed';
}

/**
 * Result of processing a trigger
 */
export interface TriggerProcessResult {
  automationId: string;
  automationName: string;
  executed: boolean;
  executionId?: string;
  triggerDevHandle?: string; // Trigger.dev task handle ID
  error?: string;
}

/**
 * TriggerListenerService - Listens for events and triggers matching automations.
 * 
 * This service is called by other services when events occur (RSVP, check-in, etc.)
 * and finds all active automations that should be triggered. It then executes
 * each matching automation via the WorkflowEngine.
 * 
 * @remarks
 * The service ensures:
 * - Only active automations are triggered
 * - Trigger conditions are properly evaluated
 * - Event guests belong to the automation's event (scope validation)
 * 
 * Requirements: 2.1, 8.5
 */
export const TriggerListenerService = {
  /**
   * Processes a trigger event and executes all matching automations.
   * 
   * Finds all active automations for the event, filters those with
   * matching triggers, and executes each one.
   * 
   * @param triggerType - The type of trigger event
   * @param data - Event data including IDs and status information
   * @returns Array of results for each automation processed
   * 
   * @example
   * ```typescript
   * const results = await TriggerListenerService.processTrigger(
   *   'guest_rsvp_received',
   *   {
   *     eventId: 'event123',
   *     eventGuestId: 'eg456',
   *     guestId: 'guest789',
   *     rsvpStatus: 'Attending'
   *   }
   * );
   * ```
   * 
   * Requirements: 2.1, 8.5
   */
  async processTrigger(
    triggerType: TriggerEventType,
    data: TriggerEventData
  ): Promise<TriggerProcessResult[]> {
    const results: TriggerProcessResult[] = [];

    // Find all active automations for this event
    const activeAutomations = await this.getActiveAutomationsForEvent(data.eventId);

    // Filter automations that have a matching trigger
    const matchingAutomations = activeAutomations.filter(automation =>
      this.automationMatchesTrigger(automation, triggerType, data)
    );

    // Execute each matching automation
    for (const automation of matchingAutomations) {
      const result = await this.executeAutomation(automation, triggerType, data);
      results.push(result);
    }

    return results;
  },

  /**
   * Get all active automations for an event
   * Requirements: 8.5
   */
  async getActiveAutomationsForEvent(eventId: string): Promise<AutomationWithDetails[]> {
    const allAutomations = await AutomationService.getByEvent(eventId);
    return allAutomations.filter(a => a.status === 'Active');
  },

  /**
   * Check if an automation's trigger matches the event
   * Requirements: 2.1
   */
  automationMatchesTrigger(
    automation: AutomationWithDetails,
    triggerType: TriggerEventType,
    data: TriggerEventData
  ): boolean {
    // Find the trigger node
    const triggerNode = automation.nodes.find(n => n.type === 'trigger');
    if (!triggerNode) {
      return false;
    }

    // Check if trigger type matches
    if (triggerNode.subType !== triggerType) {
      return false;
    }

    // Check trigger-specific conditions
    return this.checkTriggerConditions(triggerNode, triggerType, data);
  },

  /**
   * Check trigger-specific conditions
   * Requirements: 2.2, 2.3, 2.4
   */
  checkTriggerConditions(
    triggerNode: AutomationNode,
    triggerType: TriggerEventType,
    data: TriggerEventData
  ): boolean {
    const config = triggerNode.config as Record<string, unknown>;

    switch (triggerType) {
      case 'guest_rsvp_received':
        // Check if RSVP status filter is configured
        const rsvpStatuses = config.rsvpStatuses as string[] | undefined;
        if (rsvpStatuses && rsvpStatuses.length > 0 && data.rsvpStatus) {
          return rsvpStatuses.includes(data.rsvpStatus);
        }
        // No filter means match all RSVP changes
        return true;

      case 'guest_checked_in':
        // No additional conditions for check-in trigger
        return true;

      case 'guest_added_to_event':
        // No additional conditions for guest added trigger
        return true;

      case 'guest_tag_changed':
        // Check if specific tags are being monitored
        const tagIds = config.tagIds as string[] | undefined;
        if (tagIds && tagIds.length > 0 && data.tagId) {
          return tagIds.includes(data.tagId);
        }
        // No filter means match all tag changes
        return true;

      default:
        return false;
    }
  },

  /**
   * Execute an automation for a trigger event using Trigger.dev tasks.
   * 
   * This method triggers the automationExecutionTask asynchronously and returns
   * immediately without waiting for execution completion (non-blocking).
   * 
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
   */
  async executeAutomation(
    automation: AutomationWithDetails,
    triggerType: TriggerEventType,
    data: TriggerEventData
  ): Promise<TriggerProcessResult> {
    try {
      // Verify the event guest belongs to the automation's event
      // This is critical for Property 11: Trigger Scope Limited to Event Guests
      const eventGuest = await db.query.eventGuests.findFirst({
        where: and(
          eq(eventGuests.id, data.eventGuestId),
          eq(eventGuests.eventId, automation.eventId)
        ),
      });

      if (!eventGuest) {
        return {
          automationId: automation.id,
          automationName: automation.name,
          executed: false,
          error: 'Event guest does not belong to this automation\'s event',
        };
      }

      // Build trigger data for execution context (Requirement 7.3)
      const triggerData: Record<string, unknown> = {
        triggerType,
        eventId: data.eventId,
        eventGuestId: data.eventGuestId,
        guestId: data.guestId,
        timestamp: new Date().toISOString(),
      };

      // Add trigger-specific data
      if (data.rsvpStatus) {
        triggerData.rsvpStatus = data.rsvpStatus;
      }
      if (data.previousRsvpStatus) {
        triggerData.previousRsvpStatus = data.previousRsvpStatus;
      }
      if (data.tagId) {
        triggerData.tagId = data.tagId;
        triggerData.tagAction = data.tagAction;
      }

      // Trigger the automation execution job asynchronously (Requirements 7.1, 7.2, 7.4)
      // Using sendJob() for non-blocking execution
      const jobId = await sendJob('automation-execution', {
        automationId: automation.id,
        eventGuestId: data.eventGuestId,
        triggerData,
      });

      // Log the triggered job (Requirement 7.6)
      console.log(`[TriggerListenerService] Enqueued automation execution job`, {
        automationId: automation.id,
        automationName: automation.name,
        eventGuestId: data.eventGuestId,
        triggerType,
        jobId,
      });

      // Return immediately after enqueuing (Requirement 7.4, 7.5)
      return {
        automationId: automation.id,
        automationName: automation.name,
        executed: true,
        triggerDevHandle: jobId ?? 'queued',
      };
    } catch (error) {
      // Log the error (Requirement 7.6)
      console.error(`[TriggerListenerService] Failed to trigger automation execution`, {
        automationId: automation.id,
        automationName: automation.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        automationId: automation.id,
        automationName: automation.name,
        executed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  /**
   * Handle RSVP status change event
   * Requirements: 2.1, 2.2
   */
  async onRsvpChanged(
    eventGuestId: string,
    newStatus: RSVPStatus,
    previousStatus?: RSVPStatus
  ): Promise<TriggerProcessResult[]> {
    // Fetch event guest to get event and guest IDs
    const eventGuest = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, eventGuestId),
    });

    if (!eventGuest) {
      return [];
    }

    return this.processTrigger('guest_rsvp_received', {
      eventId: eventGuest.eventId,
      eventGuestId: eventGuest.id,
      guestId: eventGuest.guestId,
      rsvpStatus: newStatus,
      previousRsvpStatus: previousStatus,
    });
  },

  /**
   * Handle guest check-in event
   * Requirements: 2.1
   */
  async onGuestCheckedIn(eventGuestId: string): Promise<TriggerProcessResult[]> {
    // Fetch event guest to get event and guest IDs
    const eventGuest = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, eventGuestId),
    });

    if (!eventGuest) {
      return [];
    }

    return this.processTrigger('guest_checked_in', {
      eventId: eventGuest.eventId,
      eventGuestId: eventGuest.id,
      guestId: eventGuest.guestId,
    });
  },

  /**
   * Handle guest added to event
   * Requirements: 2.1
   */
  async onGuestAddedToEvent(
    eventId: string,
    eventGuestId: string,
    guestId: string
  ): Promise<TriggerProcessResult[]> {
    return this.processTrigger('guest_added_to_event', {
      eventId,
      eventGuestId,
      guestId,
    });
  },

  /**
   * Handle guest tag changed event
   * Requirements: 2.1, 2.4
   */
  async onGuestTagChanged(
    eventGuestId: string,
    tagId: string,
    action: 'added' | 'removed'
  ): Promise<TriggerProcessResult[]> {
    // Fetch event guest to get event and guest IDs
    const eventGuest = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, eventGuestId),
    });

    if (!eventGuest) {
      return [];
    }

    return this.processTrigger('guest_tag_changed', {
      eventId: eventGuest.eventId,
      eventGuestId: eventGuest.id,
      guestId: eventGuest.guestId,
      tagId,
      tagAction: action,
    });
  },
};

export default TriggerListenerService;
