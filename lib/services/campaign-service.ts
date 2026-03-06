/**
 * @fileoverview Campaign Service - Email campaign management
 * 
 * This service handles the creation and management of email campaigns.
 * Campaigns are associated with events and can be of various types
 * (Invitation, Reminder, Thank You, etc.).
 * 
 * Features:
 * - Enhanced CRUD with analytics fields
 * - Recipient management methods
 * - Send progress tracking
 * - Pause/resume/cancel functionality
 * 
 * @module lib/services/campaign-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { CampaignService } from '@/lib/services';
 * 
 * // Create an invitation campaign
 * const campaign = await CampaignService.create({
 *   eventId: 'event123',
 *   name: 'Event Invitation',
 *   type: 'Invitation',
 *   subject: 'You are invited to {eventName}',
 *   content: 'Dear {firstName}, please RSVP at {rsvpLink}'
 * });
 * 
 * // Pause a sending campaign
 * await CampaignService.pause(campaign.id);
 * 
 * // Resume a paused campaign
 * await CampaignService.resume(campaign.id);
 * ```
 */

import { z } from 'zod';
import { db } from '@/db';
import { 
  events, 
  campaigns, 
  campaignMessages,
  eventGuests,
  guests,
  unsubscribes,
  type Campaign, 
  type CampaignType, 
  type CampaignStatus 
} from '@/db/schema';
import { eq, desc, and, sql, inArray, notInArray, isNull } from 'drizzle-orm';
import { WhatsAppTemplateManagementService } from './whatsapp-template-management-service';

/**
 * Available campaign types for event communication.
 * Each type represents a different stage in the event lifecycle.
 * 
 * - Invitation: Initial event invitation
 * - Reminder: Follow-up for pending RSVPs
 * - LastChance: Final reminder before event
 * - EventDayInfo: Day-of logistics and details
 * - ThankYou: Post-event appreciation
 * - Feedback: Request for event feedback
 * 
 * Requirements: 4.2
 */
export const CAMPAIGN_TYPES = [
  'Invitation',
  'Reminder',
  'LastChance',
  'EventDayInfo',
  'ThankYou',
  'Feedback',
] as const;

/**
 * Campaign status enum values
 */
export const CAMPAIGN_STATUSES = [
  'Draft',
  'Scheduled',
  'Queued',
  'Sending',
  'Sent',
  'Paused',
  'Cancelled',
] as const;

/**
 * Available campaign channels for delivery.
 */
export const CAMPAIGN_CHANNELS = ['email', 'whatsapp', 'sms'] as const;

/**
 * Zod validation schema for campaign creation input
 * Requirements: 4.1, 4.2
 */
export const createCampaignSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  name: z.string().trim().min(1, 'Campaign name is required'),
  type: z.enum(CAMPAIGN_TYPES, {
    error: `Campaign type must be one of: ${CAMPAIGN_TYPES.join(', ')}`,
  }),
  channel: z.enum(CAMPAIGN_CHANNELS).default('email'),
  subject: z.string().trim().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  scheduledAt: z.coerce.date().optional(),
  // WhatsApp-specific fields
  whatsappTemplateId: z.string().optional(),
  whatsappContent: z.record(z.string(), z.unknown()).optional(),
  whatsappMediaUrl: z.string().url().optional(),
  whatsappMediaType: z.enum(['image', 'document', 'video']).optional(),
  // SMS-specific fields
  smsBody: z.string().optional(),
  smsSenderId: z.string().max(11).optional(),
  smsOptOutFooter: z.boolean().optional(),
});

/**
 * Zod validation schema for campaign update input
 */
export const updateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required'),
  type: z.enum(CAMPAIGN_TYPES, {
    error: `Campaign type must be one of: ${CAMPAIGN_TYPES.join(', ')}`,
  }),
  channel: z.enum(CAMPAIGN_CHANNELS).optional(),
  subject: z.string().trim().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  scheduledAt: z.coerce.date().optional().nullable(),
  whatsappTemplateId: z.string().optional().nullable(),
  whatsappContent: z.record(z.string(), z.unknown()).optional().nullable(),
  whatsappMediaUrl: z.string().url().optional().nullable(),
  whatsappMediaType: z.enum(['image', 'document', 'video']).optional().nullable(),
  smsBody: z.string().optional().nullable(),
  smsSenderId: z.string().max(11).optional().nullable(),
  smsOptOutFooter: z.boolean().optional(),
}).partial();

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

