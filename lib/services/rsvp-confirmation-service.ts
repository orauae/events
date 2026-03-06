/**
 * @fileoverview RSVP Confirmation Service
 * 
 * Handles sending confirmation emails when guests submit their RSVP response.
 * If the guest is attending, includes their event badge with QR code.
 * 
 * @module lib/services/rsvp-confirmation-service
 */

import { CampaignSendService } from './campaign-send-service';
import { BadgeService, BadgeWithRelations } from './badge-service';
import { db } from '@/db';
import { eventGuests, events, guests } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

/**
 * Event guest with full relations for email sending
 */
export interface EventGuestWithRelations {
  id: string;
  qrToken: string;
  rsvpStatus: string;
  guest: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    company: string | null;
  };
  event: {
    id: string;
    name: string;
    type: string;
    startDate: Date;
    endDate: Date;
    location: string;
    description: string;
  };
}

/**
 * Result of sending RSVP confirmation
 */
export interface RSVPConfirmationResult {
  success: boolean;
  emailSent: boolean;
  badge: BadgeWithRelations | null;
  error?: string;
}

/**
 * Format date for email display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format time for email display
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Generate HTML email template for RSVP confirmation
 */
function generateConfirmationEmailHTML(
  eventGuest: EventGuestWithRelations,
  status: 'Attending' | 'NotAttending',
  badgeQRDataUrl?: string,
  baseUrl?: string
): string {
  const { guest, event } = eventGuest;
  const eventDate = formatDate(new Date(event.startDate));
  const eventTime = `${formatTime(new Date(event.startDate))} - ${formatTime(new Date(event.endDate))}`;
  
  const isAttending = status === 'Attending';
  const statusText = status === 'Attending' ? "You're all set!" 
    : "We'll miss you!";
  
  const statusColor = status === 'Attending' ? '#22c55e' 
    : '#ef4444';

  const badgeSection = isAttending && badgeQRDataUrl ? `
    <!-- Badge Section -->
    <div style="background: linear-gradient(135deg, #FAF9F7 0%, #F5F3F0 100%); border-radius: 16px; padding: 32px; margin-top: 32px; border: 1px solid #E8E4DF;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2C2C2C; font-size: 20px; font-weight: 600; margin: 0 0 8px 0;">Your Event Badge</h2>
        <p style="color: #6B6B6B; font-size: 14px; margin: 0;">Show this QR code at check-in</p>
      </div>
      
      <!-- Badge Card -->
      <div style="background: #FFFFFF; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); max-width: 320px; margin: 0 auto;">
        <!-- Gold accent -->
        <div style="height: 6px; background: #B8956B; border-radius: 3px 3px 0 0; margin: -24px -24px 20px -24px;"></div>
        
        <!-- Event name -->
        <p style="color: #6B6B6B; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 8px 0;">${event.name}</p>
        
        <!-- Guest name -->
        <h3 style="color: #2C2C2C; font-size: 24px; font-weight: 700; margin: 0 0 4px 0;">${guest.firstName} ${guest.lastName}</h3>
        
        ${guest.company ? `<p style="color: #6B6B6B; font-size: 14px; margin: 0 0 20px 0;">${guest.company}</p>` : '<div style="margin-bottom: 20px;"></div>'}
        
        <!-- QR Code -->
        <div style="text-align: center; padding: 16px; background: #FAFAFA; border-radius: 8px;">
          <img src="${badgeQRDataUrl}" alt="Check-in QR Code" style="width: 160px; height: 160px;" />
          <p style="color: #9CA3AF; font-size: 11px; margin: 12px 0 0 0;">Scan at event check-in</p>
        </div>
      </div>
      
      <p style="text-align: center; color: #6B6B6B; font-size: 13px; margin-top: 20px;">
        💡 <strong>Tip:</strong> Save this email or take a screenshot for easy access at the event.
      </p>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RSVP Confirmation - ${event.name}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF9F7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background: #B8956B; width: 40px; height: 40px; border-radius: 8px; margin-bottom: 16px;"></div>
      <h1 style="color: #2C2C2C; font-size: 24px; font-weight: 300; letter-spacing: 0.1em; margin: 0;">ORA EVENTS</h1>
    </div>
    
    <!-- Main Card -->
    <div style="background: #FFFFFF; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); overflow: hidden;">
      <!-- Status Banner -->
      <div style="background: ${statusColor}; padding: 24px; text-align: center;">
        <h2 style="color: #FFFFFF; font-size: 28px; font-weight: 600; margin: 0;">${statusText}</h2>
      </div>
      
      <div style="padding: 32px;">
        <!-- Greeting -->
        <p style="color: #2C2C2C; font-size: 16px; margin: 0 0 24px 0;">
          Hi ${guest.firstName},
        </p>
        
        <p style="color: #4A4A4A; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
          ${status === 'Attending' 
            ? `We're excited to confirm your attendance for <strong>${event.name}</strong>! Your event badge is included below.`
            : `We're sorry you can't make it to <strong>${event.name}</strong>. We hope to see you at a future event!`
          }
        </p>
        
        <!-- Event Details Card -->
        <div style="background: #FAF9F7; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h3 style="color: #2C2C2C; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">Event Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; vertical-align: top; width: 28px;">
                <span style="color: #B8956B;">📅</span>
              </td>
              <td style="padding: 8px 0; color: #2C2C2C; font-size: 14px;">
                ${eventDate}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; vertical-align: top; width: 28px;">
                <span style="color: #B8956B;">🕐</span>
              </td>
              <td style="padding: 8px 0; color: #2C2C2C; font-size: 14px;">
                ${eventTime}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; vertical-align: top; width: 28px;">
                <span style="color: #B8956B;">📍</span>
              </td>
              <td style="padding: 8px 0; color: #2C2C2C; font-size: 14px;">
                ${event.location}
              </td>
            </tr>
          </table>
        </div>
        
        ${badgeSection}
      </div>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; color: #9CA3AF; font-size: 12px;">
      <p style="margin: 0 0 8px 0;">Powered by ORA Events</p>
      <p style="margin: 0;">© ${new Date().getFullYear()} All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * RSVPConfirmationService - Sends confirmation emails after RSVP submission
 */
