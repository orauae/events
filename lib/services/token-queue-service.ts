/**
 * @fileoverview Token Queue Service - Token assignment and booth queue management
 *
 * Handles sequential token assignment for Regular-tier guests, booth queue
 * management with wait time estimation, VIP/VVIP bypass logic, and queue
 * status tracking.
 *
 * @module lib/services/token-queue-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { db } from '@/db';
import {
  whatsappTokenQueues,
  eventGuests,
  events,
} from '@/db/schema';
import { eq, and, sql, isNull, count } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface TokenAssignment {
  eventId: string;
  eventGuestId: string;
  tokenNumber: number;
  assignedAt: Date;
}

export interface BoothQueuePosition {
  position: number;
  estimatedWaitMinutes: number;
}

export interface QueueStatus {
  currentlyServing: number;
  waitingCount: number;
  estimatedWaitMinutes: number;
}

/** Default average service duration per booth in minutes */
const DEFAULT_AVG_SERVICE_DURATION_MINUTES = 5;

// ============================================================================
// SERVICE
// ============================================================================

/**
 * TokenQueueService - Token assignment and booth queue management.
 *
 * Provides sequential token assignment with database-level race condition
 * prevention, booth queue operations, wait time estimation, and VIP/VVIP
 * bypass logic.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export const TokenQueueService = {
  /**
   * Assigns the next sequential token number to a Regular-tier guest.
   *
   * Uses MAX(tokenNumber) + 1 with the unique constraint on (eventId, tokenNumber)
   * as a safety net against race conditions. If a concurrent insert causes a
   * unique violation, retries once to get the next available number.
   *
   * VIP/VVIP guests are rejected — they don't receive tokens.
   *
   * @param eventId - The event ID
   * @param eventGuestId - The event guest ID
   * @returns The token assignment details
   * @throws {Error} If the guest is VIP/VVIP (they skip tokens)
   * @throws {Error} If the guest already has a general token
   * @throws {Error} If the event guest is not found
   *
   * Requirements: 6.1, 6.2, 6.7
   */
  async assignToken(eventId: string, eventGuestId: string): Promise<TokenAssignment> {
    // Look up guest tier
    const guest = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, eventGuestId),
    });

    if (!guest) {
      throw new Error(`Event guest "${eventGuestId}" not found`);
    }

    // VIP/VVIP bypass — no token assignment (Req 6.7)
    if (guest.tier === 'VIP' || guest.tier === 'VVIP') {
      throw new Error(
        `Guest "${eventGuestId}" is ${guest.tier} tier and does not receive a token. ` +
        `Please direct them to the dedicated collection point.`
      );
    }

    // Check if guest already has a general token (boothName IS NULL)
    const existingToken = await db.query.whatsappTokenQueues.findFirst({
      where: and(
        eq(whatsappTokenQueues.eventId, eventId),
        eq(whatsappTokenQueues.eventGuestId, eventGuestId),
        isNull(whatsappTokenQueues.boothName),
      ),
    });

    if (existingToken) {
      return {
        eventId: existingToken.eventId,
        eventGuestId: existingToken.eventGuestId,
        tokenNumber: existingToken.tokenNumber,
        assignedAt: existingToken.assignedAt,
      };
    }

    // Get next token number and insert with retry on unique violation
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const nextToken = await TokenQueueService.getNextTokenNumber(eventId);

      try {
        const [record] = await db
          .insert(whatsappTokenQueues)
          .values({
            eventId,
            eventGuestId,
            tokenNumber: nextToken,
            boothName: null, // general token
            status: 'waiting',
          })
          .returning();

        return {
          eventId: record.eventId,
          eventGuestId: record.eventGuestId,
          tokenNumber: record.tokenNumber,
          assignedAt: record.assignedAt,
        };
      } catch (error: unknown) {
        // Retry on unique constraint violation (concurrent token assignment)
        const isUniqueViolation =
          error instanceof Error &&
          (error.message.includes('unique') ||
            error.message.includes('duplicate') ||
            error.message.includes('23505'));

        if (isUniqueViolation && attempt < maxAttempts - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to assign token after multiple attempts due to concurrent access');
  },

  /**
   * Retrieves the general token number for a guest at an event.
   *
   * @param eventId - The event ID
   * @param eventGuestId - The event guest ID
   * @returns The token number, or null if no token is assigned
   *
   * Requirements: 6.3
   */
  async getGuestToken(eventId: string, eventGuestId: string): Promise<number | null> {
    const record = await db.query.whatsappTokenQueues.findFirst({
      where: and(
        eq(whatsappTokenQueues.eventId, eventId),
        eq(whatsappTokenQueues.eventGuestId, eventGuestId),
        isNull(whatsappTokenQueues.boothName),
      ),
    });

    return record?.tokenNumber ?? null;
  },

  /**
   * Gets the next sequential token number for an event.
   *
   * Returns MAX(tokenNumber) + 1, or 1 if no tokens exist yet.
   *
   * @param eventId - The event ID
   * @returns The next token number to assign
   *
   * Requirements: 6.1
   */
  async getNextTokenNumber(eventId: string): Promise<number> {
    const result = await db
      .select({ maxToken: sql<number>`COALESCE(MAX(${whatsappTokenQueues.tokenNumber}), 0)` })
      .from(whatsappTokenQueues)
      .where(eq(whatsappTokenQueues.eventId, eventId));

    return (result[0]?.maxToken ?? 0) + 1;
  },

  /**
   * Adds a guest to a booth queue with estimated wait time.
   *
   * VIP/VVIP guests are not placed in the queue — instead, the collection
   * point information is returned.
   *
   * If the guest is already in the booth queue, returns their current position.
   *
   * @param eventId - The event ID
   * @param eventGuestId - The event guest ID
   * @param boothName - The booth/station name
   * @param avgServiceDurationMinutes - Average service time per guest (default: 5)
   * @returns Queue position and estimated wait time
   * @throws {Error} If the guest is VIP/VVIP (redirected to collection point)
   * @throws {Error} If the event guest is not found
   *
   * Requirements: 6.4, 6.5, 6.7
   */
  async joinBoothQueue(
    eventId: string,
    eventGuestId: string,
    boothName: string,
    avgServiceDurationMinutes: number = DEFAULT_AVG_SERVICE_DURATION_MINUTES,
  ): Promise<BoothQueuePosition> {
    // Look up guest tier
    const guest = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, eventGuestId),
    });

    if (!guest) {
      throw new Error(`Event guest "${eventGuestId}" not found`);
    }

    // VIP/VVIP bypass — redirect to collection point (Req 6.7)
    if (guest.tier === 'VIP' || guest.tier === 'VVIP') {
      const collectionPoint = await TokenQueueService.getVipCollectionPoint(eventId, boothName);
      throw new Error(
        `Guest "${eventGuestId}" is ${guest.tier} tier. ` +
        `Please proceed to ${collectionPoint || 'the dedicated collection point'} instead of joining the queue.`
      );
    }

    // Check if guest is already in this booth queue
    const existing = await db.query.whatsappTokenQueues.findFirst({
      where: and(
        eq(whatsappTokenQueues.eventId, eventId),
        eq(whatsappTokenQueues.eventGuestId, eventGuestId),
        eq(whatsappTokenQueues.boothName, boothName),
      ),
    });

    if (existing && existing.status === 'waiting') {
      // Return current position
      const position = await TokenQueueService._getPositionInQueue(eventId, boothName, existing.assignedAt);
      return {
        position,
        estimatedWaitMinutes: position * avgServiceDurationMinutes,
      };
    }

    // Get next token number for this event and insert into booth queue
    const nextToken = await TokenQueueService.getNextTokenNumber(eventId);

    try {
      const [record] = await db
        .insert(whatsappTokenQueues)
        .values({
          eventId,
          eventGuestId,
          tokenNumber: nextToken,
          boothName,
          status: 'waiting',
        })
        .returning();

      const position = await TokenQueueService._getPositionInQueue(eventId, boothName, record.assignedAt);

      return {
        position,
        estimatedWaitMinutes: position * avgServiceDurationMinutes,
      };
    } catch (error: unknown) {
      // Handle unique constraint violation (guest already in queue from concurrent request)
      const isUniqueViolation =
        error instanceof Error &&
        (error.message.includes('unique') ||
          error.message.includes('duplicate') ||
          error.message.includes('23505'));

      if (isUniqueViolation) {
        const fallback = await db.query.whatsappTokenQueues.findFirst({
          where: and(
            eq(whatsappTokenQueues.eventId, eventId),
            eq(whatsappTokenQueues.eventGuestId, eventGuestId),
            eq(whatsappTokenQueues.boothName, boothName),
          ),
        });

        if (fallback && fallback.status === 'waiting') {
          const position = await TokenQueueService._getPositionInQueue(eventId, boothName, fallback.assignedAt);
          return {
            position,
            estimatedWaitMinutes: position * avgServiceDurationMinutes,
          };
        }
      }

      throw error;
    }
  },

  /**
   * Marks a token as served at a specific booth.
   *
   * Updates the status to 'served' and sets the servedAt timestamp.
   *
   * @param eventId - The event ID
   * @param tokenNumber - The token number to mark as served
   * @param boothName - The booth name
   * @throws {Error} If the token/booth combination is not found
   *
   * Requirements: 6.6
   */
  async markServed(eventId: string, tokenNumber: number, boothName: string): Promise<void> {
    const result = await db
      .update(whatsappTokenQueues)
      .set({
        status: 'served',
        servedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappTokenQueues.eventId, eventId),
          eq(whatsappTokenQueues.tokenNumber, tokenNumber),
          eq(whatsappTokenQueues.boothName, boothName),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new Error(
        `Token #${tokenNumber} at booth "${boothName}" for event "${eventId}" not found`
      );
    }
  },

  /**
   * Gets the current queue status for a booth.
   *
   * Returns the currently serving token number, waiting count, and
   * estimated wait time for a new guest joining the queue.
   *
   * @param eventId - The event ID
   * @param boothName - The booth name
   * @param avgServiceDurationMinutes - Average service time per guest (default: 5)
   * @returns Queue status with currently serving token, waiting count, and estimated wait
   *
   * Requirements: 6.5, 6.6
   */
  async getQueueStatus(
    eventId: string,
    boothName: string,
    avgServiceDurationMinutes: number = DEFAULT_AVG_SERVICE_DURATION_MINUTES,
  ): Promise<QueueStatus> {
    // Find currently serving token
    const serving = await db.query.whatsappTokenQueues.findFirst({
      where: and(
        eq(whatsappTokenQueues.eventId, eventId),
        eq(whatsappTokenQueues.boothName, boothName),
        eq(whatsappTokenQueues.status, 'serving'),
      ),
    });

    // Count waiting guests
    const [waitingResult] = await db
      .select({ count: count() })
      .from(whatsappTokenQueues)
      .where(
        and(
          eq(whatsappTokenQueues.eventId, eventId),
          eq(whatsappTokenQueues.boothName, boothName),
          eq(whatsappTokenQueues.status, 'waiting'),
        ),
      );

    const waitingCount = waitingResult?.count ?? 0;

    return {
      currentlyServing: serving?.tokenNumber ?? 0,
      waitingCount,
      estimatedWaitMinutes: waitingCount * avgServiceDurationMinutes,
    };
  },

  /**
   * Retrieves the VIP/VVIP collection point name for a booth at an event.
   *
   * Looks up the event's tierConfig JSONB column for the VIP collection point.
   * Falls back to VVIP config if VIP is not set.
   *
   * @param eventId - The event ID
   * @param boothName - The booth name (currently unused, reserved for per-booth config)
   * @returns The collection point name, or null if not configured
   *
   * Requirements: 6.7, 5.7
   */
  async getVipCollectionPoint(eventId: string, _boothName: string): Promise<string | null> {
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });

    if (!event || !event.tierConfig) {
      return null;
    }

    const config = event.tierConfig as Record<string, { collectionPoint?: string; priorityLane?: string }>;

    // Try VIP first, then VVIP
    const vipPoint = config.VIP?.collectionPoint || config.VVIP?.collectionPoint;
    return vipPoint || null;
  },

  /**
   * Internal helper: calculates a guest's position in a booth queue.
   *
   * Position = number of waiting guests who joined before the given timestamp + 1.
   *
   * @param eventId - The event ID
   * @param boothName - The booth name
   * @param assignedAt - The guest's assignment timestamp
   * @returns The 1-based position in the queue
   */
  async _getPositionInQueue(eventId: string, boothName: string, assignedAt: Date): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(whatsappTokenQueues)
      .where(
        and(
          eq(whatsappTokenQueues.eventId, eventId),
          eq(whatsappTokenQueues.boothName, boothName),
          eq(whatsappTokenQueues.status, 'waiting'),
          sql`${whatsappTokenQueues.assignedAt} <= ${assignedAt}`,
        ),
      );

    return result?.count ?? 1;
  },
};
