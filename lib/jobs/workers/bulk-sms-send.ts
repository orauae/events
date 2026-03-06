/**
 * @fileoverview Bulk SMS Send Worker
 *
 * Sends campaign SMS messages via Infobip in batches.
 *
 * @module lib/jobs/workers/bulk-sms-send
 */

import type { Job } from "pg-boss";
import { db } from "@/db";
import {
  campaigns,
  campaignMessages,
  eventGuests,
  guests,
  events,
  type CampaignStatus,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { InfobipSMSSender } from "@/lib/services/infobip-sms-sender";
import { CampaignService } from "@/lib/services/campaign-service";

// ============================================================================
// TYPES
// ============================================================================

export interface BulkSmsSendPayload {
  campaignId: string;
  batchSize?: number;
  batchDelayMs?: number;
  baseUrl?: string;
}

export interface BulkSmsSendResult {
  campaignId: string;
  success: boolean;
  totalRecipients: number;
  sent: number;
  failed: number;
  skipped: number;
  batchesProcessed: number;
  error?: string;
}

export interface SingleSmsSendPayload {
  to: string;
  text: string;
  from?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function replacePlaceholders(
  text: string,
  guest: { firstName: string; lastName: string },
  event: { name: string; date: Date | null; location: string | null },
  rsvpLink: string,
): string {
  let result = text;
  result = result.replaceAll("{{firstName}}", guest.firstName);
  result = result.replaceAll("{{lastName}}", guest.lastName);
  result = result.replaceAll("{{eventName}}", event.name);
  result = result.replaceAll(
    "{{eventDate}}",
    event.date
      ? new Date(event.date).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "TBD",
  );
  result = result.replaceAll("{{eventLocation}}", event.location || "TBD");
  result = result.replaceAll("{{rsvpLink}}", rsvpLink);
  return result;
}

function getBaseUrl(provided?: string): string {
  return (
    provided ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// HANDLER
// ============================================================================

export const JOB_NAME = "bulk-sms-send";
export const SINGLE_JOB_NAME = "single-sms-send";

export async function handler(
  job: Job<BulkSmsSendPayload>,
): Promise<BulkSmsSendResult> {
  const {
    campaignId,
    batchSize = 100,
    batchDelayMs = 1500,
    baseUrl: providedBaseUrl,
  } = job.data;

  const baseUrl = getBaseUrl(providedBaseUrl);

  console.log(`[${JOB_NAME}] Starting bulk SMS send`, { campaignId, batchSize });

  // 1. Load campaign
  const campaign = await CampaignService.getById(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (campaign.channel !== "sms")
    throw new Error(`Campaign ${campaignId} is not an SMS campaign`);
  if (!campaign.smsBody) throw new Error(`Campaign ${campaignId} has no SMS body`);

  // 2. Verify Infobip
  if (!InfobipSMSSender.isAvailable()) {
    await db
      .update(campaigns)
      .set({ status: "Failed" as CampaignStatus, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    throw new Error(
      "Infobip SMS not configured. Set INFOBIP_API_URL and INFOBIP_API_KEY.",
    );
  }

  // 3. Status → Sending
  await db
    .update(campaigns)
    .set({ status: "Sending", updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  // 4. Load event + guests
  const event = await db.query.events.findFirst({
    where: eq(events.id, campaign.eventId),
  });
  if (!event) throw new Error(`Event ${campaign.eventId} not found`);

  const recipientRows = await db
    .select({
      eventGuestId: eventGuests.id,
      guestId: eventGuests.guestId,
      qrToken: eventGuests.qrToken,
      firstName: guests.firstName,
      lastName: guests.lastName,
      mobile: guests.mobile,
      updatedMobile: eventGuests.updatedMobile,
    })
    .from(eventGuests)
    .innerJoin(guests, eq(eventGuests.guestId, guests.id))
    .where(eq(eventGuests.eventId, campaign.eventId));

  const recipients = recipientRows.filter(
    (r) => (r.updatedMobile || r.mobile)?.trim(),
  );
  const skippedCount = recipientRows.length - recipients.length;

  if (recipients.length === 0) {
    await db
      .update(campaigns)
      .set({
        status: "Sent",
        sentAt: new Date(),
        recipientCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    return {
      campaignId,
      success: true,
      totalRecipients: 0,
      sent: 0,
      failed: 0,
      skipped: skippedCount,
      batchesProcessed: 0,
    };
  }

  // 5. Process in batches
  let totalSent = 0;
  let totalFailed = 0;
  let batchesProcessed = 0;

  const senderFrom = campaign.smsSenderId || "ORA";
  const appendOptOut = campaign.smsOptOutFooter !== false;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    batchesProcessed++;

    for (const recipient of batch) {
      const phoneNumber = (recipient.updatedMobile || recipient.mobile)!.trim();
      const rsvpLink = `${baseUrl}/rsvp/${recipient.qrToken}`;

      const messageText = replacePlaceholders(
        campaign.smsBody!,
        { firstName: recipient.firstName, lastName: recipient.lastName },
        { name: event.name, date: event.startDate, location: event.location },
        rsvpLink,
      );

      const [cmRecord] = await db
        .insert(campaignMessages)
        .values({ campaignId, eventGuestId: recipient.eventGuestId, status: "Pending" })
        .returning();

      const result = await InfobipSMSSender.send({
        to: phoneNumber,
        text: messageText,
        from: senderFrom,
        appendOptOut,
      });

      if (result.success) {
        totalSent++;
        await db
          .update(campaignMessages)
          .set({
            status: "Sent",
            sentAt: new Date(),
            resendMessageId: result.messageId || null,
          })
          .where(eq(campaignMessages.id, cmRecord.id));

        await db
          .update(eventGuests)
          .set({ invitationStatus: "Sent", updatedAt: new Date() })
          .where(eq(eventGuests.id, recipient.eventGuestId));
      } else {
        totalFailed++;
        await db
          .update(campaignMessages)
          .set({ status: "Failed" })
          .where(eq(campaignMessages.id, cmRecord.id));

        await db
          .update(eventGuests)
          .set({ invitationStatus: "Failed", updatedAt: new Date() })
          .where(eq(eventGuests.id, recipient.eventGuestId));
      }
    }

    try {
      await CampaignService.incrementCounter(campaignId, "sentCount", totalSent);
    } catch {
      // Non-critical
    }

    if (i + batchSize < recipients.length) {
      await sleep(batchDelayMs);
    }
  }

  // 6. Finalize
  await db
    .update(campaigns)
    .set({
      status: "Sent",
      sentAt: new Date(),
      recipientCount: recipients.length,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  const finalResult: BulkSmsSendResult = {
    campaignId,
    success: true,
    totalRecipients: recipients.length,
    sent: totalSent,
    failed: totalFailed,
    skipped: skippedCount,
    batchesProcessed,
  };

  console.log(`[${JOB_NAME}] Bulk SMS send complete`, { ...finalResult });
  return finalResult;
}

// ============================================================================
// SINGLE SMS SEND HANDLER
// ============================================================================

export async function singleSmsHandler(
  job: Job<SingleSmsSendPayload>,
) {
  const { to, text, from } = job.data;

  console.log(`[${SINGLE_JOB_NAME}] Sending single SMS`, { to });

  if (!InfobipSMSSender.isAvailable()) {
    throw new Error("Infobip SMS not configured");
  }

  return InfobipSMSSender.send({ to, text, from: from || undefined });
}
