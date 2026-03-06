/**
 * @fileoverview Event Manager Service - CRUD and lifecycle management for event managers
 * 
 * This service handles all operations for managing event managers including:
 * - CRUD operations (create, read, update, list)
 * - Status lifecycle management (suspend, reactivate, deactivate)
 * - Permission management
 * 
 * @module lib/services/event-manager-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { EventManagerService } from '@/lib/services';
 * 
 * // Create a new event manager
 * const manager = await EventManagerService.create({
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   password: 'securePassword123',
 *   permissions: { canCreateEvents: true }
 * });
 * ```
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.2, 4.3, 4.4, 4.6, 2.3
 */

import { z } from 'zod';
import { db } from '@/db';
import { 
  user, 
  eventManagerPermissions, 
  eventAssignments,
  type User,
  type EventManagerPermission,
  type ManagerStatus,
} from '@/db/schema';
import { eq, desc, like, sql, and, count } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Event manager with aggregated statistics
 */
export interface EventManagerWithStats {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'EventManager';
  status: ManagerStatus;
  emailVerified: boolean;
  image: string | null;
  assignedEventCount: number;
  lastActiveAt: Date | null;
  permissions: EventManagerPermission | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Detailed event manager information including assigned events
 */
export interface EventManagerDetail extends EventManagerWithStats {
  assignedEvents: {
    id: string;
    name: string;
    startDate: Date;
  }[];
}

/**
 * Permissions configuration object
 */
export interface Permissions {
  canCreateEvents: boolean;
  canUploadExcel: boolean;
  canSendCampaigns: boolean;
  canManageAutomations: boolean;
  canDeleteGuests: boolean;
}

/**
 * List options for filtering and sorting
 */
export interface ListOptions {
  search?: string;
  status?: ManagerStatus;
  sortBy?: 'name' | 'email' | 'createdAt' | 'assignedEventCount';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod validation schema for event manager creation
 * Requirements: 3.2
 */
export const createEventManagerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  permissions: z.object({
    canCreateEvents: z.boolean().optional().default(false),
    canUploadExcel: z.boolean().optional().default(true),
    canSendCampaigns: z.boolean().optional().default(true),
    canManageAutomations: z.boolean().optional().default(false),
    canDeleteGuests: z.boolean().optional().default(false),
  }).optional(),
});

/**
 * Zod validation schema for event manager update
 * Requirements: 3.4
 */
export const updateEventManagerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').optional(),
  email: z.string().email('Invalid email address').toLowerCase().optional(),
});

/**
 * Zod validation schema for permission updates
 * Requirements: 2.3
 */
export const updatePermissionsSchema = z.object({
  canCreateEvents: z.boolean().optional(),
  canUploadExcel: z.boolean().optional(),
  canSendCampaigns: z.boolean().optional(),
  canManageAutomations: z.boolean().optional(),
  canDeleteGuests: z.boolean().optional(),
});

export type CreateEventManagerInput = z.infer<typeof createEventManagerSchema>;
export type UpdateEventManagerInput = z.infer<typeof updateEventManagerSchema>;
export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;

// ============================================================================
// SERVICE
// ============================================================================

/**
 * EventManagerService - Core service for event manager operations.
 * 
 * Provides methods for managing event managers including CRUD operations,
 * status lifecycle management, and permission configuration.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.2, 4.3, 4.4, 4.6, 2.3
 */
