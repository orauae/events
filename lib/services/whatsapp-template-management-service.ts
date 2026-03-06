/**
 * @fileoverview WhatsApp Template Management Service
 *
 * Handles CRUD operations for WhatsApp message templates via the Meta
 * Business Management API (Graph API v21.0) and the local cache table.
 *
 * - Create / Edit / Delete proxy through Meta then update local state
 * - Get / List read from the local cache with optional filters & favorites ordering
 * - On Meta API error the local state is never modified
 *
 * @module lib/services/whatsapp-template-management-service
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { db } from '@/db';
import {
  whatsappChannels,
  whatsappTemplates,
  whatsappTemplateFavorites,
  type WhatsAppTemplate,
} from '@/db/schema';
import { eq, and, ilike, asc } from 'drizzle-orm';
import { WhatsAppChannelService } from './whatsapp-channel-service';

// ============================================================================
// CONSTANTS
// ============================================================================

const META_GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateTemplateInput {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: TemplateComponent[];
}

export interface EditTemplateInput {
  components: TemplateComponent[];
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: TemplateButton[];
  example?: Record<string, unknown>;
}

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

export interface TemplateFilters {
  search?: string;
  category?: string;
  status?: string;
  userId?: string;
}

/** Shape returned by the Meta API on successful template creation. */
interface MetaCreateTemplateResponse {
  id: string;
  status: string;
  category: string;
}

