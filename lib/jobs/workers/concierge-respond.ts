/**
 * @fileoverview Concierge Respond Worker
 *
 * Processes inbound WhatsApp messages with AI and sends responses.
 *
 * @module lib/jobs/workers/concierge-respond
 */

import type { Job } from "pg-boss";
import { db } from "@/db";
import { whatsappMessages, whatsappConversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ConciergeService } from "@/lib/services/concierge-service";
import { WhatsAppMessageService } from "@/lib/services/whatsapp-message-service";
import { ConversationService } from "@/lib/services/conversation-service";

// ============================================================================
// TYPES
// ============================================================================

export interface ConciergeRespondPayload {
  messageId: string;
  conversationId: string;
  channelId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FALLBACK_MESSAGE =
  "I'm having trouble right now. Let me connect you with the team.";

// ============================================================================
// HANDLER
// ============================================================================

export const JOB_NAME = "concierge-respond";

/**
 * Helper to get a short preview of the message body.
 */
function getMessagePreview(message: {
  content: unknown;
}): string {
  const content = message.content as Record<string, unknown> | null;
  if (!content) return "(no content)";

  // For text messages
  if (content.type === "text") {
    const text = content.text as { body?: string } | undefined;
    const body = text?.body || "";
    return body.length > 80 ? body.slice(0, 80) + "..." : body;
  }

  return `(${content.type || "unknown"} message)`;
}

export async function handler(job: Job<ConciergeRespondPayload>) {
  const { messageId, conversationId, channelId } = job.data;

  console.log(`[${JOB_NAME}] Starting concierge response`, {
    messageId,
    conversationId,
    channelId,
  });

  // 1. Load the inbound message
  const message = await db.query.whatsappMessages.findFirst({
    where: eq(whatsappMessages.id, messageId),
  });

  if (!message) {
    throw new Error(`Message "${messageId}" not found`);
  }

  // 2. Check if conversation is human-managed — skip AI if so
  const escalationStatus =
    await ConversationService.getEscalationStatus(conversationId);

  if (escalationStatus === "human_managed") {
    console.log(
      `[${JOB_NAME}] Conversation is human-managed, skipping AI response`,
    );
    return { status: "skipped", reason: "human_managed", conversationId };
  }

  // Load conversation to get guest phone number for sending
  const conversation = await db.query.whatsappConversations.findFirst({
    where: eq(whatsappConversations.id, conversationId),
  });

  if (!conversation) {
    throw new Error(`Conversation "${conversationId}" not found`);
  }

  try {
    // 3. Build context
    const context = await ConciergeService.buildContext(conversationId);

    // 4. Generate AI response
    const aiResponse = await ConciergeService.generateResponse(
      message,
      context,
    );

    // 5. Handle escalation
    if (aiResponse.shouldEscalate) {
      console.log(
        `[${JOB_NAME}] AI confidence below threshold, escalating to human`,
        { confidence: aiResponse.confidence },
      );

      await ConversationService.escalateToHuman(
        conversationId,
        `AI confidence too low (${aiResponse.confidence.toFixed(2)}). Guest message: "${getMessagePreview(message)}"`,
      );

      const fallbackContent = {
        type: "text" as const,
        text: { body: FALLBACK_MESSAGE },
      };

      await WhatsAppMessageService.sendMessage(
        channelId,
        conversation.guestPhoneNumber,
        fallbackContent,
      );

      await WhatsAppMessageService.storeOutboundMessage(
        channelId,
        conversationId,
        fallbackContent,
        true,
      );

      return {
        status: "escalated",
        conversationId,
        confidence: aiResponse.confidence,
      };
    }

    // 6. Send AI response to guest
    await WhatsAppMessageService.sendMessage(
      channelId,
      conversation.guestPhoneNumber,
      aiResponse.content,
    );

    // 7. Store outbound message
    await WhatsAppMessageService.storeOutboundMessage(
      channelId,
      conversationId,
      aiResponse.content,
      true,
    );

    // 8. Update conversation state with topic category
    if (aiResponse.topicCategory) {
      await ConversationService.updateState(conversationId, {
        lastTopic: aiResponse.topicCategory,
      });
    }

    console.log(`[${JOB_NAME}] Concierge response sent successfully`, {
      conversationId,
      confidence: aiResponse.confidence,
      topicCategory: aiResponse.topicCategory,
    });

    return {
      status: "responded",
      conversationId,
      confidence: aiResponse.confidence,
      topicCategory: aiResponse.topicCategory,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[${JOB_NAME}] Concierge response generation failed, sending fallback`,
      { error: errorMessage },
    );

    try {
      const fallbackContent = {
        type: "text" as const,
        text: { body: FALLBACK_MESSAGE },
      };

      await WhatsAppMessageService.sendMessage(
        channelId,
        conversation.guestPhoneNumber,
        fallbackContent,
      );

      await WhatsAppMessageService.storeOutboundMessage(
        channelId,
        conversationId,
        fallbackContent,
        true,
      );

      await ConversationService.escalateToHuman(
        conversationId,
        `AI response failed: ${errorMessage}`,
      );

      return {
        status: "fallback_sent",
        conversationId,
        error: errorMessage,
      };
    } catch (fallbackError) {
      console.error(`[${JOB_NAME}] Failed to send fallback message`, {
        error:
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unknown error",
      });
      throw error; // Re-throw original error for retry
    }
  }
}
