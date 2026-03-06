/**
 * @fileoverview WhatsApp Webhook Route Handler
 *
 * Receives inbound WhatsApp messages and status updates from Meta's Cloud API.
 * Handles the GET verification challenge and POST message/status processing.
 *
 * Flow:
 * 1. GET: Responds to Meta's verification challenge by matching hub.verify_token
 * 2. POST: Validates X-Hub-Signature-256, parses payload, stores messages,
 *    triggers the concierge-respond Trigger.dev task, and returns 200 immediately.
 *
 * @module app/api/webhooks/whatsapp/route
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db';
import {
  whatsappChannels,
  whatsappConversations,
  whatsappTemplates,
  guests,
  eventGuests,
} from '@/db/schema';
import type { WATemplateStatus } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { WhatsAppMessageService } from '@/lib/services/whatsapp-message-service';
import type { WhatsAppMessageContent } from '@/lib/services/whatsapp-message-service';
import { sendJob } from '@/lib/jobs';

// ============================================================================
// CONSTANTS
// ============================================================================

const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;

// ============================================================================
// TYPES
// ============================================================================

interface WebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; mime_type: string; sha256: string; filename: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
}

interface WebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
}

interface WebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      messages?: WebhookMessage[];
      statuses?: WebhookStatus[];
    };
    field: string;
  }>;
}

interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

/**
 * Payload shape for template status update webhooks from Meta.
 * Received when a template's approval status changes.
 *
 * Requirements: 3.1, 3.2
 */
interface TemplateStatusUpdate {
  event: 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'FLAGGED';
  message_template_id: number;
  message_template_name: string;
  message_template_language: string;
  reason?: string;
}

// ============================================================================
// SIGNATURE VALIDATION
// ============================================================================

/**
 * Validates the X-Hub-Signature-256 header using HMAC-SHA256 with the app secret.
 *
 * @param rawBody - The raw request body string
 * @param signature - The X-Hub-Signature-256 header value
 * @returns true if the signature is valid
 */
