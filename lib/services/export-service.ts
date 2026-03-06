/**
 * @fileoverview Export Service - Data export functionality
 * 
 * This service handles exporting data to CSV format for:
 * - Guest lists with all details and statuses
 * - Attendance reports for check-in tracking
 * - Campaign delivery reports
 * 
 * @module lib/services/export-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { ExportService } from '@/lib/services';
 * 
 * // Export guest list
 * const csv = await ExportService.exportGuestList(eventId);
 * 
 * // Save to file or send as download
 * fs.writeFileSync('guests.csv', csv);
 * ```
 */

import { db } from '@/db';
import { events, eventGuests, guests, campaigns, campaignMessages } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * ExportService - Generates CSV exports for event data.
 * 
 * Provides methods to export:
 * - Complete guest lists with contact info and statuses
 * - Attendance reports for post-event analysis
 * - Campaign delivery reports for email tracking
 * 
 * All exports are returned as CSV strings that can be saved or downloaded.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

/**
 * Escapes a value for safe CSV formatting.
 * Handles commas, quotes, and newlines by wrapping in quotes.
 * 
 * @param value - The value to escape
 * @returns CSV-safe string
 */
function escapeCSVValue(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  // If the value contains comma, quote, or newline, wrap in quotes and escape existing quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Convert an array of objects to CSV string
 */
function toCSV(headers: string[], rows: (string | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCSVValue).join(',');
  const dataLines = rows.map(row => row.map(escapeCSVValue).join(','));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Format date for CSV export
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) {
    return '';
  }
  return date.toISOString();
}

export const ExportService = {
  /**
   * Exports the complete guest list for an event.
   * 
   * Includes all guest details and their event-specific statuses:
   * - Contact info: name, email, mobile, company, job title
   * - Status: invitation, RSVP, check-in, check-in time
   * 
   * @param eventId - The event to export guests for
   * @returns CSV string with headers and data rows
   * @throws {Error} If event ID is missing or event not found
   * 
   * @example
   * ```typescript
   * const csv = await ExportService.exportGuestList('event123');
   * // Returns: "First Name,Last Name,Email,...\nJohn,Doe,john@example.com,..."
   * ```
   * 
   * Requirements: 9.1
   */
  async exportGuestList(eventId: string): Promise<string> {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    // Verify event exists
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // Get all event guests with guest details
    const eventGuestsList = await db.query.eventGuests.findMany({
      where: eq(eventGuests.eventId, eventId),
      with: {
        guest: true,
      },
      orderBy: (eventGuests, { asc }) => [asc(eventGuests.createdAt)],
    });

    // Define CSV headers
    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'Mobile',
      'Company',
      'Job Title',
      'Invitation Status',
      'RSVP Status',
      'Check-In Status',
      'Check-In Time',
    ];

    // Build rows
    const rows = eventGuestsList.map(eg => [
      eg.guest.firstName,
      eg.guest.lastName,
      eg.guest.email,
      eg.guest.mobile,
      eg.guest.company,
      eg.guest.jobTitle,
      eg.invitationStatus,
      eg.rsvpStatus,
      eg.checkInStatus,
      formatDate(eg.checkInTime),
    ]);

    return toCSV(headers, rows);
  },

  /**
   * Export attendance report for an event
   * Requirements: 9.2
   * 
   * Generates a CSV file with:
   * - guest name, email, company, RSVP status, check-in status, check-in time
   */
  async exportAttendanceReport(eventId: string): Promise<string> {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    // Verify event exists
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // Get all event guests with guest details
    const eventGuestsList = await db.query.eventGuests.findMany({
      where: eq(eventGuests.eventId, eventId),
      with: {
        guest: true,
      },
      orderBy: (eventGuests, { asc }) => [asc(eventGuests.createdAt)],
    });

    // Define CSV headers per requirement 9.2
    const headers = [
      'Guest Name',
      'Email',
      'Company',
      'RSVP Status',
      'Check-In Status',
      'Check-In Time',
    ];

    // Build rows
    const rows = eventGuestsList.map(eg => [
      `${eg.guest.firstName} ${eg.guest.lastName}`,
      eg.guest.email,
      eg.guest.company,
      eg.rsvpStatus,
      eg.checkInStatus,
      formatDate(eg.checkInTime),
    ]);

    return toCSV(headers, rows);
  },

  /**
   * Export campaign report
   * Requirements: 9.3
   * 
   * Generates a CSV file with:
   * - campaign name, type, sent count, delivered count, delivery rate
   */
  async exportCampaignReport(campaignId: string): Promise<string> {
    if (!campaignId) {
      throw new Error('Campaign ID is required');
    }

    // Verify campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get all messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    // Calculate metrics
    const totalSent = messages.filter(msg => msg.status !== 'Pending').length;
    const delivered = messages.filter(msg => msg.status === 'Delivered').length;
    const deliveryRate = totalSent > 0 ? ((delivered / totalSent) * 100).toFixed(2) : '0.00';

    // Define CSV headers per requirement 9.3
    const headers = [
      'Campaign Name',
      'Type',
      'Sent Count',
      'Delivered Count',
      'Delivery Rate (%)',
    ];

    // Build single row for this campaign
    const rows = [
      [
        campaign.name,
        campaign.type,
        String(totalSent),
        String(delivered),
        deliveryRate,
      ],
    ];

    return toCSV(headers, rows);
  },
};

export default ExportService;
