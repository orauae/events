/**
 * @fileoverview Broadcast Service - Organizer-initiated bulk messaging and surveys
 *
 * Handles broadcast creation with recipient filtering, survey validation,
 * delivery via Trigger.dev tasks, survey response storage, and metrics tracking.
 *
 * @module lib/services/broadcast-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { z } from 'zod';
import { db } from '@/db';
import {
  whatsappBroadcasts,
  whatsappBroadcastResponses,
  whatsappChannels,
  eventGuests,
  eventGuestTags,
  guests,
  type WhatsAppBroadcast,
  type GuestTier,
} from '@/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { sendJob } from '@/lib/jobs';

// ============================================================================
// TYPES
// ============================================================================

export interface BroadcastFilter {
  tagIds?: string[];
  tiers?: GuestTier[];
  rsvpStatuses?: string[];
  checkInStatuses?: string[];
}

export interface SurveyQuestion {
  index: number;
  text: string;
  type: 'free_text' | 'single_choice' | 'multiple_choice';
  options?: string[];
}

export interface WhatsAppMessageContent {
  type: 'text' | 'image' | 'document' | 'location' | 'interactive' | 'template';
  text?: { body: string };
  image?: { url: string; caption?: string };
  document?: { url: string; filename: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: 'button' | 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
      sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
    };
  };
  template?: { name: string; language: { code: string }; components?: Array<Record<string, unknown>> };
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const MAX_SURVEY_QUESTIONS = 10;

const surveyQuestionSchema = z.object({
  index: z.number().int().min(0),
  text: z.string().min(1),
  type: z.enum(['free_text', 'single_choice', 'multiple_choice']),
  options: z.array(z.string()).optional(),
});

const broadcastFilterSchema = z.object({
  tagIds: z.array(z.string()).optional(),
  tiers: z.array(z.enum(['Regular', 'VIP', 'VVIP'])).optional(),
  rsvpStatuses: z.array(z.string()).optional(),
  checkInStatuses: z.array(z.string()).optional(),
}).optional();

// ============================================================================
// SERVICE
// ============================================================================

/**
 * BroadcastService - Organizer-initiated bulk messaging and surveys.
 *
 * Provides broadcast creation with recipient filtering by tags, tier, RSVP
 * status, and check-in status. Supports survey broadcasts with up to 10
 * questions and tracks delivery metrics.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */
