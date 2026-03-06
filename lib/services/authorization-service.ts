/**
 * @fileoverview Authorization Service - Role-based access control for EventOS
 * 
 * This service handles all authorization checks including:
 * - Role verification (Admin vs EventManager)
 * - Permission checks for granular feature access
 * - Event access authorization based on assignments
 * 
 * @module lib/services/authorization-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { AuthorizationService } from '@/lib/services';
 * 
 * // Check if user is admin
 * const isAdmin = await AuthorizationService.isAdmin(userId);
 * 
 * // Check specific permission
 * const canCreate = await AuthorizationService.hasPermission(userId, 'canCreateEvents');
 * ```
 * 
 * Requirements: 1.1, 2.4, 6.4, 9.4
 */

import { db } from '@/db';
import { 
  user, 
  eventManagerPermissions, 
  eventAssignments,
  type User,
  type EventManagerPermission,
  type UserRole,
} from '@/db/schema';
import { eq, inArray, and } from 'drizzle-orm';

/**
 * Permission types that can be checked for Event Managers.
 * Maps to columns in the eventManagerPermissions table.
 */
export type PermissionType = 
  | 'canCreateEvents'
  | 'canUploadExcel'
  | 'canSendCampaigns'
  | 'canManageAutomations'
  | 'canDeleteGuests';

/**
 * AuthorizationService - Core service for role-based access control.
 * 
 * Provides methods for checking user roles, permissions, and event access.
 * All operations query the database for current state to ensure
 * authorization decisions reflect the latest configuration.
 * 
 * Requirements: 1.1, 2.4, 6.4, 9.4
 */
