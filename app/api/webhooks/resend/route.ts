/**
 * @fileoverview Resend Webhook Route Handler
 * 
 * This route handles webhook callbacks from Resend for email delivery events.
 * It processes delivery status updates, bounces, complaints, and other events
 * to maintain accurate campaign analytics and list hygiene.
 * 
 * Key responsibilities:
 * - Verify webhook signatures using Svix
 * - Process delivery events (sent, delivered, bounced, complained)
 * - Update campaign message status
 * - Handle bounces with categorization (hard/soft)
 * - Auto-unsubscribe on complaints
 * 
 * @module app/api/webhooks/resend/route
 * @requires svix - Webhook signature verification
 * @requires lib/services/webhook-service - Event processing
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { WebhookService, type ResendWebhookPayload } from '@/lib/services/webhook-service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Environment variable for Resend webhook signing secret.
 * This secret is used to verify that webhooks are genuinely from Resend.
 * Get this from the Resend dashboard webhook settings.
 */
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

/**
 * Required Svix headers for webhook verification.
 * These headers are sent by Resend with every webhook request.
 */
const SVIX_HEADERS = {
  ID: 'svix-id',
  TIMESTAMP: 'svix-timestamp',
  SIGNATURE: 'svix-signature',
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extracts Svix headers from the request for signature verification.
 * 
 * @param request - The incoming webhook request
 * @returns Object containing the Svix headers
 */
function getSvixHeaders(request: NextRequest): {
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
} {
  return {
    svixId: request.headers.get(SVIX_HEADERS.ID),
    svixTimestamp: request.headers.get(SVIX_HEADERS.TIMESTAMP),
    svixSignature: request.headers.get(SVIX_HEADERS.SIGNATURE),
  };
}

/**
 * Verifies the webhook signature using Svix.
 * 
 * @param payload - Raw request body as string
 * @param headers - Svix headers from the request
 * @returns The verified payload or null if verification fails
 */
function verifyWebhookSignature(
  payload: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  }
): ResendWebhookPayload | null {
  if (!RESEND_WEBHOOK_SECRET) {
    console.error('[Resend Webhook] RESEND_WEBHOOK_SECRET is not configured');
    return null;
  }

  const { svixId, svixTimestamp, svixSignature } = headers;

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[Resend Webhook] Missing required Svix headers');
    return null;
  }

  try {
    const wh = new Webhook(RESEND_WEBHOOK_SECRET);
    
    // Verify the webhook signature
    const verified = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookPayload;

    return verified;
  } catch (error) {
    console.error('[Resend Webhook] Signature verification failed:', error);
    return null;
  }
}

/**
 * Logs webhook event for debugging and monitoring.
 * 
 * @param eventType - The type of webhook event
 * @param email - The recipient email address
 * @param result - The processing result
 */
function logWebhookEvent(
  eventType: string,
  email: string,
  result: { success: boolean; action?: string; error?: string }
): void {
  const status = result.success ? 'SUCCESS' : 'FAILED';
  const details = result.action || result.error || 'unknown';
  console.log(`[Resend Webhook] ${status} - ${eventType} for ${email}: ${details}`);
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * POST handler for Resend webhook events.
 * 
 * This endpoint receives webhook callbacks from Resend for various email events:
 * - email.sent: Email was accepted by Resend
 * - email.delivered: Email was delivered to recipient
 * - email.bounced: Email bounced (hard or soft)
 * - email.complained: Recipient marked email as spam
 * - email.opened: Recipient opened the email
 * - email.clicked: Recipient clicked a link
 * 
 * The handler:
 * 1. Verifies the webhook signature using Svix
 * 2. Validates the payload structure
 * 3. Processes the event using WebhookService
 * 4. Returns appropriate HTTP status codes
 * 
 * @param request - The incoming webhook request
 * @returns JSON response with processing result
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get the raw request body for signature verification
    const payload = await request.text();

    // Extract Svix headers
    const svixHeaders = getSvixHeaders(request);

    // Verify webhook signature
    const verifiedPayload = verifyWebhookSignature(payload, svixHeaders);

    if (!verifiedPayload) {
      // Return 401 for signature verification failures
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    // Validate the payload structure
    const validatedPayload = WebhookService.validatePayload(verifiedPayload);

    if (!validatedPayload) {
      // Return 400 for invalid payload structure
      return NextResponse.json(
        { error: 'Invalid webhook payload structure' },
        { status: 400 }
      );
    }

    // Process the webhook event
    const result = await WebhookService.processResendWebhook(validatedPayload);

    // Log the event for monitoring
    const email = validatedPayload.data.to[0] || 'unknown';
    logWebhookEvent(validatedPayload.type, email, result);

    if (!result.success) {
      // Return 500 for processing errors
      // Note: We still return 200 for most errors to prevent Resend from retrying
      // Only return 500 for critical errors that should be retried
      console.error('[Resend Webhook] Processing error:', result.error);
      
      // Return 200 to acknowledge receipt even on processing errors
      // This prevents unnecessary retries for non-transient errors
      return NextResponse.json({
        received: true,
        processed: false,
        eventType: result.eventType,
        error: result.error,
      });
    }

    // Return success response
    return NextResponse.json({
      received: true,
      processed: true,
      eventType: result.eventType,
      action: result.action,
    });

  } catch (error) {
    console.error('[Resend Webhook] Unexpected error:', error);

    // Return 500 for unexpected errors
    // Resend will retry the webhook
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET handler - Returns method not allowed.
 * Webhooks should only be received via POST.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST for webhook events.' },
    { status: 405 }
  );
}
