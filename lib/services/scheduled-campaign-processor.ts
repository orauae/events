/**
 * @fileoverview Scheduled Campaign Processor Service
 * 
 * This service handles the background processing of scheduled campaigns:
 * - Processes campaigns that are due for sending
 * - Sends reminder notifications (24h, 1h before)
 * - Handles recurring campaign scheduling
 * 
 * This service is designed to be called by a cron job or background worker.
 * 
 * @module lib/services/scheduled-campaign-processor
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { ScheduledCampaignProcessor } from '@/lib/services';
 * 
 * // Process all due campaigns (call from cron job)
 * const result = await ScheduledCampaignProcessor.processScheduledCampaigns();
 * console.log(`Processed: ${result.processed}, Succeeded: ${result.succeeded}`);
 * 
 * // Process reminder notifications
 * const reminders = await ScheduledCampaignProcessor.processReminders();
 * console.log(`Sent ${reminders.sent} reminders`);
 * ```
 * 
 * Requirements: 13 (Campaign Scheduling and Automation)
 * Requirements: 13.4 - Reminder notifications (24h, 1h before)
 * Requirements: 13.7 - Automatic campaign send when scheduled time arrives
 */

import { db } from '@/db';
import { campaigns, campaignSchedules, type CampaignStatus } from '@/db/schema';
import { eq, and, lte, gte } from 'drizzle-orm';
import { SchedulingService, type ProcessScheduledResult, type ReminderDueCampaign } from './scheduling-service';
import { CampaignSendService } from './campaign-send-service';
import { ABTestService } from './ab-test-service';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of processing reminders
 */
export interface ProcessRemindersResult {
  processed: number;
  sent: number;
  failed: number;
  errors: Array<{ campaignId: string; reminderType: string; error: string }>;
}

/**
 * Notification handler interface for sending reminders
 */
export interface ReminderNotificationHandler {
  send24hReminder(campaign: ReminderDueCampaign): Promise<void>;
  send1hReminder(campaign: ReminderDueCampaign): Promise<void>;
}

// ============================================================================
// DEFAULT NOTIFICATION HANDLER
// ============================================================================

/**
 * Default notification handler that logs reminders
 * In production, this would send emails or push notifications
 */
const defaultNotificationHandler: ReminderNotificationHandler = {
  async send24hReminder(campaign: ReminderDueCampaign): Promise<void> {
    console.log(`[ScheduledCampaignProcessor] 24h reminder for campaign "${campaign.campaignName}" (${campaign.campaignId})`);
    console.log(`  Scheduled for: ${campaign.scheduledAt.toISOString()} (${campaign.timezone})`);
    // In production: Send email notification to admin
  },
  
  async send1hReminder(campaign: ReminderDueCampaign): Promise<void> {
    console.log(`[ScheduledCampaignProcessor] 1h reminder for campaign "${campaign.campaignName}" (${campaign.campaignId})`);
    console.log(`  Scheduled for: ${campaign.scheduledAt.toISOString()} (${campaign.timezone})`);
    // In production: Send email notification to admin
  },
};

// Allow overriding the notification handler for testing
let notificationHandler: ReminderNotificationHandler = defaultNotificationHandler;

/**
 * Set a custom notification handler (for testing or custom implementations)
 */
export const setNotificationHandler = (handler: ReminderNotificationHandler): void => {
  notificationHandler = handler;
};

/**
 * Reset to default notification handler
 */
export const resetNotificationHandler = (): void => {
  notificationHandler = defaultNotificationHandler;
};

// ============================================================================
// SERVICE
// ============================================================================

/**
 * ScheduledCampaignProcessor - Handles background processing of scheduled campaigns.
 * 
 * This service is designed to be called periodically by a cron job or background worker.
 * It processes:
 * - Campaigns that are due for sending
 * - Reminder notifications before scheduled sends
 * - Recurring campaign rescheduling
 * 
 * Requirements: 13 (Campaign Scheduling and Automation)
 */
