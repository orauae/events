/**
 * @fileoverview WhatsApp Channel Service - Per-event WhatsApp Business Account configuration
 *
 * Manages the lifecycle of WhatsApp channels: creation with credential validation,
 * access token encryption at rest, one-to-one event constraint enforcement,
 * and cleanup of active conversations on deletion.
 *
 * @module lib/services/whatsapp-channel-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { z } from 'zod';
import { db } from '@/db';
import {
  whatsappChannels,
  whatsappConversations,
  type WhatsAppChannel,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { encryptPassword, decryptPassword } from './smtp-service';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod schema for WhatsApp channel creation input.
 * Requirements: 1.1
 */
export const createWhatsAppChannelSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  phoneNumberId: z.string().min(1, 'Phone number ID is required'),
  whatsappBusinessAccountId: z.string().min(1, 'WhatsApp Business Account ID is required'),
  accessToken: z.string().min(1, 'Access token is required'),
  verifyToken: z.string().min(1, 'Verify token is required'),
  unknownGuestTemplateId: z.string().optional(),
});

/**
 * Zod schema for WhatsApp channel update input.
 */
export const updateWhatsAppChannelSchema = z.object({
  phoneNumberId: z.string().min(1, 'Phone number ID is required'),
  whatsappBusinessAccountId: z.string().min(1, 'WhatsApp Business Account ID is required'),
  accessToken: z.string().min(1, 'Access token is required'),
  verifyToken: z.string().min(1, 'Verify token is required'),
  unknownGuestTemplateId: z.string().nullable(),
}).partial();

export type CreateWhatsAppChannelInput = z.infer<typeof createWhatsAppChannelSchema>;
export type UpdateWhatsAppChannelInput = z.infer<typeof updateWhatsAppChannelSchema>;

// ============================================================================
// SERVICE
// ============================================================================

