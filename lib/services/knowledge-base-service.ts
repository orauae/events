/**
 * @fileoverview Knowledge Base Service - Event FAQ and venue information management
 *
 * Manages per-event knowledge base entries organized by category. The AI
 * concierge uses these entries to answer common guest questions accurately.
 *
 * @module lib/services/knowledge-base-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { z } from 'zod';
import { db } from '@/db';
import {
  eventKnowledgeBase,
  kbCategoryEnum,
  type EventKnowledgeBase,
  type KBCategory,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgeBaseEntryInput {
  eventId: string;
  category: KBCategory;
  question: string;
  answer: string;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const knowledgeBaseEntryInputSchema = z.object({
  eventId: z.string().min(1),
  category: z.enum(kbCategoryEnum.enumValues),
  question: z.string().min(1),
  answer: z.string().min(1),
});

const knowledgeBaseEntryUpdateSchema = z.object({
  category: z.enum(kbCategoryEnum.enumValues).optional(),
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
});

// ============================================================================
// SERVICE
// ============================================================================

/**
 * KnowledgeBaseService - Event FAQ and venue information management.
 *
 * Provides CRUD operations for per-event knowledge base entries. Entries
 * are categorized (wifi, parking, emergency, restrooms, food_beverage,
 * transportation, general) and used by the AI concierge to answer guest
 * questions.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
export const KnowledgeBaseService = {
  /**
   * Creates a new knowledge base entry for an event.
   *
   * @param input - The knowledge base entry data
   * @returns The created knowledge base entry
   * @throws {ZodError} If input validation fails
   *
   * Requirements: 9.1
   */
  async create(input: KnowledgeBaseEntryInput): Promise<EventKnowledgeBase> {
    knowledgeBaseEntryInputSchema.parse(input);

    const [entry] = await db
      .insert(eventKnowledgeBase)
      .values({
        eventId: input.eventId,
        category: input.category,
        question: input.question,
        answer: input.answer,
      })
      .returning();

    return entry;
  },

  /**
   * Updates an existing knowledge base entry.
   *
   * @param id - The knowledge base entry ID
   * @param input - Partial update fields
   * @returns The updated knowledge base entry
   * @throws {Error} If the entry is not found
   * @throws {ZodError} If input validation fails
   *
   * Requirements: 9.1, 9.4
   */
  async update(
    id: string,
    input: Partial<KnowledgeBaseEntryInput>,
  ): Promise<EventKnowledgeBase> {
    // Strip eventId from updates — it should not be changed
    const { eventId: _, ...updateFields } = input;
    knowledgeBaseEntryUpdateSchema.parse(updateFields);

    const [updated] = await db
      .update(eventKnowledgeBase)
      .set({
        ...(updateFields.category !== undefined && { category: updateFields.category }),
        ...(updateFields.question !== undefined && { question: updateFields.question }),
        ...(updateFields.answer !== undefined && { answer: updateFields.answer }),
        updatedAt: new Date(),
      })
      .where(eq(eventKnowledgeBase.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Knowledge base entry "${id}" not found.`);
    }

    return updated;
  },

  /**
   * Deletes a knowledge base entry by ID.
   *
   * @param id - The knowledge base entry ID
   * @throws {Error} If the entry is not found
   *
   * Requirements: 9.1
   */
  async delete(id: string): Promise<void> {
    const result = await db
      .delete(eventKnowledgeBase)
      .where(eq(eventKnowledgeBase.id, id))
      .returning({ id: eventKnowledgeBase.id });

    if (result.length === 0) {
      throw new Error(`Knowledge base entry "${id}" not found.`);
    }
  },

  /**
   * Returns all knowledge base entries for an event.
   *
   * @param eventId - The event ID
   * @returns Array of knowledge base entries
   *
   * Requirements: 9.1
   */
  async getByEventId(eventId: string): Promise<EventKnowledgeBase[]> {
    return db
      .select()
      .from(eventKnowledgeBase)
      .where(eq(eventKnowledgeBase.eventId, eventId));
  },

  /**
   * Returns knowledge base entries for an event filtered by category.
   *
   * @param eventId - The event ID
   * @param category - The KB category to filter by
   * @returns Array of knowledge base entries matching the category
   *
   * Requirements: 9.3
   */
  async getByCategory(
    eventId: string,
    category: KBCategory,
  ): Promise<EventKnowledgeBase[]> {
    return db
      .select()
      .from(eventKnowledgeBase)
      .where(
        and(
          eq(eventKnowledgeBase.eventId, eventId),
          eq(eventKnowledgeBase.category, category),
        ),
      );
  },
};
