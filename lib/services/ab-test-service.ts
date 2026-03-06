/**
 * @fileoverview A/B Test Execution Service
 * 
 * This service handles the execution of A/B test campaigns:
 * - Test audience splitting across variants
 * - Tracking metrics per variant
 * - Auto-selecting winner based on configured metric
 * - Sending winner to remaining recipients
 * 
 * @module lib/services/ab-test-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { ABTestService } from '@/lib/services';
 * 
 * // Start an A/B test campaign
 * const result = await ABTestService.startABTest(campaignId, baseUrl);
 * 
 * // Check if test period has ended and select winner
 * const winner = await ABTestService.checkAndSelectWinner(campaignId);
 * 
 * // Send winner to remaining recipients
 * await ABTestService.sendWinnerToRemaining(campaignId, baseUrl);
 * ```
 * 
 * Requirements: 14 (A/B Testing for Campaigns)
 * Requirements: 14.3 - Test audience percentage (10-50%)
 * Requirements: 14.4 - Auto-select winner based on metric
 * Requirements: 14.5 - Send winner to remaining recipients
 */

import { db } from '@/db';
import {
  campaigns,
  campaignMessages,
  eventGuests,
  type Campaign,
  type CampaignStatus,
} from '@/db/schema';
import { eq, and, inArray, notInArray, sql } from 'drizzle-orm';
import type {
  ABTestConfig,
  ABTestVariant,
  ABTestVariantResult,
  ABTestResults,
  ABTestWinnerMetric,
  SubjectVariant,
  SenderVariant,
  ContentVariant,
} from '@/lib/types/ab-test';
import { CampaignSendService } from './campaign-send-service';
import { BounceService } from './bounce-service';
import { EmailTemplateService } from './email-template-service';
import { OpenTrackingService } from './open-tracking-service';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of starting an A/B test
 */
export interface StartABTestResult {
  success: boolean;
  campaignId: string;
  totalRecipients: number;
  testRecipients: number;
  remainingRecipients: number;
  variantResults: Array<{
    variantId: string;
    variantName: string;
    recipientCount: number;
    sent: number;
    failed: number;
  }>;
  testEndTime: Date;
  errors: Array<{ variantId: string; error: string }>;
}

/**
 * Result of selecting a winner
 */
export interface SelectWinnerResult {
  success: boolean;
  campaignId: string;
  winningVariantId: string | null;
  winningVariantName: string | null;
  winnerMetric: ABTestWinnerMetric;
  winnerMetricValue: number;
  variantResults: ABTestVariantResult[];
  testDurationHours: number;
  autoSendEnabled: boolean;
}

/**
 * Result of sending winner to remaining recipients
 */
export interface SendWinnerResult {
  success: boolean;
  campaignId: string;
  winningVariantId: string;
  remainingRecipients: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ eventGuestId: string; error: string }>;
}

/**
 * Recipient assignment to a variant
 */
