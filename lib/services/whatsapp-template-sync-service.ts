/**
 * @fileoverview WhatsApp Template Sync Service
 *
 * Fetches WhatsApp message templates from the Meta Business Management API
 * and upserts them into the local `whatsapp_templates` cache table.
 * Templates absent from the API response are soft-deleted locally.
 *
 * @module lib/services/whatsapp-template-sync-service
 * @requires drizzle-orm - Database ORM
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6
 */

import { db } from '@/db';
import {
  whatsappChannels,
  whatsappTemplates,
  type WhatsAppChannel,
} from '@/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';
import { WhatsAppChannelService } from './whatsapp-channel-service';

// ============================================================================
// CONSTANTS
// ============================================================================

const META_GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

// ============================================================================
// TYPES
// ============================================================================

/** A single template object from the Meta API response. */
interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown[];
}

/** The paginated response shape from GET /{waba_id}/message_templates. */
interface MetaTemplatesResponse {
  data: MetaTemplate[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export const WhatsAppTemplateSyncService = {
  /**
   * Sync all templates for a given WhatsApp channel.
   *
   * Fetches every page of templates from the Meta API, upserts each one
   * into the local cache, and soft-deletes any local templates that are
   * no longer present in the API response.
   *
   * On API error the existing local state is preserved unchanged.
   *
   * @param channelId - The local whatsapp_channels record ID
   * @returns Count of synced templates and errors
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6
   */
  async syncTemplatesForChannel(
    channelId: string,
  ): Promise<{ synced: number; errors: number }> {
    // Look up the channel to get WABA ID and encrypted token
    const channel = await db.query.whatsappChannels.findFirst({
      where: eq(whatsappChannels.id, channelId),
    });

    if (!channel) {
      throw new Error(`WhatsApp channel "${channelId}" not found`);
    }

    const accessToken = WhatsAppChannelService.decryptAccessToken(channel);
    const wabaId = channel.whatsappBusinessAccountId;

    // Fetch all templates from Meta API (handles pagination)
    let allTemplates: MetaTemplate[];
    try {
      allTemplates = await fetchAllTemplates(wabaId, accessToken);
    } catch (error) {
      // Req 1.6: On API error, log and preserve existing local state
      console.error(
        `[TemplateSyncService] Failed to fetch templates for channel ${channelId} (WABA ${wabaId}):`,
        error instanceof Error ? error.message : error,
      );
      return { synced: 0, errors: 1 };
    }

    const now = new Date();
    let synced = 0;
    let errors = 0;

    // Upsert each template (Req 1.2, 1.4)
    const syncedMetaIds: string[] = [];

    for (const tpl of allTemplates) {
      try {
        await db
          .insert(whatsappTemplates)
          .values({
            wabaId,
            metaTemplateId: tpl.id,
            name: tpl.name,
            language: tpl.language,
            category: tpl.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
            status: tpl.status as 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED',
            components: tpl.components,
            isDeleted: false,
            lastSyncedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [whatsappTemplates.wabaId, whatsappTemplates.metaTemplateId],
            set: {
              name: tpl.name,
              language: tpl.language,
              category: tpl.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
              status: tpl.status as 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED',
              components: tpl.components,
              isDeleted: false,
              lastSyncedAt: now,
              updatedAt: now,
            },
          });

        syncedMetaIds.push(tpl.id);
        synced++;
      } catch (err) {
        console.error(
          `[TemplateSyncService] Error upserting template ${tpl.id} (${tpl.name}):`,
          err instanceof Error ? err.message : err,
        );
        errors++;
      }
    }

    // Soft-delete templates that are no longer in the API response (Req 1.3)
    if (syncedMetaIds.length > 0) {
      await db
        .update(whatsappTemplates)
        .set({ isDeleted: true, updatedAt: now })
        .where(
          and(
            eq(whatsappTemplates.wabaId, wabaId),
            eq(whatsappTemplates.isDeleted, false),
            notInArray(whatsappTemplates.metaTemplateId, syncedMetaIds),
          ),
        );
    } else if (allTemplates.length === 0) {
      // API returned zero templates — soft-delete all local templates for this WABA
      await db
        .update(whatsappTemplates)
        .set({ isDeleted: true, updatedAt: now })
        .where(
          and(
            eq(whatsappTemplates.wabaId, wabaId),
            eq(whatsappTemplates.isDeleted, false),
          ),
        );
    }

    return { synced, errors };
  },

  /**
   * Sync templates for every active WhatsApp channel.
   *
   * Iterates all channels with `isActive = true` and calls
   * `syncTemplatesForChannel` for each. Errors on individual channels
   * are logged but do not stop the overall sync.
   *
   * Requirements: 1.1
   */
  async syncAllChannels(): Promise<void> {
    const channels = await db.query.whatsappChannels.findMany({
      where: eq(whatsappChannels.isActive, true),
    });

    for (const channel of channels) {
      try {
        const result = await WhatsAppTemplateSyncService.syncTemplatesForChannel(channel.id);
        console.log(
          `[TemplateSyncService] Synced channel ${channel.id}: ${result.synced} templates, ${result.errors} errors`,
        );
      } catch (error) {
        console.error(
          `[TemplateSyncService] Failed to sync channel ${channel.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  },
};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Fetches all templates for a WABA, following pagination cursors.
 *
 * @param wabaId - The WhatsApp Business Account ID
 * @param accessToken - Decrypted access token
 * @returns Array of all templates across all pages
 */
async function fetchAllTemplates(
  wabaId: string,
  accessToken: string,
): Promise<MetaTemplate[]> {
  const allTemplates: MetaTemplate[] = [];
  let url: string | null =
    `${META_GRAPH_API_BASE}/${wabaId}/message_templates?access_token=${accessToken}`;

  while (url) {
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        body?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Meta API error: ${message}`);
    }

    const data: MetaTemplatesResponse = await response.json();
    allTemplates.push(...data.data);

    // Follow pagination cursor (Req 1.1 — handle pagination via paging.next)
    url = data.paging?.next ?? null;
  }

  return allTemplates;
}
