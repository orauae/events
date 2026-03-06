/**
 * @fileoverview Conversation Service - Manages conversation lifecycle and state
 *
 * Handles creation (idempotent via unique constraint), state updates,
 * escalation transitions (ai_managed ↔ human_managed), and conversation closure.
 *
 * @module lib/services/conversation-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 2.5, 10.1, 10.3, 10.4, 10.5
 */

import { z } from 'zod';
import { db } from '@/db';
import {
  whatsappConversations,
  type WhatsAppConversation,
  type WAEscalationStatus,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';

// ============================================================================
// TYPES & VALIDATION SCHEMAS
// ============================================================================

/**
 * Conversation state stored as JSONB in the whatsappConversations table.
 * Tracks the current event phase, topic context, pending surveys, and escalation reason.
 *
 * Requirements: 13.2
 */
export interface ConversationState {
  currentPhase: 'pre-event' | 'during-event' | 'post-event';
  lastTopic?: string;
  pendingSurveyId?: string;
  pendingQuestionIndex?: number;
  escalationReason?: string;
}

/**
 * Zod schema for ConversationState validation and parsing.
 */
export const conversationStateSchema = z.object({
  currentPhase: z.enum(['pre-event', 'during-event', 'post-event']),
  lastTopic: z.string().optional(),
  pendingSurveyId: z.string().optional(),
  pendingQuestionIndex: z.number().int().min(0).optional(),
  escalationReason: z.string().optional(),
});

export type EscalationStatus = WAEscalationStatus;

// ============================================================================
// SERVICE
// ============================================================================

/**
 * ConversationService - Manages conversation lifecycle and state.
 *
 * Provides idempotent findOrCreate, state management, escalation transitions,
 * and conversation closure.
 *
 * Requirements: 2.5, 10.1, 10.3, 10.4, 10.5
 */
export const ConversationService = {
  /**
   * Finds an existing conversation for the given event and guest, or creates one.
   *
   * Uses the unique constraint on (eventId, eventGuestId) for idempotency:
   * attempts an insert, and if a unique violation occurs, returns the existing record.
   *
   * @param params - eventId, eventGuestId, channelId, guestPhoneNumber
   * @returns The existing or newly created conversation
   *
   * Requirements: 2.5
   */
  async findOrCreate(params: {
    eventId: string;
    eventGuestId: string;
    channelId: string;
    guestPhoneNumber: string;
  }): Promise<WhatsAppConversation> {
    const { eventId, eventGuestId, channelId, guestPhoneNumber } = params;

    // Try to find existing conversation first
    const existing = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.eventId, eventId),
        eq(whatsappConversations.eventGuestId, eventGuestId),
      ),
    });

    if (existing) {
      return existing;
    }

    // Attempt insert — catch unique violation for concurrent requests
    try {
      const defaultState: ConversationState = {
        currentPhase: 'pre-event',
      };

      const [created] = await db
        .insert(whatsappConversations)
        .values({
          channelId,
          eventId,
          eventGuestId,
          guestPhoneNumber,
          state: defaultState,
        })
        .returning();

      return created;
    } catch (error: unknown) {
      // Handle unique constraint violation (concurrent insert race)
      if (
        error instanceof Error &&
        (error.message.includes('unique') ||
          error.message.includes('duplicate') ||
          error.message.includes('23505'))
      ) {
        const fallback = await db.query.whatsappConversations.findFirst({
          where: and(
            eq(whatsappConversations.eventId, eventId),
            eq(whatsappConversations.eventGuestId, eventGuestId),
          ),
        });

        if (fallback) {
          return fallback;
        }
      }

      throw error;
    }
  },

  /**
   * Retrieves a conversation by its ID.
   *
   * @param id - The conversation ID
   * @returns The conversation record, or null if not found
   *
   * Requirements: 10.1
   */
  async getById(id: string): Promise<WhatsAppConversation | null> {
    const conversation = await db.query.whatsappConversations.findFirst({
      where: eq(whatsappConversations.id, id),
    });

    return conversation ?? null;
  },

  /**
   * Retrieves all active conversations for a given event.
   *
   * @param eventId - The event ID
   * @returns Array of active conversation records
   *
   * Requirements: 10.1
   */
  async getActiveByEvent(eventId: string): Promise<WhatsAppConversation[]> {
    const conversations = await db.query.whatsappConversations.findMany({
      where: and(
        eq(whatsappConversations.eventId, eventId),
        eq(whatsappConversations.isActive, true),
      ),
    });

    return conversations;
  },

  /**
   * Updates the conversation state (JSONB) by merging partial state into existing state.
   *
   * @param id - The conversation ID
   * @param partialState - Partial ConversationState to merge
   * @throws {Error} If the conversation is not found
   *
   * Requirements: 10.1, 13.2
   */
  async updateState(id: string, partialState: Partial<ConversationState>): Promise<void> {
    const existing = await db.query.whatsappConversations.findFirst({
      where: eq(whatsappConversations.id, id),
    });

    if (!existing) {
      throw new Error(`Conversation with ID "${id}" not found`);
    }

    const currentState = (existing.state ?? {}) as Partial<ConversationState>;
    const mergedState: ConversationState = {
      currentPhase: partialState.currentPhase ?? currentState.currentPhase ?? 'pre-event',
      ...(currentState.lastTopic !== undefined && { lastTopic: currentState.lastTopic }),
      ...(currentState.pendingSurveyId !== undefined && { pendingSurveyId: currentState.pendingSurveyId }),
      ...(currentState.pendingQuestionIndex !== undefined && { pendingQuestionIndex: currentState.pendingQuestionIndex }),
      ...(currentState.escalationReason !== undefined && { escalationReason: currentState.escalationReason }),
      ...partialState,
    };

    await db
      .update(whatsappConversations)
      .set({
        state: mergedState,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, id));
  },

  /**
   * Escalates a conversation from AI-managed to human-managed.
   *
   * Stores the escalation reason in the conversation state JSON and
   * transitions the escalation status to 'human_managed'.
   *
   * @param id - The conversation ID
   * @param reason - The reason for escalation
   * @throws {Error} If the conversation is not found
   * @throws {Error} If the conversation is already human-managed
   *
   * Requirements: 10.3, 10.5
   */
  async escalateToHuman(id: string, reason: string): Promise<void> {
    const existing = await db.query.whatsappConversations.findFirst({
      where: eq(whatsappConversations.id, id),
    });

    if (!existing) {
      throw new Error(`Conversation with ID "${id}" not found`);
    }

    if (existing.escalationStatus === 'human_managed') {
      throw new Error(`Conversation "${id}" is already escalated to human management`);
    }

    const currentState = (existing.state ?? {}) as Partial<ConversationState>;
    const updatedState: ConversationState = {
      currentPhase: currentState.currentPhase ?? 'pre-event',
      ...currentState,
      escalationReason: reason,
    };

    await db
      .update(whatsappConversations)
      .set({
        escalationStatus: 'human_managed',
        state: updatedState,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, id));
  },

  /**
   * Releases a conversation from human management back to AI management.
   *
   * Clears the escalation reason from the conversation state and
   * transitions the escalation status to 'ai_managed'.
   *
   * @param id - The conversation ID
   * @throws {Error} If the conversation is not found
   * @throws {Error} If the conversation is not currently human-managed
   *
   * Requirements: 10.4, 10.5
   */
  async releaseFromHuman(id: string): Promise<void> {
    const existing = await db.query.whatsappConversations.findFirst({
      where: eq(whatsappConversations.id, id),
    });

    if (!existing) {
      throw new Error(`Conversation with ID "${id}" not found`);
    }

    if (existing.escalationStatus !== 'human_managed') {
      throw new Error(`Conversation "${id}" is not currently escalated to human management`);
    }

    const currentState = (existing.state ?? {}) as Partial<ConversationState>;
    // Clear escalation reason on release
    const { escalationReason: _, ...stateWithoutReason } = currentState;
    const updatedState: ConversationState = {
      currentPhase: stateWithoutReason.currentPhase ?? 'pre-event',
      ...stateWithoutReason,
    };

    await db
      .update(whatsappConversations)
      .set({
        escalationStatus: 'ai_managed',
        state: updatedState,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, id));
  },

  /**
   * Retrieves the current escalation status of a conversation.
   *
   * @param id - The conversation ID
   * @returns The escalation status ('ai_managed' or 'human_managed')
   * @throws {Error} If the conversation is not found
   *
   * Requirements: 10.5
   */
  async getEscalationStatus(id: string): Promise<EscalationStatus> {
    const conversation = await db.query.whatsappConversations.findFirst({
      where: eq(whatsappConversations.id, id),
    });

    if (!conversation) {
      throw new Error(`Conversation with ID "${id}" not found`);
    }

    return conversation.escalationStatus;
  },

  /**
   * Closes a conversation by marking it as inactive.
   *
   * @param id - The conversation ID
   * @throws {Error} If the conversation is not found
   *
   * Requirements: 10.1
   */
  async closeConversation(id: string): Promise<void> {
    const existing = await db.query.whatsappConversations.findFirst({
      where: eq(whatsappConversations.id, id),
    });

    if (!existing) {
      throw new Error(`Conversation with ID "${id}" not found`);
    }

    await db
      .update(whatsappConversations)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, id));
  },
};
