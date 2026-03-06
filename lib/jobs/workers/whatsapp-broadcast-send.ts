/**
 * @fileoverview WhatsApp Broadcast Send Worker
 *
 * Batch delivery of broadcast messages to resolved recipients.
 *
 * @module lib/jobs/workers/whatsapp-broadcast-send
 */

import type { Job } from "pg-boss";
import { db } from "@/db";
import {
  whatsappBroadcasts,
  whatsappConversations,
  eventGuests,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { BroadcastService } from "@/lib/services/broadcast-service";
import { WhatsAppMessageService } from "@/lib/services/whatsapp-message-service";
import type { WhatsAppMessageContent } from "@/lib/services/broadcast-service";

// ============================================================================
// TYPES
// ============================================================================

export interface WhatsAppBroadcastSendPayload {
  broadcastId: string;
  batchSize: number;
  batchDelayMs: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TEMPLATE_NAME = "broadcast_notification";
const DEFAULT_LANGUAGE_CODE = "en";

// ============================================================================
// HANDLER
// ============================================================================

export const JOB_NAME = "whatsapp-broadcast-send";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(
  job: Job<WhatsAppBroadcastSendPayload>,
) {
  const { broadcastId, batchSize, batchDelayMs } = job.data;

  console.log(`[${JOB_NAME}] Starting broadcast send`, {
    broadcastId,
    batchSize,
    batchDelayMs,
  });

  // 1. Load broadcast
  const broadcast = await db.query.whatsappBroadcasts.findFirst({
    where: eq(whatsappBroadcasts.id, broadcastId),
  });

  if (!broadcast) {
    throw new Error(`Broadcast "${broadcastId}" not found`);
  }

  const channelId = broadcast.channelId;
  const content = broadcast.content as unknown as WhatsAppMessageContent;

  // 2. Resolve recipients
  const filter = broadcast.filter as Parameters<
    typeof BroadcastService.resolveRecipients
  >[1];
  const recipientIds = await BroadcastService.resolveRecipients(
    broadcast.eventId,
    filter,
  );

  if (recipientIds.length === 0) {
    return {
      broadcastId,
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
    };
  }

  // 3. Process recipients in batches
  let sentCount = 0;
  let failedCount = 0;
  const totalBatches = Math.ceil(recipientIds.length / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, recipientIds.length);
    const batchRecipientIds = recipientIds.slice(batchStart, batchEnd);

    for (const eventGuestId of batchRecipientIds) {
      try {
        await sendToRecipient(
          channelId,
          broadcast.eventId,
          eventGuestId,
          content,
          broadcastId,
        );
        sentCount++;

        await db
          .update(whatsappBroadcasts)
          .set({ sentCount: sql`${whatsappBroadcasts.sentCount} + 1` })
          .where(eq(whatsappBroadcasts.id, broadcastId));
      } catch (error) {
        failedCount++;
        console.warn(`[${JOB_NAME}] Failed to send to recipient`, {
          eventGuestId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Delay between batches (skip after last)
    if (batchIndex < totalBatches - 1 && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  console.log(`[${JOB_NAME}] Broadcast send completed`, {
    broadcastId,
    totalRecipients: recipientIds.length,
    sentCount,
    failedCount,
  });

  return {
    broadcastId,
    totalRecipients: recipientIds.length,
    sentCount,
    failedCount,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function sendToRecipient(
  channelId: string,
  eventId: string,
  eventGuestId: string,
  content: WhatsAppMessageContent,
  broadcastId: string,
): Promise<void> {
  const eventGuestRecord = await db.query.eventGuests.findFirst({
    where: eq(eventGuests.id, eventGuestId),
    with: { guest: true },
  });

  if (!eventGuestRecord?.guest) {
    throw new Error(`Event guest "${eventGuestId}" not found`);
  }

  const phoneNumber =
    eventGuestRecord.updatedMobile || eventGuestRecord.guest.mobile;
  if (!phoneNumber) {
    throw new Error(`Guest "${eventGuestId}" has no phone number`);
  }

  const conversation = await db.query.whatsappConversations.findFirst({
    where: and(
      eq(whatsappConversations.eventId, eventId),
      eq(whatsappConversations.eventGuestId, eventGuestId),
    ),
  });

  if (conversation) {
    const sessionActive =
      await WhatsAppMessageService.isSessionWindowActive(conversation.id);

    if (sessionActive) {
      await WhatsAppMessageService.sendMessage(channelId, phoneNumber, content);
      await WhatsAppMessageService.storeOutboundMessage(
        channelId,
        conversation.id,
        content,
        false,
        broadcastId,
      );
    } else {
      await sendTemplateForBroadcast(
        channelId,
        phoneNumber,
        content,
        conversation.id,
        broadcastId,
      );
    }
  } else {
    await sendTemplateForBroadcast(
      channelId,
      phoneNumber,
      content,
      null,
      broadcastId,
    );
  }
}

async function sendTemplateForBroadcast(
  channelId: string,
  phoneNumber: string,
  content: WhatsAppMessageContent,
  conversationId: string | null,
  broadcastId: string,
): Promise<void> {
  const textBody = content.text?.body || "";
  const params = textBody ? { "1": textBody } : undefined;

  await WhatsAppMessageService.sendTemplateMessage(
    channelId,
    phoneNumber,
    DEFAULT_TEMPLATE_NAME,
    DEFAULT_LANGUAGE_CODE,
    params,
  );

  if (conversationId) {
    const templateContent: WhatsAppMessageContent = {
      type: "template",
      template: {
        name: DEFAULT_TEMPLATE_NAME,
        language: { code: DEFAULT_LANGUAGE_CODE },
      },
    };

    await WhatsAppMessageService.storeOutboundMessage(
      channelId,
      conversationId,
      templateContent,
      false,
      broadcastId,
    );
  }
}
