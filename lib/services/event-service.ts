/**
 * @fileoverview Event Service - Core business logic for event management
 * 
 * This service handles all CRUD operations for events in the EventOS platform.
 * Events are the central entity around which guests, campaigns, and automations
 * are organized.
 * 
 * @module lib/services/event-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { EventService } from '@/lib/services';
 * 
 * // Create a new event
 * const event = await EventService.create({
 *   name: 'Annual Conference 2026',
 *   type: 'Conference',
 *   description: 'Our yearly gathering',
 *   startDate: new Date('2026-03-15'),
 *   endDate: new Date('2026-03-17'),
 *   location: 'Grand Ballroom, NYC',
 *   hostName: 'John Doe',
 *   hostEmail: 'john@example.com'
 * });
 * ```
 */

import { z } from 'zod';
import { db } from '@/db';
import { events, type Event, type EventType } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Zod validation schema for event creation input.
 * Validates all required fields and ensures date consistency.
 * 
 * @remarks
 * - Event name, location, and host details are required
 * - End date must be on or after start date
 * - Host email must be a valid email format
 * 
 * Requirements: 1.5, 1.6
 */
export const createEventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(200, 'Event name must be 200 characters or less'),
  type: z.enum(['Conference', 'Private', 'Corporate', 'Exhibition', 'ProductLaunch', 'OpenHouse'] as const, {
    error: 'Event type must be one of: Conference, Private, Corporate, Exhibition, Product Launch, Open House',
  }),
  description: z.string().max(5000, 'Description must be 5000 characters or less'),
  startDate: z.coerce.date({ error: 'Start date is required' }),
  endDate: z.coerce.date({ error: 'End date is required' }),
  location: z.string().trim().min(1, 'Location is required').max(500, 'Location must be 500 characters or less'),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  addressId: z.string().optional(),
}).refine((data) => data.endDate >= data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

/**
 * Zod validation schema for event update input (base schema without refinement)
 */
const baseEventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(200, 'Event name must be 200 characters or less'),
  type: z.enum(['Conference', 'Private', 'Corporate', 'Exhibition', 'ProductLaunch', 'OpenHouse'] as const, {
    error: 'Event type must be one of: Conference, Private, Corporate, Exhibition, Product Launch, Open House',
  }),
  description: z.string().max(5000, 'Description must be 5000 characters or less'),
  startDate: z.coerce.date({ error: 'Start date is required' }),
  endDate: z.coerce.date({ error: 'End date is required' }),
  location: z.string().trim().min(1, 'Location is required').max(500, 'Location must be 500 characters or less'),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  addressId: z.string().optional(),
});

