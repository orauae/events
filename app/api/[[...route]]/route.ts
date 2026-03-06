import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { 
  EventService, 
  createEventSchema, 
  updateEventSchema,
  GuestService,
  createGuestSchema,
  updateGuestSchema,
  EventGuestService,
  CampaignService,
  createCampaignSchema,
  CampaignSendService,
  BadgeService,
  RSVPConfirmationService,
  AnalyticsService,
  ExportService,
  AuthorizationService,
  EventManagerService,
  createEventManagerSchema,
  updateEventManagerSchema,
  updatePermissionsSchema,
  EventAssignmentService,
  GuestPhotoService,
  StatisticsService,
  ReportService,
} from '@/lib/services';
import { 
  SMTPService, 
  createSMTPSettingsSchema, 
  updateSMTPSettingsSchema 
} from '@/lib/services/smtp-service';
import { AutomationService, createAutomationSchema, updateAutomationSchema } from '@/lib/services/automation-service';
import { createWhatsAppRoutes } from '@/lib/routes/whatsapp-routes';
import { createWhatsAppTemplateRoutes } from '@/lib/routes/whatsapp-template-routes';
import { ExecutionService } from '@/lib/services/execution-service';
import { TemplateService } from '@/lib/services/template-service';
import { guestTags, user, type CampaignStatus, type CampaignType } from '@/db/schema';
import { R2StorageService } from '@/lib/services/r2-storage-service';
import { ImageOptimizerService } from '@/lib/services/image-optimizer-service';
import { MJMLGeneratorService } from '@/lib/services/mjml-generator-service';
import { EmailGenerationService } from '@/lib/services/email-generation-service';
import { db } from '@/db';
import { emailAssets, emailAttachments, campaigns, events, eventGuests, guests } from '@/db/schema';
import { eq, sql, desc, inArray, and } from 'drizzle-orm';
import type { EmailBuilderState } from '@/lib/types/email-builder';
import { auth } from '@/lib/auth';
import type { Context, Next } from 'hono';
import { rateLimit } from '@/lib/middleware/rate-limit';

// Create Hono app with /api base path
const app = new Hono().basePath('/api');

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Rate limiter for write operations (create, update, delete).
 * 30 requests per minute per user/IP.
 */
const writeLimiter = rateLimit({ max: 30, windowMs: 60_000, prefix: 'write' });

/**
 * Rate limiter for read operations.
 * 120 requests per minute per user/IP.
 */
const readLimiter = rateLimit({ max: 120, windowMs: 60_000, prefix: 'read' });

/**
 * Stricter rate limiter for sensitive operations (campaign sends, exports, imports).
 * 10 requests per minute per user/IP.
 */
const sensitiveLimiter = rateLimit({ max: 10, windowMs: 60_000, prefix: 'sensitive' });

/**
 * Rate limiter for public endpoints (RSVP, check-in).
 * 60 requests per minute per IP.
 */
const publicLimiter = rateLimit({ max: 60, windowMs: 60_000, prefix: 'public' });

/**
 * Rate limiter for file upload endpoints.
 * 20 requests per minute per user/IP.
 */
const uploadLimiter = rateLimit({ max: 20, windowMs: 60_000, prefix: 'upload' });

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Gets the current session from the request headers
 */
async function getSessionFromRequest(c: Context) {
  try {
    // Debug: log cookies
    const cookieHeader = c.req.raw.headers.get('cookie');
    console.log('[API] Cookie header:', cookieHeader);
    
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    
    console.log('[API] Session result:', session ? { userId: session.user.id, email: session.user.email } : null);
    
    return session;
  } catch (err) {
    console.error('[API] Session error:', err);
    return null;
  }
}

/**
 * Middleware to require authentication
 */
async function requireAuth(c: Context, next: Next) {
  const session = await getSessionFromRequest(c);
  if (!session) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
  }
  // Store userId in request header for later retrieval
  c.req.raw.headers.set('x-user-id', session.user.id);
  await next();
}

/**
 * Middleware to require admin role
 */
async function requireAdmin(c: Context, next: Next) {
  const session = await getSessionFromRequest(c);
  if (!session) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
  }
  
  const isAdmin = await AuthorizationService.isAdmin(session.user.id);
  if (!isAdmin) {
    return c.json({ code: 'FORBIDDEN', message: 'Admin access required' }, 403);
  }
  
  // Store userId in request header for later retrieval
  c.req.raw.headers.set('x-user-id', session.user.id);
  await next();
}

/**
 * Helper to get user ID from request
 */
function getUserIdFromRequest(c: Context): string {
  return c.req.raw.headers.get('x-user-id') || '';
}

