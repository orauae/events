/**
 * @fileoverview WhatsApp Management API Routes
 *
 * Provides routes under /api/events/:id/whatsapp/ for managing WhatsApp channels,
 * conversations, broadcasts, agenda items, knowledge base entries, and token queues.
 *
 * Requirements: 10.2, 10.3, 10.4, 10.6
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@/db';
import {
  whatsappMessages,
  whatsappConversations,
  eventGuests,
  kbCategoryEnum,
} from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { WhatsAppChannelService, createWhatsAppChannelSchema, updateWhatsAppChannelSchema } from '@/lib/services/whatsapp-channel-service';
import { ConversationService } from '@/lib/services/conversation-service';
import { WhatsAppMessageService, whatsAppMessageContentSchema } from '@/lib/services/whatsapp-message-service';
import { BroadcastService } from '@/lib/services/broadcast-service';
import { AgendaService } from '@/lib/services/agenda-service';
import { KnowledgeBaseService } from '@/lib/services/knowledge-base-service';
import { TokenQueueService } from '@/lib/services/token-queue-service';
import { AuthorizationService } from '@/lib/services';
import { auth } from '@/lib/auth';
import type { Context, Next } from 'hono';
import { rateLimit } from '@/lib/middleware/rate-limit';

// ============================================================================
// RATE LIMITING
// ============================================================================

const writeLimiter = rateLimit({ max: 30, windowMs: 60_000, prefix: 'wa-write' });
const readLimiter = rateLimit({ max: 120, windowMs: 60_000, prefix: 'wa-read' });

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

const broadcastCreateSchema = z.object({
  content: whatsAppMessageContentSchema,
  filter: z.object({
    tagIds: z.array(z.string()).optional(),
    tiers: z.array(z.enum(['Regular', 'VIP', 'VVIP'])).optional(),
    rsvpStatuses: z.array(z.string()).optional(),
    checkInStatuses: z.array(z.string()).optional(),
  }).optional(),
  survey: z.array(z.object({
    index: z.number().int().min(0),
    text: z.string().min(1),
    type: z.enum(['free_text', 'single_choice', 'multiple_choice']),
    options: z.array(z.string()).optional(),
  })).optional(),
});

const agendaCreateSchema = z.object({
  title: z.string().min(1),
  startTime: z.string().transform((s) => new Date(s)),
  endTime: z.string().transform((s) => new Date(s)),
  speakerName: z.string().optional(),
  description: z.string().optional(),
  hallLocation: z.string().optional(),
  slideBulletPoints: z.array(z.string()).optional(),
});

const agendaUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  startTime: z.string().transform((s) => new Date(s)).optional(),
  endTime: z.string().transform((s) => new Date(s)).optional(),
  speakerName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  hallLocation: z.string().nullable().optional(),
  slideBulletPoints: z.array(z.string()).nullable().optional(),
});

const kbCreateSchema = z.object({
  category: z.enum(kbCategoryEnum.enumValues),
  question: z.string().min(1),
  answer: z.string().min(1),
});

const kbUpdateSchema = z.object({
  category: z.enum(kbCategoryEnum.enumValues).optional(),
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
});

const humanMessageSchema = z.object({
  content: whatsAppMessageContentSchema,
});

const escalateSchema = z.object({
  reason: z.string().min(1, 'Escalation reason is required'),
});

// ============================================================================
// WHATSAPP ROUTES
// ============================================================================

/**
 * Creates the WhatsApp management routes Hono app.
 * These routes are mounted at /events/:id/whatsapp in the main app.
 */