export const updateEventSchema = baseEventSchema.partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/**
 * EventService - Core service for event management operations.
 * 
 * Provides methods for creating, reading, updating, and deleting events.
 * All operations include validation and proper error handling.
 * 
 * @remarks
 * Events are the top-level entity in EventOS. Each event can have:
 * - Multiple guests (via EventGuest records)
 * - Multiple campaigns for communication
 * - Multiple automations for workflow automation
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
export const EventService = {
  /**
   * Creates a new event with the provided details.
   * 
   * @param input - The event creation data
   * @returns The newly created event record
   * @throws {ZodError} If input validation fails
   * 
   * @example
   * ```typescript
   * const event = await EventService.create({
   *   name: 'Tech Summit 2026',
   *   type: 'Conference',
   *   description: 'Annual technology conference',
   *   startDate: new Date('2026-06-01'),
   *   endDate: new Date('2026-06-03'),
   *   location: 'Convention Center',
   *   hostName: 'Jane Smith',
   *   hostEmail: 'jane@company.com'
   * });
   * ```
   * 
   * Requirements: 1.1, 1.5, 1.6
   */
  async create(input: CreateEventInput): Promise<Event> {
    // Validate input
    const validated = createEventSchema.parse(input);

    const [event] = await db.insert(events).values({
      name: validated.name,
      type: validated.type as EventType,
      description: validated.description,
      startDate: validated.startDate,
      endDate: validated.endDate,
      location: validated.location,
      latitude: validated.latitude,
      longitude: validated.longitude,
      addressId: validated.addressId,
    }).returning();

    return event;
  },

  /**
   * Retrieves a single event by its unique identifier.
   * 
   * @param id - The unique event ID (CUID format)
   * @returns The event if found, null otherwise
   * 
   * @example
   * ```typescript
   * const event = await EventService.getById('clx1234567890');
   * if (event) {
   *   console.log(`Found event: ${event.name}`);
   * }
   * ```
   * 
   * Requirements: 1.2
   */
  async getById(id: string): Promise<Event | null> {
    const event = await db.query.events.findFirst({
      where: eq(events.id, id),
    });
    return event ?? null;
  },

  /**
   * Retrieves all events, ordered by creation date (newest first).
   * 
   * @returns Array of all events in the system
   * 
   * @example
   * ```typescript
   * const events = await EventService.getAll();
   * console.log(`Total events: ${events.length}`);
   * ```
   * 
   * Requirements: 1.2
   */
  async getAll(): Promise<Event[]> {
    return db.query.events.findMany({
      orderBy: desc(events.createdAt),
    });
  },

  /**
   * Updates an existing event with partial data.
   * 
   * @param id - The unique event ID to update
   * @param input - Partial event data to update (only provided fields are changed)
   * @returns The updated event record
   * @throws {Error} If end date would be before start date after update
   * 
   * @remarks
   * - Only provided fields are updated; others remain unchanged
   * - Date validation is performed even for partial updates
   * - The updatedAt timestamp is automatically set
   * 
   * @example
   * ```typescript
   * // Update just the location
   * const updated = await EventService.update('clx1234567890', {
   *   location: 'New Venue, Downtown'
   * });
   * ```
   * 
   * Requirements: 1.3
   */
  async update(id: string, input: UpdateEventInput): Promise<Event> {
    // Validate input
    const validated = updateEventSchema.parse(input);

    // If both dates are provided, validate end date is after start date
    if (validated.startDate && validated.endDate) {
      if (validated.endDate < validated.startDate) {
        throw new Error('End date must be after start date');
      }
    }

    // If only one date is provided, fetch the existing event to validate
    if (validated.startDate || validated.endDate) {
      const existingEvent = await db.query.events.findFirst({
        where: eq(events.id, id),
      });
      if (existingEvent) {
        const newStartDate = validated.startDate ?? existingEvent.startDate;
        const newEndDate = validated.endDate ?? existingEvent.endDate;
        if (newEndDate < newStartDate) {
          throw new Error('End date must be after start date');
        }
      }
    }

    const updateData: Partial<typeof events.$inferInsert> = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.type !== undefined) updateData.type = validated.type as EventType;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.startDate !== undefined) updateData.startDate = validated.startDate;
    if (validated.endDate !== undefined) updateData.endDate = validated.endDate;
    if (validated.location !== undefined) updateData.location = validated.location;
    if (validated.latitude !== undefined) updateData.latitude = validated.latitude;
    if (validated.longitude !== undefined) updateData.longitude = validated.longitude;
    if (validated.addressId !== undefined) updateData.addressId = validated.addressId;
    updateData.updatedAt = new Date();

    const [event] = await db.update(events)
      .set(updateData)
      .where(eq(events.id, id))
      .returning();

    return event;
  },

  /**
   * Permanently deletes an event and all associated data.
   * 
   * @param id - The unique event ID to delete
   * @returns void
   * 
   * @remarks
   * Due to cascade delete rules in the database schema, deleting an event
   * will also delete:
   * - All EventGuest records (guest participation)
   * - All Campaigns associated with the event
   * - All Automations and their execution history
   * - All GuestTags created for the event
   * 
   * @example
   * ```typescript
   * await EventService.delete('clx1234567890');
   * ```
   * 
   * Requirements: 1.4
   */
  async delete(id: string): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  },
};

export default EventService;