// Events routes
const eventsRoutes = new Hono()
  // GET /api/events - List all events (filtered by user role)
  // Requirements: 1.2, 6.1, 9.1
  .get('/', requireAuth, readLimiter, async (c) => {
    try {
      const userId = getUserIdFromRequest(c);
      const isAdmin = await AuthorizationService.isAdmin(userId);
      
      if (isAdmin) {
        // Admins see all events
        const allEvents = await EventService.getAll();
        return c.json(allEvents);
      } else {
        // Event managers see only their assigned events
        const assignedEvents = await EventAssignmentService.getEventsByUser(userId);
        return c.json(assignedEvents);
      }
    } catch (error) {
      console.error('Error listing events:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list events' }, 500);
    }
  })
  // POST /api/events - Create event with zValidator
  // Requirements: 1.1, 1.5, 1.6, 5.1, 5.6
  .post('/', requireAuth, writeLimiter, zValidator('json', createEventSchema.extend({
    assignedUserId: z.string().optional(),
  })), async (c) => {
    try {
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');
      const { assignedUserId, ...eventInput } = input;
      
      // Check if user has permission to create events
      const isAdmin = await AuthorizationService.isAdmin(userId);
      const canCreate = isAdmin || await AuthorizationService.hasPermission(userId, 'canCreateEvents');
      
      if (!canCreate) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to create events' }, 403);
      }
      
      // Create the event
      const event = await EventService.create(eventInput);
      
      // Determine who to assign the event to
      // - If assignedUserId is provided (admin only), use that
      // - Otherwise, auto-assign to the creator
      let targetUserId = userId;
      if (assignedUserId && isAdmin) {
        targetUserId = assignedUserId;
      }
      
      // Create the assignment
      try {
        await EventAssignmentService.assignEvent(event.id, targetUserId, userId);
      } catch (assignError) {
        // If assignment fails, delete the event and return error
        await EventService.delete(event.id);
        throw assignError;
      }
      
      return c.json(event, 201);
    } catch (error) {
      console.error('Error creating event:', error);
      if (error instanceof z.ZodError) {
        return c.json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {}),
        }, 400);
      }
      if (error instanceof Error) {
        if (error.message.includes('validation')) {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
        if (error.message === 'User not found' || error.message === 'Cannot assign event to inactive user') {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create event' }, 500);
    }
  })
  // GET /api/events/:id - Get event by ID
  // Requirements: 1.2, 6.4
  .get('/:id', requireAuth, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const userId = getUserIdFromRequest(c);
      
      // Check if user can access this event
      const canAccess = await AuthorizationService.canAccessEvent(userId, id);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }
      
      const event = await EventService.getById(id);
      
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      return c.json(event);
    } catch (error) {
      console.error('Error getting event:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get event' }, 500);
    }
  })
  // PUT /api/events/:id - Update event
  // Requirements: 1.3, 6.4
  .put('/:id', requireAuth, writeLimiter, zValidator('json', updateEventSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');
      
      // Check if user can modify this event
      const canModify = await AuthorizationService.canModifyEvent(userId, id);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }
      
      // Check if event exists
      const existingEvent = await EventService.getById(id);
      if (!existingEvent) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const event = await EventService.update(id, input);
      return c.json(event);
    } catch (error) {
      console.error('Error updating event:', error);
      if (error instanceof z.ZodError) {
        return c.json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {}),
        }, 400);
      }
      if (error instanceof Error && error.message.includes('End date must be after start date')) {
        return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update event' }, 500);
    }
  })
  // DELETE /api/events/:id - Delete event
  // Requirements: 1.4, 6.4
  .delete('/:id', requireAuth, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const userId = getUserIdFromRequest(c);
      
      // Check if user can modify this event
      const canModify = await AuthorizationService.canModifyEvent(userId, id);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to delete this event' }, 403);
      }
      
      // Check if event exists
      const existingEvent = await EventService.getById(id);
      if (!existingEvent) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      await EventService.delete(id);
      return c.json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
      console.error('Error deleting event:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete event' }, 500);
    }
  })
  // GET /api/events/:id/guests - List event guests
  // Requirements: 3.3, 6.4
  .get('/:id/guests', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      const userId = getUserIdFromRequest(c);
      
      // Check if user can access this event
      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }
      
      // Check if event exists
      const existingEvent = await EventService.getById(eventId);
      if (!existingEvent) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const eventGuests = await EventGuestService.getEventGuests(eventId);
      return c.json(eventGuests);
    } catch (error) {
      console.error('Error listing event guests:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list event guests' }, 500);
    }
  })
  // POST /api/events/:id/guests - Add guest to event
  // Requirements: 3.1, 6.4
  .post('/:id/guests', requireAuth, writeLimiter, zValidator('json', z.object({ guestId: z.string().min(1, 'Guest ID is required') })), async (c) => {
    try {
      const eventId = c.req.param('id');
      const userId = getUserIdFromRequest(c);
      const { guestId } = c.req.valid('json');
      
      // Check if user can modify this event
      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }
      
      const eventGuest = await EventGuestService.addGuestToEvent(eventId, guestId);
      return c.json(eventGuest, 201);
    } catch (error) {
      console.error('Error adding guest to event:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Event not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
        }
        if (error.message === 'Guest not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Guest not found' }, 404);
        }
        // Handle unique constraint violation (guest already added to event)
        if (error.message.includes('Unique constraint') || error.message.includes('unique')) {
          return c.json({ code: 'DUPLICATE_ENTRY', message: 'Guest is already added to this event' }, 409);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to add guest to event' }, 500);
    }
  })
  // DELETE /api/events/:id/guests/:guestId - Remove guest from event
  // Requirements: 3.4, 6.4
  .delete('/:id/guests/:guestId', requireAuth, writeLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      const guestId = c.req.param('guestId');
      const userId = getUserIdFromRequest(c);
      
      // Check if user can modify this event
      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }
      
      // Check if the event-guest relationship exists
      const existingEventGuest = await EventGuestService.getByEventAndGuest(eventId, guestId);
      if (!existingEventGuest) {
        return c.json({ code: 'NOT_FOUND', message: 'Guest is not associated with this event' }, 404);
      }
      
      await EventGuestService.removeGuestFromEvent(eventId, guestId);
      return c.json({ success: true, message: 'Guest removed from event successfully' });
    } catch (error) {
      console.error('Error removing guest from event:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to remove guest from event' }, 500);
    }
  })
  // GET /api/events/:id/campaigns - List event campaigns
  // Requirements: 4.1, 6.4
  .get('/:id/campaigns', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      const userId = getUserIdFromRequest(c);
      
      // Check if user can access this event
      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }
      
      // Check if event exists
      const existingEvent = await EventService.getById(eventId);
      if (!existingEvent) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const campaignList = await CampaignService.getByEvent(eventId);
      return c.json(campaignList);
    } catch (error) {
      console.error('Error listing event campaigns:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list event campaigns' }, 500);
    }
  })
  // POST /api/events/:id/campaigns - Create campaign for event
  // Requirements: 4.1, 6.4
  .post('/:id/campaigns', requireAuth, writeLimiter, zValidator('json', createCampaignSchema.omit({ eventId: true })), async (c) => {
    try {
      const eventId = c.req.param('id');
      const userId = getUserIdFromRequest(c);
      const input = c.req.valid('json');
      
      // Check if user can modify this event
      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }
      
      // Check if event exists
      const existingEvent = await EventService.getById(eventId);
      if (!existingEvent) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const campaign = await CampaignService.create({ ...input, eventId });
      return c.json(campaign, 201);
    } catch (error) {
      console.error('Error creating campaign:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create campaign' }, 500);
    }
  })
  // GET /api/events/:id/analytics - Get event analytics
  // Requirements: 8.1, 8.2, 8.3
  .get('/:id/analytics', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      
      const analytics = await AnalyticsService.getEventAnalytics(eventId);
      return c.json(analytics);
    } catch (error) {
      console.error('Error getting event analytics:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Event not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
        }
        if (error.message === 'Event ID is required') {
          return c.json({ code: 'VALIDATION_ERROR', message: 'Event ID is required' }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get event analytics' }, 500);
    }
  })
  // GET /api/events/:id/export/guests - Export guest list
  // Requirements: 9.1
  .get('/:id/export/guests', requireAuth, sensitiveLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      
      const csv = await ExportService.exportGuestList(eventId);
      
      // Return CSV with appropriate headers
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="event-${eventId}-guests.csv"`,
        },
      });
    } catch (error) {
      console.error('Error exporting guest list:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Event not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
        }
        if (error.message === 'Event ID is required') {
          return c.json({ code: 'VALIDATION_ERROR', message: 'Event ID is required' }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to export guest list' }, 500);
    }
  })
  // GET /api/events/:id/export/attendance - Export attendance report
  // Requirements: 9.2
  .get('/:id/export/attendance', requireAuth, sensitiveLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      
      const csv = await ExportService.exportAttendanceReport(eventId);
      
      // Return CSV with appropriate headers
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="event-${eventId}-attendance.csv"`,
        },
      });
    } catch (error) {
      console.error('Error exporting attendance report:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Event not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
        }
        if (error.message === 'Event ID is required') {
          return c.json({ code: 'VALIDATION_ERROR', message: 'Event ID is required' }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to export attendance report' }, 500);
    }
  })
  // PUT /api/events/:id/guests/:guestId/tier - Update guest tier
  // Requirements: 5.3, 5.7
  .put('/:id/guests/:guestId/tier', requireAuth, writeLimiter, zValidator('json', z.object({
    tier: z.enum(['Regular', 'VIP', 'VVIP'], {
      error: 'Invalid tier. Must be one of: Regular, VIP, VVIP',
    }),
  })), async (c) => {
    try {
      const eventId = c.req.param('id');
      const guestId = c.req.param('guestId');
      const userId = getUserIdFromRequest(c);
      const { tier } = c.req.valid('json');

      // Check if user can modify this event
      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      // Find the event guest record
      const eventGuest = await db.query.eventGuests.findFirst({
        where: and(
          eq(eventGuests.eventId, eventId),
          eq(eventGuests.guestId, guestId),
        ),
        with: {
          guest: true,
          event: true,
        },
      });

      if (!eventGuest) {
        return c.json({ code: 'NOT_FOUND', message: 'Guest not found in this event' }, 404);
      }

      // Update the tier
      const [updated] = await db.update(eventGuests)
        .set({ tier, updatedAt: new Date() })
        .where(eq(eventGuests.id, eventGuest.id))
        .returning();

      return c.json({ ...updated, guest: eventGuest.guest, event: eventGuest.event });
    } catch (error) {
      console.error('Error updating guest tier:', error);
      if (error instanceof z.ZodError) {
        return c.json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {}),
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update guest tier' }, 500);
    }
  })
  // GET /api/events/:id/tier-config - Get tier-specific configuration for an event
  // Requirements: 5.7
  .get('/:id/tier-config', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      const userId = getUserIdFromRequest(c);

      // Check if user can access this event
      const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
      if (!canAccess) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have access to this event' }, 403);
      }

      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }

      // Return tier config or default empty config
      const tierConfig = event.tierConfig ?? {
        VIP: { collectionPoint: '', priorityLane: '' },
        VVIP: { collectionPoint: '', priorityLane: '' },
      };

      return c.json(tierConfig);
    } catch (error) {
      console.error('Error getting tier config:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get tier configuration' }, 500);
    }
  })
  // PUT /api/events/:id/tier-config - Update tier-specific configuration for an event
  // Requirements: 5.7
  .put('/:id/tier-config', requireAuth, writeLimiter, zValidator('json', z.object({
    VIP: z.object({
      collectionPoint: z.string().default(''),
      priorityLane: z.string().default(''),
    }).optional(),
    VVIP: z.object({
      collectionPoint: z.string().default(''),
      priorityLane: z.string().default(''),
    }).optional(),
  })), async (c) => {
    try {
      const eventId = c.req.param('id');
      const userId = getUserIdFromRequest(c);
      const tierConfig = c.req.valid('json');

      // Check if user can modify this event
      const canModify = await AuthorizationService.canModifyEvent(userId, eventId);
      if (!canModify) {
        return c.json({ code: 'FORBIDDEN', message: 'You do not have permission to modify this event' }, 403);
      }

      const existingEvent = await EventService.getById(eventId);
      if (!existingEvent) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }

      // Update the tier config on the event
      const [updated] = await db.update(events)
        .set({ tierConfig, updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning();

      return c.json(updated.tierConfig);
    } catch (error) {
      console.error('Error updating tier config:', error);
      if (error instanceof z.ZodError) {
        return c.json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {}),
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update tier configuration' }, 500);
    }
  });

// Mount WhatsApp routes under events
eventsRoutes.route('/:id/whatsapp', createWhatsAppRoutes());

// Mount routes
app.route('/events', eventsRoutes);

// WhatsApp Template Management routes
app.route('/whatsapp-templates', createWhatsAppTemplateRoutes());

// Campaigns routes (for campaign-specific operations)
// Requirements: 4.1, 4.4
const campaignsRoutes = new Hono()
  // GET /api/campaigns/:id - Get campaign by ID
  // Requirements: 4.1
  .get('/:id', requireAuth, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const campaign = await CampaignService.getById(id);
      
      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      return c.json(campaign);
    } catch (error) {
      console.error('Error getting campaign:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get campaign' }, 500);
    }
  })
  // POST /api/campaigns/:id/send - Send campaign
  // Requirements: 4.4
  // Sends immediately for campaigns with < 100 recipients, queues larger campaigns
  // WhatsApp campaigns are dispatched via the whatsapp-broadcast-send task
  .post('/:id/send', requireAuth, sensitiveLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      
      // Check if campaign exists
      const existingCampaign = await CampaignService.getById(id);
      if (!existingCampaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      // Validate campaign can be sent
      if (existingCampaign.status === 'Sent') {
        return c.json({ code: 'CAMPAIGN_ALREADY_SENT', message: 'Campaign has already been sent' }, 400);
      }
      
      if (existingCampaign.status === 'Sending' || existingCampaign.status === 'Queued') {
        return c.json({ code: 'CAMPAIGN_IN_PROGRESS', message: 'Campaign is currently being processed' }, 400);
      }
      
      // Get base URL from request for generating RSVP and badge links
      const url = new URL(c.req.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      // ---- WhatsApp campaign send path ----
      if (existingCampaign.channel === 'whatsapp') {
        const { BroadcastService } = await import('@/lib/services/broadcast-service');
        const { whatsappChannels } = await import('@/db/schema');

        // Verify WhatsApp channel exists for this event
        const channel = await db.query.whatsappChannels.findFirst({
          where: and(
            eq(whatsappChannels.eventId, existingCampaign.eventId),
            eq(whatsappChannels.isActive, true)
          ),
        });

        if (!channel) {
          return c.json({
            code: 'NO_WHATSAPP_CHANNEL',
            message: 'No active WhatsApp channel configured for this event. Please set up a WhatsApp channel first.',
          }, 400);
        }

        // Build WhatsApp message content from campaign fields
        const waContent = existingCampaign.whatsappContent as Record<string, unknown> | null;
        const messageContent = waContent || {
          type: existingCampaign.whatsappTemplateId ? 'template' : 'text',
          ...(existingCampaign.whatsappTemplateId
            ? { template: { name: existingCampaign.whatsappTemplateId, language: { code: 'en' } } }
            : { text: { body: existingCampaign.content } }),
        };

        // Create a broadcast record and send via the broadcast service
        const broadcast = await BroadcastService.create(
          existingCampaign.eventId,
          messageContent as any,
          {}, // no filter — send to all guests
        );

        const sendResult = await BroadcastService.send(broadcast.id);

        // Update campaign status
        await db.update(campaigns)
          .set({ status: 'Sent', sentAt: new Date(), recipientCount: sendResult.totalRecipients, updatedAt: new Date() })
          .where(eq(campaigns.id, id));

        return c.json({
          success: true,
          campaignId: id,
          channel: 'whatsapp',
          broadcastId: broadcast.id,
          totalRecipients: sendResult.totalRecipients,
          taskId: sendResult.taskId,
          mode: 'whatsapp-broadcast',
        });
      }

      // ---- SMS campaign send path (via Infobip) ----
      if (existingCampaign.channel === 'sms') {
        if (!existingCampaign.smsBody) {
          return c.json({ code: 'MISSING_CONTENT', message: 'SMS body is required before sending' }, 400);
        }

        // Verify Infobip is configured
        const { InfobipSMSSender } = await import('@/lib/services/infobip-sms-sender');
        if (!InfobipSMSSender.isAvailable()) {
          return c.json({
            code: 'SMS_NOT_CONFIGURED',
            message: 'Infobip SMS is not configured. Set INFOBIP_API_URL and INFOBIP_API_KEY environment variables.',
          }, 400);
        }

        // Count recipients with phone numbers
        const smsRecipientCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(eventGuests)
          .innerJoin(guests, eq(eventGuests.guestId, guests.id))
          .where(
            and(
              eq(eventGuests.eventId, existingCampaign.eventId),
              sql`COALESCE(${eventGuests.updatedMobile}, ${guests.mobile}) IS NOT NULL AND COALESCE(${eventGuests.updatedMobile}, ${guests.mobile}) != ''`
            )
          )
          .then(rows => Number(rows[0]?.count || 0));

        if (smsRecipientCount === 0) {
          return c.json({
            code: 'NO_RECIPIENTS',
            message: 'No guests with phone numbers found for this event.',
          }, 400);
        }

        try {
          const { sendJob } = await import('@/lib/jobs');

          await db.update(campaigns)
            .set({ status: 'Queued', updatedAt: new Date() })
            .where(eq(campaigns.id, id));

          const jobId = await sendJob('bulk-sms-send', {
            campaignId: id,
            baseUrl,
            batchSize: 100,
            batchDelayMs: 1500,
          });

          console.log(`[Campaign Send] SMS campaign ${id} queued (${smsRecipientCount} recipients), job: ${jobId}`);

          return c.json({
            success: true,
            campaignId: id,
            channel: 'sms',
            status: 'Queued',
            message: `SMS campaign with ${smsRecipientCount} recipients queued for processing`,
            taskId: jobId ?? 'queued',
            mode: 'sms-bulk',
            recipientCount: smsRecipientCount,
          });
        } catch (queueError) {
          console.error('[Campaign Send] Failed to queue SMS campaign:', queueError);
          return c.json({
            code: 'QUEUE_FAILED',
            message: 'Failed to queue SMS campaign for processing.',
          }, 500);
        }
      }
      
      // ---- Email campaign send path (default) ----
      // Count recipients for this campaign's event
      const recipientCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(eventGuests)
        .where(eq(eventGuests.eventId, existingCampaign.eventId))
        .then(rows => Number(rows[0]?.count || 0));
      
      console.log(`[Campaign Send] Campaign ${id} has ${recipientCount} recipients`);
      
      // For small campaigns (< 100 recipients), send immediately
      // For larger campaigns, try to use background queue if available
      const IMMEDIATE_SEND_THRESHOLD = 100;
      
      if (recipientCount < IMMEDIATE_SEND_THRESHOLD) {
        console.log(`[Campaign Send] Sending immediately (${recipientCount} < ${IMMEDIATE_SEND_THRESHOLD} recipients)`);
        const result = await CampaignSendService.send(id, baseUrl);
        return c.json({ ...result, mode: 'immediate', recipientCount });
      }
      
      // For larger campaigns, use background queue
      try {
        const { sendJob } = await import('@/lib/jobs');
        
        // Update campaign status to Queued
        await db.update(campaigns)
          .set({ status: 'Queued', updatedAt: new Date() })
          .where(eq(campaigns.id, id));
        
        // Enqueue the background job
        const jobId = await sendJob('bulk-email-send', {
          campaignId: id,
          baseUrl,
          batchSize: 100,
          batchDelayMs: 1000,
        });
        
        console.log(`[Campaign Send] Queued large campaign ${id} (${recipientCount} recipients), job: ${jobId}`);
        
        return c.json({
          success: true,
          campaignId: id,
          status: 'Queued',
          message: `Campaign with ${recipientCount} recipients queued for processing`,
          taskId: jobId ?? 'queued',
          mode: 'queued',
          recipientCount,
        });
      } catch (queueError) {
        // Job queue not available, send synchronously even for large campaigns
        console.log(`[Campaign Send] Job queue not available, sending ${recipientCount} recipients synchronously`);
        const result = await CampaignSendService.send(id, baseUrl);
        return c.json({ ...result, mode: 'immediate-fallback', recipientCount });
      }
    } catch (error) {
      console.error('Error sending campaign:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Campaign has already been sent') {
          return c.json({ code: 'CAMPAIGN_ALREADY_SENT', message: error.message }, 400);
        }
        if (error.message === 'Campaign is currently being sent') {
          return c.json({ code: 'CAMPAIGN_IN_PROGRESS', message: error.message }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to send campaign' }, 500);
    }
  })
  // GET /api/campaigns/:id/analytics - Get campaign analytics
  // Requirements: 8.2
  .get('/:id/analytics', requireAuth, readLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      
      const analytics = await AnalyticsService.getCampaignAnalytics(campaignId);
      return c.json(analytics);
    } catch (error) {
      console.error('Error getting campaign analytics:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Campaign not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
        if (error.message === 'Campaign ID is required') {
          return c.json({ code: 'VALIDATION_ERROR', message: 'Campaign ID is required' }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get campaign analytics' }, 500);
    }
  })
  // GET /api/campaigns/:id/export - Export campaign report
  // Requirements: 9.3
  .get('/:id/export', requireAuth, sensitiveLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      
      const csv = await ExportService.exportCampaignReport(campaignId);
      
      // Return CSV with appropriate headers
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="campaign-${campaignId}-report.csv"`,
        },
      });
    } catch (error) {
      console.error('Error exporting campaign report:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Campaign not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
        if (error.message === 'Campaign ID is required') {
          return c.json({ code: 'VALIDATION_ERROR', message: 'Campaign ID is required' }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to export campaign report' }, 500);
    }
  })
  // PUT /api/campaigns/:id/content - Update campaign content (WhatsApp/SMS fields)
  .put('/:id/content', requireAuth, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json() as {
        whatsappTemplateId?: string | null;
        whatsappTemplateName?: string | null;
        whatsappMessageBody?: string | null;
        whatsappMediaUrl?: string | null;
        whatsappMediaType?: string | null;
        whatsappContent?: Record<string, unknown> | null;
        smsBody?: string | null;
        smsSenderId?: string | null;
        smsOptOutFooter?: boolean;
        content?: string;
        subject?: string;
      };

      const existingCampaign = await CampaignService.getById(id);
      if (!existingCampaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }

      if (existingCampaign.status === 'Sent') {
        return c.json({ code: 'CAMPAIGN_ALREADY_SENT', message: 'Cannot update a sent campaign' }, 400);
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      if (body.subject !== undefined) updateData.subject = body.subject;
      if (body.content !== undefined) updateData.content = body.content;
      if (body.whatsappTemplateId !== undefined) updateData.whatsappTemplateId = body.whatsappTemplateId;
      if (body.whatsappContent !== undefined) updateData.whatsappContent = body.whatsappContent;
      if (body.whatsappMediaUrl !== undefined) updateData.whatsappMediaUrl = body.whatsappMediaUrl;
      if (body.whatsappMediaType !== undefined) updateData.whatsappMediaType = body.whatsappMediaType;

      // SMS fields
      if (body.smsBody !== undefined) updateData.smsBody = body.smsBody;
      if (body.smsSenderId !== undefined) updateData.smsSenderId = body.smsSenderId;
      if (body.smsOptOutFooter !== undefined) updateData.smsOptOutFooter = body.smsOptOutFooter;

      const [updated] = await db.update(campaigns)
        .set(updateData)
        .where(eq(campaigns.id, id))
        .returning();

      return c.json(updated);
    } catch (error) {
      console.error('Error updating campaign content:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update campaign content' }, 500);
    }
  });

// Mount campaign routes
app.route('/campaigns', campaignsRoutes);

// Campaign Assets routes (for email builder image uploads)
const campaignAssets = new Hono()
  // POST /api/campaigns/:id/assets - Upload image asset
  .post('/:id/assets', requireAuth, uploadLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      
      // Check if campaign exists
      const campaign = await CampaignService.getById(campaignId);
      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      // Check if R2 is configured
      if (!R2StorageService.isConfigured()) {
        return c.json({ 
          code: 'SERVICE_UNAVAILABLE', 
          message: 'Image storage is not configured' 
        }, 503);
      }
      
      // Parse multipart form data
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return c.json({ code: 'VALIDATION_ERROR', message: 'No file provided' }, 400);
      }
      
      // Validate file type
      if (!ImageOptimizerService.isValidImageType(file.type)) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' 
        }, 400);
      }
      
      // Validate file size
      if (file.size > ImageOptimizerService.getMaxUploadSize()) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'File too large. Maximum size is 10MB' 
        }, 400);
      }
      
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Optimize image
      const optimized = await ImageOptimizerService.optimize(buffer, file.type);
      
      // Upload to R2
      const uploadResult = await R2StorageService.upload(
        optimized.buffer,
        file.name,
        optimized.mimeType,
        campaignId
      );
      
      // Save asset record to database
      const [asset] = await db.insert(emailAssets).values({
        campaignId,
        originalFilename: file.name,
        r2Key: uploadResult.key,
        publicUrl: uploadResult.publicUrl,
        fileSize: optimized.originalSize,
        optimizedSize: optimized.optimizedSize,
        mimeType: optimized.mimeType,
        width: optimized.width,
        height: optimized.height,
      }).returning();
      
      return c.json({
        id: asset.id,
        publicUrl: asset.publicUrl,
        width: asset.width,
        height: asset.height,
        originalSize: asset.fileSize,
        optimizedSize: asset.optimizedSize,
        wasOptimized: optimized.wasOptimized,
      }, 201);
    } catch (error) {
      console.error('Error uploading asset:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to upload asset' }, 500);
    }
  })
  // GET /api/campaigns/:id/assets - List campaign assets
  .get('/:id/assets', requireAuth, readLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      
      // Check if campaign exists
      const campaign = await CampaignService.getById(campaignId);
      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      const assets = await db.select().from(emailAssets).where(eq(emailAssets.campaignId, campaignId));
      return c.json(assets);
    } catch (error) {
      console.error('Error listing assets:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list assets' }, 500);
    }
  })
  // DELETE /api/campaigns/:id/assets/:assetId - Delete asset
  .delete('/:id/assets/:assetId', requireAuth, writeLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      const assetId = c.req.param('assetId');
      
      // Get asset
      const [asset] = await db.select().from(emailAssets)
        .where(eq(emailAssets.id, assetId));
      
      if (!asset || asset.campaignId !== campaignId) {
        return c.json({ code: 'NOT_FOUND', message: 'Asset not found' }, 404);
      }
      
      // Delete from R2
      try {
        await R2StorageService.delete(asset.r2Key);
      } catch {
        // Continue even if R2 delete fails
        console.error('Failed to delete from R2:', asset.r2Key);
      }
      
      // Delete from database
      await db.delete(emailAssets).where(eq(emailAssets.id, assetId));
      
      return c.json({ success: true, message: 'Asset deleted' });
    } catch (error) {
      console.error('Error deleting asset:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete asset' }, 500);
    }
  })
  // PUT /api/campaigns/:id/design - Save campaign design
  // Supports both legacy EmailBuilderState format and new Unlayer format
  .put('/:id/design', requireAuth, writeLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      const body = await c.req.json() as { 
        designJson: EmailBuilderState | Record<string, unknown>; 
        htmlContent?: string;
        subject?: string;
      };
      
      // Check if campaign exists
      const campaign = await CampaignService.getById(campaignId);
      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      let htmlContent = '';
      let plainTextContent = '';
      
      // Check if this is Unlayer format (has htmlContent) or legacy format (has blocks)
      const isUnlayerFormat = body.htmlContent !== undefined;
      const isLegacyFormat = body.designJson && 'blocks' in body.designJson && Array.isArray((body.designJson as EmailBuilderState).blocks);
      
      if (isUnlayerFormat && body.htmlContent) {
        // New Unlayer format - use provided HTML and generate plain text
        const validation = EmailGenerationService.validateHtml(body.htmlContent);
        if (!validation.valid) {
          return c.json({ 
            code: 'VALIDATION_ERROR', 
            message: validation.error || 'Invalid HTML content' 
          }, 400);
        }
        
        htmlContent = body.htmlContent;
        plainTextContent = EmailGenerationService.generatePlainText(body.htmlContent);
      } else if (isLegacyFormat) {
        // Legacy format - generate from MJML
        const legacyDesign = body.designJson as EmailBuilderState;
        if (legacyDesign.blocks.length > 0) {
          const mjml = MJMLGeneratorService.generate(legacyDesign);
          htmlContent = mjml;
          plainTextContent = MJMLGeneratorService.generatePlainText(legacyDesign);
        }
      }
      
      // Update campaign
      const [updated] = await db.update(campaigns)
        .set({
          designJson: body.designJson,
          content: htmlContent || plainTextContent || campaign.content,
          subject: body.subject || campaign.subject,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId))
        .returning();
      
      return c.json({
        id: updated.id,
        designJson: updated.designJson,
        subject: updated.subject,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      console.error('Error saving design:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to save design' }, 500);
    }
  })
  // POST /api/campaigns/:id/preview - Generate email preview
  // Supports both legacy EmailBuilderState format and new Unlayer format
  .post('/:id/preview', requireAuth, readLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      
      // Get campaign with design
      const campaign = await CampaignService.getById(campaignId);
      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      const designJson = campaign.designJson as EmailBuilderState | Record<string, unknown> | null;
      
      if (!designJson) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Campaign has no design content' 
        }, 400);
      }
      
      // Check if this is Unlayer format (has body.rows) or legacy format (has blocks)
      const isLegacyFormat = 'blocks' in designJson && Array.isArray((designJson as EmailBuilderState).blocks);
      const isUnlayerFormat = 'body' in designJson && typeof (designJson as Record<string, unknown>).body === 'object';
      
      if (isUnlayerFormat) {
        // New Unlayer format - use stored HTML content and EmailGenerationService
        const htmlContent = campaign.content;
        
        if (!htmlContent) {
          return c.json({ 
            code: 'VALIDATION_ERROR', 
            message: 'Campaign has no HTML content. Please save the design first.' 
          }, 400);
        }
        
        // Get sample context and substitute variables
        const sampleContext = EmailGenerationService.getSampleContext();
        const htmlWithSamples = EmailGenerationService.substituteVariables(htmlContent, sampleContext);
        const plainText = EmailGenerationService.generatePlainText(htmlContent);
        const plainTextWithSamples = EmailGenerationService.substituteVariables(plainText, sampleContext);
        const subjectWithSamples = EmailGenerationService.substituteVariables(campaign.subject, sampleContext);
        
        return c.json({
          html: htmlWithSamples,
          plainText: plainTextWithSamples,
          subject: subjectWithSamples,
          sampleData: sampleContext,
          format: 'unlayer',
        });
      } else if (isLegacyFormat) {
        // Legacy format - generate from MJML
        const legacyDesign = designJson as EmailBuilderState;
        
        if (!legacyDesign.blocks.length) {
          return c.json({ 
            code: 'VALIDATION_ERROR', 
            message: 'Campaign has no design content' 
          }, 400);
        }
        
        // Generate MJML
        const mjml = MJMLGeneratorService.generate(legacyDesign);
        
        // Substitute with sample data
        const sampleContext = MJMLGeneratorService.getSampleContext();
        const mjmlWithSamples = MJMLGeneratorService.substituteVariables(mjml, sampleContext);
        
        // Compile MJML to HTML (using mjml-browser on client side)
        // For server-side, we return MJML and let client compile
        const plainText = MJMLGeneratorService.generatePlainText(legacyDesign);
        const plainTextWithSamples = MJMLGeneratorService.substituteVariables(plainText, sampleContext);
        
        return c.json({
          mjml: mjmlWithSamples,
          plainText: plainTextWithSamples,
          subject: MJMLGeneratorService.substituteVariables(campaign.subject, sampleContext),
          sampleData: sampleContext,
          format: 'legacy',
        });
      } else {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Unrecognized design format' 
        }, 400);
      }
    } catch (error) {
      console.error('Error generating preview:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to generate preview' }, 500);
    }
  })
  // POST /api/campaigns/:id/test - Send test email
  // Supports both legacy EmailBuilderState format and new Unlayer format
  .post('/:id/test', requireAuth, sensitiveLimiter, zValidator('json', z.object({ email: z.string().email() })), async (c) => {
    try {
      const campaignId = c.req.param('id');
      const { email } = c.req.valid('json');
      
      // Get campaign with design
      const campaign = await CampaignService.getById(campaignId);
      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      const designJson = campaign.designJson as EmailBuilderState | Record<string, unknown> | null;
      
      if (!designJson) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Campaign has no design content' 
        }, 400);
      }
      
      // Check if this is Unlayer format (has body.rows) or legacy format (has blocks)
      const isLegacyFormat = 'blocks' in designJson && Array.isArray((designJson as EmailBuilderState).blocks);
      const isUnlayerFormat = 'body' in designJson && typeof (designJson as Record<string, unknown>).body === 'object';
      
      let subject: string;
      
      if (isUnlayerFormat) {
        // New Unlayer format - use stored HTML content
        const htmlContent = campaign.content;
        
        if (!htmlContent) {
          return c.json({ 
            code: 'VALIDATION_ERROR', 
            message: 'Campaign has no HTML content. Please save the design first.' 
          }, 400);
        }
        
        // Get sample context and substitute variables
        const sampleContext = EmailGenerationService.getSampleContext();
        subject = EmailGenerationService.substituteVariables(campaign.subject, sampleContext);
        
        // For now, return success - actual email sending would use Resend
        // This would integrate with CampaignSendService.sendTestEmail()
        return c.json({
          success: true,
          message: `Test email would be sent to ${email}`,
          subject,
          format: 'unlayer',
        });
      } else if (isLegacyFormat) {
        // Legacy format - generate content with sample data
        const legacyDesign = designJson as EmailBuilderState;
        
        if (!legacyDesign.blocks.length) {
          return c.json({ 
            code: 'VALIDATION_ERROR', 
            message: 'Campaign has no design content' 
          }, 400);
        }
        
        const sampleContext = MJMLGeneratorService.getSampleContext();
        subject = MJMLGeneratorService.substituteVariables(campaign.subject, sampleContext);
        
        // For now, return success - actual email sending would use Resend
        // This would integrate with CampaignSendService.sendTestEmail()
        return c.json({
          success: true,
          message: `Test email would be sent to ${email}`,
          subject,
          format: 'legacy',
        });
      } else {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Unrecognized design format' 
        }, 400);
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to send test email' }, 500);
    }
  });

// Mount campaign assets routes
app.route('/campaigns', campaignAssets);

// Campaign Attachments routes (for email file attachments)
const campaignAttachments = new Hono()
  // POST /api/campaigns/:id/attachments - Upload file attachment
  .post('/:id/attachments', requireAuth, uploadLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      
      // Check if campaign exists
      const campaign = await CampaignService.getById(campaignId);
      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      // Check if R2 is configured
      if (!R2StorageService.isConfigured()) {
        return c.json({ 
          code: 'SERVICE_UNAVAILABLE', 
          message: 'File storage is not configured' 
        }, 503);
      }
      
      // Parse multipart form data
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return c.json({ code: 'VALIDATION_ERROR', message: 'No file provided' }, 400);
      }
      
      // Allowed attachment types
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ];
      
      if (!allowedTypes.includes(file.type)) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid file type. Allowed: PDF, Word, Excel, CSV, TXT, and images' 
        }, 400);
      }
      
      // Max 25MB for attachments
      const maxSize = 25 * 1024 * 1024;
      if (file.size > maxSize) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'File too large. Maximum size is 25MB' 
        }, 400);
      }
      
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Upload to R2 with attachment context
      const uploadResult = await R2StorageService.uploadWithOptions(
        buffer,
        file.name,
        file.type,
        {
          context: 'campaign-attachment',
          referenceId: campaignId,
          contentDisposition: 'attachment',
        }
      );
      
      // Save attachment record to database
      const [attachment] = await db.insert(emailAttachments).values({
        campaignId,
        originalFilename: file.name,
        r2Key: uploadResult.key,
        publicUrl: uploadResult.publicUrl,
        fileSize: file.size,
        mimeType: file.type,
      }).returning();
      
      return c.json({
        id: attachment.id,
        filename: attachment.originalFilename,
        publicUrl: attachment.publicUrl,
        size: attachment.fileSize,
        mimeType: attachment.mimeType,
      }, 201);
    } catch (error) {
      console.error('Error uploading attachment:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to upload attachment' }, 500);
    }
  })
  // GET /api/campaigns/:id/attachments - List campaign attachments
  .get('/:id/attachments', requireAuth, readLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      
      // Check if campaign exists
      const campaign = await CampaignService.getById(campaignId);
      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      const attachments = await db.select().from(emailAttachments)
        .where(eq(emailAttachments.campaignId, campaignId));
      
      return c.json(attachments.map(a => ({
        id: a.id,
        filename: a.originalFilename,
        publicUrl: a.publicUrl,
        size: a.fileSize,
        mimeType: a.mimeType,
        createdAt: a.createdAt,
      })));
    } catch (error) {
      console.error('Error listing attachments:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list attachments' }, 500);
    }
  })
  // DELETE /api/campaigns/:id/attachments/:attachmentId - Delete attachment
  .delete('/:id/attachments/:attachmentId', requireAuth, writeLimiter, async (c) => {
    try {
      const campaignId = c.req.param('id');
      const attachmentId = c.req.param('attachmentId');
      
      // Get attachment
      const [attachment] = await db.select().from(emailAttachments)
        .where(eq(emailAttachments.id, attachmentId));
      
      if (!attachment || attachment.campaignId !== campaignId) {
        return c.json({ code: 'NOT_FOUND', message: 'Attachment not found' }, 404);
      }
      
      // Delete from R2
      try {
        await R2StorageService.delete(attachment.r2Key);
      } catch {
        // Continue even if R2 delete fails
        console.error('Failed to delete from R2:', attachment.r2Key);
      }
      
      // Delete from database
      await db.delete(emailAttachments).where(eq(emailAttachments.id, attachmentId));
      
      return c.json({ success: true, message: 'Attachment deleted' });
    } catch (error) {
      console.error('Error deleting attachment:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete attachment' }, 500);
    }
  });

// Mount campaign attachments routes
app.route('/campaigns', campaignAttachments);

// Guests routes
// Requirements: 2.1, 2.2, 2.3, 2.4
const guestsRoutes = new Hono()
  // GET /api/guests - List/search guests with pagination
  // Requirements: 2.4
  .get('/', requireAuth, readLimiter, async (c) => {
    try {
      const query = c.req.query('q') || '';
      const page = parseInt(c.req.query('page') || '1', 10);
      const pageSize = parseInt(c.req.query('pageSize') || '20', 10);
      
      // Validate pagination params
      const validPage = Math.max(1, page);
      const validPageSize = Math.min(100, Math.max(1, pageSize));
      
      const result = await GuestService.searchPaginated(query, validPage, validPageSize);
      return c.json(result);
    } catch (error) {
      console.error('Error listing guests:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list guests' }, 500);
    }
  })
  // POST /api/guests - Create guest
  // Requirements: 2.1
  .post('/', requireAuth, writeLimiter, zValidator('json', createGuestSchema), async (c) => {
    try {
      const input = c.req.valid('json');
      const guest = await GuestService.create(input);
      return c.json(guest, 201);
    } catch (error) {
      console.error('Error creating guest:', error);
      // Handle unique constraint violation (duplicate email)
      if (error instanceof Error && (error.message.includes('Unique constraint') || error.message.includes('unique'))) {
        return c.json({ code: 'DUPLICATE_ENTRY', message: 'A guest with this email already exists' }, 409);
      }
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create guest' }, 500);
    }
  })
  // GET /api/guests/:id - Get guest by ID
  // Requirements: 2.1
  .get('/:id', requireAuth, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const guest = await GuestService.getById(id);
      
      if (!guest) {
        return c.json({ code: 'NOT_FOUND', message: 'Guest not found' }, 404);
      }
      
      return c.json(guest);
    } catch (error) {
      console.error('Error getting guest:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get guest' }, 500);
    }
  })
  // PUT /api/guests/:id - Update guest
  // Requirements: 2.1
  .put('/:id', requireAuth, writeLimiter, zValidator('json', updateGuestSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      
      // Check if guest exists
      const existingGuest = await GuestService.getById(id);
      if (!existingGuest) {
        return c.json({ code: 'NOT_FOUND', message: 'Guest not found' }, 404);
      }
      
      const guest = await GuestService.update(id, input);
      return c.json(guest);
    } catch (error) {
      console.error('Error updating guest:', error);
      // Handle unique constraint violation (duplicate email)
      if (error instanceof Error && (error.message.includes('Unique constraint') || error.message.includes('unique'))) {
        return c.json({ code: 'DUPLICATE_ENTRY', message: 'A guest with this email already exists' }, 409);
      }
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update guest' }, 500);
    }
  })
  // POST /api/guests/import - Import from CSV
  // Requirements: 2.2
  .post('/import', requireAuth, sensitiveLimiter, async (c) => {
    try {
      const body = await c.req.text();
      
      if (!body || body.trim() === '') {
        return c.json({ code: 'VALIDATION_ERROR', message: 'CSV data is required' }, 400);
      }
      
      const result = await GuestService.importFromCSV(body);
      return c.json(result, 200);
    } catch (error) {
      console.error('Error importing guests:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to import guests' }, 500);
    }
  })
  // POST /api/guests/bulk-import - Bulk import from JSON
  // Requirements: 8
  .post('/bulk-import', requireAuth, sensitiveLimiter, zValidator('json', z.object({
    guests: z.array(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      mobile: z.string().optional(),
      company: z.string().optional(),
      jobTitle: z.string().optional(),
      photoUrl: z.string().optional(),
    })),
    options: z.object({
      duplicateHandling: z.enum(['skip', 'update', 'create_new']).default('update'),
      eventId: z.string().optional(),
    }),
  })), async (c) => {
    try {
      const { guests: guestsData, options } = c.req.valid('json');
      
      // Import the bulkImportGuests function dynamically to avoid circular deps
      const { bulkImportGuests } = await import('@/lib/services/guest-service');
      
      const result = await bulkImportGuests(guestsData, options);
      return c.json(result, 200);
    } catch (error) {
      console.error('Error bulk importing guests:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to import guests' }, 500);
    }
  });

// Mount guest routes
app.route('/guests', guestsRoutes);

// RSVP routes (public endpoints for guest RSVP)
// Requirements: 5.1, 5.2, 5.6
const rsvpStatusSchema = z.object({
  status: z.enum(['Attending', 'NotAttending'], {
    error: 'Invalid RSVP status. Must be one of: Attending, NotAttending',
  }),
  representingCompany: z.boolean().optional(),
  companyRepresented: z.string().optional(),
  updatedMobile: z.string().optional(),
  deviceInfo: z.object({
    screenWidth: z.number(),
    screenHeight: z.number(),
    language: z.string(),
    platform: z.string(),
    timezone: z.string(),
    touchSupport: z.boolean(),
  }).optional(),
});

const rsvp = new Hono()
  // GET /api/rsvp/:token - Get RSVP page data
  // Requirements: 5.1 - Display event details and response options
  .get('/:token', publicLimiter, async (c) => {
    try {
      const token = c.req.param('token');
      
      if (!token) {
        return c.json({ code: 'VALIDATION_ERROR', message: 'Token is required' }, 400);
      }
      
      // Get EventGuest by QR token
      const eventGuest = await EventGuestService.getByQRToken(token);
      
      // Requirement 5.6: Invalid or expired RSVP link should display error
      if (!eventGuest) {
        return c.json({ code: 'INVALID_TOKEN', message: 'Invalid or expired RSVP link' }, 404);
      }
      
      // Return event details and current RSVP status
      // Requirement 5.1: Display event name, date, time, location, description
      return c.json({
        eventGuest: {
          id: eventGuest.id,
          rsvpStatus: eventGuest.rsvpStatus,
          qrToken: eventGuest.qrToken,
          representingCompany: eventGuest.representingCompany,
          companyRepresented: eventGuest.companyRepresented,
          updatedMobile: eventGuest.updatedMobile,
        },
        guest: {
          id: eventGuest.guest.id,
          firstName: eventGuest.guest.firstName,
          lastName: eventGuest.guest.lastName,
          email: eventGuest.guest.email,
          mobile: eventGuest.guest.mobile,
          company: eventGuest.guest.company,
        },
        event: {
          id: eventGuest.event.id,
          name: eventGuest.event.name,
          type: eventGuest.event.type,
          description: eventGuest.event.description,
          startDate: eventGuest.event.startDate,
          endDate: eventGuest.event.endDate,
          location: eventGuest.event.location,
        },
      });
    } catch (error) {
      console.error('Error getting RSVP data:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get RSVP data' }, 500);
    }
  })
  // POST /api/rsvp/:token - Submit RSVP response
  // Requirements: 5.2 - Update EventGuest record with selected status
  .post('/:token', publicLimiter, zValidator('json', rsvpStatusSchema), async (c) => {
    try {
      const token = c.req.param('token');
      const { status, representingCompany, companyRepresented, updatedMobile, deviceInfo } = c.req.valid('json');
      
      if (!token) {
        return c.json({ code: 'VALIDATION_ERROR', message: 'Token is required' }, 400);
      }
      
      // Capture IP address and user agent for analytics
      const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() 
        || c.req.header('x-real-ip') 
        || c.req.header('cf-connecting-ip') // Cloudflare
        || 'unknown';
      const userAgent = c.req.header('user-agent') || 'unknown';
      
      // Update RSVP status with additional form data
      // This also triggers badge generation if status is "Attending" (Requirement 5.3)
      const eventGuest = await EventGuestService.updateRSVP(token, status, {
        representingCompany,
        companyRepresented,
        updatedMobile,
        ipAddress,
        userAgent,
        deviceInfo,
      });
      
      // Get badge and QR data if status is Attending
      let badge = null;
      let qrDataUrl = null;
      if (status === 'Attending') {
        const badgeData = await RSVPConfirmationService.getBadgeDisplayData(eventGuest.id);
        badge = badgeData.badge;
        qrDataUrl = badgeData.qrDataUrl;
      }
      
      // Send confirmation email (async, don't wait for result)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}`;
      RSVPConfirmationService.sendConfirmation(eventGuest.id, status, baseUrl)
        .then((result) => {
          if (result.emailSent) {
            console.log(`RSVP confirmation email sent to ${eventGuest.guest?.email || eventGuest.id}`);
          } else if (result.error) {
            console.warn(`Failed to send RSVP confirmation: ${result.error}`);
          }
        })
        .catch((err) => {
          console.error('Error sending RSVP confirmation:', err);
        });
      
      return c.json({
        success: true,
        message: `RSVP updated to ${status}`,
        eventGuest: {
          id: eventGuest.id,
          rsvpStatus: eventGuest.rsvpStatus,
          updatedAt: eventGuest.updatedAt,
        },
        badge: badge ? {
          id: badge.id,
          qrToken: badge.qrToken,
          generatedAt: badge.generatedAt,
          qrDataUrl, // Include QR code data URL for immediate display
        } : null,
      });
    } catch (error) {
      console.error('Error submitting RSVP:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Invalid QR token') {
          return c.json({ code: 'INVALID_TOKEN', message: 'Invalid or expired RSVP link' }, 404);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to submit RSVP' }, 500);
    }
  });

// Mount RSVP routes
app.route('/rsvp', rsvp);

// Check-In routes
// Requirements: 7.1, 7.2, 7.3, 7.5
const checkInSchema = z.object({
  qrToken: z.string().min(1, 'QR token is required'),
});

const lookupSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  query: z.string().min(1, 'Search query is required'),
});

