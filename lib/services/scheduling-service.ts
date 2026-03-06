/**
 * @fileoverview Campaign Scheduling Service
 * 
 * This service handles campaign scheduling operations including:
 * - Scheduling campaigns for future date/time
 * - Timezone handling and conversion
 * - Reminder notifications (24h, 1h before)
 * - Cancelling scheduled campaigns
 * - Recurring campaign support (daily, weekly, monthly)
 * 
 * @module lib/services/scheduling-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { SchedulingService } from '@/lib/services';
 * 
 * // Schedule a campaign for future delivery
 * const schedule = await SchedulingService.scheduleCampaign({
 *   campaignId: 'campaign123',
 *   scheduledAt: new Date('2025-02-01T10:00:00Z'),
 *   timezone: 'America/New_York',
 * });
 * 
 * // Set up a recurring campaign
 * const recurring = await SchedulingService.scheduleCampaign({
 *   campaignId: 'campaign456',
 *   scheduledAt: new Date('2025-02-01T10:00:00Z'),
 *   timezone: 'America/New_York',
 *   isRecurring: true,
 *   recurrencePattern: 'weekly',
 *   recurrenceEndDate: new Date('2025-06-01'),
 * });
 * 
 * // Cancel a scheduled campaign
 * await SchedulingService.cancelScheduledCampaign('campaign123');
 * ```
 * 
 * Requirements: 13 (Campaign Scheduling and Automation)
 */

import { z } from 'zod';
import { db } from '@/db';
import {
  campaigns,
  campaignSchedules,
  type Campaign,
  type CampaignSchedule,
  type CampaignStatus,
  type RecurrencePattern,
} from '@/db/schema';
import { eq, and, lte, gte, isNull, or, sql } from 'drizzle-orm';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Minimum time in the future a campaign can be scheduled (in minutes)
 */
export const MIN_SCHEDULE_LEAD_TIME_MINUTES = 15;

/**
 * Reminder notification thresholds in hours
 */
export const REMINDER_THRESHOLDS = {
  HOURS_24: 24,
  HOURS_1: 1,
} as const;

/**
 * Valid recurrence patterns
 */
export const RECURRENCE_PATTERNS = ['daily', 'weekly', 'monthly'] as const;

/**
 * Common timezone options for validation
 */
export const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Jerusalem',
] as const;

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for scheduling a campaign
 * Requirements: 13.1, 13.2
 */
export const scheduleCampaignSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required'),
  scheduledAt: z.coerce.date().refine(
    (date) => date > new Date(Date.now() + MIN_SCHEDULE_LEAD_TIME_MINUTES * 60 * 1000),
    `Scheduled time must be at least ${MIN_SCHEDULE_LEAD_TIME_MINUTES} minutes in the future`
  ),
  timezone: z.string().min(1, 'Timezone is required'),
  isRecurring: z.boolean().optional().default(false),
  recurrencePattern: z.enum(RECURRENCE_PATTERNS).optional().nullable(),
  recurrenceEndDate: z.coerce.date().optional().nullable(),
}).refine(
  (data) => {
    // If recurring, must have a pattern
    if (data.isRecurring && !data.recurrencePattern) {
      return false;
    }
    return true;
  },
  { message: 'Recurrence pattern is required for recurring campaigns' }
).refine(
  (data) => {
    // If end date is set, it must be after scheduled date
    if (data.recurrenceEndDate && data.recurrenceEndDate <= data.scheduledAt) {
      return false;
    }
    return true;
  },
  { message: 'Recurrence end date must be after the scheduled date' }
);

/**
 * Schema for updating a schedule
 */
export const updateScheduleSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  timezone: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurrencePattern: z.enum(RECURRENCE_PATTERNS).optional().nullable(),
  recurrenceEndDate: z.coerce.date().optional().nullable(),
});

export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Schedule with campaign details
 */
export type ScheduleWithCampaign = CampaignSchedule & {
  campaign: {
    id: string;
    name: string;
    status: CampaignStatus;
    eventId: string;
  };
};

/**
 * Campaigns due for sending
 */
export type DueCampaign = {
  scheduleId: string;
  campaignId: string;
  campaignName: string;
  scheduledAt: Date;
  timezone: string;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern | null;
  recurrenceEndDate: Date | null;
};

/**
 * Campaigns due for reminder notifications
 */
