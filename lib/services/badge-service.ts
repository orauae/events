/**
 * @fileoverview Badge Service - Guest badge generation
 * 
 * This service handles the generation of event badges for guests.
 * Badges include:
 * - Guest name and company
 * - Event name
 * - QR code for check-in
 * - PDF generation for printing
 * 
 * @module lib/services/badge-service
 * @requires zod - Schema validation
 * @requires qrcode - QR code generation
 * @requires pdf-lib - PDF generation
 * 
 * @example
 * ```typescript
 * import { BadgeService } from '@/lib/services';
 * 
 * // Generate badge for a guest
 * const badge = await BadgeService.generate(eventGuestId);
 * 
 * // Generate PDF for printing
 * const pdf = await BadgeService.generatePDF(badge);
 * ```
 */

import { z } from 'zod';
import { db } from '@/db';
import { eventGuests, badges, type Badge, type EventGuest, type Guest, type Event } from '@/db/schema';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Badge with related EventGuest, Guest, and Event data.
 * Provides full context for badge rendering.
 */
export interface BadgeWithRelations extends Badge {
  eventGuest: EventGuest & {
    guest: Guest;
    event: Event;
  };
}

/**
 * Zod validation schema for generating a badge
 * Requirements: 6.1
 */
export const generateBadgeSchema = z.object({
  eventGuestId: z.string().min(1, 'EventGuest ID is required'),
});

export type GenerateBadgeInput = z.infer<typeof generateBadgeSchema>;

/**
 * Badge content for PDF generation
 */
export interface BadgeContent {
  guestName: string;
  company: string | null;
  eventName: string;
  qrToken: string;
}

