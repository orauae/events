/**
 * @fileoverview WhatsApp Message Send Worker
 *
 * Sends a single WhatsApp message (session or template) and optionally
 * stores it as an outbound message in the database.
 *
 * @module lib/jobs/workers/whatsapp-message-send
 */

import type { Job } from "pg-boss";
import {
  WhatsAppMessageService,
  type WhatsAppMessageContent,
} from "@/lib/services/whatsapp-message-service";

// ============================================================================
// TYPES
// ============================================================================

export interface WhatsAppMessageSendPayload {
  channelId: string;
  to: string;
  content: WhatsAppMessageContent;
  conversationId?: string;
}

// ============================================================================
// HANDLER
// ============================================================================

export const JOB_NAME = "whatsapp-message-send";

export async function handler(job: Job<WhatsAppMessageSendPayload>) {
  const { channelId, to, content, conversationId } = job.data;

  console.log(`[${JOB_NAME}] Sending WhatsApp message`, {
    channelId,
    to,
    type: content.type,
    conversationId,
  });

  // Send the message via WhatsApp Cloud API
  const { messageId } = await WhatsAppMessageService.sendMessage(
    channelId,
    to,
    content,
  );

  console.log(`[${JOB_NAME}] WhatsApp message sent`, { messageId });

  // Store outbound message if conversation context is available
  if (conversationId) {
    await WhatsAppMessageService.storeOutboundMessage(
      channelId,
      conversationId,
      content,
      false, // not AI-generated — triggered by automation
    );
    console.log(`[${JOB_NAME}] Outbound message stored`, { conversationId });
  }

  return { messageId, conversationId };
}