function validateSignature(rawBody: string, signature: string | null): boolean {
  if (!WHATSAPP_APP_SECRET || !signature) {
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

// ============================================================================
// MESSAGE PARSING
// ============================================================================

/**
 * Converts a Meta webhook message into our WhatsAppMessageContent format.
 */
function parseMessageContent(msg: WebhookMessage): WhatsAppMessageContent {
  switch (msg.type) {
    case 'text':
      return { type: 'text', text: { body: msg.text?.body ?? '' } };

    case 'image':
      return {
        type: 'image',
        image: { url: msg.image?.id ?? '', caption: msg.image?.caption },
      };

    case 'document':
      return {
        type: 'document',
        document: {
          url: msg.document?.id ?? '',
          filename: msg.document?.filename ?? 'document',
          caption: msg.document?.caption,
        },
      };

    case 'location':
      return {
        type: 'location',
        location: {
          latitude: msg.location?.latitude ?? 0,
          longitude: msg.location?.longitude ?? 0,
          name: msg.location?.name,
          address: msg.location?.address,
        },
      };

    case 'interactive':
      // Interactive replies from the user (button or list selection)
      return {
        type: 'text',
        text: {
          body:
            msg.interactive?.button_reply?.title ??
            msg.interactive?.list_reply?.title ??
            '',
        },
      };

    default:
      // Fallback: treat unknown types as text
      return { type: 'text', text: { body: `[Unsupported message type: ${msg.type}]` } };
  }
}

// ============================================================================
// GUEST LOOKUP
// ============================================================================

/**
 * Identifies a guest by matching the sender's phone number against:
 * 1. guests.mobile
 * 2. eventGuests.updatedMobile
 *
 * Returns the eventGuest record for the channel's event, or null if not found.
 *
 * Requirements: 2.3
 */
async function findEventGuestByPhone(
  phoneNumber: string,
  eventId: string
): Promise<{ eventGuestId: string; guestId: string } | null> {
  // First, check eventGuests.updatedMobile for this event
  const byUpdatedMobile = await db.query.eventGuests.findFirst({
    where: and(
      eq(eventGuests.eventId, eventId),
      eq(eventGuests.updatedMobile, phoneNumber)
    ),
  });

  if (byUpdatedMobile) {
    return { eventGuestId: byUpdatedMobile.id, guestId: byUpdatedMobile.guestId };
  }

  // Then check guests.mobile and join with eventGuests for this event
  const guestByMobile = await db.query.guests.findFirst({
    where: eq(guests.mobile, phoneNumber),
  });

  if (guestByMobile) {
    const eventGuestRecord = await db.query.eventGuests.findFirst({
      where: and(
        eq(eventGuests.eventId, eventId),
        eq(eventGuests.guestId, guestByMobile.id)
      ),
    });

    if (eventGuestRecord) {
      return { eventGuestId: eventGuestRecord.id, guestId: guestByMobile.id };
    }
  }

  return null;
}

// ============================================================================
// CONVERSATION MANAGEMENT
// ============================================================================

/**
 * Finds or creates a conversation for the given event, channel, and guest.
 *
 * Requirements: 2.5
 */
async function findOrCreateConversation(
  channelId: string,
  eventId: string,
  eventGuestId: string,
  phoneNumber: string
): Promise<string> {
  const existing = await db.query.whatsappConversations.findFirst({
    where: and(
      eq(whatsappConversations.eventId, eventId),
      eq(whatsappConversations.eventGuestId, eventGuestId)
    ),
  });

  if (existing) {
    return existing.id;
  }

  const [conversation] = await db
    .insert(whatsappConversations)
    .values({
      channelId,
      eventId,
      eventGuestId,
      guestPhoneNumber: phoneNumber,
    })
    .returning();

  return conversation.id;
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

/**
 * Processes a single inbound message: identifies guest, stores message,
 * refreshes session window, and triggers the concierge task.
 *
 * Requirements: 2.3, 2.4, 2.5, 2.6
 */
async function processInboundMessage(
  msg: WebhookMessage,
  phoneNumberId: string,
  channelId: string,
  eventId: string
): Promise<void> {
  const senderPhone = msg.from;
  const content = parseMessageContent(msg);
  const timestamp = new Date(parseInt(msg.timestamp, 10) * 1000);

  // Identify guest by phone number (Req 2.3)
  const guestMatch = await findEventGuestByPhone(senderPhone, eventId);

  if (!guestMatch) {
    // Unknown guest — store message without conversation, respond with template (Req 2.4)
    console.log(`[WhatsApp Webhook] Unknown guest: ${senderPhone} for event ${eventId}`);

    // Look up the channel to get the unknown guest template
    const channel = await db.query.whatsappChannels.findFirst({
      where: eq(whatsappChannels.id, channelId),
    });

    if (channel?.unknownGuestTemplateId) {
      try {
        await WhatsAppMessageService.sendTemplateMessage(
          channelId,
          senderPhone,
          channel.unknownGuestTemplateId
        );
      } catch (error) {
        console.error('[WhatsApp Webhook] Failed to send unknown guest template:', error);
      }
    }
    return;
  }

  // Find or create conversation (Req 2.5)
  const conversationId = await findOrCreateConversation(
    channelId,
    eventId,
    guestMatch.eventGuestId,
    senderPhone
  );

  // Store inbound message (Req 2.6)
  const storedMessage = await WhatsAppMessageService.storeInboundMessage(
    channelId,
    conversationId,
    msg.id,
    senderPhone,
    content,
    timestamp
  );

  // Refresh session window (24h from now)
  await WhatsAppMessageService.refreshSessionWindow(conversationId);

  // Trigger concierge-respond job for AI processing
  try {
    await sendJob('concierge-respond', {
      messageId: storedMessage.id,
      conversationId,
      channelId,
    });
  } catch (error) {
    console.error('[WhatsApp Webhook] Failed to trigger concierge-respond job:', error);
  }
}

/**
 * Processes status updates for outbound messages.
 *
 * Requirements: 2.7
 */
async function processStatusUpdate(status: WebhookStatus): Promise<void> {
  const timestamp = new Date(parseInt(status.timestamp, 10) * 1000);

  await WhatsAppMessageService.updateMessageStatus(
    status.id,
    status.status,
    timestamp
  );
}

// ============================================================================
// TEMPLATE STATUS UPDATE PROCESSING
// ============================================================================

/** Maps Meta webhook event names to local template status values. */
const TEMPLATE_EVENT_TO_STATUS: Record<TemplateStatusUpdate['event'], WATemplateStatus> = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  FLAGGED: 'DISABLED',
};

/**
 * Processes a template status update webhook event.
 *
 * Matches the template by WABA ID (from entry.id) and template name,
 * then updates the local status. Logs a warning if the template is not
 * found locally.
 *
 * Requirements: 3.1, 3.2, 3.3
 */
async function processTemplateStatusUpdate(
  wabaId: string,
  update: TemplateStatusUpdate
): Promise<void> {
  const newStatus = TEMPLATE_EVENT_TO_STATUS[update.event];

  const [updated] = await db
    .update(whatsappTemplates)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappTemplates.wabaId, wabaId),
        eq(whatsappTemplates.name, update.message_template_name)
      )
    )
    .returning({ id: whatsappTemplates.id });

  if (!updated) {
    console.warn(
      `[WhatsApp Webhook] Template status update for unknown template: ` +
      `name="${update.message_template_name}", wabaId="${wabaId}", event="${update.event}"`
    );
  }
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET handler — Meta verification challenge.
 *
 * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge
 * query parameters. We verify the token matches a known channel's verifyToken
 * and respond with the challenge value.
 *
 * Requirements: 2.1
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const verifyToken = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !verifyToken || !challenge) {
    return NextResponse.json(
      { error: 'Missing required verification parameters' },
      { status: 400 }
    );
  }

  // Find a channel with this verify token
  const channel = await db.query.whatsappChannels.findFirst({
    where: eq(whatsappChannels.verifyToken, verifyToken),
  });

  if (!channel) {
    return NextResponse.json(
      { error: 'Invalid verify token' },
      { status: 403 }
    );
  }

  // Respond with the challenge to complete verification
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * POST handler — Inbound messages and status updates.
 *
 * Validates the webhook signature, parses the payload, and processes
 * messages and status updates. Always returns HTTP 200 to Meta immediately.
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();

    // Validate webhook signature (Req 2.2)
    const signature = request.headers.get('x-hub-signature-256');
    if (!validateSignature(rawBody, signature)) {
      console.error('[WhatsApp Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const payload: WebhookPayload = JSON.parse(rawBody);

    if (payload.object !== 'whatsapp_business_account') {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Process each entry in the payload
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        // Handle template status update webhooks (Req 3.1, 3.2, 3.3)
        if (change.field === 'message_template_status_update') {
          try {
            const update = change.value as unknown as TemplateStatusUpdate;
            await processTemplateStatusUpdate(entry.id, update);
          } catch (error) {
            console.error('[WhatsApp Webhook] Error processing template status update:', error);
          }
          continue;
        }

        if (change.field !== 'messages') continue;

        const { value } = change;
        const phoneNumberId = value.metadata?.phone_number_id;

        if (!phoneNumberId) continue;

        // Look up the channel by phone number ID
        const channel = await db.query.whatsappChannels.findFirst({
          where: and(
            eq(whatsappChannels.phoneNumberId, phoneNumberId),
            eq(whatsappChannels.isActive, true)
          ),
        });

        if (!channel) {
          console.warn(`[WhatsApp Webhook] No active channel for phone number ID: ${phoneNumberId}`);
          continue;
        }

        // Process inbound messages
        if (value.messages) {
          for (const msg of value.messages) {
            try {
              await processInboundMessage(msg, phoneNumberId, channel.id, channel.eventId);
            } catch (error) {
              console.error('[WhatsApp Webhook] Error processing message:', error);
            }
          }
        }

        // Process status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            try {
              await processStatusUpdate(status);
            } catch (error) {
              console.error('[WhatsApp Webhook] Error processing status update:', error);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[WhatsApp Webhook] Unexpected error:', error);
  }

  // Always return 200 to Meta to prevent retries (Req 2.2)
  return NextResponse.json({ received: true }, { status: 200 });
}
