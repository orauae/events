/**
 * @fileoverview Cron Job API Route for Processing Scheduled Campaigns
 * 
 * This endpoint is designed to be called by a cron job service (e.g., Vercel Cron,
 * AWS CloudWatch Events, or a similar scheduler) to process scheduled campaigns.
 * 
 * It handles:
 * - Sending campaigns that are due
 * - Sending reminder notifications (24h, 1h before)
 * - Rescheduling recurring campaigns
 * 
 * Security:
 * - Protected by CRON_SECRET environment variable
 * - Should only be called by authorized cron services
 * 
 * @module app/api/cron/process-scheduled-campaigns/route
 * 
 * @example
 * ```bash
 * # Call from cron job with authorization header
 * curl -X POST https://your-app.com/api/cron/process-scheduled-campaigns \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 * ```
 * 
 * Requirements: 13 (Campaign Scheduling and Automation)
 * Requirements: 13.7 - Automatic campaign send when scheduled time arrives
 */

import { NextRequest, NextResponse } from 'next/server';
import { ScheduledCampaignProcessor } from '@/lib/services/scheduled-campaign-processor';
import crypto from 'crypto';

/**
 * Timing-safe comparison for secret tokens
 */
function safeCompare(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Verify the cron secret from the request
 */
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  // If no secret is configured, allow in development
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Cron] CRON_SECRET not configured, allowing request in development mode');
      return true;
    }
    console.error('[Cron] CRON_SECRET not configured');
    return false;
  }
  
  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (safeCompare(token, cronSecret)) return true;
  }
  
  // Check x-cron-secret header (alternative)
  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader && safeCompare(cronHeader, cronSecret)) {
    return true;
  }
  
  // Check Vercel Cron header
  // Vercel sends the CRON_SECRET in the Authorization header automatically,
  // but we also validate the x-vercel-cron header against CRON_SECRET for extra safety
  const vercelCronHeader = request.headers.get('x-vercel-cron');
  if (vercelCronHeader && safeCompare(vercelCronHeader, cronSecret)) {
    return true;
  }
  
  return false;
}

/**
 * Get the base URL for the application
 */
function getBaseUrl(request: NextRequest): string {
  // Try to get from environment variable first
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // Fall back to request URL
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * POST /api/cron/process-scheduled-campaigns
 * 
 * Process all scheduled campaigns that are due for sending.
 * Also processes reminder notifications.
 * 
 * This endpoint should be called by a cron job every minute.
 * 
 * Headers:
 * - Authorization: Bearer <CRON_SECRET>
 * - OR x-cron-secret: <CRON_SECRET>
 * 
 * Response:
 * - 200: Processing completed successfully
 * - 401: Unauthorized (invalid or missing secret)
 * - 500: Processing error
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  // Verify authorization
  if (!verifyCronSecret(request)) {
    console.error('[Cron] Unauthorized request to process-scheduled-campaigns');
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or missing cron secret' },
      { status: 401 }
    );
  }
  
  console.log('[Cron] Starting scheduled campaign processing...');
  
  try {
    const baseUrl = getBaseUrl(request);
    
    // Run the full processing cycle
    const result = await ScheduledCampaignProcessor.runProcessingCycle(baseUrl);
    
    const duration = Date.now() - startTime;
    
    console.log(`[Cron] Processing completed in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      campaigns: {
        processed: result.campaigns.processed,
        succeeded: result.campaigns.succeeded,
        failed: result.campaigns.failed,
        errors: result.campaigns.errors.length > 0 ? result.campaigns.errors : undefined,
      },
      reminders: {
        processed: result.reminders.processed,
        sent: result.reminders.sent,
        failed: result.reminders.failed,
        errors: result.reminders.errors.length > 0 ? result.reminders.errors : undefined,
      },
      abTests: {
        processed: result.abTests.processed,
        winnersSelected: result.abTests.winnersSelected,
        winnersSent: result.abTests.winnersSent,
        errors: result.abTests.errors.length > 0 ? result.abTests.errors : undefined,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Cron] Error processing scheduled campaigns:', error);
    
    return NextResponse.json(
      {
        success: false,
        duration: `${duration}ms`,
        error: 'Processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/process-scheduled-campaigns
 * 
 * Health check endpoint for the cron job.
 * Returns information about the cron configuration.
 */
export async function GET(request: NextRequest) {
  // Verify authorization for health check too
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or missing cron secret' },
      { status: 401 }
    );
  }
  
  return NextResponse.json({
    status: 'healthy',
    endpoint: '/api/cron/process-scheduled-campaigns',
    description: 'Processes scheduled campaigns and sends reminder notifications',
    recommendedSchedule: '* * * * *', // Every minute
    environment: process.env.NODE_ENV,
    hasBaseUrl: !!process.env.NEXT_PUBLIC_APP_URL,
  });
}
