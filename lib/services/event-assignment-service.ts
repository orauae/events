/**
 * @fileoverview Event Assignment Service - Event assignment and transfer operations
 * 
 * This service handles all operations for managing event assignments including:
 * - Initial event assignment to users
 * - Event transfer between users
 * - Bulk transfer for deactivation workflows
 * - Query operations for assignments
 * 
 * @module lib/services/event-assignment-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { EventAssignmentService } from '@/lib/services';
 * 
 * // Assign an event to a user
 * const assignment = await EventAssignmentService.assignEvent(eventId, userId, adminId);
 * 
 * // Transfer an event to another user
 * const transferred = await EventAssignmentService.transferEvent(eventId, newUserId, adminId);
 * ```
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1
 */

import { db } from '@/db';
import { 
  user, 
  events,
  eventAssignments,
  type User,
  type Event,
  type EventAssignment,
} from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Event assignment with related event details
 */
export interface EventAssignmentWithEvent extends EventAssignment {
  event: Event;
}

/**
 * Event assignment with related user details
 */
export interface EventAssignmentWithUser extends EventAssignment {
  assignedUser: User;
}

/**
 * User eligible for event assignment
 */
export interface AssignableUser {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'EventManager';
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * EventAssignmentService - Core service for event assignment operations.
 * 
 * Provides methods for assigning events to users, transferring events
 * between users, and querying assignment information.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1
 */
export const EventAssignmentService = {
  /**
   * Assigns an event to a user.
   * 
   * Creates a new assignment record linking the event to the specified user.
   * If the event is already assigned, this will fail due to unique constraint.
   * 
   * @param eventId - The event ID to assign
   * @param userId - The user ID to assign the event to
   * @param assignedBy - The user ID of who is making the assignment
   * @returns The created assignment record
   * @throws {Error} If event not found, user not found, user inactive, or event already assigned
   * 
   * Requirements: 5.1
   */
  async assignEvent(eventId: string, userId: string, assignedBy: string): Promise<EventAssignment> {
    // Verify event exists
    const eventRecord = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });

    if (!eventRecord) {
      throw new Error('Event not found');
    }

    // Verify user exists and is active
    const userRecord = await db.query.user.findFirst({
      where: eq(user.id, userId),
    });

    if (!userRecord) {
      throw new Error('User not found');
    }

    if (userRecord.status !== 'Active') {
      throw new Error('Cannot assign event to inactive user');
    }

    if (userRecord.role !== 'Admin' && userRecord.role !== 'EventManager') {
      throw new Error('User must be Admin or EventManager to be assigned events');
    }

    // Check if event is already assigned
    const existingAssignment = await db.query.eventAssignments.findFirst({
      where: eq(eventAssignments.eventId, eventId),
    });

    if (existingAssignment) {
      throw new Error('Event is already assigned to a user');
    }

    // Create the assignment
    const [assignment] = await db.insert(eventAssignments).values({
      eventId,
      assignedUserId: userId,
      assignedBy,
    }).returning();