/** Shape of a Meta API error response. */
interface MetaErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export const WhatsAppTemplateManagementService = {
  /**
   * Create a new template on Meta and cache locally with PENDING status.
   *
   * POST /{waba_id}/message_templates
   *
   * On Meta API error the local state is not modified and the error
   * message is thrown so the caller can surface it.
   *
   * @param channelId - Local whatsapp_channels record ID
   * @param input     - Template creation payload
   * @returns The newly inserted local template record
   *
   * Requirements: 2.1, 2.4, 2.5
   */
  async createTemplate(
    channelId: string,
    input: CreateTemplateInput,
  ): Promise<WhatsAppTemplate> {
    const { channel, accessToken } = await resolveChannel(channelId);
    const wabaId = channel.whatsappBusinessAccountId;

    // POST to Meta API
    const response = await fetch(
      `${META_GRAPH_API_BASE}/${wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: input.name,
          category: input.category,
          language: input.language,
          components: input.components,
        }),
      },
    );

    if (!response.ok) {
      const body: MetaErrorResponse = await response.json().catch(() => ({}));
      const message =
        body?.error?.message ?? `Meta API error (HTTP ${response.status})`;
      throw new Error(message);
    }

    const metaResult: MetaCreateTemplateResponse = await response.json();

    // Insert local record with PENDING status (Req 2.1, 2.5)
    const now = new Date();
    const [record] = await db
      .insert(whatsappTemplates)
      .values({
        wabaId,
        metaTemplateId: metaResult.id,
        name: input.name,
        language: input.language,
        category: input.category,
        status: 'PENDING',
        components: input.components,
        isDeleted: false,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .returning();

    return record;
  },

  /**
   * Edit an existing template on Meta and reset local status to PENDING.
   *
   * POST /{template_id}
   *
   * On Meta API error the local state is not modified.
   *
   * @param channelId  - Local whatsapp_channels record ID
   * @param templateId - Local whatsapp_templates record ID
   * @param input      - Updated components
   * @returns The updated local template record
   *
   * Requirements: 2.2, 2.4
   */
  async editTemplate(
    channelId: string,
    templateId: string,
    input: EditTemplateInput,
  ): Promise<WhatsAppTemplate> {
    const { accessToken } = await resolveChannel(channelId);

    // Look up the local template to get the Meta template ID
    const existing = await db.query.whatsappTemplates.findFirst({
      where: eq(whatsappTemplates.id, templateId),
    });

    if (!existing) {
      throw new Error(`Template "${templateId}" not found`);
    }

    // POST to Meta API
    const response = await fetch(
      `${META_GRAPH_API_BASE}/${existing.metaTemplateId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          components: input.components,
        }),
      },
    );

    if (!response.ok) {
      const body: MetaErrorResponse = await response.json().catch(() => ({}));
      const message =
        body?.error?.message ?? `Meta API error (HTTP ${response.status})`;
      throw new Error(message);
    }

    // Update local record — status resets to PENDING (Req 2.2)
    const now = new Date();
    const [updated] = await db
      .update(whatsappTemplates)
      .set({
        components: input.components,
        status: 'PENDING',
        updatedAt: now,
      })
      .where(eq(whatsappTemplates.id, templateId))
      .returning();

    return updated;
  },

  /**
   * Delete a template from Meta and soft-delete locally.
   *
   * DELETE /{waba_id}/message_templates?name={name}
   *
   * On Meta API error the local state is not modified.
   *
   * @param channelId    - Local whatsapp_channels record ID
   * @param templateName - The template name (Meta uses name for deletion)
   *
   * Requirements: 2.3, 2.4
   */
  async deleteTemplate(
    channelId: string,
    templateName: string,
  ): Promise<void> {
    const { channel, accessToken } = await resolveChannel(channelId);
    const wabaId = channel.whatsappBusinessAccountId;

    // DELETE from Meta API
    const response = await fetch(
      `${META_GRAPH_API_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const body: MetaErrorResponse = await response.json().catch(() => ({}));
      const message =
        body?.error?.message ?? `Meta API error (HTTP ${response.status})`;
      throw new Error(message);
    }

    // Soft-delete local records matching this WABA + name (Req 2.3)
    const now = new Date();
    await db
      .update(whatsappTemplates)
      .set({ isDeleted: true, updatedAt: now })
      .where(
        and(
          eq(whatsappTemplates.wabaId, wabaId),
          eq(whatsappTemplates.name, templateName),
        ),
      );
  },

  /**
   * Fetch a single template by its local ID.
   *
   * @param templateId - Local whatsapp_templates record ID
   * @returns The template record, or null if not found
   *
   * Requirements: 2.1
   */
  async getTemplate(templateId: string): Promise<WhatsAppTemplate | null> {
    const template = await db.query.whatsappTemplates.findFirst({
      where: eq(whatsappTemplates.id, templateId),
    });

    return template ?? null;
  },

  /**
   * Toggle a template as favorite for a user.
   *
   * If the (userId, templateId) pair exists, it is removed (unfavorite).
   * If it does not exist, it is inserted (favorite).
   *
   * @param userId     - The user toggling the favorite
   * @param templateId - The template to favorite/unfavorite
   * @returns `{ favorited: boolean }` indicating the new state
   *
   * Requirements: 4.1, 4.2
   */
  async toggleFavorite(
    userId: string,
    templateId: string,
  ): Promise<{ favorited: boolean }> {
    const existing = await db.query.whatsappTemplateFavorites.findFirst({
      where: and(
        eq(whatsappTemplateFavorites.userId, userId),
        eq(whatsappTemplateFavorites.templateId, templateId),
      ),
    });

    if (existing) {
      // Unfavorite — remove the association (Req 4.2)
      await db
        .delete(whatsappTemplateFavorites)
        .where(eq(whatsappTemplateFavorites.id, existing.id));
      return { favorited: false };
    }

    // Favorite — insert the association (Req 4.1)
    await db.insert(whatsappTemplateFavorites).values({
      userId,
      templateId,
    });
    return { favorited: true };
  },

  /**
   * Get all favorite template IDs for a user.
   *
   * @param userId - The user whose favorites to retrieve
   * @returns Array of template IDs that the user has favorited
   *
   * Requirements: 4.1
   */
  async getUserFavorites(userId: string): Promise<string[]> {
    const favorites = await db
      .select({ templateId: whatsappTemplateFavorites.templateId })
      .from(whatsappTemplateFavorites)
      .where(eq(whatsappTemplateFavorites.userId, userId));

    return favorites.map((f) => f.templateId);
  },

  /**
   * List templates for a WABA with optional search, category, status
   * filters and favorites-first ordering.
   *
   * - `search`   — case-insensitive substring match on template name
   * - `category` — exact match on category column
   * - `status`   — exact match on status column
   * - `userId`   — when provided, favorited templates are returned first
   *
   * Non-deleted templates only.
   *
   * @param wabaId  - WhatsApp Business Account ID
   * @param filters - Optional filter criteria
   * @returns Matching template records, favorites first then alphabetical
   *
   * Requirements: 2.1, 4.3
   */
  async listTemplates(
    wabaId: string,
    filters?: TemplateFilters,
  ): Promise<WhatsAppTemplate[]> {
    // Build WHERE conditions
    const conditions = [
      eq(whatsappTemplates.wabaId, wabaId),
      eq(whatsappTemplates.isDeleted, false),
    ];

    if (filters?.search) {
      conditions.push(ilike(whatsappTemplates.name, `%${filters.search}%`));
    }

    if (filters?.category) {
      conditions.push(eq(whatsappTemplates.category, filters.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'));
    }

    if (filters?.status) {
      conditions.push(eq(whatsappTemplates.status, filters.status as 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED'));
    }

    // When userId is provided, order favorites first (Req 4.3)
    if (filters?.userId) {
      // Get the user's favorite template IDs
      const favorites = await db
        .select({ templateId: whatsappTemplateFavorites.templateId })
        .from(whatsappTemplateFavorites)
        .where(eq(whatsappTemplateFavorites.userId, filters.userId));

      const favoriteIds = favorites.map((f) => f.templateId);

      // Query all matching templates
      const templates = await db
        .select()
        .from(whatsappTemplates)
        .where(and(...conditions))
        .orderBy(asc(whatsappTemplates.name));

      // Sort: favorites first (alphabetical), then non-favorites (alphabetical)
      const favoriteSet = new Set(favoriteIds);
      const favs = templates.filter((t) => favoriteSet.has(t.id));
      const nonFavs = templates.filter((t) => !favoriteSet.has(t.id));

      return [...favs, ...nonFavs];
    }

    // No userId — simple query with alphabetical ordering
    const templates = await db
      .select()
      .from(whatsappTemplates)
      .where(and(...conditions))
      .orderBy(asc(whatsappTemplates.name));

    return templates;
  },
};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Resolves a channel ID to the channel record and decrypted access token.
 *
 * @param channelId - Local whatsapp_channels record ID
 * @returns The channel record and plaintext access token
 * @throws If the channel is not found
 */
async function resolveChannel(channelId: string): Promise<{
  channel: typeof whatsappChannels.$inferSelect;
  accessToken: string;
}> {
  const channel = await db.query.whatsappChannels.findFirst({
    where: eq(whatsappChannels.id, channelId),
  });

  if (!channel) {
    throw new Error(`WhatsApp channel "${channelId}" not found`);
  }

  const accessToken = WhatsAppChannelService.decryptAccessToken(channel);
  return { channel, accessToken };
}