/**
 * Campaign with event relation
 */
export type CampaignWithEvent = Campaign & {
  event: {
    id: string;
    name: string;
  };
};

/**
 * Campaign recipient with guest details
 */
export type CampaignRecipient = {
  eventGuestId: string;
  guestId: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  jobTitle: string | null;
  messageStatus: 'Pending' | 'Sent' | 'Delivered' | 'Failed' | 'Bounced' | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
};

/**
 * Send progress tracking
 */
export type SendProgress = {
  campaignId: string;
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  bouncedCount: number;
  openedCount: number;
  clickedCount: number;
  progressPercent: number;
  estimatedTimeRemaining: number | null; // in seconds
};

/**
 * Filters for listing campaigns
 */
export type CampaignFilters = {
  eventId?: string;
  status?: CampaignStatus | CampaignStatus[];
  type?: CampaignType | CampaignType[];
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
};

/**
 * Pagination options
 */
export type PaginationOptions = {
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'createdAt' | 'sentAt' | 'status' | 'openedCount' | 'clickedCount';
  sortOrder?: 'asc' | 'desc';
};

/**
 * Paginated result
 */
export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * CampaignService - Manages email campaigns for events.
 * 
 * Provides methods for creating, updating, and managing email campaigns.
 * Campaigns support:
 * - Multiple types (Invitation, Reminder, Thank You, etc.)
 * - Template variables for personalization
 * - Visual email builder integration
 * - Scheduling for future delivery
 * - Pause/resume/cancel functionality
 * - Recipient management
 * - Send progress tracking
 * 
 * @remarks
 * Campaigns must be associated with an event. The actual sending
 * is handled by CampaignSendService.
 * 
 * Requirements: 3, 4, 11
 */
