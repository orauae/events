/**
 * @fileoverview WhatsApp Message Service - Sending, receiving, and managing WhatsApp messages
 *
 * Handles Meta WhatsApp Cloud API integration for sending text, media, interactive,
 * and template messages. Manages session window tracking (24h expiry), message
 * persistence, and delivery status updates.
 *
 * @module lib/services/whatsapp-message-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { z } from 'zod';
import { db } from '@/db';
import {
  whatsappMessages,
  whatsappConversations,
  whatsappChannels,
  whatsappBroadcasts,
  type WhatsAppMessage,
  type WhatsAppChannel,
  type WAMessageStatus,
} from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { WhatsAppChannelService } from './whatsapp-channel-service';

// ============================================================================
// CONSTANTS
// ============================================================================

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v21.0';
const SESSION_WINDOW_HOURS = 24;
const MAX_INTERACTIVE_BUTTONS = 3;
const MAX_INTERACTIVE_LIST_ITEMS = 10;

/**
 * Forward-only status transition order.
 * Status can only move forward in this sequence; backward transitions are rejected.
 * Requirements: 2.7
 */
const STATUS_ORDER: Record<WAMessageStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: -1, // failed can be set from any state
};

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export type MessageType = 'text' | 'image' | 'document' | 'location' | 'interactive' | 'template';
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Zod schema for WhatsApp message content.
 * Validates the structured content payload for all supported message types.
 * Requirements: 3.3, 3.4, 13.1
 */
export const whatsAppMessageContentSchema = z.object({
  type: z.enum(['text', 'image', 'document', 'location', 'interactive', 'template']),
  text: z.object({
    body: z.string(),
  }).optional(),
  image: z.object({
    url: z.string(),
    caption: z.string().optional(),
  }).optional(),
  document: z.object({
    url: z.string(),
    filename: z.string(),
    caption: z.string().optional(),
  }).optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
  interactive: z.object({
    type: z.enum(['button', 'list']),
    header: z.object({
      type: z.literal('text'),
      text: z.string(),
    }).optional(),
    body: z.object({ text: z.string() }),
    footer: z.object({ text: z.string() }).optional(),
    action: z.object({
      buttons: z.array(z.object({
        type: z.literal('reply'),
        reply: z.object({
          id: z.string(),
          title: z.string(),
        }),
      })).optional(),
      sections: z.array(z.object({
        title: z.string(),
        rows: z.array(z.object({
          id: z.string(),
          title: z.string(),
          description: z.string().optional(),
        })),
      })).optional(),
    }),
  }).optional(),
  template: z.object({
    name: z.string(),
    language: z.object({ code: z.string() }),
    components: z.array(z.record(z.string(), z.unknown())).optional(),
  }).optional(),
});

export type WhatsAppMessageContent = z.infer<typeof whatsAppMessageContentSchema>;

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates interactive message limits.
 *
 * - Button type: max 3 buttons
 * - List type: max 10 total rows across all sections
 *
 * @param content - The message content to validate
 * @throws {Error} If interactive message exceeds limits
 *
 * Requirements: 3.3
 */
export function validateInteractiveMessage(content: WhatsAppMessageContent): void {
  if (content.type !== 'interactive' || !content.interactive) {
    return;
  }

  const { interactive } = content;

  if (interactive.type === 'button') {
    const buttonCount = interactive.action.buttons?.length ?? 0;
    if (buttonCount > MAX_INTERACTIVE_BUTTONS) {
      throw new Error(
        `Interactive button message exceeds limit: ${buttonCount} buttons provided, maximum is ${MAX_INTERACTIVE_BUTTONS}`
      );
    }
  }

  if (interactive.type === 'list') {
    const totalRows = (interactive.action.sections ?? []).reduce(
      (sum, section) => sum + section.rows.length,
      0
    );
    if (totalRows > MAX_INTERACTIVE_LIST_ITEMS) {
      throw new Error(
        `Interactive list message exceeds limit: ${totalRows} items provided, maximum is ${MAX_INTERACTIVE_LIST_ITEMS}`
      );
    }
  }
}

// ============================================================================
// META WHATSAPP CLOUD API CLIENT
// ============================================================================

/**
 * Builds the Meta Cloud API request body for a given message content.
 */
function buildApiPayload(to: string, content: WhatsAppMessageContent): Record<string, unknown> {
  const base: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
  };

  switch (content.type) {
    case 'text':
      return { ...base, type: 'text', text: content.text };

    case 'image':
      return { ...base, type: 'image', image: { link: content.image?.url, caption: content.image?.caption } };

    case 'document':
      return {
        ...base,
        type: 'document',
        document: {
          link: content.document?.url,
          filename: content.document?.filename,
          caption: content.document?.caption,
        },
      };

    case 'location':
      return { ...base, type: 'location', location: content.location };

    case 'interactive':
      return { ...base, type: 'interactive', interactive: content.interactive };

    case 'template':
      return { ...base, type: 'template', template: content.template };

    default:
      return { ...base, type: 'text', text: content.text };
  }
}