/**
 * BadgeService - Generates event badges for guests.
 * 
 * Handles badge creation, QR code generation, and PDF rendering.
 * Badges are automatically generated when a guest confirms attendance
 * (RSVP status = Attending).
 * 
 * @remarks
 * Badge design follows the ORA design system:
 * - Gold accent line at top
 * - Charcoal text for guest name
 * - Graphite text for company and event
 * - QR code in bottom right for check-in
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export const BadgeService = {
  /**
   * Generates a badge record for an event guest.
   * 
   * If a badge already exists, returns the existing badge.
   * Uses the EventGuest's QR token for the badge.
   * 
   * @param eventGuestId - The EventGuest to generate a badge for
   * @returns The badge with full relations
   * @throws {Error} If EventGuest not found
   * 
   * @example
   * ```typescript
   * const badge = await BadgeService.generate('eventGuest123');
   * console.log(`Badge QR: ${badge.qrToken}`);
   * ```
   * 
   * Requirements: 6.1, 6.2, 6.3
   */
  async generate(eventGuestId: string): Promise<BadgeWithRelations> {
    // Validate input
    generateBadgeSchema.parse({ eventGuestId });

    // Get the EventGuest with relations
    const eventGuest = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, eventGuestId),
      with: {
        guest: true,
        event: true,
        badge: true,
      },
    });

    if (!eventGuest) {
      throw new Error('EventGuest not found');
    }

    // If badge already exists, return it
    if (eventGuest.badge) {
      return {
        ...eventGuest.badge,
        eventGuest: {
          ...eventGuest,
          guest: eventGuest.guest,
          event: eventGuest.event,
        },
      };
    }

    // Create the badge record
    // Uses the EventGuest's qrToken for the badge
    const [badge] = await db.insert(badges).values({
      eventGuestId,
      qrToken: eventGuest.qrToken,
    }).returning();

    return {
      ...badge,
      eventGuest: {
        ...eventGuest,
        guest: eventGuest.guest,
        event: eventGuest.event,
      },
    };
  },

  /**
   * Get a badge by EventGuest ID
   * Requirements: 6.1
   */
  async getByEventGuest(eventGuestId: string): Promise<BadgeWithRelations | null> {
    if (!eventGuestId) {
      return null;
    }

    const badge = await db.query.badges.findFirst({
      where: eq(badges.eventGuestId, eventGuestId),
      with: {
        eventGuest: {
          with: {
            guest: true,
            event: true,
          },
        },
      },
    });

    if (!badge) return null;

    return {
      ...badge,
      eventGuest: {
        ...badge.eventGuest,
        guest: badge.eventGuest.guest,
        event: badge.eventGuest.event,
      },
    };
  },

  /**
   * Get a badge by ID
   */
  async getById(id: string): Promise<BadgeWithRelations | null> {
    if (!id) {
      return null;
    }

    const badge = await db.query.badges.findFirst({
      where: eq(badges.id, id),
      with: {
        eventGuest: {
          with: {
            guest: true,
            event: true,
          },
        },
      },
    });

    if (!badge) return null;

    return {
      ...badge,
      eventGuest: {
        ...badge.eventGuest,
        guest: badge.eventGuest.guest,
        event: badge.eventGuest.event,
      },
    };
  },

  /**
   * Generate QR code as data URL
   * Requirements: 6.2, 6.3
   */
  async generateQRCode(qrToken: string): Promise<string> {
    if (!qrToken) {
      throw new Error('QR token is required');
    }

    // Generate QR code as data URL (PNG format)
    const qrDataUrl = await QRCode.toDataURL(qrToken, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 200,
      color: {
        dark: '#2C2C2C', // ORA charcoal
        light: '#FAFAFA', // ORA white
      },
    });

    return qrDataUrl;
  },


  /**
   * Generates a PDF badge for printing.
   * 
   * Creates a 4" x 3" badge with:
   * - Gold accent line at top
   * - Event name
   * - Guest name (large, bold)
   * - Company name
   * - QR code for check-in
   * 
   * @param badge - The badge with relations
   * @returns PDF as a Buffer
   * 
   * @example
   * ```typescript
   * const badge = await BadgeService.generate(eventGuestId);
   * const pdf = await BadgeService.generatePDF(badge);
   * 
   * // Save to file
   * fs.writeFileSync('badge.pdf', pdf);
   * ```
   * 
   * Requirements: 6.2, 6.5
   */
  async generatePDF(badge: BadgeWithRelations): Promise<Buffer> {
    const { eventGuest } = badge;
    const { guest, event } = eventGuest;

    // Create badge content
    const content: BadgeContent = {
      guestName: `${guest.firstName} ${guest.lastName}`,
      company: guest.company,
      eventName: event.name,
      qrToken: badge.qrToken,
    };

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Badge size: 4" x 3" (288 x 216 points at 72 DPI)
    const pageWidth = 288;
    const pageHeight = 216;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Embed fonts
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // ORA Design System colors
    const charcoal = rgb(0.173, 0.173, 0.173); // #2C2C2C
    const graphite = rgb(0.29, 0.29, 0.29); // #4A4A4A
    const gold = rgb(0.722, 0.584, 0.42); // #B8956B

    // Draw gold accent line at top
    page.drawRectangle({
      x: 0,
      y: pageHeight - 8,
      width: pageWidth,
      height: 8,
      color: gold,
    });

    // Draw event name
    const eventNameSize = 12;
    page.drawText(content.eventName, {
      x: 20,
      y: pageHeight - 35,
      size: eventNameSize,
      font: helvetica,
      color: graphite,
    });

    // Draw guest name (larger, bold)
    const guestNameSize = 18;
    page.drawText(content.guestName, {
      x: 20,
      y: pageHeight - 65,
      size: guestNameSize,
      font: helveticaBold,
      color: charcoal,
    });

    // Draw company if present
    if (content.company) {
      const companySize = 14;
      page.drawText(content.company, {
        x: 20,
        y: pageHeight - 90,
        size: companySize,
        font: helvetica,
        color: graphite,
      });
    }

    // Generate and embed QR code
    const qrDataUrl = await this.generateQRCode(content.qrToken);
    
    // Convert data URL to bytes
    const qrBase64 = qrDataUrl.split(',')[1];
    const qrBytes = Buffer.from(qrBase64, 'base64');
    
    // Embed QR code image
    const qrImage = await pdfDoc.embedPng(qrBytes);
    
    // Draw QR code (positioned at bottom right)
    const qrSize = 80;
    page.drawImage(qrImage, {
      x: pageWidth - qrSize - 20,
      y: 20,
      width: qrSize,
      height: qrSize,
    });

    // Serialize PDF to bytes
    const pdfBytes = await pdfDoc.save();
    
    return Buffer.from(pdfBytes);
  },

  /**
   * Generate badge and PDF for an EventGuest
   * Combines generate and generatePDF into one operation
   * Requirements: 6.1, 6.2, 6.5
   */
  async generateWithPDF(eventGuestId: string): Promise<{ badge: BadgeWithRelations; pdf: Buffer }> {
    const badge = await this.generate(eventGuestId);
    const pdf = await this.generatePDF(badge);
    return { badge, pdf };
  },
};

export default BadgeService;