export const AuthorizationService = {
  /**
   * Checks if a user has the Admin role.
   * 
   * @param userId - The unique user ID to check
   * @returns true if user is an Admin, false otherwise
   * 
   * @example
   * ```typescript
   * const isAdmin = await AuthorizationService.isAdmin('user123');
   * if (isAdmin) {
   *   // Allow admin-only action
   * }
   * ```
   * 
   * Requirements: 1.1
   */
  async isAdmin(userId: string): Promise<boolean> {
    const foundUser = await db.query.user.findFirst({
      where: and(
        eq(user.id, userId),
        eq(user.status, 'Active')
      ),
      columns: { role: true },
    });
    
    return foundUser?.role === 'Admin';
  },

  /**
   * Checks if a user has the EventManager role.
   * 
   * @param userId - The unique user ID to check
   * @returns true if user is an EventManager, false otherwise
   * 
   * @example
   * ```typescript
   * const isManager = await AuthorizationService.isEventManager('user123');
   * ```
   * 
   * Requirements: 1.1
   */
  async isEventManager(userId: string): Promise<boolean> {
    const foundUser = await db.query.user.findFirst({
      where: and(
        eq(user.id, userId),
        eq(user.status, 'Active')
      ),
      columns: { role: true },
    });
    
    return foundUser?.role === 'EventManager';
  },

  /**
   * Gets the role of a user.
   * 
   * @param userId - The unique user ID
   * @returns The user's role or null if user not found
   * 
   * Requirements: 1.1
   */
  async getRole(userId: string): Promise<UserRole | null> {
    const foundUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { role: true, status: true },
    });
    
    if (!foundUser || foundUser.status !== 'Active') {
      return null;
    }
    
    return foundUser.role;
  },

  /**
   * Checks if a user has a specific permission.
   * 
   * Admins implicitly have all permissions.
   * EventManagers must have the permission explicitly enabled.
   * Suspended or deactivated users have no permissions.
   * 
   * @param userId - The unique user ID to check
   * @param permission - The permission type to verify
   * @returns true if user has the permission, false otherwise
   * 
   * @example
   * ```typescript
   * const canUpload = await AuthorizationService.hasPermission(userId, 'canUploadExcel');
   * if (!canUpload) {
   *   throw new Error('Permission denied');
   * }
   * ```
   * 
   * Requirements: 2.4
   */
  async hasPermission(userId: string, permission: PermissionType): Promise<boolean> {
    // First check user exists and is active
    const foundUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { role: true, status: true },
    });
    
    if (!foundUser || foundUser.status !== 'Active') {
      return false;
    }
    
    // Admins have all permissions
    if (foundUser.role === 'Admin') {
      return true;
    }
    
    // For EventManagers, check the permissions table
    const permissions = await db.query.eventManagerPermissions.findFirst({
      where: eq(eventManagerPermissions.userId, userId),
    });
    
    if (!permissions) {
      return false;
    }
    
    return permissions[permission] === true;
  },

  /**
   * Retrieves all permissions for a user.
   * 
   * @param userId - The unique user ID
   * @returns The user's permissions or null if not found/not an EventManager
   * 
   * @example
   * ```typescript
   * const perms = await AuthorizationService.getPermissions(userId);
   * if (perms?.canCreateEvents) {
   *   // Show create event button
   * }
   * ```
   * 
   * Requirements: 2.2, 2.3
   */
  async getPermissions(userId: string): Promise<EventManagerPermission | null> {
    const permissions = await db.query.eventManagerPermissions.findFirst({
      where: eq(eventManagerPermissions.userId, userId),
    });
    
    return permissions ?? null;
  },

  /**
   * Checks if a user can access a specific event.
   * 
   * Admins can access all events.
   * EventManagers can only access events assigned to them.
   * Suspended or deactivated users cannot access any events.
   * 
   * @param userId - The unique user ID
   * @param eventId - The event ID to check access for
   * @returns true if user can access the event, false otherwise
   * 
   * @example
   * ```typescript
   * const canAccess = await AuthorizationService.canAccessEvent(userId, eventId);
   * if (!canAccess) {
   *   return { error: 'Access denied' };
   * }
   * ```
   * 
   * Requirements: 6.4, 9.4
   */
  async canAccessEvent(userId: string, eventId: string): Promise<boolean> {
    // Check user exists and is active
    const foundUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { role: true, status: true },
    });
    
    if (!foundUser || foundUser.status !== 'Active') {
      return false;
    }
    
    // Admins can access all events
    if (foundUser.role === 'Admin') {
      return true;
    }
    
    // EventManagers can only access assigned events
    const assignment = await db.query.eventAssignments.findFirst({
      where: and(
        eq(eventAssignments.eventId, eventId),
        eq(eventAssignments.assignedUserId, userId)
      ),
    });
    
    return assignment !== undefined;
  },

  /**
   * Checks if a user can modify a specific event.
   * 
   * This is the same as canAccessEvent for now, but provides
   * a semantic distinction for future permission granularity.
   * 
   * @param userId - The unique user ID
   * @param eventId - The event ID to check modification access for
   * @returns true if user can modify the event, false otherwise
   * 
   * Requirements: 6.4, 9.4
   */
  async canModifyEvent(userId: string, eventId: string): Promise<boolean> {
    return this.canAccessEvent(userId, eventId);
  },

  /**
   * Filters a list of event IDs to only those the user can access.
   * 
   * Admins get all events returned.
   * EventManagers get only their assigned events.
   * 
   * @param userId - The unique user ID
   * @param eventIds - Array of event IDs to filter
   * @returns Array of event IDs the user can access
   * 
   * @example
   * ```typescript
   * const allEventIds = ['event1', 'event2', 'event3'];
   * const accessibleIds = await AuthorizationService.filterAccessibleEvents(userId, allEventIds);
   * ```
   * 
   * Requirements: 6.1, 6.4
   */
  async filterAccessibleEvents(userId: string, eventIds: string[]): Promise<string[]> {
    if (eventIds.length === 0) {
      return [];
    }
    
    // Check user exists and is active
    const foundUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { role: true, status: true },
    });
    
    if (!foundUser || foundUser.status !== 'Active') {
      return [];
    }
    
    // Admins can access all events
    if (foundUser.role === 'Admin') {
      return eventIds;
    }
    
    // EventManagers can only access assigned events
    const assignments = await db.query.eventAssignments.findMany({
      where: and(
        inArray(eventAssignments.eventId, eventIds),
        eq(eventAssignments.assignedUserId, userId)
      ),
      columns: { eventId: true },
    });
    
    return assignments.map(a => a.eventId);
  },

  /**
   * Gets all event IDs assigned to a user.
   * 
   * Admins get all events in the system.
   * EventManagers get only their assigned events.
   * 
   * @param userId - The unique user ID
   * @returns Array of event IDs the user can access
   * 
   * Requirements: 6.1
   */
  async getAccessibleEventIds(userId: string): Promise<string[]> {
    // Check user exists and is active
    const foundUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { role: true, status: true },
    });
    
    if (!foundUser || foundUser.status !== 'Active') {
      return [];
    }
    
    // Admins can access all events - return empty to signal "all"
    // The caller should handle this case by not filtering
    if (foundUser.role === 'Admin') {
      // Return special marker or handle in caller
      // For now, we'll query all event assignments and return unique event IDs
      // Actually, for admins we should return all events
      const { events } = await import('@/db/schema');
      const allEvents = await db.query.events.findMany({
        columns: { id: true },
      });
      return allEvents.map(e => e.id);
    }
    
    // EventManagers get only assigned events
    const assignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, userId),
      columns: { eventId: true },
    });
    
    return assignments.map(a => a.eventId);
  },

  /**
   * Checks if a user is active (not suspended or deactivated).
   * 
   * @param userId - The unique user ID
   * @returns true if user is active, false otherwise
   * 
   * Requirements: 4.2
   */
  async isActive(userId: string): Promise<boolean> {
    const foundUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { status: true },
    });
    
    return foundUser?.status === 'Active';
  },
};

export default AuthorizationService;
