/**
 * @fileoverview WhatsApp Template Management API Routes
 *
 * Provides routes for managing WhatsApp message templates: listing,
 * creating, editing, deleting, syncing from Meta, and toggling favorites.
 *
 * Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 1.1
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@/db';
import { whatsappChannels } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  WhatsAppTemplateManagementService,
  type CreateTemplateInput,
  type EditTemplateInput,
} from '@/lib/services/whatsapp-template-management-service';
import { WhatsAppTemplateSyncService } from '@/lib/services/whatsapp-template-sync-service';
import { auth } from '@/lib/auth';
import type { Context, Next } from 'hono';
import { rateLimit } from '@/lib/middleware/rate-limit';

// ============================================================================
// RATE LIMITING
// ============================================================================

const writeLimiter = rateLimit({ max: 30, windowMs: 60_000, prefix: 'wa-tpl-write' });
const readLimiter = rateLimit({ max: 120, windowMs: 60_000, prefix: 'wa-tpl-read' });

// ============================================================================
// AUTH HELPERS
// ============================================================================

async function getSessionFromRequest(c: Context) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    return session;
  } catch {
    return null;
  }
}

async function requireAuth(c: Context, next: Next) {
  const session = await getSessionFromRequest(c);
  if (!session) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
  }
  c.req.raw.headers.set('x-user-id', session.user.id);
  await next();
}

function getUserIdFromRequest(c: Context): string {
  return c.req.raw.headers.get('x-user-id') || '';
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createTemplateSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z.string().min(1),
  components: z.array(
    z.object({
      type: z.enum(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']),
      format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
      text: z.string().optional(),
      buttons: z
        .array(
          z.object({
            type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
            text: z.string(),
            url: z.string().optional(),
            phone_number: z.string().optional(),
          }),
        )
        .optional(),
      example: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

const editTemplateSchema = z.object({
  components: z.array(
    z.object({
      type: z.enum(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']),
      format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
      text: z.string().optional(),
      buttons: z
        .array(
          z.object({
            type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
            text: z.string(),
            url: z.string().optional(),
            phone_number: z.string().optional(),
          }),
        )
        .optional(),
      example: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Resolves a channelId to the WABA ID by looking up the channel record.
 */
async function getWabaIdFromChannel(channelId: string): Promise<string | null> {
  const channel = await db.query.whatsappChannels.findFirst({
    where: eq(whatsappChannels.id, channelId),
  });
  return channel?.whatsappBusinessAccountId ?? null;
}

// ============================================================================
// WHATSAPP TEMPLATE ROUTES
// ============================================================================

/**
 * Creates the WhatsApp template management routes Hono app.
 * Mounted at /api/whatsapp-templates in the main app.
 */