export type ReminderDueCampaign = {
  scheduleId: string;
  campaignId: string;
  campaignName: string;
  scheduledAt: Date;
  timezone: string;
  reminderType: '24h' | '1h';
};

/**
 * Result of scheduling a campaign
 */
export type ScheduleResult = {
  schedule: CampaignSchedule;
  campaign: Campaign;
};

/**
 * Result of processing scheduled campaigns
 */
export type ProcessScheduledResult = {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ campaignId: string; error: string }>;
};

/**
 * Next occurrence calculation result
 */
export type NextOccurrence = {
  nextDate: Date;
  isWithinEndDate: boolean;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate that a timezone string is valid
 */
function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a date to a specific timezone
 */
function convertToTimezone(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const values: Record<string, string> = {};
  parts.forEach(part => {
    values[part.type] = part.value;
  });
  
  return new Date(
    `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
  );
}

/**
 * Calculate the next occurrence for a recurring campaign
 * Requirements: 13.6
 */
function calculateNextOccurrence(
  currentDate: Date,
  pattern: RecurrencePattern,
  endDate: Date | null
): NextOccurrence {
  const nextDate = new Date(currentDate);
  
  switch (pattern) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }
  
  const isWithinEndDate = endDate ? nextDate <= endDate : true;
  
  return { nextDate, isWithinEndDate };
}

/**
 * Format date for display with timezone
 */
function formatScheduledTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * SchedulingService - Manages campaign scheduling operations.
 * 
 * Provides methods for:
 * - Scheduling campaigns for future delivery
 * - Managing timezone conversions
 * - Handling reminder notifications
 * - Cancelling scheduled campaigns
 * - Supporting recurring campaigns
 * 
 * Requirements: 13 (Campaign Scheduling and Automation)
 */
export const SchedulingService = {
  /**
   * Schedule a campaign for future delivery
   * 
   * @param input - Scheduling configuration
   * @returns The created schedule and updated campaign
   * @throws {Error} If campaign not found or already scheduled
   * 
   * Requirements: 13.1, 13.2
   */
  async scheduleCampaign(input: ScheduleCampaignInput): Promise<ScheduleResult> {
    // Validate input
    const validated = scheduleCampaignSchema.parse(input);
    
    // Validate timezone
    if (!isValidTimezone(validated.timezone)) {
      throw new Error(`Invalid timezone: ${validated.timezone}`);
    }
    
    // Check if campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, validated.campaignId),
    });
    
    if (!campaign) {
      throw new Error(`Campaign with ID "${validated.campaignId}" not found`);
    }
    
    // Check if campaign is in a schedulable state
    const schedulableStatuses: CampaignStatus[] = ['Draft'];
    if (!schedulableStatuses.includes(campaign.status)) {
      throw new Error(
        `Cannot schedule campaign with status "${campaign.status}". Only draft campaigns can be scheduled.`
      );
    }
    
    // Check if campaign already has a schedule
    const existingSchedule = await db.query.campaignSchedules.findFirst({
      where: eq(campaignSchedules.campaignId, validated.campaignId),
    });
    
    if (existingSchedule) {
      throw new Error(
        `Campaign "${validated.campaignId}" already has a schedule. Use updateSchedule to modify it.`
      );
    }
    
    // Create the schedule
    const [schedule] = await db.insert(campaignSchedules).values({
      campaignId: validated.campaignId,
      scheduledAt: validated.scheduledAt,
      timezone: validated.timezone,
      isRecurring: validated.isRecurring,
      recurrencePattern: validated.recurrencePattern as RecurrencePattern | null,
      recurrenceEndDate: validated.recurrenceEndDate,
      reminderSent24h: false,
      reminderSent1h: false,
    }).returning();
    
    // Update campaign status to Scheduled
    const [updatedCampaign] = await db.update(campaigns)
      .set({
        status: 'Scheduled' as CampaignStatus,
        scheduledAt: validated.scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, validated.campaignId))
      .returning();
    
    return { schedule, campaign: updatedCampaign };
  },

  /**
   * Update an existing schedule
   * 
   * @param campaignId - Campaign ID
   * @param input - Updated schedule data
   * @returns The updated schedule
   * 
   * Requirements: 13.1, 13.2
   */
  async updateSchedule(
    campaignId: string,
    input: UpdateScheduleInput
  ): Promise<CampaignSchedule> {
    const validated = updateScheduleSchema.parse(input);
    
    // Check if schedule exists
    const existingSchedule = await db.query.campaignSchedules.findFirst({
      where: eq(campaignSchedules.campaignId, campaignId),
    });
    
    if (!existingSchedule) {
      throw new Error(`No schedule found for campaign "${campaignId}"`);
    }
    
    // Check if campaign is still scheduled
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
    
    if (!campaign || campaign.status !== 'Scheduled') {
      throw new Error(
        `Cannot update schedule for campaign with status "${campaign?.status}". Campaign must be in Scheduled status.`
      );
    }
    
    // Validate timezone if provided
    if (validated.timezone && !isValidTimezone(validated.timezone)) {
      throw new Error(`Invalid timezone: ${validated.timezone}`);
    }
    
    // Validate scheduled time if provided
    if (validated.scheduledAt) {
      const minTime = new Date(Date.now() + MIN_SCHEDULE_LEAD_TIME_MINUTES * 60 * 1000);
      if (validated.scheduledAt <= minTime) {
        throw new Error(
          `Scheduled time must be at least ${MIN_SCHEDULE_LEAD_TIME_MINUTES} minutes in the future`
        );
      }
    }
    
    // Build update data
    const updateData: Partial<typeof campaignSchedules.$inferInsert> = {};
    
    if (validated.scheduledAt !== undefined) {
      updateData.scheduledAt = validated.scheduledAt;
      // Reset reminder flags if time changed
      updateData.reminderSent24h = false;
      updateData.reminderSent1h = false;
    }
    if (validated.timezone !== undefined) {
      updateData.timezone = validated.timezone;
    }
    if (validated.isRecurring !== undefined) {
      updateData.isRecurring = validated.isRecurring;
    }
    if (validated.recurrencePattern !== undefined) {
      updateData.recurrencePattern = validated.recurrencePattern as RecurrencePattern | null;
    }
    if (validated.recurrenceEndDate !== undefined) {
      updateData.recurrenceEndDate = validated.recurrenceEndDate;
    }
    
    const [updatedSchedule] = await db.update(campaignSchedules)
      .set(updateData)
      .where(eq(campaignSchedules.campaignId, campaignId))
      .returning();
    
    // Update campaign scheduledAt if changed
    if (validated.scheduledAt) {
      await db.update(campaigns)
        .set({
          scheduledAt: validated.scheduledAt,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
    }
    
    return updatedSchedule;
  },

  /**
   * Cancel a scheduled campaign
   * 
   * @param campaignId - Campaign ID to cancel
   * @returns The cancelled campaign
   * 
   * Requirements: 13.5
   */
  async cancelScheduledCampaign(campaignId: string): Promise<Campaign> {
    // Check if campaign exists and is scheduled
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
    
    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }
    
    if (campaign.status !== 'Scheduled') {
      throw new Error(
        `Cannot cancel campaign with status "${campaign.status}". Only scheduled campaigns can be cancelled.`
      );
    }
    
    // Delete the schedule
    await db.delete(campaignSchedules)
      .where(eq(campaignSchedules.campaignId, campaignId));
    
    // Update campaign status to Cancelled
    const [updatedCampaign] = await db.update(campaigns)
      .set({
        status: 'Cancelled' as CampaignStatus,
        scheduledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId))
      .returning();
    
    return updatedCampaign;
  },

  /**
   * Get schedule for a campaign
   * 
   * @param campaignId - Campaign ID
   * @returns The schedule or null if not found
   */
  async getSchedule(campaignId: string): Promise<ScheduleWithCampaign | null> {
    const schedule = await db.query.campaignSchedules.findFirst({
      where: eq(campaignSchedules.campaignId, campaignId),
      with: {
        campaign: {
          columns: {
            id: true,
            name: true,
            status: true,
            eventId: true,
          },
        },
      },
    });
    
    if (!schedule) return null;
    
    return {
      ...schedule,
      campaign: {
        id: schedule.campaign.id,
        name: schedule.campaign.name,
        status: schedule.campaign.status,
        eventId: schedule.campaign.eventId,
      },
    };
  },

  /**
   * Get all campaigns due for sending
   * 
   * @param asOfDate - Check campaigns due as of this date (defaults to now)
   * @returns List of campaigns due for sending
   * 
   * Requirements: 13.7
   */
  async getDueCampaigns(asOfDate: Date = new Date()): Promise<DueCampaign[]> {
    const schedules = await db.query.campaignSchedules.findFirst({
      where: and(
        lte(campaignSchedules.scheduledAt, asOfDate),
      ),
      with: {
        campaign: {
          columns: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });
    
    // Query all due schedules
    const dueSchedules = await db
      .select({
        scheduleId: campaignSchedules.id,
        campaignId: campaignSchedules.campaignId,
        scheduledAt: campaignSchedules.scheduledAt,
        timezone: campaignSchedules.timezone,
        isRecurring: campaignSchedules.isRecurring,
        recurrencePattern: campaignSchedules.recurrencePattern,
        recurrenceEndDate: campaignSchedules.recurrenceEndDate,
        campaignName: campaigns.name,
        campaignStatus: campaigns.status,
      })
      .from(campaignSchedules)
      .innerJoin(campaigns, eq(campaignSchedules.campaignId, campaigns.id))
      .where(
        and(
          lte(campaignSchedules.scheduledAt, asOfDate),
          eq(campaigns.status, 'Scheduled')
        )
      );
    
    return dueSchedules.map(s => ({
      scheduleId: s.scheduleId,
      campaignId: s.campaignId,
      campaignName: s.campaignName,
      scheduledAt: s.scheduledAt,
      timezone: s.timezone,
      isRecurring: s.isRecurring,
      recurrencePattern: s.recurrencePattern,
      recurrenceEndDate: s.recurrenceEndDate,
    }));
  },

  /**
   * Get campaigns due for reminder notifications
   * 
   * @param asOfDate - Check reminders as of this date (defaults to now)
   * @returns List of campaigns needing reminders
   * 
   * Requirements: 13.4
   */
  async getReminderDueCampaigns(asOfDate: Date = new Date()): Promise<ReminderDueCampaign[]> {
    const reminders: ReminderDueCampaign[] = [];
    
    // Calculate threshold times
    const threshold24h = new Date(asOfDate.getTime() + REMINDER_THRESHOLDS.HOURS_24 * 60 * 60 * 1000);
    const threshold1h = new Date(asOfDate.getTime() + REMINDER_THRESHOLDS.HOURS_1 * 60 * 60 * 1000);
    
    // Get campaigns needing 24h reminder
    const due24h = await db
      .select({
        scheduleId: campaignSchedules.id,
        campaignId: campaignSchedules.campaignId,
        scheduledAt: campaignSchedules.scheduledAt,
        timezone: campaignSchedules.timezone,
        campaignName: campaigns.name,
      })
      .from(campaignSchedules)
      .innerJoin(campaigns, eq(campaignSchedules.campaignId, campaigns.id))
      .where(
        and(
          eq(campaignSchedules.reminderSent24h, false),
          lte(campaignSchedules.scheduledAt, threshold24h),
          gte(campaignSchedules.scheduledAt, asOfDate),
          eq(campaigns.status, 'Scheduled')
        )
      );
    
    reminders.push(...due24h.map(s => ({
      scheduleId: s.scheduleId,
      campaignId: s.campaignId,
      campaignName: s.campaignName,
      scheduledAt: s.scheduledAt,
      timezone: s.timezone,
      reminderType: '24h' as const,
    })));
    
    // Get campaigns needing 1h reminder
    const due1h = await db
      .select({
        scheduleId: campaignSchedules.id,
        campaignId: campaignSchedules.campaignId,
        scheduledAt: campaignSchedules.scheduledAt,
        timezone: campaignSchedules.timezone,
        campaignName: campaigns.name,
      })
      .from(campaignSchedules)
      .innerJoin(campaigns, eq(campaignSchedules.campaignId, campaigns.id))
      .where(
        and(
          eq(campaignSchedules.reminderSent1h, false),
          lte(campaignSchedules.scheduledAt, threshold1h),
          gte(campaignSchedules.scheduledAt, asOfDate),
          eq(campaigns.status, 'Scheduled')
        )
      );
    
    reminders.push(...due1h.map(s => ({
      scheduleId: s.scheduleId,
      campaignId: s.campaignId,
      campaignName: s.campaignName,
      scheduledAt: s.scheduledAt,
      timezone: s.timezone,
      reminderType: '1h' as const,
    })));
    
    return reminders;
  },

  /**
   * Mark reminder as sent
   * 
   * @param scheduleId - Schedule ID
   * @param reminderType - Type of reminder sent
   * 
   * Requirements: 13.4
   */
  async markReminderSent(
    scheduleId: string,
    reminderType: '24h' | '1h'
  ): Promise<void> {
    const updateData = reminderType === '24h'
      ? { reminderSent24h: true }
      : { reminderSent1h: true };
    
    await db.update(campaignSchedules)
      .set(updateData)
      .where(eq(campaignSchedules.id, scheduleId));
  },

  /**
   * Process a recurring campaign after it's been sent
   * Creates the next occurrence or removes the schedule if ended
   * 
   * @param campaignId - Campaign ID
   * @returns The next scheduled date or null if recurring ended
   * 
   * Requirements: 13.6
   */
  async processRecurringCampaign(campaignId: string): Promise<Date | null> {
    const schedule = await db.query.campaignSchedules.findFirst({
      where: eq(campaignSchedules.campaignId, campaignId),
    });
    
    if (!schedule || !schedule.isRecurring || !schedule.recurrencePattern) {
      return null;
    }
    
    // Calculate next occurrence
    const { nextDate, isWithinEndDate } = calculateNextOccurrence(
      schedule.scheduledAt,
      schedule.recurrencePattern,
      schedule.recurrenceEndDate
    );
    
    if (!isWithinEndDate) {
      // Recurring has ended, remove schedule
      await db.delete(campaignSchedules)
        .where(eq(campaignSchedules.id, schedule.id));
      return null;
    }
    
    // Update schedule with next occurrence
    await db.update(campaignSchedules)
      .set({
        scheduledAt: nextDate,
        reminderSent24h: false,
        reminderSent1h: false,
      })
      .where(eq(campaignSchedules.id, schedule.id));
    
    // Update campaign to scheduled status with new date
    await db.update(campaigns)
      .set({
        status: 'Scheduled' as CampaignStatus,
        scheduledAt: nextDate,
        sentAt: null,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
    
    return nextDate;
  },

  /**
   * Get all scheduled campaigns (for calendar view)
   * 
   * @param startDate - Start of date range
   * @param endDate - End of date range
   * @returns List of scheduled campaigns in the date range
   * 
   * Requirements: 13.3
   */
  async getScheduledCampaigns(
    startDate: Date,
    endDate: Date
  ): Promise<ScheduleWithCampaign[]> {
    const schedules = await db.query.campaignSchedules.findMany({
      where: and(
        gte(campaignSchedules.scheduledAt, startDate),
        lte(campaignSchedules.scheduledAt, endDate)
      ),
      with: {
        campaign: {
          columns: {
            id: true,
            name: true,
            status: true,
            eventId: true,
          },
        },
      },
      orderBy: (campaignSchedules, { asc }) => [asc(campaignSchedules.scheduledAt)],
    });
    
    return schedules.map(s => ({
      ...s,
      campaign: {
        id: s.campaign.id,
        name: s.campaign.name,
        status: s.campaign.status,
        eventId: s.campaign.eventId,
      },
    }));
  },

  /**
   * Format scheduled time for display
   * 
   * @param date - Date to format
   * @param timezone - Timezone for display
   * @returns Formatted date string
   */
  formatScheduledTime(date: Date, timezone: string): string {
    return formatScheduledTime(date, timezone);
  },

  /**
   * Calculate next occurrence for a recurring pattern
   * 
   * @param currentDate - Current scheduled date
   * @param pattern - Recurrence pattern
   * @param endDate - Optional end date
   * @returns Next occurrence details
   * 
   * Requirements: 13.6
   */
  calculateNextOccurrence(
    currentDate: Date,
    pattern: RecurrencePattern,
    endDate: Date | null
  ): NextOccurrence {
    return calculateNextOccurrence(currentDate, pattern, endDate);
  },

  /**
   * Validate a timezone string
   * 
   * @param timezone - Timezone to validate
   * @returns True if valid
   */
  isValidTimezone(timezone: string): boolean {
    return isValidTimezone(timezone);
  },

  /**
   * Get the minimum schedulable date
   * 
   * @returns Minimum date that can be scheduled
   */
  getMinScheduleDate(): Date {
    return new Date(Date.now() + MIN_SCHEDULE_LEAD_TIME_MINUTES * 60 * 1000);
  },
};

export default SchedulingService;