const checkin = new Hono()
  // POST /api/checkin - Check in by QR token
  // Requirements: 7.1, 7.2, 7.4, 7.5
  .post('/', publicLimiter, zValidator('json', checkInSchema), async (c) => {
    try {
      const { qrToken } = c.req.valid('json');
      
      // Perform check-in
      const result = await EventGuestService.checkIn(qrToken);
      
      // Requirement 7.2: Display warning if already checked in
      if (result.alreadyCheckedIn) {
        return c.json({
          success: true,
          alreadyCheckedIn: true,
          message: 'Guest was previously checked in',
          previousCheckInTime: result.previousCheckInTime,
          guest: {
            id: result.eventGuest.guest.id,
            firstName: result.eventGuest.guest.firstName,
            lastName: result.eventGuest.guest.lastName,
            email: result.eventGuest.guest.email,
            company: result.eventGuest.guest.company,
          },
          event: {
            id: result.eventGuest.event.id,
            name: result.eventGuest.event.name,
          },
        });
      }
      
      // Requirement 7.1: Display guest information and mark as checked-in
      return c.json({
        success: true,
        alreadyCheckedIn: false,
        message: 'Guest checked in successfully',
        checkInTime: result.eventGuest.checkInTime,
        guest: {
          id: result.eventGuest.guest.id,
          firstName: result.eventGuest.guest.firstName,
          lastName: result.eventGuest.guest.lastName,
          email: result.eventGuest.guest.email,
          company: result.eventGuest.guest.company,
        },
        event: {
          id: result.eventGuest.event.id,
          name: result.eventGuest.event.name,
        },
      });
    } catch (error) {
      console.error('Error checking in guest:', error);
      
      // Requirement 7.5: Invalid QR code should display error
      if (error instanceof Error) {
        if (error.message === 'Invalid QR token') {
          return c.json({ code: 'INVALID_TOKEN', message: 'Invalid QR code' }, 404);
        }
        if (error.message === 'QR token is required') {
          return c.json({ code: 'VALIDATION_ERROR', message: 'QR token is required' }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to check in guest' }, 500);
    }
  })
  // GET /api/checkin/lookup - Manual guest lookup
  // Requirements: 7.3 - Provide manual guest lookup by name or email
  .get('/lookup', publicLimiter, async (c) => {
    try {
      const eventId = c.req.query('eventId');
      const query = c.req.query('query');
      
      if (!eventId) {
        return c.json({ code: 'VALIDATION_ERROR', message: 'Event ID is required' }, 400);
      }
      
      if (!query) {
        return c.json({ code: 'VALIDATION_ERROR', message: 'Search query is required' }, 400);
      }
      
      // Verify event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      // Get all guests for the event
      const eventGuests = await EventGuestService.getEventGuests(eventId);
      
      // Filter by name or email (case-insensitive)
      const searchLower = query.toLowerCase();
      const matchingGuests = eventGuests.filter((eg) => {
        const fullName = `${eg.guest.firstName} ${eg.guest.lastName}`.toLowerCase();
        const email = eg.guest.email.toLowerCase();
        return fullName.includes(searchLower) || email.includes(searchLower);
      });
      
      // Return matching guests with their check-in status
      return c.json({
        event: {
          id: event.id,
          name: event.name,
        },
        guests: matchingGuests.map((eg) => ({
          eventGuestId: eg.id,
          qrToken: eg.qrToken,
          checkInStatus: eg.checkInStatus,
          checkInTime: eg.checkInTime,
          rsvpStatus: eg.rsvpStatus,
          guest: {
            id: eg.guest.id,
            firstName: eg.guest.firstName,
            lastName: eg.guest.lastName,
            email: eg.guest.email,
            company: eg.guest.company,
          },
        })),
        totalMatches: matchingGuests.length,
      });
    } catch (error) {
      console.error('Error looking up guest:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to lookup guest' }, 500);
    }
  });

// Mount check-in routes
app.route('/checkin', checkin);

// Automation routes
// Requirements: 6.1, 6.2, 6.3, 6.4
const automationsRoutes = new Hono()
  // GET /api/automations/event/:eventId - List automations for an event
  // Requirements: 6.1
  .get('/event/:eventId', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('eventId');
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const automationList = await AutomationService.getByEvent(eventId);
      return c.json(automationList);
    } catch (error) {
      console.error('Error listing automations:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list automations' }, 500);
    }
  })
  // POST /api/automations/event/:eventId - Create automation for an event
  // Requirements: 6.1, 8.1
  .post('/event/:eventId', requireAuth, writeLimiter, zValidator('json', createAutomationSchema), async (c) => {
    try {
      const eventId = c.req.param('eventId');
      const input = c.req.valid('json');
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const automation = await AutomationService.create(eventId, input);
      return c.json(automation, 201);
    } catch (error) {
      console.error('Error creating automation:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create automation' }, 500);
    }
  })
  // GET /api/automations/:id - Get automation by ID
  // Requirements: 6.1
  .get('/:id', requireAuth, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const automation = await AutomationService.getById(id);
      
      if (!automation) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      return c.json(automation);
    } catch (error) {
      console.error('Error getting automation:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get automation' }, 500);
    }
  })
  // PUT /api/automations/:id - Update automation
  // Requirements: 6.4
  .put('/:id', requireAuth, writeLimiter, zValidator('json', updateAutomationSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      
      // Check if automation exists
      const existing = await AutomationService.getById(id);
      if (!existing) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      const automation = await AutomationService.update(id, input);
      return c.json(automation);
    } catch (error) {
      console.error('Error updating automation:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update automation' }, 500);
    }
  })
  // DELETE /api/automations/:id - Delete automation
  // Requirements: 6.4
  .delete('/:id', requireAuth, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      
      // Check if automation exists
      const existing = await AutomationService.getById(id);
      if (!existing) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      await AutomationService.delete(id);
      return c.json({ success: true, message: 'Automation deleted successfully' });
    } catch (error) {
      console.error('Error deleting automation:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete automation' }, 500);
    }
  })
  // POST /api/automations/:id/duplicate - Duplicate automation
  // Requirements: 6.3
  .post('/:id/duplicate', requireAuth, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      
      // Check if automation exists
      const existing = await AutomationService.getById(id);
      if (!existing) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      const duplicated = await AutomationService.duplicate(id);
      return c.json(duplicated, 201);
    } catch (error) {
      console.error('Error duplicating automation:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to duplicate automation' }, 500);
    }
  })
  // POST /api/automations/:id/status - Toggle automation status
  // Requirements: 6.2, 6.5
  .post('/:id/status', requireAuth, writeLimiter, zValidator('json', z.object({ status: z.enum(['Draft', 'Active', 'Paused']) })), async (c) => {
    try {
      const id = c.req.param('id');
      const { status } = c.req.valid('json');
      
      // Check if automation exists
      const existing = await AutomationService.getById(id);
      if (!existing) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      const automation = await AutomationService.setStatus(id, status);
      return c.json(automation);
    } catch (error) {
      console.error('Error updating automation status:', error);
      
      if (error instanceof Error) {
        // Handle validation errors when trying to activate invalid automation
        if (error.message.startsWith('Cannot activate automation:')) {
          return c.json({ 
            code: 'CANNOT_ACTIVATE', 
            message: error.message 
          }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update automation status' }, 500);
    }
  })
  // GET /api/automations/:id/executions - List executions for an automation
  // Requirements: 7.2
  .get('/:id/executions', requireAuth, readLimiter, async (c) => {
    try {
      const automationId = c.req.param('id');
      const limit = parseInt(c.req.query('limit') || '100', 10);
      const offset = parseInt(c.req.query('offset') || '0', 10);
      
      // Check if automation exists
      const existing = await AutomationService.getById(automationId);
      if (!existing) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      const result = await ExecutionService.getByAutomation(automationId, { limit, offset });
      return c.json(result);
    } catch (error) {
      console.error('Error listing executions:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list executions' }, 500);
    }
  })
  // GET /api/automations/:id/executions/:executionId - Get execution details
  // Requirements: 7.3
  .get('/:id/executions/:executionId', requireAuth, readLimiter, async (c) => {
    try {
      const automationId = c.req.param('id');
      const executionId = c.req.param('executionId');
      
      // Check if automation exists
      const existing = await AutomationService.getById(automationId);
      if (!existing) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      const execution = await ExecutionService.getById(executionId);
      
      if (!execution) {
        return c.json({ code: 'NOT_FOUND', message: 'Execution not found' }, 404);
      }
      
      // Verify execution belongs to the automation
      if (execution.automationId !== automationId) {
        return c.json({ code: 'NOT_FOUND', message: 'Execution not found' }, 404);
      }
      
      return c.json(execution);
    } catch (error) {
      console.error('Error getting execution:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get execution' }, 500);
    }
  })
  // POST /api/automations/:id/executions/:executionId/sync - Sync execution status from Trigger.dev
  // Requirements: 10.6
  .post('/:id/executions/:executionId/sync', requireAuth, writeLimiter, async (c) => {
    try {
      const automationId = c.req.param('id');
      const executionId = c.req.param('executionId');
      
      // Check if automation exists
      const existing = await AutomationService.getById(automationId);
      if (!existing) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      // Check if execution exists and belongs to automation
      const execution = await ExecutionService.getById(executionId);
      if (!execution) {
        return c.json({ code: 'NOT_FOUND', message: 'Execution not found' }, 404);
      }
      
      if (execution.automationId !== automationId) {
        return c.json({ code: 'NOT_FOUND', message: 'Execution not found' }, 404);
      }
      
      // Sync status from Trigger.dev
      const { ExecutionStatusSyncService } = await import('@/lib/services/execution-status-sync-service');
      const result = await ExecutionStatusSyncService.syncByExecutionId(executionId);
      
      if (!result) {
        return c.json({ code: 'NOT_FOUND', message: 'Execution has no Trigger.dev run ID' }, 404);
      }
      
      return c.json(result);
    } catch (error) {
      console.error('Error syncing execution status:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to sync execution status' }, 500);
    }
  })
  // POST /api/automations/:id/executions/sync - Sync all running executions for an automation
  // Requirements: 10.6
  .post('/:id/executions/sync', requireAuth, writeLimiter, async (c) => {
    try {
      const automationId = c.req.param('id');
      
      // Check if automation exists
      const existing = await AutomationService.getById(automationId);
      if (!existing) {
        return c.json({ code: 'NOT_FOUND', message: 'Automation not found' }, 404);
      }
      
      // Sync all running executions
      const { ExecutionStatusSyncService } = await import('@/lib/services/execution-status-sync-service');
      const result = await ExecutionStatusSyncService.syncRunningExecutions(automationId);
      
      return c.json(result);
    } catch (error) {
      console.error('Error syncing execution statuses:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to sync execution statuses' }, 500);
    }
  });

