/**
 * @fileoverview Link Click Tracking Route Handler
 * 
 * This route handles click tracking for email campaign links.
 * When a recipient clicks a tracked link in an email, this endpoint:
 * 1. Records the click event with metadata (async, non-blocking)
 * 2. Redirects the user to the original destination URL
 * 
 * The click recording is done asynchronously to ensure fast redirects
 * and a good user experience.
 * 
 * @module app/track/[linkId]/route
 * @requires lib/services/link-tracking-service
 * 
 * Requirements: 6.1, 6.2, 6.5, 6.7
 */

import { NextRequest, NextResponse } from 'next/server';
import { LinkTrackingService, DEFAULT_DEDUP_WINDOW_MINUTES } from '@/lib/services';

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
 * Extracts the recipient email from query parameters.
 * The email is passed as a query parameter when the tracking link is generated
 * to associate clicks with specific recipients.
 * 
 * @param request - The incoming request
 * @returns The recipient email or undefined
 */
function getRecipientEmail(request: NextRequest): string | undefined {
  const { searchParams } = new URL(request.url);
  return searchParams.get('email') || undefined;
}

/**
 * Extracts the campaign message ID from query parameters.
 * Used to associate clicks with specific email messages for detailed tracking.
 * 
 * @param request - The incoming request
 * @returns The campaign message ID or undefined
 */
function getCampaignMessageId(request: NextRequest): string | undefined {
  const { searchParams } = new URL(request.url);
  return searchParams.get('mid') || undefined;
}

/**
 * Records a click event asynchronously without blocking the redirect.
 * This function catches and logs any errors to prevent them from
 * affecting the user experience.
 * 
 * @param linkId - The tracking link ID
 * @param metadata - Click event metadata
 */
async function recordClickAsync(
  linkId: string,
  metadata: {
    recipientEmail: string;
    campaignMessageId?: string;
    userAgent?: string;
    ipAddress?: string;
    referer?: string;
  }
): Promise<void> {
  try {
    // Check for duplicate clicks within the deduplication window
    const isDuplicate = await LinkTrackingService.isDuplicateClick(
      linkId,
      metadata.recipientEmail,
      DEFAULT_DEDUP_WINDOW_MINUTES
    );

    if (!isDuplicate) {
      await LinkTrackingService.recordClick(linkId, metadata);
    }
  } catch (error) {
    // Log error but don't throw - we don't want to affect the redirect
    console.error('Error recording click:', error);
  }
}

/**
 * GET handler for link click tracking.
 * 
 * This endpoint is called when a recipient clicks a tracked link in an email.
 * It records the click event and redirects to the original URL.
 * 
 * Query Parameters:
 * - email: The recipient's email address (required for tracking)
 * - mid: The campaign message ID (optional, for detailed tracking)
 * 
 * @param request - The incoming request
 * @param params - Route parameters containing the linkId
 * @returns Redirect response to the original URL or error response
 * 
 * Requirements: 6.1, 6.2, 6.5, 6.7
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
): Promise<NextResponse> {
  const { linkId } = await params;

  try {
    // Get the redirect URL with UTM parameters
    const redirectUrl = await LinkTrackingService.getRedirectUrlWithUTM(linkId);

    if (!redirectUrl) {
      // Link not found - return 404
      return new NextResponse('Link not found', { status: 404 });
    }

    // Extract metadata from request
    const recipientEmail = getRecipientEmail(request);
    const campaignMessageId = getCampaignMessageId(request);
    const userAgent = request.headers.get('user-agent') || undefined;
    const ipAddress = getClientIP(request);
    const referer = request.headers.get('referer') || undefined;

    // Record click asynchronously if we have a recipient email
    // Don't await - we want to redirect immediately
    if (recipientEmail) {
      // Fire and forget - don't block the redirect
      recordClickAsync(linkId, {
        recipientEmail,
        campaignMessageId,
        userAgent,
        ipAddress,
        referer,
      }).catch((error) => {
        console.error('Failed to record click:', error);
      });
    }

    // Redirect to the original URL (302 temporary redirect)
    return NextResponse.redirect(redirectUrl, 302);
  } catch (error) {
    console.error('Error handling link click:', error);
    
    // On error, try to get the original URL and redirect anyway
    try {
      const link = await LinkTrackingService.getLinkById(linkId);
      if (link) {
        return NextResponse.redirect(link.originalUrl, 302);
      }
    } catch {
      // Ignore secondary error
    }

    // If all else fails, return a generic error
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