export const ScheduledCampaignProcessor = {
  /**
   * Process all campaigns that are due for sending.
   * 
   * This method should be called periodically (e.g., every minute) by a cron job.
   * It finds all campaigns with scheduledAt <= now and status = 'Scheduled',
   * then triggers the send process for each.
   * 
   * @param baseUrl - Base URL for generating RSVP and badge links
   * @param asOfDate - Process campaigns due as of this date (defaults to now)
   * @returns Processing result with success/failure counts
   * 
   * Requirements: 13.7
   */
  async processScheduledCampaigns(
    baseUrl: string,
    asOfDate: Date = new Date()
  ): Promise<ProcessScheduledResult> {
    const result: ProcessScheduledResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Get all campaigns due for sending
      const dueCampaigns = await SchedulingService.getDueCampaigns(asOfDate);
      
      console.log(`[ScheduledCampaignProcessor] Found ${dueCampaigns.length} campaigns due for sending`);
      
      for (const dueCampaign of dueCampaigns) {
        result.processed++;
        
        try {
          console.log(`[ScheduledCampaignProcessor] Processing campaign "${dueCampaign.campaignName}" (${dueCampaign.campaignId})`);
          
          // Try to use background task first, fall back to sync send
          let sendResult: Awaited<ReturnType<typeof CampaignSendService.send>>;
          let usedBackgroundTask = false;
          
          try {
            // Update campaign status to Queued
            await db.update(campaigns)
              .set({ status: 'Queued', updatedAt: new Date() })
              .where(eq(campaigns.id, dueCampaign.campaignId));
            
            // Enqueue the background job
            const { sendJob } = await import('@/lib/jobs');
            await sendJob('bulk-email-send', {
              campaignId: dueCampaign.campaignId,
              baseUrl,
              batchSize: 100,
              batchDelayMs: 1000,
            });
            
            console.log(`[ScheduledCampaignProcessor] Enqueued background job for campaign "${dueCampaign.campaignName}"`);
            usedBackgroundTask = true;
            result.succeeded++;
            
            // For background jobs, we assume success since actual errors will be handled by the worker
            sendResult = {
              success: true,
              campaignId: dueCampaign.campaignId,
              totalRecipients: 0,
              sent: 0,
              failed: 0,
              skipped: 0,
              errors: [],
              batchesProcessed: 0,
              isPaused: false,
            };
          } catch {
            console.log(`[ScheduledCampaignProcessor] Job queue not available, using sync send for "${dueCampaign.campaignName}"`);
            // Fall back to sync send
            sendResult = await CampaignSendService.send(dueCampaign.campaignId, baseUrl);
          }
          
          if (!usedBackgroundTask) {
            if (sendResult.success) {
              result.succeeded++;
              console.log(`[ScheduledCampaignProcessor] Successfully sent campaign "${dueCampaign.campaignName}"`);
              console.log(`  Sent: ${sendResult.sent}, Failed: ${sendResult.failed}, Skipped: ${sendResult.skipped}`);
            } else {
              result.failed++;
              const errorMsg = sendResult.errors.length > 0 
                ? sendResult.errors.map(e => e.error).join(', ')
                : 'Unknown error';
              result.errors.push({
                campaignId: dueCampaign.campaignId,
                error: errorMsg,
              });
              console.error(`[ScheduledCampaignProcessor] Failed to send campaign "${dueCampaign.campaignName}": ${errorMsg}`);
              // Skip recurring logic on failure
              continue;
            }
          }
          
          // Handle recurring campaigns (only if not using background task - the task will handle completion)
          if (!usedBackgroundTask && sendResult.success) {
            if (dueCampaign.isRecurring && dueCampaign.recurrencePattern) {
              const nextDate = await SchedulingService.processRecurringCampaign(dueCampaign.campaignId);
              if (nextDate) {
                console.log(`[ScheduledCampaignProcessor] Rescheduled recurring campaign for ${nextDate.toISOString()}`);
              } else {
                console.log(`[ScheduledCampaignProcessor] Recurring campaign ended (no more occurrences)`);
              }
            } else {
              // Non-recurring: delete the schedule
              await db.delete(campaignSchedules)
                .where(eq(campaignSchedules.id, dueCampaign.scheduleId));
            }
          }
        } catch (error) {
          result.failed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({
            campaignId: dueCampaign.campaignId,
            error: errorMsg,
          });
          console.error(`[ScheduledCampaignProcessor] Error processing campaign "${dueCampaign.campaignName}":`, error);
        }
      }
    } catch (error) {
      console.error('[ScheduledCampaignProcessor] Error fetching due campaigns:', error);
      throw error;
    }

    return result;
  },

  /**
   * Process reminder notifications for upcoming scheduled campaigns.
   * 
   * This method should be called periodically (e.g., every 5 minutes) by a cron job.
   * It sends reminder notifications 24 hours and 1 hour before scheduled sends.
   * 
   * @param asOfDate - Check reminders as of this date (defaults to now)
   * @returns Processing result with success/failure counts
   * 
   * Requirements: 13.4
   */
  async processReminders(asOfDate: Date = new Date()): Promise<ProcessRemindersResult> {
    const result: ProcessRemindersResult = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Get all campaigns needing reminders
      const reminderDueCampaigns = await SchedulingService.getReminderDueCampaigns(asOfDate);
      
      console.log(`[ScheduledCampaignProcessor] Found ${reminderDueCampaigns.length} campaigns needing reminders`);
      
      for (const campaign of reminderDueCampaigns) {
        result.processed++;
        
        try {
          // Send the appropriate reminder
          if (campaign.reminderType === '24h') {
            await notificationHandler.send24hReminder(campaign);
          } else {
            await notificationHandler.send1hReminder(campaign);
          }
          
          // Mark reminder as sent
          await SchedulingService.markReminderSent(campaign.scheduleId, campaign.reminderType);
          
          result.sent++;
          console.log(`[ScheduledCampaignProcessor] Sent ${campaign.reminderType} reminder for "${campaign.campaignName}"`);
        } catch (error) {
          result.failed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({
            campaignId: campaign.campaignId,
            reminderType: campaign.reminderType,
            error: errorMsg,
          });
          console.error(`[ScheduledCampaignProcessor] Error sending reminder for "${campaign.campaignName}":`, error);
        }
      }
    } catch (error) {
      console.error('[ScheduledCampaignProcessor] Error fetching reminder due campaigns:', error);
      throw error;
    }

    return result;
  },

  /**
   * Run a full processing cycle (campaigns + reminders + A/B tests).
   * 
   * This is a convenience method that runs both processScheduledCampaigns
   * and processReminders in sequence, plus processes completed A/B tests.
   * 
   * @param baseUrl - Base URL for generating RSVP and badge links
   * @returns Combined results from all processing steps
   */
  async runProcessingCycle(baseUrl: string): Promise<{
    campaigns: ProcessScheduledResult;
    reminders: ProcessRemindersResult;
    abTests: { processed: number; winnersSelected: number; winnersSent: number; errors: Array<{ campaignId: string; error: string }> };
  }> {
    console.log('[ScheduledCampaignProcessor] Starting processing cycle...');
    
    const campaignResult = await this.processScheduledCampaigns(baseUrl);
    const reminderResult = await this.processReminders();
    const abTestResult = await ABTestService.processCompletedABTests(baseUrl);
    
    console.log('[ScheduledCampaignProcessor] Processing cycle complete');
    console.log(`  Campaigns: ${campaignResult.succeeded}/${campaignResult.processed} succeeded`);
    console.log(`  Reminders: ${reminderResult.sent}/${reminderResult.processed} sent`);
    console.log(`  A/B Tests: ${abTestResult.winnersSelected} winners selected, ${abTestResult.winnersSent} sent`);
    
    return {
      campaigns: campaignResult,
      reminders: reminderResult,
      abTests: abTestResult,
    };
  },
};

export default ScheduledCampaignProcessor;