// Mount automation routes
app.route('/automations', automationsRoutes);

// Automation Templates routes
// Requirements: 5.1, 5.2, 5.3
const automationTemplatesRoutes = new Hono()
  // GET /api/automation-templates - List all templates
  // Requirements: 5.1
  .get('/', requireAuth, readLimiter, async (c) => {
    try {
      const templates = TemplateService.getAll();
      return c.json(templates);
    } catch (error) {
      console.error('Error listing templates:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list templates' }, 500);
    }
  })
  // GET /api/automation-templates/:id - Get template by ID
  // Requirements: 5.2
  .get('/:id', requireAuth, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const template = TemplateService.getById(id);
      
      if (!template) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      
      return c.json(template);
    } catch (error) {
      console.error('Error getting template:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get template' }, 500);
    }
  })
  // POST /api/automation-templates/:id/import/:eventId - Import template to event
  // Requirements: 5.3
  .post('/:id/import/:eventId', requireAuth, writeLimiter, async (c) => {
    try {
      const templateId = c.req.param('id');
      const eventId = c.req.param('eventId');
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      // Check if template exists
      const template = TemplateService.getById(templateId);
      if (!template) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      
      const automation = await TemplateService.importToEvent(templateId, eventId);
      return c.json(automation, 201);
    } catch (error) {
      console.error('Error importing template:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Template not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to import template' }, 500);
    }
  });