/**
 * Sends a message via the Meta WhatsApp Cloud API.
 *
 * @param phoneNumberId - The WhatsApp phone number ID
 * @param accessToken - The plaintext access token
 * @param to - Recipient phone number
 * @param content - Message content
 * @returns The WhatsApp message ID from Meta's response
 * @throws {Error} If the API call fails
 */
async function callWhatsAppApi(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  content: WhatsAppMessageContent
): Promise<string> {
  const payload = buildApiPayload(to, content);

  const response = await fetch(`${WHATSAPP_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const errorMessage = errorBody?.error?.message || `HTTP ${response.status}`;
    throw new Error(`WhatsApp API error: ${errorMessage}`);
  }

  const data = await response.json() as { messages?: Array<{ id: string }> };
  const waMessageId = data.messages?.[0]?.id;

  if (!waMessageId) {
    throw new Error('WhatsApp API returned no message ID');
  }

  return waMessageId;
}

/**
 * Loads a channel and decrypts its access token.
 */
async function getChannelWithToken(channelId: string): Promise<{ channel: WhatsAppChannel; accessToken: string }> {
  const channel = await db.query.whatsappChannels.findFirst({
    where: eq(whatsappChannels.id, channelId),
  });

  if (!channel) {
    throw new Error(`WhatsApp channel "${channelId}" not found`);
  }

  if (!channel.isActive) {
    throw new Error(`WhatsApp channel "${channelId}" is inactive`);
  }

  const accessToken = WhatsAppChannelService.decryptAccessToken(channel);
  return { channel, accessToken };
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * WhatsAppMessageService - Handles sending, receiving, and managing WhatsApp messages.
 *
 * Provides methods for sending messages via Meta's Cloud API, storing inbound/outbound
 * messages, tracking delivery status, and managing the 24-hour session window.
 *
 * Requirements: 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */
export const WhatsAppMessageService = {
  /**
   * Sends a message via the WhatsApp Cloud API.
   *
   * Validates interactive message limits before sending. The message is sent
   * through Meta's API and the WhatsApp message ID is returned.
   *
   * @param channelId - The WhatsApp channel ID
   * @param to - Recipient phone number
   * @param content - Message content (text, media, interactive, etc.)
   * @returns The WhatsApp message ID
   * @throws {Error} If interactive limits are exceeded or API call fails
   *
   * Requirements: 3.1, 3.3, 3.4
   */
  async sendMessage(
    channelId: string,
    to: string,
    content: WhatsAppMessageContent
  ): Promise<{ messageId: string }> {
    // Validate interactive message limits (Req 3.3)
    validateInteractiveMessage(content);

    const { channel, accessToken } = await getChannelWithToken(channelId);

    const waMessageId = await callWhatsAppApi(
      channel.phoneNumberId,
      accessToken,
      to,
      content
    );

    return { messageId: waMessageId };
  },

  /**
   * Sends a template message via the WhatsApp Cloud API.
   *
   * Template messages are required when no session window is active (Req 3.2).
   *
   * @param channelId - The WhatsApp channel ID
   * @param to - Recipient phone number
   * @param templateName - The approved template name
   * @param languageCode - Template language code (default: 'en')
   * @param params - Optional template parameter values
   * @returns The WhatsApp message ID
   *
   * Requirements: 3.2
   */
  async sendTemplateMessage(
    channelId: string,
    to: string,
    templateName: string,
    languageCode: string = 'en',
    params?: Record<string, string>
  ): Promise<{ messageId: string }> {
    const components: Array<Record<string, unknown>> = [];

    if (params && Object.keys(params).length > 0) {
      components.push({
        type: 'body',
        parameters: Object.values(params).map((value) => ({
          type: 'text',
          text: value,
        })),
      });
    }

    const content: WhatsAppMessageContent = {
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    return this.sendMessage(channelId, to, content);
  },

  /**
   * Stores an inbound message from a guest.
   *
   * Records the message in the database with direction 'inbound' and all required fields.
   *
   * @param channelId - The WhatsApp channel ID
   * @param conversationId - The conversation this message belongs to
   * @param waMessageId - Meta's WhatsApp message ID
   * @param from - Sender phone number
   * @param content - Message content
   * @param timestamp - When the message was sent
   * @returns The stored message record
   *
   * Requirements: 2.6
   */
  async storeInboundMessage(
    channelId: string,
    conversationId: string,
    waMessageId: string,
    from: string,
    content: WhatsAppMessageContent,
    timestamp: Date
  ): Promise<WhatsAppMessage> {
    const [message] = await db
      .insert(whatsappMessages)
      .values({
        conversationId,
        channelId,
        waMessageId,
        direction: 'inbound',
        type: content.type,
        content: content as unknown as Record<string, unknown>,
        status: 'delivered', // inbound messages are already delivered
        aiGenerated: false,
        createdAt: timestamp,
      })
      .returning();

    return message;
  },

  /**
   * Stores an outbound message sent to a guest.
   *
   * Records the message in the database with direction 'outbound' and pending status.
   *
   * @param channelId - The WhatsApp channel ID
   * @param conversationId - The conversation this message belongs to
   * @param content - Message content
   * @param aiGenerated - Whether the message was generated by AI
   * @returns The stored message record
   *
   * Requirements: 3.7
   */
  async storeOutboundMessage(
    channelId: string,
    conversationId: string,
    content: WhatsAppMessageContent,
    aiGenerated: boolean,
    broadcastId?: string
  ): Promise<WhatsAppMessage> {
    const [message] = await db
      .insert(whatsappMessages)
      .values({
        conversationId,
        channelId,
        broadcastId: broadcastId ?? null,
        direction: 'outbound',
        type: content.type,
        content: content as unknown as Record<string, unknown>,
        status: 'pending',
        aiGenerated,
      })
      .returning();

    return message;
  },

  /**
   * Updates the delivery status of an outbound message.
   *
   * Enforces forward-only status transitions: pending → sent → delivered → read.
   * The 'failed' status can be set from any state. Backward transitions are silently ignored.
   *
   * @param waMessageId - Meta's WhatsApp message ID
   * @param status - The new status
   * @param timestamp - When the status change occurred
   *
   * Requirements: 2.7
   */
  async updateMessageStatus(
    waMessageId: string,
    status: WAMessageStatus,
    timestamp: Date
  ): Promise<void> {
    const existing = await db.query.whatsappMessages.findFirst({
      where: eq(whatsappMessages.waMessageId, waMessageId),
    });

    if (!existing) {
      // Message not found — may be from a different system or already deleted
      return;
    }

    const currentOrder = STATUS_ORDER[existing.status as WAMessageStatus];
    const newOrder = STATUS_ORDER[status];

    // Allow 'failed' from any state, otherwise enforce forward-only transitions
    if (status !== 'failed' && newOrder <= currentOrder) {
      return; // Silently ignore backward or same-state transitions
    }

    await db
      .update(whatsappMessages)
      .set({
        status,
        statusUpdatedAt: timestamp,
      })
      .where(eq(whatsappMessages.waMessageId, waMessageId));

    // Aggregate broadcast counters if this message belongs to a broadcast
    if (existing.broadcastId) {
      await this.updateBroadcastCounters(existing.broadcastId, existing.status as WAMessageStatus, status);
    }
  },

  /**
   * Updates broadcast delivery metric counters when a message status transitions.
   * Increments the counter for the new status. Only tracks forward transitions
   * (delivered, read) since sentCount is already incremented at send time.
   *
   * @param broadcastId - The broadcast this message belongs to
   * @param oldStatus - The previous message status
   * @param newStatus - The new message status
   */
  async updateBroadcastCounters(
    broadcastId: string,
    oldStatus: WAMessageStatus,
    newStatus: WAMessageStatus
  ): Promise<void> {
    try {
      const updates: Record<string, unknown> = {};

      if (newStatus === 'delivered' && oldStatus !== 'delivered') {
        updates.deliveredCount = sql`${whatsappBroadcasts.deliveredCount} + 1`;
      }

      if (newStatus === 'read' && oldStatus !== 'read') {
        // If jumping from sent/pending straight to read, also count as delivered
        if (oldStatus !== 'delivered') {
          updates.deliveredCount = sql`${whatsappBroadcasts.deliveredCount} + 1`;
        }
        updates.readCount = sql`${whatsappBroadcasts.readCount} + 1`;
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(whatsappBroadcasts)
          .set(updates)
          .where(eq(whatsappBroadcasts.id, broadcastId));
      }
    } catch (error) {
      // Log but don't fail the status update — counters are best-effort
      console.error('[WhatsAppMessageService] Failed to update broadcast counters:', error);
    }
  },

  /**
   * Checks whether the 24-hour session window is active for a conversation.
   *
   * The session window is active if sessionWindowExpiresAt is set and in the future.
   *
   * @param conversationId - The conversation ID
   * @returns true if the session window is active
   *
   * Requirements: 3.1, 3.2, 3.5
   */
  async isSessionWindowActive(conversationId: string): Promise<boolean> {
    const conversation = await db.query.whatsappConversations.findFirst({
      where: eq(whatsappConversations.id, conversationId),
    });

    if (!conversation || !conversation.sessionWindowExpiresAt) {
      return false;
    }

    return new Date() < conversation.sessionWindowExpiresAt;
  },

  /**
   * Refreshes the session window for a conversation to 24 hours from now.
   *
   * Called when an inbound message is received to extend the free-form messaging window.
   *
   * @param conversationId - The conversation ID
   *
   * Requirements: 3.5
   */
  async refreshSessionWindow(conversationId: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SESSION_WINDOW_HOURS);

    await db
      .update(whatsappConversations)
      .set({
        sessionWindowExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));
  },
};
