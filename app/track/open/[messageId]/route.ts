/**
 * @fileoverview Email Open Tracking Route Handler
 * 
 * This route handles open tracking for email campaigns via a tracking pixel.
 * When an email client loads the tracking pixel image, this endpoint:
 * 1. Records the open event with metadata (async, non-blocking)
 * 2. Returns a 1x1 transparent GIF image
 * 
 * Multiple Opens Handling:
 * - ALL opens are recorded in the emailOpens table for analytics (total opens)
 * - Only the FIRST open per recipient updates campaignMessages.openedAt
 * - Only the FIRST open per recipient increments campaigns.openedCount (unique opens)
 * - Deduplication within a 5-minute window prevents rapid successive opens
 *   from being counted multiple times (e.g., email client prefetching)
 * 
 * The open recording is done asynchronously to ensure fast responses
 * and a good user experience.
 * 
 * @module app/track/open/[messageId]/route
 * @requires db - Database connection
 * @requires db/schema - Database schema definitions
 * 
 * Requirements: 6, 7
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emailOpens, campaignMessages, campaigns } from '@/db/schema';
import { eq, sql, and, gte } from 'drizzle-orm';

/**
 * 1x1 transparent GIF image as a base64-encoded buffer.
 * This is the smallest valid GIF image possible.
 */
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * Default deduplication window in minutes for open tracking.
 * Opens from the same message within this window are considered duplicates.
 */
const DEFAULT_OPEN_DEDUP_WINDOW_MINUTES = 5;

/**
 * Extracts the client IP address from the request.
 * Checks various headers that may contain the real IP when behind proxies.
 * 
 * @param request - The incoming request
 * @returns The client IP address or undefined
 */
function getClientIP(request: NextRequest): string | undefined {
  // Check X-Forwarded-For header (common for proxies/load balancers)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }

  // Check X-Real-IP header (used by some proxies)
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Check CF-Connecting-IP header (Cloudflare)
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) {
    return cfIP;
  }

  return undefined;
}

/**
 * Checks if an open is a duplicate within the specified time window.
 * 
 * Used to prevent counting multiple opens from the same recipient
 * on the same message within a short time period (e.g., email client
 * prefetching, multiple image loads).
 * 
 * @param campaignMessageId - The campaign message ID
 * @param windowMinutes - Time window in minutes (default: 5)
 * @returns True if this is a duplicate open
 */
async function isDuplicateOpen(
  campaignMessageId: string,
  windowMinutes: number = DEFAULT_OPEN_DEDUP_WINDOW_MINUTES
): Promise<boolean> {
  // Calculate the cutoff time
  const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);

  // Check for existing opens within the window
  const existingOpen = await db.query.emailOpens.findFirst({
    where: and(
      eq(emailOpens.campaignMessageId, campaignMessageId),
      gte(emailOpens.openedAt, cutoffTime)
    ),
  });

  return !!existingOpen;
}

/**
 * Records an open event asynchronously without blocking the response.
 * This function catches and logs any errors to prevent them from
 * affecting the user experience.
 * 
 * Unique opens per recipient are tracked by:
 * 1. Recording all opens in the emailOpens table for analytics
 * 2. Only incrementing campaign.openedCount on the FIRST open per recipient
 * 3. Using campaignMessages.openedAt to track if a recipient has opened
 * 
 * @param campaignMessageId - The campaign message ID
 * @param metadata - Open event metadata
 */
async function recordOpenAsync(
  campaignMessageId: string,
  metadata: {
    userAgent?: string;
    ipAddress?: string;
  }
): Promise<void> {
  try {
    // Get the campaign message to check if this is the first open for this recipient
    const message = await db.query.campaignMessages.findFirst({
      where: eq(campaignMessages.id, campaignMessageId),
    });

    if (!message) {
      return;
    }

    // Check if this is the first open for this recipient (unique open)
    const isFirstOpenForRecipient = !message.openedAt;

    // Check for duplicate opens within the deduplication window
    // This prevents counting rapid successive opens (e.g., email client prefetching)
    const isDuplicateWithinWindow = await isDuplicateOpen(campaignMessageId);

    // Always record the open for analytics (total opens tracking)
    await db.insert(emailOpens).values({
      campaignMessageId,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    });

    // If this is a duplicate within the time window, don't update anything else
    if (isDuplicateWithinWindow) {
      return;
    }

    // Update campaign message openedAt if this is the first open for this recipient
    if (isFirstOpenForRecipient) {
      await db.update(campaignMessages)
        .set({ openedAt: new Date() })
        .where(eq(campaignMessages.id, campaignMessageId));

      // Only increment campaign opened count on FIRST open per recipient
      // This ensures openedCount represents unique opens, not total opens
      await db.update(campaigns)
        .set({
          openedCount: sql`${campaigns.openedCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, message.campaignId));
    }
  } catch (error) {
    // Log error but don't throw - we don't want to affect the response
    console.error('Error recording email open:', error);
  }
}

/**
 * GET handler for email open tracking.
 * 
 * This endpoint is called when an email client loads the tracking pixel.
 * It records the open event and returns a 1x1 transparent GIF.
 * 
 * @param request - The incoming request
 * @param params - Route parameters containing the messageId
 * @returns Response with 1x1 transparent GIF image
 * 
 * Requirements: 6, 7
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
): Promise<NextResponse> {
  const { messageId } = await params;

  try {
    // Verify the campaign message exists
    const message = await db.query.campaignMessages.findFirst({
      where: eq(campaignMessages.id, messageId),
    });

    if (message) {
      // Extract metadata from request
      const userAgent = request.headers.get('user-agent') || undefined;
      const ipAddress = getClientIP(request);

      // Record open asynchronously - don't await to ensure fast response
      recordOpenAsync(messageId, {
        userAgent,
        ipAddress,
      }).catch((error) => {
        console.error('Failed to record email open:', error);
      });
    }

    // Return 1x1 transparent GIF regardless of whether message exists
    // This prevents information leakage about valid message IDs
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error handling email open tracking:', error);

    // Still return the GIF even on error to prevent broken images
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }
}