// Mount automation templates routes
app.route('/automation-templates', automationTemplatesRoutes);

// Guest Tags routes
// Requirements: 2.4, 4.4
const createGuestTagSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required'),
  color: z.string().optional(),
});

const guestTagsRoutes = new Hono()
  // GET /api/guest-tags/event/:eventId - List tags for an event
  // Requirements: 2.4
  .get('/event/:eventId', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('eventId');
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const tags = await db.select().from(guestTags).where(eq(guestTags.eventId, eventId));
      return c.json(tags);
    } catch (error) {
      console.error('Error listing guest tags:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list guest tags' }, 500);
    }
  })
  // POST /api/guest-tags/event/:eventId - Create tag for an event
  // Requirements: 4.4
  .post('/event/:eventId', requireAuth, writeLimiter, zValidator('json', createGuestTagSchema), async (c) => {
    try {
      const eventId = c.req.param('eventId');
      const input = c.req.valid('json');
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const [tag] = await db.insert(guestTags).values({
        eventId,
        name: input.name,
        color: input.color || '#B8956B',
      }).returning();
      
      return c.json(tag, 201);
    } catch (error) {
      console.error('Error creating guest tag:', error);
      
      // Handle unique constraint violation (duplicate tag name for event)
      if (error instanceof Error && (error.message.includes('Unique constraint') || error.message.includes('unique') || error.message.includes('duplicate'))) {
        return c.json({ code: 'DUPLICATE_ENTRY', message: 'A tag with this name already exists for this event' }, 409);
      }
      
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create guest tag' }, 500);
    }
  })
  // DELETE /api/guest-tags/:id - Delete a tag
  // Requirements: 4.4
  .delete('/:id', requireAuth, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      
      // Check if tag exists
      const [existingTag] = await db.select().from(guestTags).where(eq(guestTags.id, id));
      if (!existingTag) {
        return c.json({ code: 'NOT_FOUND', message: 'Tag not found' }, 404);
      }
      
      await db.delete(guestTags).where(eq(guestTags.id, id));
      return c.json({ success: true, message: 'Tag deleted successfully' });
    } catch (error) {
      console.error('Error deleting guest tag:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete guest tag' }, 500);
    }
  });

// Mount guest tags routes
app.route('/guest-tags', guestTagsRoutes);

// ============================================================================
// EVENT MANAGER ROUTES (Admin only)
// Requirements: 3.1, 3.2, 3.3, 3.4
// ============================================================================

const eventManagersRoutes = new Hono()
  // GET /api/event-managers - List all event managers
  // Requirements: 3.1
  .get('/', requireAdmin, readLimiter, async (c) => {
    try {
      const search = c.req.query('search');
      const status = c.req.query('status') as 'Active' | 'Suspended' | 'Deactivated' | undefined;
      const sortBy = c.req.query('sortBy') as 'name' | 'email' | 'createdAt' | 'assignedEventCount' | undefined;
      const sortOrder = c.req.query('sortOrder') as 'asc' | 'desc' | undefined;
      
      const managers = await EventManagerService.list({
        search,
        status,
        sortBy,
        sortOrder,
      });
      
      return c.json(managers);
    } catch (error) {
      console.error('Error listing event managers:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list event managers' }, 500);
    }
  })
  // POST /api/event-managers - Create event manager
  // Requirements: 3.2
  .post('/', requireAdmin, writeLimiter, zValidator('json', createEventManagerSchema), async (c) => {
    try {
      const input = c.req.valid('json');
      const manager = await EventManagerService.create(input);
      return c.json(manager, 201);
    } catch (error) {
      console.error('Error creating event manager:', error);
      
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      
      if (error instanceof Error) {
        if (error.message === 'Email already exists') {
          return c.json({ code: 'DUPLICATE_ENTRY', message: 'A user with this email already exists' }, 409);
        }
        if (error.message.includes('required') || error.message.includes('validation')) {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create event manager' }, 500);
    }
  })
  // GET /api/event-managers/:id - Get event manager by ID
  // Requirements: 3.3
  .get('/:id', requireAdmin, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const manager = await EventManagerService.getById(id);
      
      if (!manager) {
        return c.json({ code: 'NOT_FOUND', message: 'Event manager not found' }, 404);
      }
      
      return c.json(manager);
    } catch (error) {
      console.error('Error getting event manager:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get event manager' }, 500);
    }
  })
  // PATCH /api/event-managers/:id - Update event manager
  // Requirements: 3.4
  .patch('/:id', requireAdmin, writeLimiter, zValidator('json', updateEventManagerSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      
      // Check if manager exists
      const existingManager = await EventManagerService.getById(id);
      if (!existingManager) {
        return c.json({ code: 'NOT_FOUND', message: 'Event manager not found' }, 404);
      }
      
      const manager = await EventManagerService.update(id, input);
      return c.json(manager);
    } catch (error) {
      console.error('Error updating event manager:', error);
      
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event manager not found' }, 404);
        }
        if (error.message === 'Email already exists') {
          return c.json({ code: 'DUPLICATE_ENTRY', message: 'A user with this email already exists' }, 409);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update event manager' }, 500);
    }
  })
  // POST /api/event-managers/:id/suspend - Suspend event manager
  // Requirements: 4.2
  .post('/:id/suspend', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      
      const manager = await EventManagerService.suspend(id);
      return c.json({
        success: true,
        message: 'Event manager suspended successfully',
        manager,
      });
    } catch (error) {
      console.error('Error suspending event manager:', error);
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event manager not found' }, 404);
        }
        if (error.message === 'User is already suspended') {
          return c.json({ code: 'INVALID_STATE', message: error.message }, 400);
        }
        if (error.message === 'Cannot suspend a deactivated user') {
          return c.json({ code: 'INVALID_STATE', message: error.message }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to suspend event manager' }, 500);
    }
  })
  // POST /api/event-managers/:id/reactivate - Reactivate event manager
  // Requirements: 4.3
  .post('/:id/reactivate', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      
      const manager = await EventManagerService.reactivate(id);
      return c.json({
        success: true,
        message: 'Event manager reactivated successfully',
        manager,
      });
    } catch (error) {
      console.error('Error reactivating event manager:', error);
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event manager not found' }, 404);
        }
        if (error.message === 'User is already active') {
          return c.json({ code: 'INVALID_STATE', message: error.message }, 400);
        }
        if (error.message === 'Cannot reactivate a deactivated user') {
          return c.json({ code: 'INVALID_STATE', message: error.message }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to reactivate event manager' }, 500);
    }
  })
  // POST /api/event-managers/:id/deactivate - Deactivate event manager with transfer
  // Requirements: 4.4, 4.6
  .post('/:id/deactivate', requireAdmin, sensitiveLimiter, zValidator('json', z.object({
    transferToUserId: z.string().optional(),
  }).optional()), async (c) => {
    try {
      const id = c.req.param('id');
      const body = c.req.valid('json');
      const transferToUserId = body?.transferToUserId;
      
      await EventManagerService.deactivate(id, transferToUserId);
      return c.json({
        success: true,
        message: 'Event manager deactivated successfully',
      });
    } catch (error) {
      console.error('Error deactivating event manager:', error);
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event manager not found' }, 404);
        }
        if (error.message === 'User is already deactivated') {
          return c.json({ code: 'INVALID_STATE', message: error.message }, 400);
        }
        if (error.message === 'Transfer destination required for user with assigned events') {
          return c.json({ code: 'TRANSFER_REQUIRED', message: error.message }, 400);
        }
        if (error.message === 'Transfer destination user not found') {
          return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
        }
        if (error.message === 'Cannot transfer to inactive user') {
          return c.json({ code: 'INVALID_STATE', message: error.message }, 400);
        }
        if (error.message === 'Cannot transfer events to the same user') {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to deactivate event manager' }, 500);
    }
  })
  // PATCH /api/event-managers/:id/permissions - Update event manager permissions
  // Requirements: 2.3
  .patch('/:id/permissions', requireAdmin, writeLimiter, zValidator('json', updatePermissionsSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const permissions = c.req.valid('json');
      
      const updatedPermissions = await EventManagerService.updatePermissions(id, permissions);
      return c.json({
        success: true,
        message: 'Permissions updated successfully',
        permissions: updatedPermissions,
      });
    } catch (error) {
      console.error('Error updating permissions:', error);
      
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event manager not found' }, 404);
        }
        if (error.message === 'Cannot modify permissions for Admin users') {
          return c.json({ code: 'FORBIDDEN', message: error.message }, 403);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update permissions' }, 500);
    }
  });

// Mount event managers routes
app.route('/event-managers', eventManagersRoutes);

// ============================================================================
// EVENT ASSIGNMENT ROUTES (Admin only)
// Requirements: 5.1, 5.2, 5.3, 5.4
// ============================================================================

const eventAssignmentRoutes = new Hono()
  // GET /api/events/:id/assignment - Get event assignment
  // Requirements: 5.2
  .get('/:id/assignment', requireAdmin, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const assignment = await EventAssignmentService.getAssignment(eventId);
      
      if (!assignment) {
        return c.json({ code: 'NOT_FOUND', message: 'Event is not assigned to any user' }, 404);
      }
      
      return c.json(assignment);
    } catch (error) {
      console.error('Error getting event assignment:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get event assignment' }, 500);
    }
  })
  // POST /api/events/:id/assignment - Assign or transfer event
  // Requirements: 5.1, 5.3, 5.4
  .post('/:id/assignment', requireAdmin, writeLimiter, zValidator('json', z.object({
    userId: z.string().min(1, 'User ID is required'),
  })), async (c) => {
    try {
      const eventId = c.req.param('id');
      const { userId } = c.req.valid('json');
      const adminId = getUserIdFromRequest(c);
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      // Check if event is already assigned
      const existingAssignment = await EventAssignmentService.getAssignment(eventId);
      
      let assignment;
      if (existingAssignment) {
        // Transfer the event
        assignment = await EventAssignmentService.transferEvent(eventId, userId, adminId);
        return c.json({
          success: true,
          message: 'Event transferred successfully',
          assignment,
        });
      } else {
        // Create new assignment
        assignment = await EventAssignmentService.assignEvent(eventId, userId, adminId);
        return c.json({
          success: true,
          message: 'Event assigned successfully',
          assignment,
        }, 201);
      }
    } catch (error) {
      console.error('Error assigning event:', error);
      
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      
      if (error instanceof Error) {
        if (error.message === 'Event not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
        }
        if (error.message === 'User not found' || error.message === 'Target user not found') {
          return c.json({ code: 'NOT_FOUND', message: 'User not found' }, 404);
        }
        if (error.message === 'Cannot assign event to inactive user' || error.message === 'Cannot transfer event to inactive user') {
          return c.json({ code: 'INVALID_STATE', message: error.message }, 400);
        }
        if (error.message === 'User must be Admin or EventManager to be assigned events' || error.message === 'Target user must be Admin or EventManager') {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to assign event' }, 500);
    }
  });

// Mount event assignment routes under /events
app.route('/events', eventAssignmentRoutes);

// GET /api/assignable-users - List users who can be assigned events
// Requirements: 5.2
app.get('/assignable-users', requireAdmin, readLimiter, async (c) => {
  try {
    const users = await EventAssignmentService.getAssignableUsers();
    return c.json(users);
  } catch (error) {
    console.error('Error listing assignable users:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list assignable users' }, 500);
  }
});

// ============================================================================
// GUEST PHOTO ROUTES
// Requirements: 8.2, 8.3
// ============================================================================

const guestPhotoRoutes = new Hono()
  // POST /api/guests/:id/photo - Upload guest photo
  // Requirements: 8.2, 8.3
  .post('/:id/photo', requireAuth, uploadLimiter, async (c) => {
    try {
      const guestId = c.req.param('id');
      
      // Check if R2 is configured
      if (!GuestPhotoService.isConfigured()) {
        return c.json({ 
          code: 'SERVICE_UNAVAILABLE', 
          message: 'Photo storage is not configured' 
        }, 503);
      }
      
      // Parse multipart form data
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return c.json({ code: 'VALIDATION_ERROR', message: 'No file provided' }, 400);
      }
      
      // Validate file
      const validation = GuestPhotoService.validateFile({
        mimeType: file.type,
        size: file.size,
      });
      
      if (!validation.valid) {
        return c.json({ code: 'VALIDATION_ERROR', message: validation.error }, 400);
      }
      
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Upload photo
      const photo = await GuestPhotoService.upload(guestId, buffer, file.name, file.type);
      
      return c.json({
        id: photo.id,
        publicUrl: photo.publicUrl,
        width: photo.width,
        height: photo.height,
        fileSize: photo.fileSize,
      }, 201);
    } catch (error) {
      console.error('Error uploading guest photo:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Guest not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Guest not found' }, 404);
        }
        if (error.message.includes('Invalid file type') || error.message.includes('File size exceeds')) {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to upload photo' }, 500);
    }
  })
  // DELETE /api/guests/:id/photo - Delete guest photo
  // Requirements: 8.3
  .delete('/:id/photo', requireAuth, writeLimiter, async (c) => {
    try {
      const guestId = c.req.param('id');
      
      await GuestPhotoService.delete(guestId);
      
      return c.json({
        success: true,
        message: 'Photo deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting guest photo:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Photo not found') {
          return c.json({ code: 'NOT_FOUND', message: 'Photo not found' }, 404);
        }
      }
      
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete photo' }, 500);
    }
  })
  // GET /api/guests/:id/photo - Get guest photo
  // Requirements: 8.3
  .get('/:id/photo', readLimiter, async (c) => {
    try {
      const guestId = c.req.param('id');
      
      const photo = await GuestPhotoService.getByGuestId(guestId);
      
      if (!photo) {
        return c.json({ code: 'NOT_FOUND', message: 'Photo not found' }, 404);
      }
      
      return c.json(photo);
    } catch (error) {
      console.error('Error getting guest photo:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get photo' }, 500);
    }
  });

