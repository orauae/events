/**
 * @fileoverview Admin Authorization Service - Admin-specific access control for EventOS
 * 
 * This service handles all admin-specific authorization checks including:
 * - Admin role verification
 * - Admin route protection
 * - Admin session validation
 * 
 * @module lib/services/admin-authorization-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { AdminAuthorizationService } from '@/lib/services';
 * 
 * // Check if user is admin
 * const isAdmin = await AdminAuthorizationService.isAdmin(userId);
 * 
 * // Require admin access (throws if not admin)
 * await AdminAuthorizationService.requireAdmin(userId);
 * ```
 * 
 * Requirements: 1.1, 1.4
 */

import { db } from '@/db';
import { user, type User, type UserRole } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Result of admin verification check.
 */
export interface AdminVerificationResult {
  isAdmin: boolean;
  userId: string | null;
  role: UserRole | null;
  error?: string;
}

/**
 * Admin user info returned from verification.
 */
export interface AdminUserInfo {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Error thrown when admin access is required but not granted.
 */
export class AdminAccessDeniedError extends Error {
  constructor(message: string = 'Admin access required') {
    super(message);
    this.name = 'AdminAccessDeniedError';
  }
}

/**
 * AdminAuthorizationService - Service for admin-specific access control.
 * 
 * Provides methods for verifying admin role and protecting admin routes.
 * All operations query the database for current state to ensure
 * authorization decisions reflect the latest configuration.
 * 
 * Requirements: 1.1, 1.4
 */
export const AdminAuthorizationService = {
  /**
   * Checks if a user has the Admin role and is active.
   * 
   * @param userId - The unique user ID to check
   * @returns true if user is an active Admin, false otherwise
   * 
   * @example
   * ```typescript
   * const isAdmin = await AdminAuthorizationService.isAdmin('user123');
   * if (isAdmin) {
   *   // Allow admin-only action
   * }
   * ```
   * 
   * Requirements: 1.1
   */
  async isAdmin(userId: string): Promise<boolean> {
    if (!userId) {
      return false;
    }

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
   * Verifies admin access and returns detailed result.
   * 
   * @param userId - The unique user ID to verify
   * @returns AdminVerificationResult with detailed status
   * 
   * @example
   * ```typescript
   * const result = await AdminAuthorizationService.verifyAdmin('user123');
   * if (!result.isAdmin) {
   *   console.log('Access denied:', result.error);
   * }
   * ```
   * 
   * Requirements: 1.1, 1.4
   */
  async verifyAdmin(userId: string): Promise<AdminVerificationResult> {
    if (!userId) {
      return {
        isAdmin: false,
        userId: null,
        role: null,
        error: 'No user ID provided',
      };
    }

    const foundUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { id: true, role: true, status: true },
    });

    if (!foundUser) {
      return {
        isAdmin: false,
        userId,
        role: null,
        error: 'User not found',
      };
    }

    if (foundUser.status !== 'Active') {
      return {
        isAdmin: false,
        userId,
        role: foundUser.role,
        error: `User account is ${foundUser.status.toLowerCase()}`,
      };
    }

    if (foundUser.role !== 'Admin') {
      return {
        isAdmin: false,
        userId,
        role: foundUser.role,
        error: 'User does not have admin role',
      };
    }

    return {
      isAdmin: true,
      userId,
      role: foundUser.role,
    };
  },

  /**
   * Requires admin access, throwing an error if not granted.
   * 
   * Use this method in API routes and server actions that require admin access.
   * 
   * @param userId - The unique user ID to check
   * @throws AdminAccessDeniedError if user is not an active admin
   * 
   * @example
   * ```typescript
   * // In an API route
   * await AdminAuthorizationService.requireAdmin(session.user.id);
   * // If we get here, user is an admin
   * ```
   * 
   * Requirements: 1.4
   */
  async requireAdmin(userId: string): Promise<void> {
    const result = await this.verifyAdmin(userId);
    
    if (!result.isAdmin) {
      throw new AdminAccessDeniedError(result.error || 'Admin access required');
    }
  },

  /**
   * Gets admin user info if the user is an active admin.
   * 
   * @param userId - The unique user ID
   * @returns AdminUserInfo if user is admin, null otherwise
   * 
   * @example
   * ```typescript
   * const adminInfo = await AdminAuthorizationService.getAdminInfo('user123');
   * if (adminInfo) {
   *   console.log('Admin:', adminInfo.name);
   * }
   * ```
   * 
   * Requirements: 1.5
   */
  async getAdminInfo(userId: string): Promise<AdminUserInfo | null> {
    if (!userId) {
      return null;
    }

    const foundUser = await db.query.user.findFirst({
      where: and(
        eq(user.id, userId),
        eq(user.role, 'Admin'),
        eq(user.status, 'Active')
      ),
      columns: { 
        id: true, 
        name: true, 
        email: true, 
        role: true 
      },
    });

    if (!foundUser) {
      return null;
    }

    return {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      role: foundUser.role,
    };
  },

  /**
   * Checks if a user can access admin routes.
   * 
   * This is a convenience method that combines role check with
   * active status verification for route protection.
   * 
   * @param userId - The unique user ID
   * @returns true if user can access admin routes, false otherwise
   * 
   * Requirements: 1.4
   */
  async canAccessAdminRoutes(userId: string): Promise<boolean> {
    return this.isAdmin(userId);
  },

  /**
   * Gets all active admin users.
   * 
   * Useful for admin management and notifications.
   * 
   * @returns Array of active admin users
   * 
   * @example
   * ```typescript
   * const admins = await AdminAuthorizationService.getActiveAdmins();
   * console.log(`${admins.length} active admins`);
   * ```
   */
  async getActiveAdmins(): Promise<AdminUserInfo[]> {
    const admins = await db.query.user.findMany({
      where: and(
        eq(user.role, 'Admin'),
        eq(user.status, 'Active')
      ),
      columns: { 
        id: true, 
        name: true, 
        email: true, 
        role: true 
      },
    });

    return admins.map(admin => ({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    }));
  },
};

export default AdminAuthorizationService;