export function createWhatsAppRoutes() {
  const wa = new Hono();

  // ============================================================================
  // CHANNEL ROUTES
  // ============================================================================

  // POST /whatsapp/channel - Create WhatsApp channel for event
  wa.post('/channel', requireAuth, writeLimiter, zValidator('json', createWhatsAppChannelSchema.omit({ eventId: true })), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      if (!eventId) {
        return c.json({ code: 'BAD_REQUEST', message: 'Event ID is required' }, 400);
      }
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const channel = await WhatsAppChannelService.create({ ...input, eventId });
      return c.json(channel, 201);
    } catch (error) {
      console.error('Error creating WhatsApp channel:', error);
      if (error instanceof Error) {
        if (error.message.includes('already has a WhatsApp channel')) {
          return c.json({ code: 'DUPLICATE_ENTRY', message: error.message }, 409);
        }
        if (error.message.includes('credential validation failed')) {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create WhatsApp channel' }, 500);
    }
  });

  // GET /whatsapp/channel - Get WhatsApp channel for event
  wa.get('/channel', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);

      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }

      const channel = await WhatsAppChannelService.getByEventId(eventId);
      if (!channel) {
        return c.json({ code: 'NOT_FOUND', message: 'No WhatsApp channel configured for this event' }, 404);
      }

      return c.json(channel);
    } catch (error) {
      console.error('Error getting WhatsApp channel:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get WhatsApp channel' }, 500);
    }
  });

  // PUT /whatsapp/channel - Update WhatsApp channel
  wa.put('/channel', requireAuth, writeLimiter, zValidator('json', updateWhatsAppChannelSchema), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const channel = await WhatsAppChannelService.getByEventId(eventId);
      if (!channel) {
        return c.json({ code: 'NOT_FOUND', message: 'No WhatsApp channel configured for this event' }, 404);
      }

      const updated = await WhatsAppChannelService.update(channel.id, input);
      return c.json(updated);
    } catch (error) {
      console.error('Error updating WhatsApp channel:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update WhatsApp channel' }, 500);
    }
  });

  // DELETE /whatsapp/channel - Delete WhatsApp channel
  wa.delete('/channel', requireAuth, writeLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const channel = await WhatsAppChannelService.getByEventId(eventId);
      if (!channel) {
        return c.json({ code: 'NOT_FOUND', message: 'No WhatsApp channel configured for this event' }, 404);
      }

      await WhatsAppChannelService.delete(channel.id);
      return c.json({ success: true, message: 'WhatsApp channel deleted successfully' });
    } catch (error) {
      console.error('Error deleting WhatsApp channel:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete WhatsApp channel' }, 500);
    }
  });

  // ============================================================================
  // CONVERSATION ROUTES
  // ============================================================================

  // GET /whatsapp/conversations - List conversations with last message preview, tier badge, escalation status
  // Requirements: 10.2
  wa.get('/conversations', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);

      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }

      // Get all active conversations for this event with related data
      const conversations = await db.query.whatsappConversations.findMany({
        where: and(
          eq(whatsappConversations.eventId, eventId),
          eq(whatsappConversations.isActive, true),
        ),
        with: {
          eventGuest: {
            with: {
              guest: true,
            },
          },
        },
        orderBy: [desc(whatsappConversations.updatedAt)],
      });

      // For each conversation, get the last message
      const conversationsWithPreview = await Promise.all(
        conversations.map(async (conv) => {
          const [lastMessage] = await db
            .select()
            .from(whatsappMessages)
            .where(eq(whatsappMessages.conversationId, conv.id))
            .orderBy(desc(whatsappMessages.createdAt))
            .limit(1);

          const guest = conv.eventGuest?.guest;
          return {
            id: conv.id,
            guestName: guest ? `${guest.firstName} ${guest.lastName}` : 'Unknown Guest',
            guestPhoneNumber: conv.guestPhoneNumber,
            tier: conv.eventGuest?.tier ?? 'Regular',
            escalationStatus: conv.escalationStatus,
            isActive: conv.isActive,
            lastMessage: lastMessage ? {
              id: lastMessage.id,
              direction: lastMessage.direction,
              type: lastMessage.type,
              content: lastMessage.content,
              createdAt: lastMessage.createdAt,
              aiGenerated: lastMessage.aiGenerated,
            } : null,
            state: conv.state,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
          };
        })
      );

      return c.json(conversationsWithPreview);
    } catch (error) {
      console.error('Error listing conversations:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list conversations' }, 500);
    }
  });

  // GET /whatsapp/conversations/:conversationId - Get conversation detail with messages
  wa.get('/conversations/:conversationId', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const conversationId = c.req.param('conversationId') as string;
      const userId = getUserIdFromRequest(c);

      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }

      const conversation = await ConversationService.getById(conversationId);
      if (!conversation || conversation.eventId !== eventId) {
        return c.json({ code: 'NOT_FOUND', message: 'Conversation not found' }, 404);
      }

      // Get guest info
      const eventGuest = await db.query.eventGuests.findFirst({
        where: eq(eventGuests.id, conversation.eventGuestId),
        with: { guest: true },
      });

      // Get messages for this conversation
      const messages = await db
        .select()
        .from(whatsappMessages)
        .where(eq(whatsappMessages.conversationId, conversationId))
        .orderBy(desc(whatsappMessages.createdAt));

      return c.json({
        ...conversation,
        guestName: eventGuest?.guest ? `${eventGuest.guest.firstName} ${eventGuest.guest.lastName}` : 'Unknown Guest',
        tier: eventGuest?.tier ?? 'Regular',
        messages,
      });
    } catch (error) {
      console.error('Error getting conversation:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get conversation' }, 500);
    }
  });

  // POST /whatsapp/conversations/:conversationId/escalate - Escalate to human
  // Requirements: 10.3
  wa.post('/conversations/:conversationId/escalate', requireAuth, writeLimiter, zValidator('json', escalateSchema), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const conversationId = c.req.param('conversationId') as string;
      const userId = getUserIdFromRequest(c);
      const { reason } = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const conversation = await ConversationService.getById(conversationId);
      if (!conversation || conversation.eventId !== eventId) {
        return c.json({ code: 'NOT_FOUND', message: 'Conversation not found' }, 404);
      }

      await ConversationService.escalateToHuman(conversationId, reason);
      return c.json({ success: true, message: 'Conversation escalated to human management' });
    } catch (error) {
      console.error('Error escalating conversation:', error);
      if (error instanceof Error && error.message.includes('already escalated')) {
        return c.json({ code: 'CONFLICT', message: error.message }, 409);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to escalate conversation' }, 500);
    }
  });

  // POST /whatsapp/conversations/:conversationId/release - Release from human
  // Requirements: 10.4
  wa.post('/conversations/:conversationId/release', requireAuth, writeLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const conversationId = c.req.param('conversationId') as string;
      const userId = getUserIdFromRequest(c);

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const conversation = await ConversationService.getById(conversationId);
      if (!conversation || conversation.eventId !== eventId) {
        return c.json({ code: 'NOT_FOUND', message: 'Conversation not found' }, 404);
      }

      await ConversationService.releaseFromHuman(conversationId);
      return c.json({ success: true, message: 'Conversation released back to AI management' });
    } catch (error) {
      console.error('Error releasing conversation:', error);
      if (error instanceof Error && error.message.includes('not currently escalated')) {
        return c.json({ code: 'CONFLICT', message: error.message }, 409);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to release conversation' }, 500);
    }
  });

  // POST /whatsapp/conversations/:conversationId/message - Send human message in escalated conversation
  // Requirements: 10.6
  wa.post('/conversations/:conversationId/message', requireAuth, writeLimiter, zValidator('json', humanMessageSchema), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const conversationId = c.req.param('conversationId') as string;
      const userId = getUserIdFromRequest(c);
      const { content } = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const conversation = await ConversationService.getById(conversationId);
      if (!conversation || conversation.eventId !== eventId) {
        return c.json({ code: 'NOT_FOUND', message: 'Conversation not found' }, 404);
      }

      // Only allow sending messages in escalated conversations
      if (conversation.escalationStatus !== 'human_managed') {
        return c.json({
          code: 'FORBIDDEN',
          message: 'Can only send messages in escalated (human-managed) conversations',
        }, 403);
      }

      // Send the message via WhatsApp API
      const { messageId } = await WhatsAppMessageService.sendMessage(
        conversation.channelId,
        conversation.guestPhoneNumber,
        content,
      );

      // Store the outbound message (not AI-generated)
      const storedMessage = await WhatsAppMessageService.storeOutboundMessage(
        conversation.channelId,
        conversationId,
        content,
        false, // not AI-generated
      );

      return c.json({ success: true, messageId, message: storedMessage }, 201);
    } catch (error) {
      console.error('Error sending human message:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to send message' }, 500);
    }
  });

  // ============================================================================
  // BROADCAST ROUTES
  // ============================================================================

  // POST /whatsapp/broadcasts - Create broadcast
  wa.post('/broadcasts', requireAuth, writeLimiter, zValidator('json', broadcastCreateSchema), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);
      const { content, filter, survey } = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const broadcast = await BroadcastService.create(eventId, content, filter, survey);
      return c.json(broadcast, 201);
    } catch (error) {
      console.error('Error creating broadcast:', error);
      if (error instanceof Error) {
        if (error.message.includes('more than')) {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
        if (error.message.includes('No active WhatsApp channel')) {
          return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create broadcast' }, 500);
    }
  });

  // POST /whatsapp/broadcasts/:broadcastId/send - Send broadcast
  wa.post('/broadcasts/:broadcastId/send', requireAuth, writeLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const broadcastId = c.req.param('broadcastId') as string;
      const userId = getUserIdFromRequest(c);

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const result = await BroadcastService.send(broadcastId);
      return c.json(result);
    } catch (error) {
      console.error('Error sending broadcast:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to send broadcast' }, 500);
    }
  });

  // GET /whatsapp/broadcasts/:broadcastId/metrics - Get broadcast metrics
  wa.get('/broadcasts/:broadcastId/metrics', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const broadcastId = c.req.param('broadcastId') as string;
      const userId = getUserIdFromRequest(c);

      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }

      const metrics = await BroadcastService.getBroadcastMetrics(broadcastId);
      return c.json(metrics);
    } catch (error) {
      console.error('Error getting broadcast metrics:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get broadcast metrics' }, 500);
    }
  });

  // ============================================================================
  // AGENDA ROUTES
  // ============================================================================

  // POST /whatsapp/agenda - Create agenda item
  wa.post('/agenda', requireAuth, writeLimiter, zValidator('json', agendaCreateSchema), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const agendaItem = await AgendaService.create({ ...input, eventId });
      return c.json(agendaItem, 201);
    } catch (error) {
      console.error('Error creating agenda item:', error);
      if (error instanceof Error && error.message.includes('must not be equal')) {
        return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create agenda item' }, 500);
    }
  });

  // GET /whatsapp/agenda - List agenda items
  wa.get('/agenda', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);

      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }

      const items = await AgendaService.getByEventId(eventId);
      return c.json(items);
    } catch (error) {
      console.error('Error listing agenda items:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list agenda items' }, 500);
    }
  });

  // PUT /whatsapp/agenda/:agendaId - Update agenda item
  wa.put('/agenda/:agendaId', requireAuth, writeLimiter, zValidator('json', agendaUpdateSchema), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const agendaId = c.req.param('agendaId') as string;
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const updated = await AgendaService.update(agendaId, input as Parameters<typeof AgendaService.update>[1]);
      return c.json(updated);
    } catch (error) {
      console.error('Error updating agenda item:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
        }
        if (error.message.includes('must not be equal')) {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update agenda item' }, 500);
    }
  });

  // DELETE /whatsapp/agenda/:agendaId - Delete agenda item
  wa.delete('/agenda/:agendaId', requireAuth, writeLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const agendaId = c.req.param('agendaId') as string;
      const userId = getUserIdFromRequest(c);

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      await AgendaService.delete(agendaId);
      return c.json({ success: true, message: 'Agenda item deleted successfully' });
    } catch (error) {
      console.error('Error deleting agenda item:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete agenda item' }, 500);
    }
  });

  // ============================================================================
  // KNOWLEDGE BASE ROUTES
  // ============================================================================

  // POST /whatsapp/knowledge-base - Create KB entry
  wa.post('/knowledge-base', requireAuth, writeLimiter, zValidator('json', kbCreateSchema), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const entry = await KnowledgeBaseService.create({ ...input, eventId });
      return c.json(entry, 201);
    } catch (error) {
      console.error('Error creating knowledge base entry:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create knowledge base entry' }, 500);
    }
  });

  // GET /whatsapp/knowledge-base - List KB entries
  wa.get('/knowledge-base', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);

      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }

      // Support optional category filter via query param
      const category = c.req.query('category');
      let entries;
      if (category && kbCategoryEnum.enumValues.includes(category as any)) {
        entries = await KnowledgeBaseService.getByCategory(eventId, category as any);
      } else {
        entries = await KnowledgeBaseService.getByEventId(eventId);
      }

      return c.json(entries);
    } catch (error) {
      console.error('Error listing knowledge base entries:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list knowledge base entries' }, 500);
    }
  });

  // PUT /whatsapp/knowledge-base/:entryId - Update KB entry
  wa.put('/knowledge-base/:entryId', requireAuth, writeLimiter, zValidator('json', kbUpdateSchema), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const entryId = c.req.param('entryId') as string;
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const updated = await KnowledgeBaseService.update(entryId, input);
      return c.json(updated);
    } catch (error) {
      console.error('Error updating knowledge base entry:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update knowledge base entry' }, 500);
    }
  });

  // DELETE /whatsapp/knowledge-base/:entryId - Delete KB entry
  wa.delete('/knowledge-base/:entryId', requireAuth, writeLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const entryId = c.req.param('entryId') as string;
      const userId = getUserIdFromRequest(c);

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      await KnowledgeBaseService.delete(entryId);
      return c.json({ success: true, message: 'Knowledge base entry deleted successfully' });
    } catch (error) {
      console.error('Error deleting knowledge base entry:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete knowledge base entry' }, 500);
    }
  });

  // ============================================================================
  // TOKEN QUEUE ROUTES
  // ============================================================================

  // GET /whatsapp/queue/:boothName/status - Get queue status
  wa.get('/queue/:boothName/status', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const boothName = c.req.param('boothName') as string;
      const userId = getUserIdFromRequest(c);

      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }

      const status = await TokenQueueService.getQueueStatus(eventId, boothName);
      return c.json(status);
    } catch (error) {
      console.error('Error getting queue status:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get queue status' }, 500);
    }
  });

  // POST /whatsapp/queue/:boothName/serve - Mark token as served
  wa.post('/queue/:boothName/serve', requireAuth, writeLimiter, zValidator('json', z.object({
    tokenNumber: z.number().int().min(1),
  })), async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const boothName = c.req.param('boothName') as string;
      const userId = getUserIdFromRequest(c);
      const { tokenNumber } = c.req.valid('json');

      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      await TokenQueueService.markServed(eventId, tokenNumber, boothName);
      return c.json({ success: true, message: `Token #${tokenNumber} marked as served at ${boothName}` });
    } catch (error) {
      console.error('Error marking token as served:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to mark token as served' }, 500);
    }
  });

  // ============================================================================
  // ANALYTICS ROUTES (Requirements: 12.1, 12.5)
  // ============================================================================

  /**
   * GET /analytics - Get full WhatsApp analytics dashboard for an event
   */
  wa.get('/analytics', requireAuth, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const userId = getUserIdFromRequest(c);

      const canView = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canView) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to view this event' }, 403);
      }

      const { WhatsAppAnalyticsService } = await import('@/lib/services/whatsapp-analytics-service');
      const analytics = await WhatsAppAnalyticsService.getFullAnalytics(eventId);
      return c.json(analytics);
    } catch (error) {
      console.error('Error fetching WhatsApp analytics:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch analytics' }, 500);
    }
  });

  /**
   * GET /broadcasts/:broadcastId/responses/export - Export survey responses for a broadcast
   */
  wa.get('/broadcasts/:broadcastId/responses/export', requireAuth, async (c) => {
    try {
      const eventId = c.req.param('id')!;
      const broadcastId = c.req.param('broadcastId') as string;
      const userId = getUserIdFromRequest(c);

      const canView = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canView) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to view this event' }, 403);
      }

      const { WhatsAppAnalyticsService } = await import('@/lib/services/whatsapp-analytics-service');
      const responses = await WhatsAppAnalyticsService.exportSurveyResponses(broadcastId);
      return c.json({ broadcastId, responses });
    } catch (error) {
      console.error('Error exporting survey responses:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to export survey responses' }, 500);
    }
  });

  return wa;
}