// Mount guest photo routes under /guests
app.route('/guests', guestPhotoRoutes);

// ============================================================================
// STATISTICS ROUTES
// Requirements: 6.2, 6.3, 7.5
// ============================================================================

const statisticsRoutes = new Hono()
  // GET /api/events/:id/statistics - Get event statistics
  // Requirements: 6.2, 6.3
  .get('/:id/statistics', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const stats = await StatisticsService.getEventStats(eventId);
      return c.json(stats);
    } catch (error) {
      console.error('Error getting event statistics:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get event statistics' }, 500);
    }
  })
  // GET /api/events/:id/presentation-stats - Get presentation mode statistics
  // Requirements: 7.5
  .get('/:id/presentation-stats', requireAuth, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      
      // Check if event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      const stats = await StatisticsService.getPresentationStats(eventId);
      return c.json(stats);
    } catch (error) {
      console.error('Error getting presentation statistics:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get presentation statistics' }, 500);
    }
  });

// Mount statistics routes under /events
app.route('/events', statisticsRoutes);

// GET /api/dashboard-stats - Get dashboard statistics
// Requirements: 6.2
app.get('/dashboard-stats', requireAuth, readLimiter, async (c) => {
  try {
    const userId = getUserIdFromRequest(c);
    const stats = await StatisticsService.getDashboardStatsForUser(userId);
    return c.json(stats);
  } catch (error) {
    console.error('Error getting dashboard statistics:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get dashboard statistics' }, 500);
  }
});

// ============================================================================
// USER AUTHORIZATION ROUTES
// Requirements: 2.4, 6.4
// ============================================================================

// GET /api/me - Get current user's role and permissions
// Requirements: 2.4, 6.4
app.get('/me', requireAuth, readLimiter, async (c) => {
  try {
    const userId = getUserIdFromRequest(c);
    
    // Get user role
    const role = await AuthorizationService.getRole(userId);
    if (!role) {
      return c.json({ code: 'NOT_FOUND', message: 'User not found' }, 404);
    }
    
    // Get permissions (only for EventManagers)
    const permissions = role === 'EventManager' 
      ? await AuthorizationService.getPermissions(userId)
      : null;
    
    return c.json({
      userId,
      role,
      permissions,
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get user info' }, 500);
  }
});

// GET /api/me/can-access/:eventId - Check if user can access an event
// Requirements: 6.4
app.get('/me/can-access/:eventId', requireAuth, readLimiter, async (c) => {
  try {
    const userId = getUserIdFromRequest(c);
    const eventId = c.req.param('eventId');
    
    const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
    
    return c.json({ canAccess });
  } catch (error) {
    console.error('Error checking event access:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to check event access' }, 500);
  }
});

// ============================================================================
// ADMIN AUTHORIZATION ROUTES
// Requirements: 1.1, 1.4, 1.5
// ============================================================================

// GET /api/admin/verify - Verify if current user is an admin
// Requirements: 1.1, 1.4
app.get('/admin/verify', requireAuth, readLimiter, async (c) => {
  try {
    const userId = getUserIdFromRequest(c);
    
    // Get user role
    const role = await AuthorizationService.getRole(userId);
    if (!role) {
      return c.json({
        isAdmin: false,
        userId: null,
        role: null,
        error: 'User not found',
      });
    }
    
    const isAdmin = role === 'Admin';
    
    return c.json({
      isAdmin,
      userId,
      role,
      error: isAdmin ? undefined : 'User does not have admin role',
    });
  } catch (error) {
    console.error('Error verifying admin status:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to verify admin status' }, 500);
  }
});

// GET /api/admin/me - Get admin user info (only for admins)
// Requirements: 1.5
app.get('/admin/me', requireAdmin, readLimiter, async (c) => {
  try {
    const userId = getUserIdFromRequest(c);
    
    // Get full user info
    const foundUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
    
    if (!foundUser) {
      return c.json({ code: 'NOT_FOUND', message: 'User not found' }, 404);
    }
    
    return c.json({
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      role: foundUser.role,
    });
  } catch (error) {
    console.error('Error getting admin info:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get admin info' }, 500);
  }
});

// ============================================================================
// ADMIN CAMPAIGNS ROUTES
// Requirements: 3, 11
// ============================================================================

// Zod schema for admin campaign filters
const adminCampaignFiltersSchema = z.object({
  status: z.enum(['Draft', 'Scheduled', 'Queued', 'Sending', 'Sent', 'Paused', 'Cancelled']).optional(),
  type: z.enum(['Invitation', 'Reminder', 'LastChance', 'EventDayInfo', 'ThankYou', 'Feedback']).optional(),
  eventId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(25),
  sortBy: z.enum(['name', 'createdAt', 'sentAt', 'status', 'openedCount', 'clickedCount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Zod schema for admin campaign creation
const adminCreateCampaignSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  name: z.string().trim().min(1, 'Campaign name is required'),
  type: z.enum(['Invitation', 'Reminder', 'LastChance', 'EventDayInfo', 'ThankYou', 'Feedback'], {
    message: 'Invalid campaign type',
  }),
  channel: z.enum(['email', 'whatsapp', 'sms']).optional().default('email'),
  subject: z.string().trim().min(1, 'Email subject is required'),
  content: z.string().min(1, 'Email content is required'),
  scheduledAt: z.coerce.date().optional(),
  whatsappTemplateId: z.string().optional(),
  whatsappContent: z.record(z.string(), z.unknown()).optional(),
  whatsappMediaUrl: z.string().optional(),
  whatsappMediaType: z.enum(['image', 'document', 'video']).optional(),
  smsBody: z.string().optional(),
  smsSenderId: z.string().max(11).optional(),
  smsOptOutFooter: z.boolean().optional(),
});

// Zod schema for admin campaign update
const adminUpdateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').optional(),
  type: z.enum(['Invitation', 'Reminder', 'LastChance', 'EventDayInfo', 'ThankYou', 'Feedback']).optional(),
  channel: z.enum(['email', 'whatsapp', 'sms']).optional(),
  subject: z.string().trim().min(1, 'Email subject is required').optional(),
  content: z.string().min(1, 'Email content is required').optional(),
  status: z.enum(['Draft', 'Scheduled', 'Queued', 'Sending', 'Sent', 'Paused', 'Cancelled']).optional(),
  scheduledAt: z.coerce.date().optional().nullable(),
  whatsappTemplateId: z.string().optional().nullable(),
  whatsappContent: z.record(z.string(), z.unknown()).optional().nullable(),
  whatsappMediaUrl: z.string().optional().nullable(),
  whatsappMediaType: z.enum(['image', 'document', 'video']).optional().nullable(),
  smsBody: z.string().optional().nullable(),
  smsSenderId: z.string().max(11).optional().nullable(),
  smsOptOutFooter: z.boolean().optional(),
});

// Zod schema for bulk delete
const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, 'At least one campaign ID is required'),
});

// Zod schema for saving campaign draft
// Requirements: 4.4 - Allow saving progress as draft at any step
const saveDraftSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required'),
  type: z.string().optional(),
  description: z.string().optional(),
  eventId: z.string().optional(),
  channel: z.enum(['email', 'whatsapp', 'sms']).optional(),
  subject: z.string().optional(),
  designJson: z.unknown().optional(),
  recipientType: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  sendType: z.enum(['now', 'scheduled', 'draft']).optional(),
  scheduledAt: z.coerce.date().optional().nullable(),
  timezone: z.string().optional(),
  whatsappTemplateId: z.string().optional(),
  whatsappContent: z.unknown().optional(),
  whatsappMediaUrl: z.string().optional(),
  whatsappMediaType: z.string().optional(),
  smsBody: z.string().optional(),
  smsSenderId: z.string().max(11).optional(),
  smsOptOutFooter: z.boolean().optional(),
});

// Zod schema for updating campaign draft
const updateDraftSchema = saveDraftSchema.partial();

// Admin Campaigns routes
const adminCampaignsRoutes = new Hono()
  // GET /api/admin/campaigns - List campaigns with filters and pagination
  // Requirements: 3.1, 3.2, 3.3, 3.4, 3.7
  .get('/', requireAdmin, readLimiter, async (c) => {
    try {
      const query = c.req.query();
      const filters = adminCampaignFiltersSchema.parse({
        status: query.status,
        type: query.type,
        eventId: query.eventId,
        search: query.search,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      const result = await CampaignService.list(
        {
          status: filters.status as CampaignStatus | undefined,
          type: filters.type as CampaignType | undefined,
          eventId: filters.eventId,
          search: filters.search,
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
          dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
        },
        {
          page: filters.page,
          pageSize: filters.pageSize,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
        }
      );

      return c.json(result);
    } catch (error) {
      console.error('Error listing admin campaigns:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid filter parameters',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list campaigns' }, 500);
    }
  })
  // POST /api/admin/campaigns - Create a new campaign
  // Requirements: 3
  .post('/', requireAdmin, writeLimiter, zValidator('json', adminCreateCampaignSchema), async (c) => {
    try {
      const input = c.req.valid('json');
      const campaign = await CampaignService.create(input);
      return c.json(campaign, 201);
    } catch (error) {
      console.error('Error creating campaign:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: error.message }, 404);
        }
      }
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create campaign' }, 500);
    }
  })
  // POST /api/admin/campaigns/bulk-delete - Bulk delete campaigns
  // Requirements: 3.5
  .post('/bulk-delete', requireAdmin, writeLimiter, zValidator('json', bulkDeleteSchema), async (c) => {
    try {
      const { ids } = c.req.valid('json');
      const errors: Array<{ id: string; error: string }> = [];
      let deletedCount = 0;

      for (const id of ids) {
        try {
          await CampaignService.delete(id);
          deletedCount++;
        } catch (error) {
          errors.push({
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return c.json({
        success: errors.length === 0,
        deletedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error('Error bulk deleting campaigns:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete campaigns' }, 500);
    }
  })
  // POST /api/admin/campaigns/draft - Save a new campaign draft
  // Requirements: 4.4 - Allow saving progress as draft at any step
  .post('/draft', requireAdmin, writeLimiter, zValidator('json', saveDraftSchema), async (c) => {
    try {
      const input = c.req.valid('json');
      
      // If no eventId provided, we need to handle this case
      if (!input.eventId) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Event ID is required to save a draft. Please select an event first.' 
        }, 400);
      }
      
      // Verify the event exists
      const event = await db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });
      
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      // Determine the campaign type - use Invitation as default if not provided or empty
      const validTypes = ['Invitation', 'Reminder', 'LastChance', 'EventDayInfo', 'ThankYou', 'Feedback'];
      const campaignType: CampaignType = (input.type && validTypes.includes(input.type)) 
        ? input.type as CampaignType 
        : 'Invitation';
      
      // Create the draft campaign
      const [campaign] = await db.insert(campaigns).values({
        eventId: input.eventId,
        name: input.name,
        type: campaignType,
        channel: input.channel || 'email',
        subject: input.subject || `Draft: ${input.name}`,
        content: input.description || '',
        status: 'Draft' as CampaignStatus,
        scheduledAt: input.scheduledAt || null,
        whatsappTemplateId: input.whatsappTemplateId || null,
        whatsappContent: input.whatsappContent || null,
        whatsappMediaUrl: input.whatsappMediaUrl || null,
        whatsappMediaType: input.whatsappMediaType || null,
        smsBody: input.smsBody || null,
        smsSenderId: input.smsSenderId || null,
        smsOptOutFooter: input.smsOptOutFooter ?? false,
        designJson: input.designJson || {
          wizardData: {
            description: input.description,
            recipientType: input.recipientType,
            filters: input.filters,
            sendType: input.sendType,
            timezone: input.timezone,
          },
        },
        recipientCount: 0,
        sentCount: 0,
        deliveredCount: 0,
        openedCount: 0,
        clickedCount: 0,
        bouncedCount: 0,
        unsubscribedCount: 0,
      }).returning();
      
      return c.json(campaign, 201);
    } catch (error) {
      console.error('Error saving campaign draft:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to save draft' }, 500);
    }
  })
  // GET /api/admin/campaigns/:id - Get campaign details
  // Requirements: 3.6
  .get('/:id', requireAdmin, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const campaign = await CampaignService.getById(id);

      if (!campaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }

      return c.json(campaign);
    } catch (error) {
      console.error('Error getting campaign:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get campaign' }, 500);
    }
  })
  // PUT /api/admin/campaigns/:id/draft - Update an existing campaign draft
  // Requirements: 4.4 - Allow saving progress as draft at any step
  .put('/:id/draft', requireAdmin, writeLimiter, zValidator('json', updateDraftSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      
      // Check if campaign exists and is a draft
      const existingCampaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, id),
      });
      
      if (!existingCampaign) {
        return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
      }
      
      if (existingCampaign.status !== 'Draft') {
        return c.json({ 
          code: 'INVALID_STATUS', 
          message: 'Can only update draft campaigns' 
        }, 400);
      }
      
      // Build update data
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      
      const validTypes = ['Invitation', 'Reminder', 'LastChance', 'EventDayInfo', 'ThankYou', 'Feedback'];
      
      if (input.name !== undefined) updateData.name = input.name;
      if (input.type !== undefined && input.type !== '' && validTypes.includes(input.type)) {
        updateData.type = input.type as CampaignType;
      }
      if (input.channel !== undefined) updateData.channel = input.channel;
      if (input.subject !== undefined) updateData.subject = input.subject;
      if (input.description !== undefined) updateData.content = input.description;
      if (input.scheduledAt !== undefined) updateData.scheduledAt = input.scheduledAt;
      if (input.whatsappTemplateId !== undefined) updateData.whatsappTemplateId = input.whatsappTemplateId;
      if (input.whatsappContent !== undefined) updateData.whatsappContent = input.whatsappContent;
      if (input.whatsappMediaUrl !== undefined) updateData.whatsappMediaUrl = input.whatsappMediaUrl;
      if (input.whatsappMediaType !== undefined) updateData.whatsappMediaType = input.whatsappMediaType;
      if (input.eventId !== undefined) {
        // Verify the new event exists
        const event = await db.query.events.findFirst({
          where: eq(events.id, input.eventId),
        });
        if (!event) {
          return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
        }
        updateData.eventId = input.eventId;
      }
      
      // Update designJson with wizard metadata
      if (input.designJson !== undefined || input.recipientType !== undefined || 
          input.filters !== undefined || input.sendType !== undefined || 
          input.timezone !== undefined) {
        const existingDesignJson = (existingCampaign.designJson as Record<string, unknown>) || {};
        const existingWizardData = (existingDesignJson.wizardData as Record<string, unknown>) || {};
        
        updateData.designJson = {
          ...existingDesignJson,
          ...(input.designJson && typeof input.designJson === 'object' ? input.designJson : {}),
          wizardData: {
            ...existingWizardData,
            ...(input.description !== undefined && { description: input.description }),
            ...(input.recipientType !== undefined && { recipientType: input.recipientType }),
            ...(input.filters !== undefined && { filters: input.filters }),
            ...(input.sendType !== undefined && { sendType: input.sendType }),
            ...(input.timezone !== undefined && { timezone: input.timezone }),
          },
        };
      }
      
      const [updated] = await db.update(campaigns)
        .set(updateData)
        .where(eq(campaigns.id, id))
        .returning();
      
      return c.json(updated);
    } catch (error) {
      console.error('Error updating campaign draft:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update draft' }, 500);
    }
  })
  // PUT /api/admin/campaigns/:id - Update a campaign
  // Requirements: 3
  .put('/:id', requireAdmin, writeLimiter, zValidator('json', adminUpdateCampaignSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');

      const campaign = await CampaignService.update(id, input);
      return c.json(campaign);
    } catch (error) {
      console.error('Error updating campaign:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
        if (error.message.includes('already been sent')) {
          return c.json({ code: 'CAMPAIGN_ALREADY_SENT', message: error.message }, 400);
        }
      }
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update campaign' }, 500);
    }
  })
  // DELETE /api/admin/campaigns/:id - Delete a campaign
  // Requirements: 3
  .delete('/:id', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      await CampaignService.delete(id);
      return c.json({ success: true, message: 'Campaign deleted successfully' });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
        if (error.message.includes('already been sent')) {
          return c.json({ code: 'CAMPAIGN_ALREADY_SENT', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete campaign' }, 500);
    }
  })
  // POST /api/admin/campaigns/:id/send - Send a campaign
  // Requirements: 11
  .post('/:id/send', requireAdmin, sensitiveLimiter, async (c) => {
    try {
      const id = c.req.param('id');

      // Check if campaign can be sent
      const canSendResult = await CampaignService.canSend(id);
      if (!canSendResult.canSend) {
        return c.json({ 
          code: 'CANNOT_SEND', 
          message: canSendResult.reason || 'Campaign cannot be sent' 
        }, 400);
      }

      // Update recipient count before sending
      await CampaignService.updateRecipientCount(id);

      // Get base URL from request for generating RSVP and badge links
      const url = new URL(c.req.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      const result = await CampaignSendService.send(id, baseUrl);
      return c.json(result);
    } catch (error) {
      console.error('Error sending campaign:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
        if (error.message.includes('already been sent')) {
          return c.json({ code: 'CAMPAIGN_ALREADY_SENT', message: error.message }, 400);
        }
        if (error.message.includes('currently being sent')) {
          return c.json({ code: 'CAMPAIGN_IN_PROGRESS', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to send campaign' }, 500);
    }
  })
  // POST /api/admin/campaigns/:id/pause - Pause a sending campaign
  // Requirements: 11.4
  .post('/:id/pause', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const campaign = await CampaignService.pause(id);
      return c.json(campaign);
    } catch (error) {
      console.error('Error pausing campaign:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
        if (error.message.includes('Cannot pause')) {
          return c.json({ code: 'INVALID_STATUS', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to pause campaign' }, 500);
    }
  })
  // POST /api/admin/campaigns/:id/resume - Resume a paused campaign
  // Requirements: 11.4
  .post('/:id/resume', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const campaign = await CampaignService.resume(id);
      return c.json(campaign);
    } catch (error) {
      console.error('Error resuming campaign:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
        if (error.message.includes('Cannot resume')) {
          return c.json({ code: 'INVALID_STATUS', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to resume campaign' }, 500);
    }
  })
  // POST /api/admin/campaigns/:id/cancel - Cancel a campaign
  // Requirements: 11
  .post('/:id/cancel', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const campaign = await CampaignService.cancel(id);
      return c.json(campaign);
    } catch (error) {
      console.error('Error cancelling campaign:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
        if (error.message.includes('Cannot cancel')) {
          return c.json({ code: 'INVALID_STATUS', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to cancel campaign' }, 500);
    }
  })
  // POST /api/admin/campaigns/:id/duplicate - Duplicate a campaign
  // Requirements: 3.5
  .post('/:id/duplicate', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const campaign = await CampaignService.duplicate(id);
      return c.json(campaign, 201);
    } catch (error) {
      console.error('Error duplicating campaign:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to duplicate campaign' }, 500);
    }
  })
  // GET /api/admin/campaigns/:id/recipients - Get campaign recipients
  // Requirements: 3.6
  .get('/:id/recipients', requireAdmin, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const query = c.req.query();
      
      const page = parseInt(query.page || '1', 10);
      const pageSize = parseInt(query.pageSize || '50', 10);

      const result = await CampaignService.getRecipients(id, { page, pageSize });
      return c.json(result);
    } catch (error) {
      console.error('Error getting campaign recipients:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get campaign recipients' }, 500);
    }
  })
  // GET /api/admin/campaigns/:id/progress - Get send progress
  // Requirements: 11.5
  .get('/:id/progress', requireAdmin, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const progress = await CampaignService.getSendProgress(id);
      return c.json(progress);
    } catch (error) {
      console.error('Error getting campaign progress:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get campaign progress' }, 500);
    }
  })
  // GET /api/admin/campaigns/:id/report - Get campaign report
  // Requirements: 7.1, 7.2
  .get('/:id/report', requireAdmin, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const report = await ReportService.getCampaignReport(id);
      return c.json(report);
    } catch (error) {
      console.error('Error getting campaign report:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get campaign report' }, 500);
    }
  })
  // GET /api/admin/campaigns/:id/report/export - Export campaign report as CSV or PDF
  // Requirements: 7.6
  .get('/:id/report/export', requireAdmin, sensitiveLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const format = c.req.query('format') || 'csv';
      
      if (format !== 'csv' && format !== 'pdf') {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid format. Supported formats: csv, pdf' 
        }, 400);
      }
      
      const exportData = await ReportService.exportReport(id, format);
      
      if (format === 'csv') {
        return new Response(exportData, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="campaign-${id}-report.csv"`,
          },
        });
      } else {
        // PDF is returned as base64 encoded text
        const pdfBuffer = Buffer.from(exportData, 'base64');
        return new Response(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="campaign-${id}-report.pdf"`,
          },
        });
      }
    } catch (error) {
      console.error('Error exporting campaign report:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Campaign not found' }, 404);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to export campaign report' }, 500);
    }
  })
  // GET /api/admin/campaigns/scheduled - Get scheduled campaigns for calendar view
  // Requirements: 13.3
  .get('/scheduled', requireAdmin, readLimiter, async (c) => {
    try {
      const query = c.req.query();
      const startDate = query.startDate ? new Date(query.startDate) : new Date();
      const endDate = query.endDate ? new Date(query.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid date format' 
        }, 400);
      }
      
      // Import SchedulingService
      const { SchedulingService } = await import('@/lib/services/scheduling-service');
      
      // Get scheduled campaigns
      const schedules = await SchedulingService.getScheduledCampaigns(startDate, endDate);
      
      // Transform to calendar format
      const calendarCampaigns = schedules.map(schedule => ({
        id: schedule.id,
        campaignId: schedule.campaignId,
        campaignName: schedule.campaign.name,
        scheduledAt: schedule.scheduledAt,
        timezone: schedule.timezone,
        isRecurring: schedule.isRecurring,
        recurrencePattern: schedule.recurrencePattern,
        status: schedule.campaign.status,
      }));
      
      return c.json(calendarCampaigns);
    } catch (error) {
      console.error('Error getting scheduled campaigns:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get scheduled campaigns' }, 500);
    }
  });