/**
 * WhatsAppChannelService - Manages per-event WhatsApp Business Account configuration.
 *
 * Provides methods for creating, reading, updating, and deleting WhatsApp channels,
 * with credential validation against Meta's Cloud API and access token encryption.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
export const WhatsAppChannelService = {
  /**
   * Creates a new WhatsApp channel for an event.
   *
   * Validates credentials against Meta's API, encrypts the access token,
   * and enforces the one-to-one event-channel constraint.
   *
   * @param input - Channel configuration including eventId and credentials
   * @returns The newly created channel record
   * @throws {Error} If the event already has a channel (one-to-one constraint)
   * @throws {Error} If credential validation fails
   *
   * Requirements: 1.1, 1.2, 1.3, 1.5
   */
  async create(input: CreateWhatsAppChannelInput): Promise<WhatsAppChannel> {
    const validated = createWhatsAppChannelSchema.parse(input);

    // Enforce one-to-one event-channel constraint (Req 1.5)
    const existing = await db.query.whatsappChannels.findFirst({
      where: eq(whatsappChannels.eventId, validated.eventId),
    });

    if (existing) {
      throw new Error(
        `Event "${validated.eventId}" already has a WhatsApp channel. Only one channel per event is allowed.`
      );
    }

    // Validate credentials against Meta API (Req 1.2)
    const validation = await WhatsAppChannelService.validateCredentials(
      validated.phoneNumberId,
      validated.accessToken
    );

    if (!validation.valid) {
      throw new Error(`WhatsApp credential validation failed: ${validation.error}`);
    }

    // Encrypt access token at rest (Req 1.3)
    const accessTokenEncrypted = encryptPassword(validated.accessToken);

    const [channel] = await db
      .insert(whatsappChannels)
      .values({
        eventId: validated.eventId,
        phoneNumberId: validated.phoneNumberId,
        whatsappBusinessAccountId: validated.whatsappBusinessAccountId,
        accessTokenEncrypted,
        verifyToken: validated.verifyToken,
        unknownGuestTemplateId: validated.unknownGuestTemplateId ?? null,
      })
      .returning();

    return channel;
  },

  /**
   * Retrieves the WhatsApp channel for a given event.
   *
   * @param eventId - The event ID to look up
   * @returns The channel record, or null if none exists
   *
   * Requirements: 1.1
   */
  async getByEventId(eventId: string): Promise<WhatsAppChannel | null> {
    const channel = await db.query.whatsappChannels.findFirst({
      where: eq(whatsappChannels.eventId, eventId),
    });

    return channel ?? null;
  },

  /**
   * Updates an existing WhatsApp channel.
   *
   * If the access token is being changed, it is re-encrypted.
   *
   * @param id - The channel ID to update
   * @param input - Partial channel configuration to update
   * @returns The updated channel record
   * @throws {Error} If the channel is not found
   *
   * Requirements: 1.1, 1.3
   */
  async update(
    id: string,
    input: UpdateWhatsAppChannelInput
  ): Promise<WhatsAppChannel> {
    const validated = updateWhatsAppChannelSchema.parse(input);

    const existing = await db.query.whatsappChannels.findFirst({
      where: eq(whatsappChannels.id, id),
    });

    if (!existing) {
      throw new Error(`WhatsApp channel with ID "${id}" not found`);
    }

    // Build the update payload
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (validated.phoneNumberId !== undefined) {
      updateData.phoneNumberId = validated.phoneNumberId;
    }
    if (validated.whatsappBusinessAccountId !== undefined) {
      updateData.whatsappBusinessAccountId = validated.whatsappBusinessAccountId;
    }
    if (validated.accessToken !== undefined) {
      // Re-encrypt the new access token (Req 1.3)
      updateData.accessTokenEncrypted = encryptPassword(validated.accessToken);
    }
    if (validated.verifyToken !== undefined) {
      updateData.verifyToken = validated.verifyToken;
    }
    if (validated.unknownGuestTemplateId !== undefined) {
      updateData.unknownGuestTemplateId = validated.unknownGuestTemplateId;
    }

    const [updated] = await db
      .update(whatsappChannels)
      .set(updateData)
      .where(eq(whatsappChannels.id, id))
      .returning();

    return updated;
  },

  /**
   * Deletes a WhatsApp channel and closes all active conversations for that event.
   *
   * @param id - The channel ID to delete
   * @throws {Error} If the channel is not found
   *
   * Requirements: 1.6
   */
  async delete(id: string): Promise<void> {
    const existing = await db.query.whatsappChannels.findFirst({
      where: eq(whatsappChannels.id, id),
    });

    if (!existing) {
      throw new Error(`WhatsApp channel with ID "${id}" not found`);
    }

    // Close active conversations for this event (Req 1.6)
    await db
      .update(whatsappConversations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(whatsappConversations.channelId, id),
          eq(whatsappConversations.isActive, true)
        )
      );

    // Delete the channel (cascades to conversations, messages, broadcasts via FK)
    await db
      .delete(whatsappChannels)
      .where(eq(whatsappChannels.id, id));
  },

  /**
   * Validates WhatsApp credentials by making a test API call to Meta's Cloud API.
   *
   * Makes a GET request to https://graph.facebook.com/v21.0/{phoneNumberId}
   * to verify the phone number ID and access token are valid.
   *
   * @param phoneNumberId - The WhatsApp phone number ID
   * @param accessToken - The plaintext access token
   * @returns Validation result with valid flag and optional error message
   *
   * Requirements: 1.2, 1.4
   */
  async validateCredentials(
    phoneNumberId: string,
    accessToken: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}?access_token=${accessToken}`
      );

      if (response.ok) {
        return { valid: true };
      }

      const errorBody = await response.json().catch(() => null);

      // Provide descriptive errors based on failure reason (Req 1.4)
      if (response.status === 401 || response.status === 403) {
        const message =
          errorBody?.error?.message || 'Invalid or expired access token';
        return { valid: false, error: message };
      }

      if (response.status === 400) {
        const message =
          errorBody?.error?.message || 'Invalid phone number ID';
        return { valid: false, error: message };
      }

      const message =
        errorBody?.error?.message ||
        `Unexpected API error (HTTP ${response.status})`;
      return { valid: false, error: message };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Network error during validation';
      return { valid: false, error: `Failed to connect to Meta API: ${message}` };
    }
  },

  /**
   * Decrypts and returns the access token for a channel.
   * Utility method for other services that need the plaintext token.
   *
   * @param channel - The channel record with encrypted token
   * @returns The decrypted access token
   *
   * Requirements: 1.3
   */
  decryptAccessToken(channel: WhatsAppChannel): string {
    return decryptPassword(channel.accessTokenEncrypted);
  },
};