    return assignment;
  },

  /**
   * Transfers an event from one user to another.
   * 
   * Updates the existing assignment to point to the new user.
   * Records who made the transfer and when.
   * 
   * @param eventId - The event ID to transfer
   * @param toUserId - The user ID to transfer the event to
   * @param transferredBy - The user ID of who is making the transfer
   * @returns The updated assignment record
   * @throws {Error} If event not found, not assigned, target user invalid
   * 
   * Requirements: 5.3, 5.4
   */
  async transferEvent(eventId: string, toUserId: string, transferredBy: string): Promise<EventAssignment> {
    // Verify event exists
    const eventRecord = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });

    if (!eventRecord) {
      throw new Error('Event not found');
    }

    // Verify target user exists and is active
    const targetUser = await db.query.user.findFirst({
      where: eq(user.id, toUserId),
    });

    if (!targetUser) {
      throw new Error('Target user not found');
    }

    if (targetUser.status !== 'Active') {
      throw new Error('Cannot transfer event to inactive user');
    }

    if (targetUser.role !== 'Admin' && targetUser.role !== 'EventManager') {
      throw new Error('Target user must be Admin or EventManager');
    }

    // Check if event has an existing assignment
    const existingAssignment = await db.query.eventAssignments.findFirst({
      where: eq(eventAssignments.eventId, eventId),
    });

    if (!existingAssignment) {
      // If no existing assignment, create one
      const [assignment] = await db.insert(eventAssignments).values({
        eventId,
        assignedUserId: toUserId,
        assignedBy: transferredBy,
      }).returning();

      return assignment;
    }

    // Update the existing assignment
    const [updatedAssignment] = await db.update(eventAssignments)
      .set({
        assignedUserId: toUserId,
        assignedAt: new Date(),
        assignedBy: transferredBy,
      })
      .where(eq(eventAssignments.eventId, eventId))
      .returning();

    return updatedAssignment;
  },

  /**
   * Transfers all events from one user to another.
   * 
   * Used during deactivation workflow to reassign all events
   * from a departing user to another active user.
   * 
   * @param fromUserId - The user ID to transfer events from
   * @param toUserId - The user ID to transfer events to
   * @param transferredBy - The user ID of who is making the transfer
   * @returns The number of events transferred
   * @throws {Error} If target user is invalid or same as source
   * 
   * Requirements: 5.4
   */
  async bulkTransfer(fromUserId: string, toUserId: string, transferredBy: string): Promise<number> {
    // Verify source and target are different
    if (fromUserId === toUserId) {
      throw new Error('Cannot transfer events to the same user');
    }

    // Verify target user exists and is active
    const targetUser = await db.query.user.findFirst({
      where: eq(user.id, toUserId),
    });

    if (!targetUser) {
      throw new Error('Target user not found');
    }

    if (targetUser.status !== 'Active') {
      throw new Error('Cannot transfer events to inactive user');
    }

    if (targetUser.role !== 'Admin' && targetUser.role !== 'EventManager') {
      throw new Error('Target user must be Admin or EventManager');
    }

    // Get all assignments for the source user
    const assignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, fromUserId),
    });

    if (assignments.length === 0) {
      return 0;
    }

    // Update all assignments to the target user
    await db.update(eventAssignments)
      .set({
        assignedUserId: toUserId,
        assignedAt: new Date(),
        assignedBy: transferredBy,
      })
      .where(eq(eventAssignments.assignedUserId, fromUserId));

    return assignments.length;
  },

  /**
   * Gets the assignment for a specific event.
   * 
   * @param eventId - The event ID to get assignment for
   * @returns The assignment with user details or null if not assigned
   * 
   * Requirements: 5.2
   */
  async getAssignment(eventId: string): Promise<EventAssignmentWithUser | null> {
    const assignment = await db.query.eventAssignments.findFirst({
      where: eq(eventAssignments.eventId, eventId),
      with: {
        assignedUser: true,
      },
    });

    if (!assignment) {
      return null;
    }

    return assignment as EventAssignmentWithUser;
  },

  /**
   * Gets all events assigned to a specific user.
   * 
   * @param userId - The user ID to get events for
   * @returns Array of events assigned to the user
   * 
   * Requirements: 6.1
   */
  async getEventsByUser(userId: string): Promise<Event[]> {
    const assignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, userId),
      with: {
        event: true,
      },
    });

    return assignments.map(a => a.event);
  },

  /**
   * Gets all users who can be assigned events.
   * 
   * Returns active Admin and EventManager users who can receive
   * event assignments. Used for transfer UI dropdowns.
   * 
   * @returns Array of assignable users
   * 
   * Requirements: 5.2
   */
  async getAssignableUsers(): Promise<AssignableUser[]> {
    const users = await db.query.user.findMany({
      where: eq(user.status, 'Active'),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    // Filter to only Admin and EventManager roles
    return users.filter(u => u.role === 'Admin' || u.role === 'EventManager') as AssignableUser[];
  },

  /**
   * Checks if an event is assigned to a specific user.
   * 
   * @param eventId - The event ID to check
   * @param userId - The user ID to check assignment for
   * @returns true if the event is assigned to the user
   */
  async isAssignedTo(eventId: string, userId: string): Promise<boolean> {
    const assignment = await db.query.eventAssignments.findFirst({
      where: and(
        eq(eventAssignments.eventId, eventId),
        eq(eventAssignments.assignedUserId, userId)
      ),
    });

    return assignment !== undefined;
  },

  /**
   * Gets the count of events assigned to a user.
   * 
   * @param userId - The user ID to count events for
   * @returns The number of events assigned to the user
   */
  async getAssignmentCount(userId: string): Promise<number> {
    const assignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, userId),
      columns: { id: true },
    });

    return assignments.length;
  },

  /**
   * Removes an event assignment.
   * 
   * @param eventId - The event ID to remove assignment for
   * @throws {Error} If assignment not found
   */
  async removeAssignment(eventId: string): Promise<void> {
    const assignment = await db.query.eventAssignments.findFirst({
      where: eq(eventAssignments.eventId, eventId),
    });

    if (!assignment) {
      throw new Error('Assignment not found');
    }

    await db.delete(eventAssignments)
      .where(eq(eventAssignments.eventId, eventId));
  },
};

export default EventAssignmentService;