// Mount admin campaigns routes
app.route('/admin/campaigns', adminCampaignsRoutes);

// ============================================================================
// ADMIN EVENTS ROUTES
// Requirements: 4 (Campaign Wizard - Event Selection with Guest Count)
// ============================================================================

// Admin Events routes - provides events with guest counts for campaign wizard
const adminEventsRoutes = new Hono()
  // GET /api/admin/events - List all events with guest counts (paginated)
  // Requirements: 4.2 - Recipients (select event with guest count preview)
  .get('/', requireAdmin, readLimiter, async (c) => {
    try {
      const url = new URL(c.req.url);
      const search = url.searchParams.get('search') || '';
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));
      const includeGuestCount = url.searchParams.get('includeGuestCount') === 'true';
      const offset = (page - 1) * pageSize;

      // Get total count for pagination
      const [{ count: totalCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(events);

      // Get paginated events
      let query = db
        .select()
        .from(events)
        .orderBy(desc(events.createdAt))
        .limit(pageSize)
        .offset(offset);

      const allEvents = await query;

      if (includeGuestCount && allEvents.length > 0) {
        // Batch query guest counts instead of N+1
        const eventIds = allEvents.map(e => e.id);
        const guestCounts = await db
          .select({
            eventId: eventGuests.eventId,
            count: sql<number>`count(*)::int`,
          })
          .from(eventGuests)
          .where(inArray(eventGuests.eventId, eventIds))
          .groupBy(eventGuests.eventId);

        const countMap = new Map(guestCounts.map(gc => [gc.eventId, gc.count]));

        const eventsWithCounts = allEvents.map(event => ({
          ...event,
          guestCount: countMap.get(event.id) ?? 0,
        }));

        return c.json({
          data: eventsWithCounts,
          pagination: { page, pageSize, total: totalCount, totalPages: Math.ceil(totalCount / pageSize) },
        });
      }

      return c.json({
        data: allEvents,
        pagination: { page, pageSize, total: totalCount, totalPages: Math.ceil(totalCount / pageSize) },
      });
    } catch (error) {
      console.error('Error listing admin events:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list events' }, 500);
    }
  })
  // GET /api/admin/events/:id/guest-count - Get guest count for a specific event
  // Requirements: 4.2 - Event selector with guest count preview
  .get('/:id/guest-count', requireAdmin, readLimiter, async (c) => {
    try {
      const eventId = c.req.param('id');
      
      // Verify event exists
      const event = await EventService.getById(eventId);
      if (!event) {
        return c.json({ code: 'NOT_FOUND', message: 'Event not found' }, 404);
      }
      
      // Get guest count
      const guestCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventGuests)
        .where(eq(eventGuests.eventId, eventId));
      
      return c.json({
        eventId,
        guestCount: guestCount[0]?.count ?? 0,
      });
    } catch (error) {
      console.error('Error getting event guest count:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get guest count' }, 500);
    }
  });

// Mount admin events routes
app.route('/admin/events', adminEventsRoutes);

// ============================================================================
// ADMIN GUESTS ROUTES
// ============================================================================

// Admin Guests routes - provides all guests for admin view
const adminGuestsRoutes = new Hono()
  // GET /api/admin/guests - List all guests with pagination
  .get('/', requireAdmin, readLimiter, async (c) => {
    try {
      const url = new URL(c.req.url);
      const search = url.searchParams.get('search') || '';
      const page = parseInt(url.searchParams.get('page') || '1');
      const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
      
      // Use GuestService to get paginated guests
      const result = await GuestService.searchPaginated(search, page, pageSize);
      
      return c.json(result);
    } catch (error) {
      console.error('Error listing admin guests:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list guests' }, 500);
    }
  });

// DELETE /api/admin/guests/bulk - Bulk delete guests
adminGuestsRoutes.delete('/bulk', requireAdmin, writeLimiter, async (c) => {
  try {
    const body = await c.req.json<{ ids: string[] }>();
    const ids = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' }, 400);
    }

    if (ids.length > 500) {
      return c.json({ code: 'VALIDATION_ERROR', message: 'Cannot delete more than 500 guests at once' }, 400);
    }

    const deleted = await GuestService.bulkDelete(ids);
    return c.json({ deleted });
  } catch (error) {
    console.error('Error bulk deleting guests:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete guests' }, 500);
  }
});

// Mount admin guests routes
app.route('/admin/guests', adminGuestsRoutes);

// ============================================================================
// ADMIN SMTP SETTINGS ROUTES
// Requirements: 2
// ============================================================================

// Zod schema for test connection request
const testConnectionSchema = z.object({
  testEmail: z.string().email('Invalid test email address'),
});

// ============================================================================
// ADMIN EMAIL TEMPLATES ROUTES
// ============================================================================

import { 
  EmailTemplateLibraryService, 
  createEmailTemplateSchema, 
  updateEmailTemplateSchema,
  listEmailTemplatesSchema,
  importFromHtmlSchema,
} from '@/lib/services/email-template-library-service';

// Admin Email Templates routes
// Requirements: 10 (Email Template Library)
const adminEmailTemplatesRoutes = new Hono()
  // GET /api/admin/email-templates - List all email templates
  // Requirements: 10.1
  .get('/', requireAdmin, readLimiter, async (c) => {
    try {
      const url = new URL(c.req.url);
      const params = {
        category: url.searchParams.get('category') as any || undefined,
        search: url.searchParams.get('search') || undefined,
        sortBy: url.searchParams.get('sortBy') as any || undefined,
        sortOrder: url.searchParams.get('sortOrder') as any || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
      };
      
      const result = await EmailTemplateLibraryService.list(params);
      return c.json(result);
    } catch (error) {
      console.error('Error listing email templates:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list email templates' }, 500);
    }
  })
  // GET /api/admin/email-templates/wizard - Get templates for campaign wizard
  // Requirements: 10.5
  .get('/wizard', requireAdmin, readLimiter, async (c) => {
    try {
      const templates = await EmailTemplateLibraryService.getForCampaignWizard();
      return c.json(templates);
    } catch (error) {
      console.error('Error fetching templates for wizard:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch templates' }, 500);
    }
  })
  // POST /api/admin/email-templates/import-html - Import template from HTML
  // Requirements: 10.6
  .post('/import-html', requireAdmin, writeLimiter, zValidator('json', importFromHtmlSchema), async (c) => {
    try {
      const input = c.req.valid('json');
      const template = await EmailTemplateLibraryService.importFromHtml(input);
      return c.json(template, 201);
    } catch (error) {
      console.error('Error importing template from HTML:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to import template from HTML' }, 500);
    }
  })
  // POST /api/admin/email-templates/import-json - Import template from JSON
  // Requirements: 10.6
  .post('/import-json', requireAdmin, writeLimiter, async (c) => {
    try {
      const body = await c.req.json();
      const jsonContent = typeof body === 'string' ? body : JSON.stringify(body);
      const template = await EmailTemplateLibraryService.importFromJson(jsonContent);
      return c.json(template, 201);
    } catch (error) {
      console.error('Error importing template from JSON:', error);
      if (error instanceof Error) {
        if (error.message.includes('Invalid JSON format') || error.message.includes('Invalid template format')) {
          return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to import template from JSON' }, 500);
    }
  })
  // POST /api/admin/email-templates - Create email template
  // Requirements: 10.2
  .post('/', requireAdmin, writeLimiter, zValidator('json', createEmailTemplateSchema), async (c) => {
    try {
      const input = c.req.valid('json');
      const template = await EmailTemplateLibraryService.create(input);
      return c.json(template, 201);
    } catch (error) {
      console.error('Error creating email template:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create email template' }, 500);
    }
  })
  // GET /api/admin/email-templates/:id - Get email template by ID
  // Requirements: 10.2
  .get('/:id', requireAdmin, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      
      // Skip if this is the wizard route (already handled above)
      if (id === 'wizard') {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      
      const template = await EmailTemplateLibraryService.getById(id);
      
      if (!template) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      
      return c.json(template);
    } catch (error) {
      console.error('Error getting email template:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get email template' }, 500);
    }
  })
  // PUT /api/admin/email-templates/:id - Update email template
  // Requirements: 10.2
  .put('/:id', requireAdmin, writeLimiter, zValidator('json', updateEmailTemplateSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      
      const template = await EmailTemplateLibraryService.update(id, input);
      return c.json(template);
    } catch (error) {
      console.error('Error updating email template:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update email template' }, 500);
    }
  })
  // DELETE /api/admin/email-templates/:id - Delete email template
  // Requirements: 10.2
  .delete('/:id', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      await EmailTemplateLibraryService.delete(id);
      return c.json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
      console.error('Error deleting email template:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete email template' }, 500);
    }
  })
  // POST /api/admin/email-templates/:id/duplicate - Duplicate email template
  // Requirements: 10.2
  .post('/:id/duplicate', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const template = await EmailTemplateLibraryService.duplicate(id);
      return c.json(template, 201);
    } catch (error) {
      console.error('Error duplicating email template:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to duplicate email template' }, 500);
    }
  })
  // POST /api/admin/email-templates/:id/set-default - Set template as default for category
  // Requirements: 10.4
  .post('/:id/set-default', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const template = await EmailTemplateLibraryService.setAsDefault(id);
      return c.json(template);
    } catch (error) {
      console.error('Error setting default template:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to set default template' }, 500);
    }
  })
  // GET /api/admin/email-templates/:id/export/html - Export template as HTML
  // Requirements: 10.7
  .get('/:id/export/html', requireAdmin, sensitiveLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const html = await EmailTemplateLibraryService.exportAsHtml(id);
      
      // Return HTML with appropriate headers for download
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="template-${id}.html"`,
        },
      });
    } catch (error) {
      console.error('Error exporting template as HTML:', error);
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
        }
        if (error.message.includes('does not have HTML content')) {
          return c.json({ code: 'NO_HTML_CONTENT', message: error.message }, 400);
        }
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to export template as HTML' }, 500);
    }
  })
  // GET /api/admin/email-templates/:id/export/json - Export template as JSON
  // Requirements: 10.7
  .get('/:id/export/json', requireAdmin, sensitiveLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const json = await EmailTemplateLibraryService.exportAsJson(id);
      
      // Return JSON with appropriate headers for download
      return new Response(json, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="template-${id}.json"`,
        },
      });
    } catch (error) {
      console.error('Error exporting template as JSON:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to export template as JSON' }, 500);
    }
  });

