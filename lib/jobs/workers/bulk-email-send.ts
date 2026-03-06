/**
 * @fileoverview Bulk Email Send Worker
 *
 * Sends campaign emails to all recipients using SMTP in batches.
 * Supports pause/resume via campaign status checks between batches.
 *
 * @module lib/jobs/workers/bulk-email-send
 */

import type { Job } from "pg-boss";
import { db } from "@/db";
import {
  campaigns,
  campaignMessages,
  eventGuests,
  type MessageStatus,
  type InvitationStatus,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { InfobipEmailSender } from "@/lib/services/infobip-email-sender";
import { EmailTemplateService } from "@/lib/services/email-template-service";
import { OpenTrackingService } from "@/lib/services/open-tracking-service";
import { LinkTrackingService } from "@/lib/services/link-tracking-service";
import { BounceService } from "@/lib/services/bounce-service";
import { CampaignService } from "@/lib/services/campaign-service";

// ============================================================================
// TYPES
// ============================================================================

export interface BulkEmailSendPayload {
  campaignId: string;
  batchSize?: number;
  batchDelayMs?: number;
  smtpId?: string;
  baseUrl?: string;
}

export interface BulkEmailSendResult {
  campaignId: string;
  success: boolean;
  totalRecipients: number;
  sent: number;
  failed: number;
  skipped: number;
  batchesProcessed: number;
  isPaused: boolean;
  error?: string;
}

export interface SingleEmailPayload {
  campaignMessageId: string;
  eventGuestId: string;
  to: string;
  subject: string;
  html: string;
  smtpId?: string;
  trackingPixelUrl?: string;
}

// ============================================================================
// HANDLER
// ============================================================================

export const JOB_NAME = "bulk-email-send";
export const SINGLE_JOB_NAME = "single-email-send";

function getBaseUrl(providedUrl?: string): string {
  return (
    providedUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(job: Job<BulkEmailSendPayload>) {
  const {
    campaignId,
    batchSize = 100,
    batchDelayMs = 1000,
    smtpId,
    baseUrl: providedBaseUrl,
  } = job.data;

  const baseUrl = getBaseUrl(providedBaseUrl);

  console.log(`[${JOB_NAME}] Starting bulk email send`, {
    campaignId,
    batchSize,
    batchDelayMs,
  });

  const result: BulkEmailSendResult = {
    campaignId,
    success: true,
    totalRecipients: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    batchesProcessed: 0,
    isPaused: false,
  };

  try {
    // 1. Load campaign with event
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
      with: { event: true },
    });

    if (!campaign) throw new Error(`Campaign "${campaignId}" not found`);
    if (campaign.status === "Sent") throw new Error("Campaign already sent");
    if (campaign.status === "Sending")
      throw new Error("Campaign is currently being sent");

    // 2. Verify Infobip email is configured
    if (!InfobipEmailSender.isAvailable()) {
      throw new Error(
        "Infobip email not configured. Set INFOBIP_API_URL, INFOBIP_API_KEY, and INFOBIP_EMAIL_FROM in .env",
      );
    }

    console.log(`[${JOB_NAME}] Using Infobip email provider`);

    // 3. Campaign → Sending
    await db
      .update(campaigns)
      .set({ status: "Sending", updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    // 4. Get all event guests
    const allEventGuests = await db.query.eventGuests.findMany({
      where: eq(eventGuests.eventId, campaign.eventId),
      with: { guest: true },
    });

    result.totalRecipients = allEventGuests.length;

    // 5. Filter undeliverable addresses
    const allEmails = allEventGuests.map((eg) => eg.guest.email);
    const deliverableEmails =
      await BounceService.filterDeliverableEmails(allEmails);
    const deliverableEmailSet = new Set(
      deliverableEmails.map((e) => e.toLowerCase()),
    );

    const deliverableGuests = allEventGuests.filter((eg) =>
      deliverableEmailSet.has(eg.guest.email.toLowerCase()),
    );

    result.skipped = allEventGuests.length - deliverableGuests.length;

    // 6. Update recipient count
    await db
      .update(campaigns)
      .set({ recipientCount: deliverableGuests.length, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    // 7. Process in batches
    const totalBatches = Math.ceil(deliverableGuests.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // Check pause/cancel
      const currentCampaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, campaignId),
      });

      if (currentCampaign?.status === "Paused") {
        result.isPaused = true;
        result.success = false;
        break;
      }
      if (currentCampaign?.status === "Cancelled") {
        result.success = false;
        break;
      }

      const startIndex = batchIndex * batchSize;
      const batch = deliverableGuests.slice(startIndex, startIndex + batchSize);

      for (const eventGuest of batch) {
        try {
          const context = EmailTemplateService.createContext(
            eventGuest.guest,
            campaign.event,
            eventGuest.qrToken,
            baseUrl,
          );

          const subjectResult = EmailTemplateService.render(
            campaign.subject,
            context,
          );
          const contentResult = EmailTemplateService.render(
            campaign.content,
            context,
          );

          const [message] = await db
            .insert(campaignMessages)
            .values({ campaignId, eventGuestId: eventGuest.id, status: "Pending" })
            .returning();

          const contentWithLinks =
            await LinkTrackingService.createTrackingLinks(
              campaignId,
              contentResult.content,
              baseUrl,
              {
                utmSource: "email",
                utmMedium: "campaign",
                utmCampaign: campaign.event.name,
              },
            );

          const personalizedContent =
            LinkTrackingService.personalizeTrackingLinks(
              contentWithLinks,
              baseUrl,
              eventGuest.guest.email,
              message.id,
            );

          const contentWithTracking =
            OpenTrackingService.insertTrackingPixel(
              personalizedContent,
              baseUrl,
              message.id,
            );

          const sendResult = await InfobipEmailSender.send(
            {
              to: eventGuest.guest.email,
              subject: subjectResult.content,
              html: contentWithTracking,
            },
          );

          if (sendResult.success) {
            await db
              .update(campaignMessages)
              .set({
                status: "Sent" as MessageStatus,
                sentAt: new Date(),
              })
              .where(eq(campaignMessages.id, message.id));

            await db
              .update(eventGuests)
              .set({
                invitationStatus: "Sent" as InvitationStatus,
                updatedAt: new Date(),
              })
              .where(eq(eventGuests.id, eventGuest.id));

            result.sent++;
          } else {
            await db
              .update(campaignMessages)
              .set({ status: "Failed" as MessageStatus })
              .where(eq(campaignMessages.id, message.id));

            await db
              .update(eventGuests)
              .set({
                invitationStatus: "Failed" as InvitationStatus,
                updatedAt: new Date(),
              })
              .where(eq(eventGuests.id, eventGuest.id));

            result.failed++;
          }
        } catch (error) {
          result.failed++;
          console.error(`[${JOB_NAME}] Error processing recipient`, {
            eventGuestId: eventGuest.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      result.batchesProcessed++;
      await CampaignService.incrementCounter(campaignId, "sentCount", result.sent);

      // Delay between batches
      if (batchIndex < totalBatches - 1 && batchDelayMs > 0) {
        await sleep(batchDelayMs);
      }
    }

    // 8. Finalize campaign status
    if (!result.isPaused) {
      const finalCampaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, campaignId),
      });

      if (finalCampaign?.status === "Sending") {
        await db
          .update(campaigns)
          .set({ status: "Sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(campaigns.id, campaignId));
      }
    }

    result.success = result.failed === 0 && !result.isPaused;
    console.log(`[${JOB_NAME}] Bulk email send completed`, { ...result });
    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    result.success = false;
    result.error = errorMessage;

    console.error(`[${JOB_NAME}] Bulk email send failed`, {
      campaignId,
      error: errorMessage,
    });

    await db
      .update(campaigns)
      .set({ status: "Draft", updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    throw error; // Re-throw for pg-boss retry
  }
}

// ============================================================================
// SINGLE EMAIL SEND HANDLER
// ============================================================================

export async function singleEmailHandler(
  job: Job<SingleEmailPayload>,
) {
  const { campaignMessageId, eventGuestId, to, subject, html } =
    job.data;

  console.log(`[${SINGLE_JOB_NAME}] Sending single email`, { to });

  const result = await InfobipEmailSender.send(
    {
      to,
      subject,
      html,
    },
  );

  if (campaignMessageId) {
    await db
      .update(campaignMessages)
      .set({
        status: (result.success ? "Sent" : "Failed") as MessageStatus,
        sentAt: result.success ? new Date() : undefined,
      })
      .where(eq(campaignMessages.id, campaignMessageId));
  }

  if (eventGuestId) {
    await db
      .update(eventGuests)
      .set({
        invitationStatus: (result.success
          ? "Sent"
          : "Failed") as InvitationStatus,
        updatedAt: new Date(),
      })
      .where(eq(eventGuests.id, eventGuestId));
  }

  return result;
}