export const RSVPConfirmationService = {
  /**
   * Send RSVP confirmation email to a guest
   * 
   * @param eventGuestId - The event guest ID
   * @param status - The RSVP status
   * @param baseUrl - Base URL for links
   * @returns Confirmation result with badge if attending
   */
  async sendConfirmation(
    eventGuestId: string,
    status: 'Attending' | 'NotAttending',
    baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ): Promise<RSVPConfirmationResult> {
    try {
      // Get event guest with relations
      const eventGuest = await db.query.eventGuests.findFirst({
        where: eq(eventGuests.id, eventGuestId),
        with: {
          guest: true,
          event: true,
        },
      });

      if (!eventGuest) {
        return {
          success: false,
          emailSent: false,
          badge: null,
          error: 'Event guest not found',
        };
      }

      let badge: BadgeWithRelations | null = null;
      let badgeQRDataUrl: string | undefined;

      // Generate badge and QR code if attending
      if (status === 'Attending') {
        badge = await BadgeService.generate(eventGuestId);
        badgeQRDataUrl = await BadgeService.generateQRCode(badge.qrToken);
      }

      // Generate email content
      const htmlContent = generateConfirmationEmailHTML(
        eventGuest as EventGuestWithRelations,
        status,
        badgeQRDataUrl,
        baseUrl
      );

      // Subject based on status
      const subject = status === 'Attending' 
        ? `✅ You're confirmed for ${eventGuest.event.name} - Here's your badge!`
        : `RSVP Update: ${eventGuest.event.name}`;

      // Send email (generate a unique ID for tracking)
      const sendResult = await CampaignSendService.sendEmail({
        to: eventGuest.guest.email,
        subject,
        html: htmlContent,
        messageId: `rsvp-confirm-${createId()}`,
      });

      if (!sendResult.success) {
        console.error('Failed to send RSVP confirmation email:', sendResult.error);
        return {
          success: true, // RSVP still succeeded, just email failed
          emailSent: false,
          badge,
          error: `Email failed: ${sendResult.error}`,
        };
      }

      return {
        success: true,
        emailSent: true,
        badge,
      };
    } catch (error) {
      console.error('Error in RSVP confirmation:', error);
      return {
        success: false,
        emailSent: false,
        badge: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  /**
   * Get badge data for display (QR code as data URL)
   */
  async getBadgeDisplayData(eventGuestId: string): Promise<{
    badge: BadgeWithRelations | null;
    qrDataUrl: string | null;
  }> {
    const badge = await BadgeService.getByEventGuest(eventGuestId);
    
    if (!badge) {
      return { badge: null, qrDataUrl: null };
    }

    const qrDataUrl = await BadgeService.generateQRCode(badge.qrToken);
    
    return { badge, qrDataUrl };
  },
};

export default RSVPConfirmationService;