export const EventManagerService = {
  /**
   * Lists all event managers with their stats.
   * 
   * @param options - Optional filtering and sorting options
   * @returns Array of event managers with stats
   * 
   * Requirements: 3.1
   */
  async list(options?: ListOptions): Promise<EventManagerWithStats[]> {
    // Build the query with aggregation
    const managers = await db.query.user.findMany({
      where: options?.search 
        ? like(user.email, `%${options.search.toLowerCase()}%`)
        : undefined,
      with: {
        permissions: true,
        assignedEvents: true,
      },
      orderBy: options?.sortOrder === 'asc' 
        ? [user.createdAt]
        : [desc(user.createdAt)],
    });

    // Filter by status if specified
    let filteredManagers = managers;
    if (options?.status) {
      filteredManagers = managers.filter(m => m.status === options.status);
    }

    // Map to EventManagerWithStats
    return filteredManagers.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      status: m.status,
      emailVerified: m.emailVerified,
      image: m.image,
      assignedEventCount: m.assignedEvents?.length ?? 0,
      lastActiveAt: null, // Would need session tracking to implement
      permissions: m.permissions ?? null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
  },

  /**
   * Gets a single event manager by ID with full details.
   * 
   * @param id - The event manager's user ID
   * @returns The event manager detail or null if not found
   * 
   * Requirements: 3.3
   */
  async getById(id: string): Promise<EventManagerDetail | null> {
    const manager = await db.query.user.findFirst({
      where: eq(user.id, id),
      with: {
        permissions: true,
        assignedEvents: {
          with: {
            event: true,
          },
        },
      },
    });

    if (!manager) {
      return null;
    }

    return {
      id: manager.id,
      name: manager.name,
      email: manager.email,
      role: manager.role,
      status: manager.status,
      emailVerified: manager.emailVerified,
      image: manager.image,
      assignedEventCount: manager.assignedEvents?.length ?? 0,
      lastActiveAt: null,
      permissions: manager.permissions ?? null,
      createdAt: manager.createdAt,
      updatedAt: manager.updatedAt,
      assignedEvents: (manager.assignedEvents ?? []).map(a => ({
        id: a.event.id,
        name: a.event.name,
        startDate: a.event.startDate,
      })),
    };
  },

  /**
   * Creates a new event manager with initial permissions.
   * 
   * @param input - The event manager creation data
   * @returns The newly created user record
   * @throws {ZodError} If input validation fails
   * @throws {Error} If email already exists
   * 
   * Requirements: 3.2
   */
  async create(input: CreateEventManagerInput): Promise<User> {
    // Validate input
    const validated = createEventManagerSchema.parse(input);

    // Check if email already exists
    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, validated.email),
    });

    if (existingUser) {
      throw new Error('Email already exists');
    }

    const userId = createId();

    // Create user with EventManager role
    const [newUser] = await db.insert(user).values({
      id: userId,
      name: validated.name,
      email: validated.email,
      role: 'EventManager',
      status: 'Active',
      emailVerified: false,
    }).returning();

    // Create permissions record with defaults or provided values
    const permissionDefaults: Permissions = {
      canCreateEvents: false,
      canUploadExcel: true,
      canSendCampaigns: true,
      canManageAutomations: false,
      canDeleteGuests: false,
    };

    const permissions = validated.permissions 
      ? { ...permissionDefaults, ...validated.permissions }
      : permissionDefaults;

    await db.insert(eventManagerPermissions).values({
      userId: userId,
      ...permissions,
    });

    return newUser;
  },

  /**
   * Updates an event manager's profile.
   * 
   * @param id - The event manager's user ID
   * @param input - The update data
   * @returns The updated user record
   * @throws {ZodError} If input validation fails
   * @throws {Error} If user not found or email already exists
   * 
   * Requirements: 3.4
   */
  async update(id: string, input: UpdateEventManagerInput): Promise<User> {
    // Validate input
    const validated = updateEventManagerSchema.parse(input);

    // Check if user exists
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, id),
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    // If email is being changed, check for conflicts
    if (validated.email && validated.email !== existingUser.email) {
      const emailConflict = await db.query.user.findFirst({
        where: eq(user.email, validated.email),
      });

      if (emailConflict) {
        throw new Error('Email already exists');
      }
    }

    // Build update data
    const updateData: Partial<typeof user.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.email !== undefined) updateData.email = validated.email;

    const [updatedUser] = await db.update(user)
      .set(updateData)
      .where(eq(user.id, id))
      .returning();

    return updatedUser;
  },


  /**
   * Suspends an event manager, blocking their access while preserving assignments.
   * 
   * @param id - The event manager's user ID
   * @returns The updated user record
   * @throws {Error} If user not found or already suspended/deactivated
   * 
   * Requirements: 4.2
   */
  async suspend(id: string): Promise<User> {
    // Check if user exists and is active
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, id),
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    if (existingUser.status === 'Suspended') {
      throw new Error('User is already suspended');
    }

    if (existingUser.status === 'Deactivated') {
      throw new Error('Cannot suspend a deactivated user');
    }

    const [updatedUser] = await db.update(user)
      .set({
        status: 'Suspended',
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updatedUser;
  },

  /**
   * Reactivates a suspended event manager, restoring their access.
   * 
   * @param id - The event manager's user ID
   * @returns The updated user record
   * @throws {Error} If user not found or not suspended
   * 
   * Requirements: 4.3
   */
  async reactivate(id: string): Promise<User> {
    // Check if user exists and is suspended
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, id),
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    if (existingUser.status === 'Active') {
      throw new Error('User is already active');
    }

    if (existingUser.status === 'Deactivated') {
      throw new Error('Cannot reactivate a deactivated user');
    }

    const [updatedUser] = await db.update(user)
      .set({
        status: 'Active',
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updatedUser;
  },

  /**
   * Deactivates an event manager, transferring all their events first.
   * 
   * @param id - The event manager's user ID
   * @param transferToUserId - The user ID to transfer events to
   * @throws {Error} If user not found, has events but no transfer destination,
   *                 or transfer destination is invalid
   * 
   * Requirements: 4.4, 4.6
   */
  async deactivate(id: string, transferToUserId?: string): Promise<void> {
    // Check if user exists
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, id),
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    if (existingUser.status === 'Deactivated') {
      throw new Error('User is already deactivated');
    }

    // Check for assigned events
    const assignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, id),
    });

    // If user has assigned events, require a transfer destination
    if (assignments.length > 0) {
      if (!transferToUserId) {
        throw new Error('Transfer destination required for user with assigned events');
      }

      // Validate transfer destination
      const transferTarget = await db.query.user.findFirst({
        where: eq(user.id, transferToUserId),
      });

      if (!transferTarget) {
        throw new Error('Transfer destination user not found');
      }

      if (transferTarget.status !== 'Active') {
        throw new Error('Cannot transfer to inactive user');
      }

      if (transferTarget.id === id) {
        throw new Error('Cannot transfer events to the same user');
      }

      // Transfer all events to the destination user
      await db.update(eventAssignments)
        .set({
          assignedUserId: transferToUserId,
          assignedAt: new Date(),
          assignedBy: id, // Record who initiated the transfer
        })
        .where(eq(eventAssignments.assignedUserId, id));
    }

    // Deactivate the user
    await db.update(user)
      .set({
        status: 'Deactivated',
        updatedAt: new Date(),
      })
      .where(eq(user.id, id));
  },

  /**
   * Updates an event manager's permissions.
   * 
   * @param id - The event manager's user ID
   * @param permissions - Partial permissions to update
   * @returns The updated permissions record
   * @throws {ZodError} If input validation fails
   * @throws {Error} If user not found or is an Admin
   * 
   * Requirements: 2.3
   */
  async updatePermissions(id: string, permissions: UpdatePermissionsInput): Promise<EventManagerPermission> {
    // Validate input
    const validated = updatePermissionsSchema.parse(permissions);

    // Check if user exists and is an EventManager
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, id),
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    if (existingUser.role === 'Admin') {
      throw new Error('Cannot modify permissions for Admin users');
    }

    // Check if permissions record exists
    const existingPermissions = await db.query.eventManagerPermissions.findFirst({
      where: eq(eventManagerPermissions.userId, id),
    });

    if (!existingPermissions) {
      // Create permissions record if it doesn't exist
      const [newPermissions] = await db.insert(eventManagerPermissions).values({
        userId: id,
        canCreateEvents: validated.canCreateEvents ?? false,
        canUploadExcel: validated.canUploadExcel ?? true,
        canSendCampaigns: validated.canSendCampaigns ?? true,
        canManageAutomations: validated.canManageAutomations ?? false,
        canDeleteGuests: validated.canDeleteGuests ?? false,
      }).returning();

      return newPermissions;
    }

    // Build update data
    const updateData: Partial<typeof eventManagerPermissions.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (validated.canCreateEvents !== undefined) updateData.canCreateEvents = validated.canCreateEvents;
    if (validated.canUploadExcel !== undefined) updateData.canUploadExcel = validated.canUploadExcel;
    if (validated.canSendCampaigns !== undefined) updateData.canSendCampaigns = validated.canSendCampaigns;
    if (validated.canManageAutomations !== undefined) updateData.canManageAutomations = validated.canManageAutomations;
    if (validated.canDeleteGuests !== undefined) updateData.canDeleteGuests = validated.canDeleteGuests;

    const [updatedPermissions] = await db.update(eventManagerPermissions)
      .set(updateData)
      .where(eq(eventManagerPermissions.userId, id))
      .returning();

    return updatedPermissions;
  },

  /**
   * Gets the count of assigned events for a user.
   * 
   * @param userId - The user ID
   * @returns The count of assigned events
   */
  async getAssignedEventCount(userId: string): Promise<number> {
    const assignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, userId),
    });

    return assignments.length;
  },
};

export default EventManagerService;
