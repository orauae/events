/**
 * @fileoverview Agenda Service - Event agenda CRUD and query operations
 *
 * Manages event agenda items with time-based lookups for current and
 * upcoming sessions. Validates time ranges and maintains chronological
 * ordering.
 *
 * @module lib/services/agenda-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { z } from 'zod';
import { db } from '@/db';
import {
  eventAgendas,
  type EventAgenda,
} from '@/db/schema';
import { eq, and, lte, gte, gt, asc } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface AgendaItemInput {
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  speakerName?: string;
  description?: string;
  hallLocation?: string;
  slideBulletPoints?: string[];
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const agendaItemInputSchema = z.object({
  eventId: z.string().min(1),
  title: z.string().min(1),
  startTime: z.date(),
  endTime: z.date(),
  speakerName: z.string().optional(),
  description: z.string().optional(),
  hallLocation: z.string().optional(),
  slideBulletPoints: z.array(z.string()).optional(),
});

const agendaItemUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  speakerName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  hallLocation: z.string().nullable().optional(),
  slideBulletPoints: z.array(z.string()).nullable().optional(),
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Validates that startTime and endTime are not equal.
 *
 * @param startTime - Session start time
 * @param endTime - Session end time
 * @throws {Error} If startTime equals endTime
 *
 * Requirements: 8.4
 */
function validateTimeRange(startTime: Date, endTime: Date): void {
  if (startTime.getTime() === endTime.getTime()) {
    throw new Error(
      'Agenda item start time and end time must not be equal.'
    );
  }
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * AgendaService - Event agenda CRUD and query operations.
 *
 * Provides creation, update, deletion, and time-based lookups for event
 * agenda items. Validates that start and end times differ, supports
 * current session lookup and chronologically ordered upcoming sessions.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export const AgendaService = {
  /**
   * Creates a new agenda item for an event.
   *
   * Validates input fields and ensures startTime != endTime before
   * inserting into the database.
   *
   * @param input - The agenda item data
   * @returns The created agenda item
   * @throws {Error} If startTime equals endTime
   * @throws {ZodError} If input validation fails
   *
   * Requirements: 8.1, 8.4
   */
  async create(input: AgendaItemInput): Promise<EventAgenda> {
    agendaItemInputSchema.parse(input);
    validateTimeRange(input.startTime, input.endTime);

    const [agendaItem] = await db
      .insert(eventAgendas)
      .values({
        eventId: input.eventId,
        title: input.title,
        startTime: input.startTime,
        endTime: input.endTime,
        speakerName: input.speakerName ?? null,
        description: input.description ?? null,
        hallLocation: input.hallLocation ?? null,
        slideBulletPoints: input.slideBulletPoints ?? null,
      })
      .returning();

    return agendaItem;
  },

  /**
   * Updates an existing agenda item.
   *
   * If both startTime and endTime are provided, validates they are not
   * equal. If only one is provided, loads the existing record to validate
   * against the other time field.
   *
   * @param id - The agenda item ID
   * @param input - Partial update fields
   * @returns The updated agenda item
   * @throws {Error} If the agenda item is not found
   * @throws {Error} If startTime equals endTime after update
   * @throws {ZodError} If input validation fails
   *
   * Requirements: 8.1, 8.4, 8.5
   */
  async update(id: string, input: Partial<AgendaItemInput>): Promise<EventAgenda> {
    agendaItemUpdateSchema.parse(input);

    // If either time field is being updated, validate the resulting range
    if (input.startTime || input.endTime) {
      const existing = await db.query.eventAgendas.findFirst({
        where: eq(eventAgendas.id, id),
      });

      if (!existing) {
        throw new Error(`Agenda item "${id}" not found.`);
      }

      const newStart = input.startTime ?? existing.startTime;
      const newEnd = input.endTime ?? existing.endTime;
      validateTimeRange(newStart, newEnd);
    }

    const [updated] = await db
      .update(eventAgendas)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.endTime !== undefined && { endTime: input.endTime }),
        ...(input.speakerName !== undefined && { speakerName: input.speakerName ?? null }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.hallLocation !== undefined && { hallLocation: input.hallLocation ?? null }),
        ...(input.slideBulletPoints !== undefined && { slideBulletPoints: input.slideBulletPoints ?? null }),
        updatedAt: new Date(),
      })
      .where(eq(eventAgendas.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Agenda item "${id}" not found.`);
    }

    return updated;
  },

  /**
   * Deletes an agenda item by ID.
   *
   * @param id - The agenda item ID
   * @throws {Error} If the agenda item is not found
   *
   * Requirements: 8.1
   */
  async delete(id: string): Promise<void> {
    const result = await db
      .delete(eventAgendas)
      .where(eq(eventAgendas.id, id))
      .returning({ id: eventAgendas.id });

    if (result.length === 0) {
      throw new Error(`Agenda item "${id}" not found.`);
    }
  },

  /**
   * Returns all agenda items for an event, ordered by startTime ascending.
   *
   * @param eventId - The event ID
   * @returns Array of agenda items in chronological order
   *
   * Requirements: 8.1
   */
  async getByEventId(eventId: string): Promise<EventAgenda[]> {
    return db
      .select()
      .from(eventAgendas)
      .where(eq(eventAgendas.eventId, eventId))
      .orderBy(asc(eventAgendas.startTime));
  },

  /**
   * Finds the currently active session for an event.
   *
   * Returns the agenda item where startTime <= now <= endTime.
   * If multiple sessions overlap, returns the first match.
   *
   * @param eventId - The event ID
   * @returns The current agenda item, or null if no session is active
   *
   * Requirements: 8.2
   */
  async getCurrentSession(eventId: string): Promise<EventAgenda | null> {
    const now = new Date();

    const [current] = await db
      .select()
      .from(eventAgendas)
      .where(
        and(
          eq(eventAgendas.eventId, eventId),
          lte(eventAgendas.startTime, now),
          gte(eventAgendas.endTime, now),
        ),
      )
      .orderBy(asc(eventAgendas.startTime))
      .limit(1);

    return current ?? null;
  },

  /**
   * Returns upcoming sessions for an event (startTime > now).
   *
   * Results are ordered chronologically by startTime ascending.
   * An optional limit can cap the number of results.
   *
   * @param eventId - The event ID
   * @param limit - Optional maximum number of sessions to return
   * @returns Array of upcoming agenda items in chronological order
   *
   * Requirements: 8.3
   */
  async getUpcomingSessions(eventId: string, limit?: number): Promise<EventAgenda[]> {
    const now = new Date();

    let query = db
      .select()
      .from(eventAgendas)
      .where(
        and(
          eq(eventAgendas.eventId, eventId),
          gt(eventAgendas.startTime, now),
        ),
      )
      .orderBy(asc(eventAgendas.startTime));

    if (limit !== undefined) {
      query = query.limit(limit) as typeof query;
    }

    return query;
  },
};