interface VariantAssignment {
  eventGuestId: string;
  variantId: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Shuffles an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Splits recipients evenly across variants
 * 
 * Requirements: 14.3 - Test audience percentage
 */
function splitRecipientsAcrossVariants(
  recipientIds: string[],
  variants: ABTestVariant[],
  testPercentage: number
): { testAssignments: VariantAssignment[]; remainingIds: string[] } {
  // Calculate test audience size
  const testCount = Math.ceil(recipientIds.length * (testPercentage / 100));
  
  // Shuffle recipients for random selection
  const shuffled = shuffleArray(recipientIds);
  
  // Split into test and remaining
  const testRecipientIds = shuffled.slice(0, testCount);
  const remainingIds = shuffled.slice(testCount);
  
  // Distribute test recipients evenly across variants
  const assignments: VariantAssignment[] = [];
  const recipientsPerVariant = Math.ceil(testRecipientIds.length / variants.length);
  
  variants.forEach((variant, variantIndex) => {
    const startIdx = variantIndex * recipientsPerVariant;
    const endIdx = Math.min(startIdx + recipientsPerVariant, testRecipientIds.length);
    
    for (let i = startIdx; i < endIdx; i++) {
      assignments.push({
        eventGuestId: testRecipientIds[i],
        variantId: variant.id,
      });
    }
  });
  
  return { testAssignments: assignments, remainingIds };
}

/**
 * Gets the metric value for a variant based on the winner metric
 */
function getMetricValue(result: ABTestVariantResult, metric: ABTestWinnerMetric): number {
  switch (metric) {
    case 'openRate':
      return result.openRate;
    case 'clickRate':
      return result.clickRate;
    case 'conversionRate':
      return result.conversionRate;
    default:
      return result.openRate;
  }
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * ABTestService - Handles A/B test campaign execution.
 * 
 * Features:
 * - Split test audience across variants
 * - Track metrics per variant
 * - Auto-select winner based on configured metric
 * - Send winner to remaining recipients
 * 
 * Requirements: 14 (A/B Testing for Campaigns)
 */
export const ABTestService = {

  /**
   * Starts an A/B test campaign by splitting the audience and sending variants.
   * 
   * Process:
   * 1. Validates campaign has A/B test configuration
   * 2. Gets all deliverable recipients
   * 3. Splits recipients into test group and remaining group
   * 4. Distributes test group evenly across variants
   * 5. Sends each variant to its assigned recipients
   * 6. Records variant assignments for tracking
   * 
   * @param campaignId - The campaign ID
   * @param baseUrl - Base URL for generating RSVP and badge links
   * @returns Result with variant send statistics
   * @throws {Error} If campaign not found or not configured for A/B testing
   * 
   * Requirements: 14.3
   */
  async startABTest(campaignId: string, baseUrl: string): Promise<StartABTestResult> {
    // Get campaign with A/B test config
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
      with: {
        event: true,
      },
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (!campaign.isAbTest || !campaign.abTestConfig) {
      throw new Error('Campaign is not configured for A/B testing');
    }

    if (campaign.status === 'Sent') {
      throw new Error('Campaign has already been sent');
    }

    if (campaign.status === 'Sending') {
      throw new Error('Campaign is currently being sent');
    }

    const abConfig = campaign.abTestConfig as ABTestConfig;

    if (!abConfig.enabled || abConfig.variants.length < 2) {
      throw new Error('A/B test configuration is invalid');
    }

    // Update campaign status to Sending
    await db.update(campaigns)
      .set({ status: 'Sending', updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    // Get all event guests for this campaign's event
    const allEventGuests = await db.query.eventGuests.findMany({
      where: eq(eventGuests.eventId, campaign.eventId),
      with: {
        guest: true,
      },
    });

    // Filter out undeliverable addresses
    const allEmails = allEventGuests.map(eg => eg.guest.email);
    const deliverableEmails = await BounceService.filterDeliverableEmails(allEmails);
    const deliverableEmailSet = new Set(deliverableEmails.map(e => e.toLowerCase()));
    
    const eventGuestsList = allEventGuests.filter(
      eg => deliverableEmailSet.has(eg.guest.email.toLowerCase())
    );

    const recipientIds = eventGuestsList.map(eg => eg.id);

    // Split recipients across variants
    const { testAssignments, remainingIds } = splitRecipientsAcrossVariants(
      recipientIds,
      abConfig.variants,
      abConfig.testAudiencePercentage
    );

    // Calculate test end time
    const testEndTime = new Date();
    testEndTime.setHours(testEndTime.getHours() + abConfig.testDurationHours);

    // Store variant assignments in abTestConfig for later reference
    const updatedConfig: ABTestConfig & { 
      variantAssignments: VariantAssignment[];
      remainingRecipientIds: string[];
      testStartedAt: string;
      testEndTime: string;
    } = {
      ...abConfig,
      variantAssignments: testAssignments,
      remainingRecipientIds: remainingIds,
      testStartedAt: new Date().toISOString(),
      testEndTime: testEndTime.toISOString(),
    };

    await db.update(campaigns)
      .set({ 
        abTestConfig: updatedConfig,
        recipientCount: eventGuestsList.length,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    const result: StartABTestResult = {
      success: true,
      campaignId,
      totalRecipients: eventGuestsList.length,
      testRecipients: testAssignments.length,
      remainingRecipients: remainingIds.length,
      variantResults: [],
      testEndTime,
      errors: [],
    };

    // Create a map of eventGuestId to guest data
    const eventGuestMap = new Map(eventGuestsList.map(eg => [eg.id, eg]));

    // Send each variant to its assigned recipients
    for (const variant of abConfig.variants) {
      const variantAssignments = testAssignments.filter(a => a.variantId === variant.id);
      const variantRecipientIds = variantAssignments.map(a => a.eventGuestId);
      
      const variantResult = {
        variantId: variant.id,
        variantName: variant.name,
        recipientCount: variantRecipientIds.length,
        sent: 0,
        failed: 0,
      };

      try {
        // Send to each recipient in this variant
        for (const eventGuestId of variantRecipientIds) {
          const eventGuest = eventGuestMap.get(eventGuestId);
          if (!eventGuest) continue;

          const sendResult = await this.sendVariantEmail(
            campaign,
            variant,
            abConfig,
            eventGuest,
            baseUrl
          );

          if (sendResult.success) {
            variantResult.sent++;
          } else {
            variantResult.failed++;
            result.errors.push({
              variantId: variant.id,
              error: sendResult.error || 'Unknown error',
            });
          }
        }
      } catch (error) {
        result.errors.push({
          variantId: variant.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      result.variantResults.push(variantResult);
    }

    // Update sent count
    const totalSent = result.variantResults.reduce((sum, v) => sum + v.sent, 0);
    await db.update(campaigns)
      .set({ 
        sentCount: totalSent,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    result.success = result.errors.length === 0;

    return result;
  },

  /**
   * Sends a variant email to a single recipient.
   * 
   * @internal
   */
  async sendVariantEmail(
    campaign: Campaign & { event: { id: string; name: string; startDate: Date; endDate: Date; location: string } },
    variant: ABTestVariant,
    abConfig: ABTestConfig,
    eventGuest: { id: string; guest: { email: string; firstName: string; lastName: string; company: string | null; jobTitle: string | null }; qrToken: string },
    baseUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Determine subject and content based on variant type
      let subject = campaign.subject;
      let content = campaign.content;

      if (abConfig.testType === 'subject') {
        const subjectVariant = variant as SubjectVariant;
        subject = subjectVariant.subject || campaign.subject;
      } else if (abConfig.testType === 'content') {
        const contentVariant = variant as ContentVariant;
        if (contentVariant.designJson) {
          // Use variant's design JSON to generate content
          // For now, use the campaign content as fallback
          content = campaign.content;
        }
      }

      // Create template context
      const context = EmailTemplateService.createContext(
        eventGuest.guest,
        campaign.event,
        eventGuest.qrToken,
        baseUrl
      );

      // Render subject and content
      const subjectResult = EmailTemplateService.render(subject, context);
      const contentResult = EmailTemplateService.render(content, context);

      // Create CampaignMessage record with variant info
      const [message] = await db.insert(campaignMessages).values({
        campaignId: campaign.id,
        eventGuestId: eventGuest.id,
        status: 'Pending',
      }).returning();

      // Insert tracking pixel
      const contentWithTracking = OpenTrackingService.insertTrackingPixel(
        contentResult.content,
        baseUrl,
        message.id
      );

      // Send email
      const sendResult = await CampaignSendService.sendEmail({
        to: eventGuest.guest.email,
        subject: subjectResult.content,
        html: contentWithTracking,
        messageId: message.id,
      });

      if (sendResult.success) {
        await db.update(campaignMessages)
          .set({
            status: 'Sent',
            sentAt: new Date(),
          })
          .where(eq(campaignMessages.id, message.id));

        return { success: true };
      } else {
        await db.update(campaignMessages)
          .set({ status: 'Failed' })
          .where(eq(campaignMessages.id, message.id));

        return { success: false, error: sendResult.error };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },


  /**
   * Gets the current metrics for each variant in an A/B test.
   * 
   * @param campaignId - The campaign ID
   * @returns Variant results with metrics
   * @throws {Error} If campaign not found or not an A/B test
   * 
   * Requirements: 14.4
   */
  async getVariantMetrics(campaignId: string): Promise<ABTestVariantResult[]> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (!campaign.isAbTest || !campaign.abTestConfig) {
      throw new Error('Campaign is not configured for A/B testing');
    }

    const abConfig = campaign.abTestConfig as ABTestConfig & {
      variantAssignments?: VariantAssignment[];
    };

    if (!abConfig.variantAssignments) {
      throw new Error('A/B test has not been started yet');
    }

    // Get all messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    // Create a map of eventGuestId to message
    const messageMap = new Map(messages.map(m => [m.eventGuestId, m]));

    // Calculate metrics for each variant
    const variantResults: ABTestVariantResult[] = [];

    for (const variant of abConfig.variants) {
      const variantAssignments = abConfig.variantAssignments.filter(
        a => a.variantId === variant.id
      );
      const variantEventGuestIds = new Set(variantAssignments.map(a => a.eventGuestId));

      // Get messages for this variant
      const variantMessages = messages.filter(m => variantEventGuestIds.has(m.eventGuestId));

      const recipientCount = variantAssignments.length;
      const sentCount = variantMessages.filter(m => m.status !== 'Pending').length;
      const deliveredCount = variantMessages.filter(m => m.status === 'Delivered').length;
      const openedCount = variantMessages.filter(m => m.openedAt !== null).length;
      const clickedCount = variantMessages.filter(m => m.clickedAt !== null).length;
      
      // For conversion, we'd need to check RSVP status - simplified for now
      const conversionCount = 0;

      variantResults.push({
        variantId: variant.id,
        variantName: variant.name,
        recipientCount,
        sentCount,
        deliveredCount,
        openedCount,
        clickedCount,
        conversionCount,
        openRate: recipientCount > 0 ? (openedCount / recipientCount) * 100 : 0,
        clickRate: recipientCount > 0 ? (clickedCount / recipientCount) * 100 : 0,
        conversionRate: recipientCount > 0 ? (conversionCount / recipientCount) * 100 : 0,
      });
    }

    return variantResults;
  },

  /**
   * Checks if the test period has ended and selects a winner.
   * 
   * @param campaignId - The campaign ID
   * @returns Winner selection result, or null if test period hasn't ended
   * @throws {Error} If campaign not found or not an A/B test
   * 
   * Requirements: 14.4
   */
  async checkAndSelectWinner(campaignId: string): Promise<SelectWinnerResult | null> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (!campaign.isAbTest || !campaign.abTestConfig) {
      throw new Error('Campaign is not configured for A/B testing');
    }

    // Check if winner already selected
    if (campaign.winningVariant) {
      const variantResults = await this.getVariantMetrics(campaignId);
      const abConfig = campaign.abTestConfig as ABTestConfig;
      const winningVariant = abConfig.variants.find(v => v.id === campaign.winningVariant);
      const winnerResult = variantResults.find(r => r.variantId === campaign.winningVariant);

      return {
        success: true,
        campaignId,
        winningVariantId: campaign.winningVariant,
        winningVariantName: winningVariant?.name || null,
        winnerMetric: abConfig.winnerMetric,
        winnerMetricValue: winnerResult ? getMetricValue(winnerResult, abConfig.winnerMetric) : 0,
        variantResults,
        testDurationHours: abConfig.testDurationHours,
        autoSendEnabled: abConfig.autoSendWinner,
      };
    }

    const abConfig = campaign.abTestConfig as ABTestConfig & {
      testEndTime?: string;
    };

    // Check if test period has ended
    if (abConfig.testEndTime) {
      const testEndTime = new Date(abConfig.testEndTime);
      if (new Date() < testEndTime) {
        // Test period hasn't ended yet
        return null;
      }
    }

    // Get variant metrics
    const variantResults = await this.getVariantMetrics(campaignId);

    // Select winner based on configured metric
    let winningVariant: ABTestVariantResult | null = null;
    let highestMetricValue = -1;

    for (const result of variantResults) {
      const metricValue = getMetricValue(result, abConfig.winnerMetric);
      if (metricValue > highestMetricValue) {
        highestMetricValue = metricValue;
        winningVariant = result;
      }
    }

    if (!winningVariant) {
      throw new Error('Could not determine winning variant');
    }

    // Update campaign with winning variant
    await db.update(campaigns)
      .set({
        winningVariant: winningVariant.variantId,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    return {
      success: true,
      campaignId,
      winningVariantId: winningVariant.variantId,
      winningVariantName: winningVariant.variantName,
      winnerMetric: abConfig.winnerMetric,
      winnerMetricValue: highestMetricValue,
      variantResults,
      testDurationHours: abConfig.testDurationHours,
      autoSendEnabled: abConfig.autoSendWinner,
    };
  },


  /**
   * Sends the winning variant to remaining recipients.
   * 
   * @param campaignId - The campaign ID
   * @param baseUrl - Base URL for generating RSVP and badge links
   * @returns Send result with statistics
   * @throws {Error} If campaign not found, not an A/B test, or no winner selected
   * 
   * Requirements: 14.5
   */
  async sendWinnerToRemaining(campaignId: string, baseUrl: string): Promise<SendWinnerResult> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
      with: {
        event: true,
      },
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (!campaign.isAbTest || !campaign.abTestConfig) {
      throw new Error('Campaign is not configured for A/B testing');
    }

    if (!campaign.winningVariant) {
      throw new Error('No winning variant has been selected yet');
    }

    const abConfig = campaign.abTestConfig as ABTestConfig & {
      remainingRecipientIds?: string[];
    };

    if (!abConfig.remainingRecipientIds || abConfig.remainingRecipientIds.length === 0) {
      return {
        success: true,
        campaignId,
        winningVariantId: campaign.winningVariant,
        remainingRecipients: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };
    }

    // Find the winning variant
    const winningVariant = abConfig.variants.find(v => v.id === campaign.winningVariant);
    if (!winningVariant) {
      throw new Error('Winning variant not found in configuration');
    }

    // Get event guests for remaining recipients
    const eventGuestsList = await db.query.eventGuests.findMany({
      where: and(
        eq(eventGuests.eventId, campaign.eventId),
        inArray(eventGuests.id, abConfig.remainingRecipientIds)
      ),
      with: {
        guest: true,
      },
    });

    // Filter out undeliverable addresses
    const allEmails = eventGuestsList.map(eg => eg.guest.email);
    const deliverableEmails = await BounceService.filterDeliverableEmails(allEmails);
    const deliverableEmailSet = new Set(deliverableEmails.map(e => e.toLowerCase()));
    
    const deliverableEventGuests = eventGuestsList.filter(
      eg => deliverableEmailSet.has(eg.guest.email.toLowerCase())
    );

    const skippedCount = eventGuestsList.length - deliverableEventGuests.length;

    const result: SendWinnerResult = {
      success: true,
      campaignId,
      winningVariantId: campaign.winningVariant,
      remainingRecipients: abConfig.remainingRecipientIds.length,
      sent: 0,
      failed: 0,
      skipped: skippedCount,
      errors: [],
    };

    // Send winning variant to each remaining recipient
    for (const eventGuest of deliverableEventGuests) {
      const sendResult = await this.sendVariantEmail(
        campaign as Campaign & { event: typeof campaign.event },
        winningVariant,
        abConfig,
        eventGuest,
        baseUrl
      );

      if (sendResult.success) {
        result.sent++;
      } else {
        result.failed++;
        result.errors.push({
          eventGuestId: eventGuest.id,
          error: sendResult.error || 'Unknown error',
        });
      }
    }

    // Update campaign status and counts
    const totalSent = campaign.sentCount + result.sent;
    await db.update(campaigns)
      .set({
        status: 'Sent' as CampaignStatus,
        sentCount: totalSent,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    result.success = result.failed === 0;

    return result;
  },

  /**
   * Gets the full A/B test results for a campaign.
   * 
   * @param campaignId - The campaign ID
   * @returns Complete A/B test results
   * @throws {Error} If campaign not found or not an A/B test
   * 
   * Requirements: 14.6
   */
  async getABTestResults(campaignId: string): Promise<ABTestResults> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (!campaign.isAbTest || !campaign.abTestConfig) {
      throw new Error('Campaign is not configured for A/B testing');
    }

    const abConfig = campaign.abTestConfig as ABTestConfig & {
      testStartedAt?: string;
      testEndTime?: string;
    };

    const variantResults = await this.getVariantMetrics(campaignId);

    return {
      testType: abConfig.testType,
      winnerMetric: abConfig.winnerMetric,
      testStartedAt: abConfig.testStartedAt ? new Date(abConfig.testStartedAt) : new Date(),
      testEndedAt: abConfig.testEndTime ? new Date(abConfig.testEndTime) : null,
      winningVariantId: campaign.winningVariant,
      variantResults,
    };
  },

  /**
   * Processes A/B test campaigns that have completed their test period.
   * 
   * This method should be called periodically by a cron job to:
   * 1. Find A/B test campaigns where test period has ended
   * 2. Select winners for those campaigns
   * 3. If autoSendWinner is enabled, send winner to remaining recipients
   * 
   * @param baseUrl - Base URL for generating RSVP and badge links
   * @returns Processing result
   */
  async processCompletedABTests(baseUrl: string): Promise<{
    processed: number;
    winnersSelected: number;
    winnersSent: number;
    errors: Array<{ campaignId: string; error: string }>;
  }> {
    const result = {
      processed: 0,
      winnersSelected: 0,
      winnersSent: 0,
      errors: [] as Array<{ campaignId: string; error: string }>,
    };

    // Find A/B test campaigns that are in Sending status and have no winner yet
    const abTestCampaigns = await db.query.campaigns.findMany({
      where: and(
        eq(campaigns.isAbTest, true),
        eq(campaigns.status, 'Sending'),
        sql`${campaigns.winningVariant} IS NULL`
      ),
    });

    for (const campaign of abTestCampaigns) {
      result.processed++;

      try {
        // Check if test period has ended and select winner
        const winnerResult = await this.checkAndSelectWinner(campaign.id);

        if (winnerResult) {
          result.winnersSelected++;
          console.log(`[ABTestService] Selected winner for campaign "${campaign.name}": Variant ${winnerResult.winningVariantName}`);

          // If auto-send is enabled, send winner to remaining recipients
          if (winnerResult.autoSendEnabled) {
            const sendResult = await this.sendWinnerToRemaining(campaign.id, baseUrl);
            if (sendResult.success) {
              result.winnersSent++;
              console.log(`[ABTestService] Sent winner to ${sendResult.sent} remaining recipients`);
            } else {
              result.errors.push({
                campaignId: campaign.id,
                error: `Failed to send winner: ${sendResult.errors.length} errors`,
              });
            }
          }
        }
      } catch (error) {
        result.errors.push({
          campaignId: campaign.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`[ABTestService] Error processing A/B test for campaign "${campaign.name}":`, error);
      }
    }

    return result;
  },

  /**
   * Validates that a campaign is properly configured for A/B testing.
   * 
   * @param campaignId - The campaign ID
   * @returns Validation result with any errors
   */
  async validateABTestConfig(campaignId: string): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      return { isValid: false, errors: ['Campaign not found'] };
    }

    if (!campaign.isAbTest) {
      return { isValid: false, errors: ['Campaign is not marked as A/B test'] };
    }

    if (!campaign.abTestConfig) {
      return { isValid: false, errors: ['A/B test configuration is missing'] };
    }

    const abConfig = campaign.abTestConfig as ABTestConfig;
    const errors: string[] = [];

    if (!abConfig.enabled) {
      errors.push('A/B testing is not enabled');
    }

    if (abConfig.variants.length < 2) {
      errors.push('At least 2 variants are required');
    }

    if (abConfig.variants.length > 4) {
      errors.push('Maximum 4 variants are allowed');
    }

    if (abConfig.testAudiencePercentage < 10 || abConfig.testAudiencePercentage > 50) {
      errors.push('Test audience percentage must be between 10% and 50%');
    }

    if (abConfig.testDurationHours < 1 || abConfig.testDurationHours > 72) {
      errors.push('Test duration must be between 1 and 72 hours');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },
};

export default ABTestService;