// Mount admin email templates routes
app.route('/admin/email-templates', adminEmailTemplatesRoutes);

// Admin SMTP routes
const adminSmtpRoutes = new Hono()
  // GET /api/admin/smtp - List all SMTP configurations
  // Requirements: 2.1, 2.7
  .get('/', requireAdmin, readLimiter, async (c) => {
    try {
      const settings = await SMTPService.getAll();
      return c.json(settings);
    } catch (error) {
      console.error('Error listing SMTP settings:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list SMTP settings' }, 500);
    }
  })
  // POST /api/admin/smtp - Create SMTP configuration
  // Requirements: 2.1, 2.2, 2.3, 2.7, 2.8
  .post('/', requireAdmin, writeLimiter, zValidator('json', createSMTPSettingsSchema), async (c) => {
    try {
      const input = c.req.valid('json');
      const settings = await SMTPService.create(input);
      return c.json(settings, 201);
    } catch (error) {
      console.error('Error creating SMTP settings:', error);
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create SMTP settings' }, 500);
    }
  })
  // GET /api/admin/smtp/:id - Get SMTP configuration by ID
  // Requirements: 2.1
  .get('/:id', requireAdmin, readLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const settings = await SMTPService.getById(id);
      
      if (!settings) {
        return c.json({ code: 'NOT_FOUND', message: 'SMTP settings not found' }, 404);
      }
      
      return c.json(settings);
    } catch (error) {
      console.error('Error getting SMTP settings:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get SMTP settings' }, 500);
    }
  })
  // PUT /api/admin/smtp/:id - Update SMTP configuration
  // Requirements: 2.1, 2.2, 2.3
  .put('/:id', requireAdmin, writeLimiter, zValidator('json', updateSMTPSettingsSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      
      const settings = await SMTPService.update(id, input);
      return c.json(settings);
    } catch (error) {
      console.error('Error updating SMTP settings:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: 'SMTP settings not found' }, 404);
      }
      if (error instanceof z.ZodError) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Validation failed',
          details: error.issues.reduce((acc: Record<string, string[]>, err) => {
            const path = err.path.join('.');
            if (!acc[path]) acc[path] = [];
            acc[path].push(err.message);
            return acc;
          }, {})
        }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to update SMTP settings' }, 500);
    }
  })
  // DELETE /api/admin/smtp/:id - Delete SMTP configuration
  // Requirements: 2.1
  .delete('/:id', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      await SMTPService.delete(id);
      return c.json({ success: true, message: 'SMTP settings deleted successfully' });
    } catch (error) {
      console.error('Error deleting SMTP settings:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: 'SMTP settings not found' }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete SMTP settings' }, 500);
    }
  })
  // POST /api/admin/smtp/:id/test - Test SMTP connection
  // Requirements: 2.4, 2.5, 2.6
  .post('/:id/test', requireAdmin, sensitiveLimiter, zValidator('json', testConnectionSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const { testEmail } = c.req.valid('json');
      
      const result = await SMTPService.testConnection(id, testEmail);
      
      if (result.success) {
        return c.json({ 
          success: true, 
          message: result.message 
        });
      } else {
        return c.json({ 
          success: false, 
          message: result.message,
          error: result.error 
        }, 400);
      }
    } catch (error) {
      console.error('Error testing SMTP connection:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to test SMTP connection' }, 500);
    }
  })
  // POST /api/admin/smtp/:id/set-default - Set SMTP configuration as default
  // Requirements: 2.7
  .post('/:id/set-default', requireAdmin, writeLimiter, async (c) => {
    try {
      const id = c.req.param('id');
      const settings = await SMTPService.setDefault(id);
      return c.json(settings);
    } catch (error) {
      console.error('Error setting default SMTP:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ code: 'NOT_FOUND', message: 'SMTP settings not found' }, 404);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to set default SMTP settings' }, 500);
    }
  });

// Mount admin SMTP routes
app.route('/admin/smtp', adminSmtpRoutes);

// ============================================================================
// ADMIN IMPORT ROUTES
// ============================================================================

import { ImportService, columnMappingSchema, importOptionsSchema } from '@/lib/services/import-service';

// Validation schemas for import API
const uploadImportSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileContent: z.string().min(1, 'File content is required'),
  eventId: z.string().optional(),
});

const startImportSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  fileContent: z.string().min(1, 'File content is required'),
  columnMapping: columnMappingSchema,
  options: importOptionsSchema.optional(),
});

// Admin Import routes
const adminImportRoutes = new Hono()
  // POST /api/admin/import/upload - Upload and parse import file
  // Requirements: 8.1, 8.2
  .post('/upload', requireAdmin, uploadLimiter, zValidator('json', uploadImportSchema), async (c) => {
    try {
      const userId = getUserIdFromRequest(c);
      const { fileName, fileContent, eventId } = c.req.valid('json');
      
      // Decode base64 content if needed
      let content: string | Buffer;
      const fileType = ImportService.detectFileType(fileName);
      
      if (fileType === 'csv') {
        // CSV files are text
        content = Buffer.from(fileContent, 'base64').toString('utf-8');
      } else {
        // Excel files are binary
        content = Buffer.from(fileContent, 'base64');
      }
      
      // Parse the file
      const parseResult = await ImportService.parseFile(content, fileName);
      
      // Auto-detect column mapping
      const suggestedMapping = ImportService.autoDetectColumnMapping(parseResult.headers);
      
      // Validate the suggested mapping
      const mappingValidation = ImportService.validateColumnMapping(suggestedMapping);
      
      // Create import job (pending state)
      const job = await ImportService.createImportJob(
        userId,
        fileName,
        fileContent.length,
        parseResult.totalRows,
        eventId,
        suggestedMapping
      );
      
      return c.json({
        jobId: job.id,
        fileName,
        fileType: parseResult.fileType,
        totalRows: parseResult.totalRows,
        headers: parseResult.headers,
        suggestedMapping,
        mappingValidation,
        preview: parseResult.rows.slice(0, 10), // First 10 rows for preview
      }, 201);
    } catch (error) {
      console.error('Error uploading import file:', error);
      if (error instanceof Error) {
        return c.json({ code: 'VALIDATION_ERROR', message: error.message }, 400);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to upload import file' }, 500);
    }
  })
  
  // POST /api/admin/import/start - Start import job with column mapping
  // Requirements: 8.3, 8.4, 8.5
  .post('/start', requireAdmin, sensitiveLimiter, zValidator('json', startImportSchema), async (c) => {
    try {
      const { jobId, fileContent, columnMapping, options } = c.req.valid('json');
      
      // Get the job
      const job = await ImportService.getImportJob(jobId);
      if (!job) {
        return c.json({ code: 'NOT_FOUND', message: 'Import job not found' }, 404);
      }
      
      // Check job status
      if (job.status !== 'pending') {
        return c.json({ 
          code: 'INVALID_STATE', 
          message: `Cannot start import with status: ${job.status}` 
        }, 400);
      }
      
      // Validate column mapping
      const mappingValidation = ImportService.validateColumnMapping(columnMapping);
      if (!mappingValidation.isValid) {
        return c.json({ 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid column mapping',
          errors: mappingValidation.errors 
        }, 400);
      }
      
      // Decode and parse file content
      const fileType = ImportService.detectFileType(job.fileName);
      let content: string | Buffer;
      
      if (fileType === 'csv') {
        content = Buffer.from(fileContent, 'base64').toString('utf-8');
      } else {
        content = Buffer.from(fileContent, 'base64');
      }
      
      const parseResult = await ImportService.parseFile(content, job.fileName);
      
      // Validate rows before starting
      const validationResult = ImportService.validateRows(parseResult, columnMapping);
      
      // If validateOnly option is set, return validation result without processing
      if (options?.validateOnly) {
        return c.json({
          jobId,
          validation: validationResult,
        });
      }
      
      // Start processing in background (for now, synchronous)
      // In production, this would be a background job
      const importOptions = {
        eventId: job.eventId || options?.eventId,
        duplicateHandling: options?.duplicateHandling || 'update',
        batchSize: options?.batchSize || 100,
        validateOnly: false,
      };
      
      // Process the import
      const result = await ImportService.processImport(
        jobId,
        parseResult,
        columnMapping,
        importOptions
      );
      
      return c.json({
        jobId: result.jobId,
        status: result.status,
        totalRows: result.totalRows,
        successCount: result.successCount,
        errorCount: result.errorCount,
        errorReportUrl: result.errorReportUrl,
      });
    } catch (error) {
      console.error('Error starting import:', error);
      if (error instanceof Error) {
        return c.json({ code: 'INTERNAL_ERROR', message: error.message }, 500);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to start import' }, 500);
    }
  })
  
  // GET /api/admin/import/:id/status - Get import job status
  // Requirements: 8.4
  .get('/:id/status', requireAdmin, readLimiter, async (c) => {
    try {
      const jobId = c.req.param('id');
      
      const progress = await ImportService.getImportProgress(jobId);
      if (!progress) {
        return c.json({ code: 'NOT_FOUND', message: 'Import job not found' }, 404);
      }
      
      return c.json(progress);
    } catch (error) {
      console.error('Error getting import status:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get import status' }, 500);
    }
  })
  
  // POST /api/admin/import/:id/cancel - Cancel import job
  // Requirements: 8.6
  .post('/:id/cancel', requireAdmin, writeLimiter, async (c) => {
    try {
      const jobId = c.req.param('id');
      
      const job = await ImportService.getImportJob(jobId);
      if (!job) {
        return c.json({ code: 'NOT_FOUND', message: 'Import job not found' }, 404);
      }
      
      // Can only cancel pending or processing jobs
      if (job.status !== 'pending' && job.status !== 'processing') {
        return c.json({ 
          code: 'INVALID_STATE', 
          message: `Cannot cancel import with status: ${job.status}` 
        }, 400);
      }
      
      await ImportService.cancelImportJob(jobId);
      
      return c.json({ 
        success: true, 
        message: 'Import job cancelled',
        jobId 
      });
    } catch (error) {
      console.error('Error cancelling import:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to cancel import' }, 500);
    }
  })
  
  // GET /api/admin/import/:id/error-report - Download error report
  // Requirements: 8.5
  .get('/:id/error-report', requireAdmin, sensitiveLimiter, async (c) => {
    try {
      const jobId = c.req.param('id');
      
      const job = await ImportService.getImportJob(jobId);
      if (!job) {
        return c.json({ code: 'NOT_FOUND', message: 'Import job not found' }, 404);
      }
      
      if (!job.errorReportUrl) {
        return c.json({ 
          code: 'NOT_FOUND', 
          message: 'No error report available for this import job' 
        }, 404);
      }
      
      // If it's a data URL, decode and return as CSV
      if (job.errorReportUrl.startsWith('data:text/csv;base64,')) {
        const base64Data = job.errorReportUrl.replace('data:text/csv;base64,', '');
        const csvContent = Buffer.from(base64Data, 'base64').toString('utf-8');
        
        return new Response(csvContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="import-${jobId}-errors.csv"`,
          },
        });
      }
      
      // If it's a URL, redirect to it
      return Response.redirect(job.errorReportUrl, 302);
    } catch (error) {
      console.error('Error downloading error report:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to download error report' }, 500);
    }
  })
  
  // GET /api/admin/import - List import jobs for current user
  // Requirements: 8
  .get('/', requireAdmin, readLimiter, async (c) => {
    try {
      const userId = getUserIdFromRequest(c);
      const limitParam = c.req.query('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 10;
      
      const jobs = await ImportService.getImportJobsForUser(userId, limit);
      
      return c.json(jobs);
    } catch (error) {
      console.error('Error listing import jobs:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to list import jobs' }, 500);
    }
  })
  
  // DELETE /api/admin/import/:id - Delete import job
  // Requirements: 8
  .delete('/:id', requireAdmin, writeLimiter, async (c) => {
    try {
      const jobId = c.req.param('id');
      
      const job = await ImportService.getImportJob(jobId);
      if (!job) {
        return c.json({ code: 'NOT_FOUND', message: 'Import job not found' }, 404);
      }
      
      // Can only delete completed, failed, or cancelled jobs
      if (job.status === 'pending' || job.status === 'processing') {
        return c.json({ 
          code: 'INVALID_STATE', 
          message: 'Cannot delete an active import job. Cancel it first.' 
        }, 400);
      }
      
      await ImportService.deleteImportJob(jobId);
      
      return c.json({ 
        success: true, 
        message: 'Import job deleted',
        jobId 
      });
    } catch (error) {
      console.error('Error deleting import job:', error);
      return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete import job' }, 500);
    }
  });

// Mount admin import routes
app.route('/admin/import', adminImportRoutes);

// GET /api/admin/stats - Get admin dashboard statistics
// Requirements: Admin Dashboard
app.get('/admin/stats', requireAdmin, readLimiter, async (c) => {
  try {
    const stats = await StatisticsService.getAdminDashboardStats();
    return c.json(stats);
  } catch (error) {
    console.error('Error getting admin stats:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to get admin statistics' }, 500);
  }
});

// ============================================================================
// ADDRESS ENDPOINTS
// ============================================================================

import { AddressService, createAddressSchema } from '@/lib/services/address-service';

// GET /api/addresses - List all saved addresses
app.get('/addresses', requireAuth, readLimiter, async (c) => {
  try {
    const addresses = await AddressService.getAll();
    return c.json({ data: addresses });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch addresses' }, 500);
  }
});

// POST /api/addresses - Create a saved address
app.post('/addresses', requireAuth, writeLimiter, async (c) => {
  try {
    const body = await c.req.json();
    const address = await AddressService.create(body);
    return c.json({ data: address }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ code: 'VALIDATION_ERROR', message: 'Invalid address data', errors: error.issues }, 400);
    }
    console.error('Error creating address:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to create address' }, 500);
  }
});

// DELETE /api/addresses/:id - Delete a saved address
app.delete('/addresses/:id', requireAuth, writeLimiter, async (c) => {
  try {
    const id = c.req.param('id');
    await AddressService.delete(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting address:', error);
    return c.json({ code: 'INTERNAL_ERROR', message: 'Failed to delete address' }, 500);
  }
});

// Export handlers for Next.js
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