export const CampaignService = {
  /**
   * Creates a new campaign for an event.
   * 
   * @param input - Campaign creation data including eventId
   * @returns The newly created campaign with Draft status
   * @throws {Error} If the associated event doesn't exist
   * @throws {ZodError} If input validation fails
   * 
   * @example
   * ```typescript
   * const campaign = await CampaignService.create({
   *   eventId: 'event123',
   *   name: 'Save the Date',
   *   type: 'Invitation',
   *   subject: 'Join us at {eventName}!',
   *   content: 'Dear {firstName}, we would love to see you...'
   * });
   * ```
   * 
   * Requirements: 3, 4
   */
  async create(input: CreateCampaignInput): Promise<Campaign> {
    // Validate input
    const validated = createCampaignSchema.parse(input);

    // Verify the event exists (enforce event association)
    const event = await db.query.events.findFirst({
      where: eq(events.id, validated.eventId),
    });

    if (!event) {
      throw new Error(`Event with ID "${validated.eventId}" not found`);
    }

    const [campaign] = await db.insert(campaigns).values({
      eventId: validated.eventId,
      name: validated.name,
      type: validated.type as CampaignType,
      channel: validated.channel,
      subject: validated.subject,
      content: validated.content,
      status: 'Draft' as CampaignStatus,
      scheduledAt: validated.scheduledAt,
      whatsappTemplateId: validated.whatsappTemplateId,
      whatsappContent: validated.whatsappContent,
      whatsappMediaUrl: validated.whatsappMediaUrl,
      whatsappMediaType: validated.whatsappMediaType,
      smsBody: validated.smsBody,
      smsSenderId: validated.smsSenderId,
      smsOptOutFooter: validated.smsOptOutFooter,
      recipientCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      openedCount: 0,
      clickedCount: 0,
      bouncedCount: 0,
      unsubscribedCount: 0,
    }).returning();

    return campaign;
  },

  /**
   * Get a campaign by ID
   * Requirements: 3
   */
  async getById(id: string): Promise<CampaignWithEvent | null> {
    const result = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, id),
      with: {
        event: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!result) return null;

    return {
      ...result,
      event: {
        id: result.event.id,
        name: result.event.name,
      },
    };
  },

  /**
   * Get all campaigns for a specific event
   * Requirements: 3
   */
  async getByEvent(eventId: string): Promise<Campaign[]> {
    return db.query.campaigns.findMany({
      where: eq(campaigns.eventId, eventId),
      orderBy: desc(campaigns.createdAt),
    });
  },

  /**
   * List campaigns with filters and pagination
   * Requirements: 3
   */
  async list(
    filters: CampaignFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<CampaignWithEvent>> {
    const {
      page = 1,
      pageSize = 25,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = pagination;

    // Build where conditions
    const conditions = [];

    if (filters.eventId) {
      conditions.push(eq(campaigns.eventId, filters.eventId));
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      conditions.push(inArray(campaigns.status, statuses));
    }

    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      conditions.push(inArray(campaigns.type, types));
    }

    if (filters.dateFrom) {
      conditions.push(sql`${campaigns.createdAt} >= ${filters.dateFrom}`);
    }

    if (filters.dateTo) {
      conditions.push(sql`${campaigns.createdAt} <= ${filters.dateTo}`);
    }

    if (filters.search) {
      conditions.push(sql`${campaigns.name} ILIKE ${'%' + filters.search + '%'}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by
    const orderByColumn = {
      name: campaigns.name,
      createdAt: campaigns.createdAt,
      sentAt: campaigns.sentAt,
      status: campaigns.status,
      openedCount: campaigns.openedCount,
      clickedCount: campaigns.clickedCount,
    }[sortBy] || campaigns.createdAt;

    const orderByDirection = sortOrder === 'asc' ? sql`ASC` : sql`DESC`;

    // Get paginated results
    const offset = (page - 1) * pageSize;
    const results = await db.query.campaigns.findMany({
      where: whereClause,
      with: {
        event: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: sortOrder === 'asc' 
        ? (campaigns, { asc }) => [asc(orderByColumn)]
        : (campaigns, { desc }) => [desc(orderByColumn)],
      limit: pageSize,
      offset,
    });

    return {
      data: results.map(r => ({
        ...r,
        event: { id: r.event.id, name: r.event.name },
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  /**
   * Update a campaign
   * Requirements: 3
   */
  async update(id: string, input: UpdateCampaignInput): Promise<Campaign> {
    // Validate input
    const validated = updateCampaignSchema.parse(input);

    // Check if campaign exists
    const existingCampaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, id),
    });

    if (!existingCampaign) {
      throw new Error(`Campaign with ID "${id}" not found`);
    }

    // Don't allow updates to sent campaigns
    if (existingCampaign.status === 'Sent') {
      throw new Error('Cannot update a campaign that has already been sent');
    }

    const updateData: Partial<typeof campaigns.$inferInsert> = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.type !== undefined) updateData.type = validated.type as CampaignType;
    if (validated.channel !== undefined) updateData.channel = validated.channel;
    if (validated.subject !== undefined) updateData.subject = validated.subject;
    if (validated.content !== undefined) updateData.content = validated.content;
    if (validated.status !== undefined) updateData.status = validated.status as CampaignStatus;
    if (validated.scheduledAt !== undefined) updateData.scheduledAt = validated.scheduledAt;
    if (validated.whatsappTemplateId !== undefined) updateData.whatsappTemplateId = validated.whatsappTemplateId;
    if (validated.whatsappContent !== undefined) updateData.whatsappContent = validated.whatsappContent;
    if (validated.whatsappMediaUrl !== undefined) updateData.whatsappMediaUrl = validated.whatsappMediaUrl;
    if (validated.whatsappMediaType !== undefined) updateData.whatsappMediaType = validated.whatsappMediaType;
    if (validated.smsBody !== undefined) updateData.smsBody = validated.smsBody;
    if (validated.smsSenderId !== undefined) updateData.smsSenderId = validated.smsSenderId;
    if (validated.smsOptOutFooter !== undefined) updateData.smsOptOutFooter = validated.smsOptOutFooter;
    updateData.updatedAt = new Date();

    const [campaign] = await db.update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, id))
      .returning();

    return campaign;
  },

  /**
   * Delete a campaign
   * Requirements: 3
   */
  async delete(id: string): Promise<void> {
    // Check if campaign exists
    const existingCampaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, id),
    });

    if (!existingCampaign) {
      throw new Error(`Campaign with ID "${id}" not found`);
    }

    // Don't allow deletion of sent campaigns
    if (existingCampaign.status === 'Sent') {
      throw new Error('Cannot delete a campaign that has already been sent');
    }

    await db.delete(campaigns).where(eq(campaigns.id, id));
  },

  /**
   * Duplicate a campaign
   * Requirements: 3
   */
  async duplicate(id: string, newName?: string): Promise<Campaign> {
    const existingCampaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, id),
    });

    if (!existingCampaign) {
      throw new Error(`Campaign with ID "${id}" not found`);
    }

    const [duplicated] = await db.insert(campaigns).values({
      eventId: existingCampaign.eventId,
      name: newName || `${existingCampaign.name} (Copy)`,
      type: existingCampaign.type,
      channel: existingCampaign.channel,
      subject: existingCampaign.subject,
      content: existingCampaign.content,
      designJson: existingCampaign.designJson,
      whatsappTemplateId: existingCampaign.whatsappTemplateId,
      whatsappContent: existingCampaign.whatsappContent,
      whatsappMediaUrl: existingCampaign.whatsappMediaUrl,
      whatsappMediaType: existingCampaign.whatsappMediaType,
      status: 'Draft' as CampaignStatus,
      recipientCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      openedCount: 0,
      clickedCount: 0,
      bouncedCount: 0,
      unsubscribedCount: 0,
    }).returning();

    return duplicated;
  },

  // ============================================================================
  // RECIPIENT MANAGEMENT
  // ============================================================================

  /**
   * Get recipients for a campaign (event guests excluding unsubscribed)
   * Requirements: 4
   */
  async getRecipients(
    campaignId: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<CampaignRecipient>> {
    const { page = 1, pageSize = 50 } = pagination;

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get unsubscribed emails
    const unsubscribedEmails = await db
      .select({ email: unsubscribes.email })
      .from(unsubscribes);
    const unsubscribedSet = new Set(unsubscribedEmails.map(u => u.email));

    // Get event guests with their guest info and message status
    const eventGuestsList = await db.query.eventGuests.findMany({
      where: eq(eventGuests.eventId, campaign.eventId),
      with: {
        guest: true,
      },
    });

    // Get campaign messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });
    const messageMap = new Map(messages.map(m => [m.eventGuestId, m]));

    // Filter out unsubscribed and map to recipients
    const allRecipients: CampaignRecipient[] = eventGuestsList
      .filter(eg => !unsubscribedSet.has(eg.guest.email))
      .map(eg => {
        const message = messageMap.get(eg.id);
        return {
          eventGuestId: eg.id,
          guestId: eg.guest.id,
          email: eg.guest.email,
          firstName: eg.guest.firstName,
          lastName: eg.guest.lastName,
          company: eg.guest.company,
          jobTitle: eg.guest.jobTitle,
          messageStatus: message?.status ?? null,
          sentAt: message?.sentAt ?? null,
          deliveredAt: message?.deliveredAt ?? null,
          openedAt: message?.openedAt ?? null,
          clickedAt: message?.clickedAt ?? null,
        };
      });

    const total = allRecipients.length;
    const offset = (page - 1) * pageSize;
    const data = allRecipients.slice(offset, offset + pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  /**
   * Get recipient count for a campaign (excluding unsubscribed)
   * Requirements: 4
   */
  async getRecipientCount(campaignId: string): Promise<number> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Count event guests
    const eventGuestCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventGuests)
      .where(eq(eventGuests.eventId, campaign.eventId));

    // Count unsubscribed emails that are in this event
    const unsubscribedInEvent = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(unsubscribes)
      .innerJoin(guests, eq(guests.email, unsubscribes.email))
      .innerJoin(eventGuests, and(
        eq(eventGuests.guestId, guests.id),
        eq(eventGuests.eventId, campaign.eventId)
      ));

    const totalGuests = eventGuestCount[0]?.count ?? 0;
    const unsubscribedCount = unsubscribedInEvent[0]?.count ?? 0;

    return totalGuests - unsubscribedCount;
  },

  /**
   * Update recipient count on campaign
   * Requirements: 3
   */
  async updateRecipientCount(campaignId: string): Promise<Campaign> {
    const count = await this.getRecipientCount(campaignId);

    const [updated] = await db.update(campaigns)
      .set({ 
        recipientCount: count,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId))
      .returning();

    return updated;
  },

  // ============================================================================
  // SEND PROGRESS TRACKING
  // ============================================================================

  /**
   * Get send progress for a campaign
   * Requirements: 11
   */
  async getSendProgress(campaignId: string): Promise<SendProgress> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Calculate progress percentage
    const progressPercent = campaign.recipientCount > 0
      ? Math.round((campaign.sentCount / campaign.recipientCount) * 100)
      : 0;

    // Estimate time remaining (rough estimate based on average send rate)
    // Assuming ~10 emails per second average
    const remainingEmails = campaign.recipientCount - campaign.sentCount;
    const estimatedTimeRemaining = campaign.status === 'Sending' && remainingEmails > 0
      ? Math.ceil(remainingEmails / 10)
      : null;

    return {
      campaignId,
      status: campaign.status,
      recipientCount: campaign.recipientCount,
      sentCount: campaign.sentCount,
      deliveredCount: campaign.deliveredCount,
      failedCount: campaign.bouncedCount, // Using bounced as failed for now
      bouncedCount: campaign.bouncedCount,
      openedCount: campaign.openedCount,
      clickedCount: campaign.clickedCount,
      progressPercent,
      estimatedTimeRemaining,
    };
  },

  /**
   * Update campaign analytics counters
   * Requirements: 7
   */
  async updateAnalytics(
    campaignId: string,
    updates: {
      sentCount?: number;
      deliveredCount?: number;
      openedCount?: number;
      clickedCount?: number;
      bouncedCount?: number;
      unsubscribedCount?: number;
    }
  ): Promise<Campaign> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    const updateData: Partial<typeof campaigns.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.sentCount !== undefined) {
      updateData.sentCount = campaign.sentCount + updates.sentCount;
    }
    if (updates.deliveredCount !== undefined) {
      updateData.deliveredCount = campaign.deliveredCount + updates.deliveredCount;
    }
    if (updates.openedCount !== undefined) {
      updateData.openedCount = campaign.openedCount + updates.openedCount;
    }
    if (updates.clickedCount !== undefined) {
      updateData.clickedCount = campaign.clickedCount + updates.clickedCount;
    }
    if (updates.bouncedCount !== undefined) {
      updateData.bouncedCount = campaign.bouncedCount + updates.bouncedCount;
    }
    if (updates.unsubscribedCount !== undefined) {
      updateData.unsubscribedCount = campaign.unsubscribedCount + updates.unsubscribedCount;
    }

    const [updated] = await db.update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, campaignId))
      .returning();

    return updated;
  },

  /**
   * Increment a specific counter atomically
   * Requirements: 7
   */
  async incrementCounter(
    campaignId: string,
    counter: 'sentCount' | 'deliveredCount' | 'openedCount' | 'clickedCount' | 'bouncedCount' | 'unsubscribedCount',
    amount: number = 1
  ): Promise<void> {
    await db.update(campaigns)
      .set({
        [counter]: sql`${campaigns[counter]} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  },

  // ============================================================================
  // PAUSE / RESUME / CANCEL FUNCTIONALITY
  // ============================================================================

  /**
   * Pause a sending campaign
   * Requirements: 11
   */
  async pause(campaignId: string): Promise<Campaign> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (campaign.status !== 'Sending') {
      throw new Error(`Cannot pause campaign with status "${campaign.status}". Only sending campaigns can be paused.`);
    }

    const [updated] = await db.update(campaigns)
      .set({
        status: 'Paused' as CampaignStatus,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId))
      .returning();

    return updated;
  },

  /**
   * Resume a paused campaign
   * Requirements: 11
   */
  async resume(campaignId: string): Promise<Campaign> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (campaign.status !== 'Paused') {
      throw new Error(`Cannot resume campaign with status "${campaign.status}". Only paused campaigns can be resumed.`);
    }

    const [updated] = await db.update(campaigns)
      .set({
        status: 'Sending' as CampaignStatus,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId))
      .returning();

    return updated;
  },

  /**
   * Cancel a campaign (cannot be resumed)
   * Requirements: 11
   */
  async cancel(campaignId: string): Promise<Campaign> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Can cancel from Draft, Scheduled, Sending, or Paused
    const cancellableStatuses: CampaignStatus[] = ['Draft', 'Scheduled', 'Sending', 'Paused'];
    if (!cancellableStatuses.includes(campaign.status)) {
      throw new Error(`Cannot cancel campaign with status "${campaign.status}". Campaign may already be sent or cancelled.`);
    }

    const [updated] = await db.update(campaigns)
      .set({
        status: 'Cancelled' as CampaignStatus,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId))
      .returning();

    return updated;
  },

  /**
   * Check if a campaign can be sent
   * Requirements: 11
   */
  async canSend(campaignId: string): Promise<{ canSend: boolean; reason?: string }> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      return { canSend: false, reason: 'Campaign not found' };
    }

    if (campaign.status === 'Sent') {
      return { canSend: false, reason: 'Campaign has already been sent' };
    }

    if (campaign.status === 'Sending') {
      return { canSend: false, reason: 'Campaign is currently being sent' };
    }

    if (campaign.status === 'Cancelled') {
      return { canSend: false, reason: 'Campaign has been cancelled' };
    }

    const recipientCount = await this.getRecipientCount(campaignId);
    if (recipientCount === 0) {
      return { canSend: false, reason: 'Campaign has no recipients' };
    }

    // WhatsApp template validation (Requirements: 8.1, 8.2, 8.3)
    if (campaign.channel === 'whatsapp') {
      const templateValidation = await validateWhatsAppCampaignTemplate(
        campaign.channel,
        campaign.whatsappTemplateId,
      );
      if (!templateValidation.valid) {
        return { canSend: false, reason: templateValidation.reason };
      }
    }

    return { canSend: true };
  },

  /**
   * Get pending messages for a campaign (for resuming)
   * Requirements: 11
   */
  async getPendingRecipients(campaignId: string): Promise<string[]> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get event guest IDs that already have messages
    const existingMessages = await db
      .select({ eventGuestId: campaignMessages.eventGuestId })
      .from(campaignMessages)
      .where(eq(campaignMessages.campaignId, campaignId));
    
    const sentEventGuestIds = existingMessages.map(m => m.eventGuestId);

    // Get unsubscribed emails
    const unsubscribedEmails = await db
      .select({ email: unsubscribes.email })
      .from(unsubscribes);
    const unsubscribedSet = new Set(unsubscribedEmails.map(u => u.email));

    // Get event guests that haven't been sent to yet
    const eventGuestsList = await db.query.eventGuests.findMany({
      where: and(
        eq(eventGuests.eventId, campaign.eventId),
        sentEventGuestIds.length > 0 
          ? notInArray(eventGuests.id, sentEventGuestIds)
          : undefined
      ),
      with: {
        guest: true,
      },
    });

    // Filter out unsubscribed
    return eventGuestsList
      .filter(eg => !unsubscribedSet.has(eg.guest.email))
      .map(eg => eg.id);
  },
};