export const BroadcastService = {
  /**
   * Creates a new broadcast record for an event.
   *
   * Validates survey question limit (max 10), looks up the WhatsApp channel
   * for the event, and stores the broadcast with content, filter, and survey
   * as JSONB columns.
   *
   * @param eventId - The event ID
   * @param content - The WhatsApp message content to broadcast
   * @param filter - Optional recipient filter criteria
   * @param survey - Optional survey questions (max 10)
   * @returns The created broadcast record
   * @throws {Error} If survey has more than 10 questions
   * @throws {Error} If no WhatsApp channel is configured for the event
   *
   * Requirements: 7.1, 7.4
   */
  async create(
    eventId: string,
    content: WhatsAppMessageContent,
    filter?: BroadcastFilter,
    survey?: SurveyQuestion[],
  ): Promise<WhatsAppBroadcast> {
    // Validate survey question limit (Req 7.4)
    if (survey && survey.length > MAX_SURVEY_QUESTIONS) {
      throw new Error(
        `Survey cannot have more than ${MAX_SURVEY_QUESTIONS} questions. Received ${survey.length}.`
      );
    }

    // Validate survey questions if provided
    if (survey) {
      for (const q of survey) {
        surveyQuestionSchema.parse(q);
      }
    }

    // Validate filter if provided
    if (filter) {
      broadcastFilterSchema.parse(filter);
    }

    // Look up the WhatsApp channel for this event
    const channel = await db.query.whatsappChannels.findFirst({
      where: and(
        eq(whatsappChannels.eventId, eventId),
        eq(whatsappChannels.isActive, true),
      ),
    });

    if (!channel) {
      throw new Error(
        `No active WhatsApp channel found for event "${eventId}". Please configure a WhatsApp channel first.`
      );
    }

    const [broadcast] = await db
      .insert(whatsappBroadcasts)
      .values({
        eventId,
        channelId: channel.id,
        content: content as unknown as Record<string, unknown>,
        filter: filter ? (filter as unknown as Record<string, unknown>) : null,
        survey: survey ? (survey as unknown as Record<string, unknown>[]) : null,
      })
      .returning();

    return broadcast;
  },

  /**
   * Sends a broadcast by resolving recipients and triggering the delivery task.
   *
   * Resolves recipients based on filter criteria (tags, tiers, RSVP status,
   * check-in status), updates the totalRecipients count, and triggers the
   * `whatsapp-broadcast-send` Trigger.dev task for batch delivery.
   *
   * @param broadcastId - The broadcast ID to send
   * @returns Total recipients and the Trigger.dev task handle ID
   * @throws {Error} If the broadcast is not found
   *
   * Requirements: 7.2, 7.3
   */
  async send(broadcastId: string): Promise<{ totalRecipients: number; taskId: string }> {
    // Get the broadcast record
    const broadcast = await db.query.whatsappBroadcasts.findFirst({
      where: eq(whatsappBroadcasts.id, broadcastId),
    });

    if (!broadcast) {
      throw new Error(`Broadcast "${broadcastId}" not found`);
    }

    // Resolve recipients based on filter
    const filter = broadcast.filter as BroadcastFilter | null;
    const recipientIds = await BroadcastService.resolveRecipients(broadcast.eventId, filter);

    // Update totalRecipients and sentAt
    await db
      .update(whatsappBroadcasts)
      .set({
        totalRecipients: recipientIds.length,
        sentAt: new Date(),
      })
      .where(eq(whatsappBroadcasts.id, broadcastId));

    // Trigger the broadcast send job
    const jobId = await sendJob('whatsapp-broadcast-send', {
      broadcastId,
      batchSize: 50,
      batchDelayMs: 1000,
    });

    return {
      totalRecipients: recipientIds.length,
      taskId: jobId ?? 'queued',
    };
  },

  /**
   * Resolves recipient event guest IDs based on filter criteria.
   *
   * Applies all filter conditions with AND logic: a guest must match ALL
   * specified criteria to be included. Supports filtering by tags (guest
   * must have at least one matching tag), tiers, RSVP statuses, and
   * check-in statuses.
   *
   * @param eventId - The event ID
   * @param filter - Optional filter criteria
   * @returns Array of event guest IDs matching the filter
   *
   * Requirements: 7.2
   */
  async resolveRecipients(eventId: string, filter?: BroadcastFilter | null): Promise<string[]> {
    // Build conditions array
    const conditions = [eq(eventGuests.eventId, eventId)];

    // Filter by tiers
    if (filter?.tiers && filter.tiers.length > 0) {
      conditions.push(inArray(eventGuests.tier, filter.tiers));
    }

    // Filter by RSVP statuses
    if (filter?.rsvpStatuses && filter.rsvpStatuses.length > 0) {
      conditions.push(inArray(eventGuests.rsvpStatus, filter.rsvpStatuses as any));
    }

    // Filter by check-in statuses
    if (filter?.checkInStatuses && filter.checkInStatuses.length > 0) {
      conditions.push(inArray(eventGuests.checkInStatus, filter.checkInStatuses as any));
    }

    // Base query for event guests matching tier/rsvp/checkin filters
    let recipientIds: string[];

    if (filter?.tagIds && filter.tagIds.length > 0) {
      // When filtering by tags, join with eventGuestTags
      // Guest must have at least one of the specified tags
      const results = await db
        .selectDistinct({ id: eventGuests.id })
        .from(eventGuests)
        .innerJoin(eventGuestTags, eq(eventGuests.id, eventGuestTags.eventGuestId))
        .where(
          and(
            ...conditions,
            inArray(eventGuestTags.tagId, filter.tagIds),
          ),
        );

      recipientIds = results.map((r) => r.id);
    } else {
      // No tag filter — just apply tier/rsvp/checkin conditions
      const results = await db
        .select({ id: eventGuests.id })
        .from(eventGuests)
        .where(and(...conditions));

      recipientIds = results.map((r) => r.id);
    }

    return recipientIds;
  },

  /**
   * Stores a guest's response to a survey question.
   *
   * Inserts the response into whatsappBroadcastResponses and increments
   * the respondedCount on the broadcast record.
   *
   * @param broadcastId - The broadcast ID
   * @param eventGuestId - The responding guest's event guest ID
   * @param questionIndex - The 0-based question index
   * @param response - The guest's response text
   *
   * Requirements: 7.5
   */
  async storeSurveyResponse(
    broadcastId: string,
    eventGuestId: string,
    questionIndex: number,
    response: string,
  ): Promise<void> {
    // Insert the survey response
    await db.insert(whatsappBroadcastResponses).values({
      broadcastId,
      eventGuestId,
      questionIndex,
      response,
    });

    // Increment respondedCount on the broadcast
    await db
      .update(whatsappBroadcasts)
      .set({
        respondedCount: sql`${whatsappBroadcasts.respondedCount} + 1`,
      })
      .where(eq(whatsappBroadcasts.id, broadcastId));
  },

  /**
   * Returns delivery metrics for a broadcast.
   *
   * Reads the metric counter fields directly from the broadcast record.
   *
   * @param broadcastId - The broadcast ID
   * @returns Metrics object with sent, delivered, read, and responded counts
   * @throws {Error} If the broadcast is not found
   *
   * Requirements: 7.6
   */
  async getBroadcastMetrics(
    broadcastId: string,
  ): Promise<{ sent: number; delivered: number; read: number; responded: number }> {
    const broadcast = await db.query.whatsappBroadcasts.findFirst({
      where: eq(whatsappBroadcasts.id, broadcastId),
    });

    if (!broadcast) {
      throw new Error(`Broadcast "${broadcastId}" not found`);
    }

    return {
      sent: broadcast.sentCount,
      delivered: broadcast.deliveredCount,
      read: broadcast.readCount,
      responded: broadcast.respondedCount,
    };
  },

  /**
   * Returns all survey responses for a broadcast, grouped by guest.
   *
   * Queries broadcast responses joined with event guests and guests tables
   * to include guest names. Groups responses by guest, returning each
   * guest's responses as a Record<questionIndex, responseText>.
   *
   * @param broadcastId - The broadcast ID
   * @returns Array of guest survey responses with guest name and response map
   *
   * Requirements: 7.5
   */
  async getSurveyResponses(
    broadcastId: string,
  ): Promise<Array<{ guestName: string; responses: Record<number, string> }>> {
    const rows = await db
      .select({
        eventGuestId: whatsappBroadcastResponses.eventGuestId,
        questionIndex: whatsappBroadcastResponses.questionIndex,
        response: whatsappBroadcastResponses.response,
        firstName: guests.firstName,
        lastName: guests.lastName,
      })
      .from(whatsappBroadcastResponses)
      .innerJoin(eventGuests, eq(whatsappBroadcastResponses.eventGuestId, eventGuests.id))
      .innerJoin(guests, eq(eventGuests.guestId, guests.id))
      .where(eq(whatsappBroadcastResponses.broadcastId, broadcastId));

    // Group by guest
    const grouped = new Map<string, { guestName: string; responses: Record<number, string> }>();

    for (const row of rows) {
      const key = row.eventGuestId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          guestName: `${row.firstName} ${row.lastName}`,
          responses: {},
        });
      }
      grouped.get(key)!.responses[row.questionIndex] = row.response;
    }

    return Array.from(grouped.values());
  },
};