export function createWhatsAppTemplateRoutes() {
  const tpl = new Hono();

  // --------------------------------------------------------------------------
  // FAVORITES ROUTES (defined first so /favorites doesn't clash with /:channelId)
  // --------------------------------------------------------------------------

  // GET /favorites — list user's favorite template IDs
  // Requirements: 4.1
  tpl.get('/favorites', requireAuth, readLimiter, async (c) => {
    try {
      const userId = getUserIdFromRequest(c);
      const favorites = await WhatsAppTemplateManagementService.getUserFavorites(userId);
      return c.json(favorites);
    } catch (error) {
      console.error('Error listing favorites:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list favorites' }, 500);
    }
  });

  // POST /favorites/:templateId — toggle favorite for the authenticated user
  // Requirements: 4.1, 4.2
  tpl.post('/favorites/:templateId', requireAuth, writeLimiter, async (c) => {
    try {
      const userId = getUserIdFromRequest(c);
      const templateId = c.req.param('templateId') as string;
      const result = await WhatsAppTemplateManagementService.toggleFavorite(userId, templateId);
      return c.json(result);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to toggle favorite' }, 500);
    }
  });

  // --------------------------------------------------------------------------
  // CHANNEL-SCOPED TEMPLATE ROUTES
  // --------------------------------------------------------------------------

  // GET /:channelId — list templates with search/filter query params
  // Requirements: 2.1, 4.2
  tpl.get('/:channelId', requireAuth, readLimiter, async (c) => {
    try {
      const channelId = c.req.param('channelId') as string;
      const userId = getUserIdFromRequest(c);

      const wabaId = await getWabaIdFromChannel(channelId);
      if (!wabaId) {
        return c.json({ code: 'NOT_FOUND', message: 'WhatsApp channel not found' }, 404);
      }

      const search = c.req.query('search') || undefined;
      const category = c.req.query('category') || undefined;
      const status = c.req.query('status') || undefined;

      const templates = await WhatsAppTemplateManagementService.listTemplates(wabaId, {
        search,
        category,
        status,
        userId,
      });

      return c.json(templates);
    } catch (error) {
      console.error('Error listing templates:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list templates' }, 500);
    }
  });

  // POST /:channelId/sync — trigger manual sync for a channel
  // Requirements: 1.1
  tpl.post('/:channelId/sync', requireAuth, writeLimiter, async (c) => {
    try {
      const channelId = c.req.param('channelId') as string;
      const result = await WhatsAppTemplateSyncService.syncTemplatesForChannel(channelId);
      return c.json(result);
    } catch (error) {
      console.error('Error syncing templates:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to sync templates' }, 500);
    }
  });

  // GET /:channelId/:templateId — get a single template
  // Requirements: 2.1
  tpl.get('/:channelId/:templateId', requireAuth, readLimiter, async (c) => {
    try {
      const templateId = c.req.param('templateId') as string;
      const template = await WhatsAppTemplateManagementService.getTemplate(templateId);

      if (!template) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }

      return c.json(template);
    } catch (error) {
      console.error('Error getting template:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get template' }, 500);
    }
  });

  // POST /:channelId — create a new template
  // Requirements: 2.1
  tpl.post('/:channelId', requireAuth, writeLimiter, zValidator('json', createTemplateSchema), async (c) => {
    try {
      const channelId = c.req.param('channelId') as string;
      const input: CreateTemplateInput = c.req.valid('json');
      const template = await WhatsAppTemplateManagementService.createTemplate(channelId, input);
      return c.json(template, 201);
    } catch (error) {
      console.error('Error creating template:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
        }
        // Meta API validation errors are surfaced directly (Req 2.4)
        return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create template' }, 500);
    }
  });

  // PUT /:channelId/:templateId — edit an existing template
  // Requirements: 2.2
  tpl.put('/:channelId/:templateId', requireAuth, writeLimiter, zValidator('json', editTemplateSchema), async (c) => {
    try {
      const channelId = c.req.param('channelId') as string;
      const templateId = c.req.param('templateId') as string;
      const input: EditTemplateInput = c.req.valid('json');
      const template = await WhatsAppTemplateManagementService.editTemplate(channelId, templateId, input);
      return c.json(template);
    } catch (error) {
      console.error('Error editing template:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
        }
        // Meta API validation errors are surfaced directly (Req 2.4)
        return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to edit template' }, 500);
    }
  });

  // DELETE /:channelId/:templateId — delete a template (soft-delete locally)
  // Requirements: 2.3
  tpl.delete('/:channelId/:templateId', requireAuth, writeLimiter, async (c) => {
    try {
      const channelId = c.req.param('channelId') as string;
      const templateId = c.req.param('templateId') as string;

      // Look up the template to get its name (Meta API deletes by name)
      const template = await WhatsAppTemplateManagementService.getTemplate(templateId);
      if (!template) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }

      await WhatsAppTemplateManagementService.deleteTemplate(channelId, template.name);
      return c.json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
      console.error('Error deleting template:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
        }
        return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete template' }, 500);
    }
  });

  return tpl;
}