// ============================================================================
// WHATSAPP TEMPLATE VALIDATION
// ============================================================================

/**
 * Validation result for WhatsApp campaign template checks.
 */
export type WhatsAppTemplateValidationResult = {
  valid: boolean;
  reason?: string;
};

/**
 * Validates that a WhatsApp campaign has a valid, APPROVED template.
 *
 * This function is intentionally standalone and exported so it can be
 * tested independently of the CampaignService.
 *
 * Rules:
 * - If channel is 'whatsapp', a non-null whatsappTemplateId is required
 * - The template must exist in the local DB
 * - The template status must be APPROVED
 * - PENDING, REJECTED, PAUSED, and DISABLED statuses block sending
 *
 * @param channel            - The campaign channel
 * @param whatsappTemplateId - The template ID stored on the campaign (may be null)
 * @returns Validation result with `valid` flag and optional `reason`
 *
 * Requirements: 8.1, 8.2, 8.3
 */
export async function validateWhatsAppCampaignTemplate(
  channel: string,
  whatsappTemplateId: string | null | undefined,
): Promise<WhatsAppTemplateValidationResult> {
  // Only applies to WhatsApp campaigns
  if (channel !== 'whatsapp') {
    return { valid: true };
  }

  // Requirement 8.1: WhatsApp campaigns require a template
  if (!whatsappTemplateId) {
    return {
      valid: false,
      reason: 'WhatsApp campaigns require a template to be selected before sending',
    };
  }

  // Look up the template in the local DB
  const template = await WhatsAppTemplateManagementService.getTemplate(whatsappTemplateId);

  if (!template) {
    return {
      valid: false,
      reason: `Template "${whatsappTemplateId}" not found. Please select a valid template.`,
    };
  }

  // Requirement 8.2: Template must be APPROVED
  if (template.status === 'APPROVED') {
    return { valid: true };
  }

  // Requirement 8.3: Block with descriptive error for non-APPROVED statuses
  const statusMessages: Record<string, string> = {
    PENDING: 'Template is pending Meta review and cannot be used for sending yet',
    REJECTED: 'Template has been rejected by Meta and cannot be used for sending',
    PAUSED: 'Template has been paused by Meta and cannot be used for sending',
    DISABLED: 'Template has been disabled and cannot be used for sending',
  };

  const message = statusMessages[template.status]
    ?? `Template has status "${template.status}" and cannot be used for sending`;

  return {
    valid: false,
    reason: message,
  };
}

export default CampaignService;
