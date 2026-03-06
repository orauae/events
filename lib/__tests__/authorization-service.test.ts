/**
 * @fileoverview Authorization Service Property Tests
 * 
 * Property-based tests for the Authorization Service using fast-check.
 * Tests verify role-based access control and permission enforcement.
 * 
 * Feature: event-manager-roles
 */

import { describe, expect, afterAll, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db } from '@/db';
import { 
  user, 
  eventManagerPermissions,
  events,
  eventAssignments,
} from '@/db/schema';
import { AuthorizationService, type PermissionType } from '../services/authorization-service';
import { createId } from '@paralleldrive/cuid2';
import { like, inArray } from 'drizzle-orm';

// Test prefix to identify test data for cleanup
const TEST_PREFIX = 'authz-test-';

/**
 * Feature: event-manager-roles, Property 3: Permission Enforcement
 * 
 * For any Event_Manager and any permission-gated action, the action SHALL 
 * succeed if and only if the manager has the corresponding permission enabled.
 * 
 * Validates: Requirements 2.4
 */
describe('Property 3: Permission Enforcement', () => {
  // Clean up all test data after all tests complete
  afterAll(async () => {
    // Find all test users by email pattern
    const testUsers = await db.query.user.findMany({
      where: like(user.email, `${TEST_PREFIX}%`),
      columns: { id: true },
    });
    
    if (testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      await db.delete(eventManagerPermissions).where(inArray(eventManagerPermissions.userId, userIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });

  // All permission types
  const allPermissions: PermissionType[] = [
    'canCreateEvents',
    'canUploadExcel',
    'canSendCampaigns',
    'canManageAutomations',
    'canDeleteGuests',
  ];

  // Arbitrary for permission type
  const permissionTypeArb = fc.constantFrom(...allPermissions);

  // Arbitrary for permission configuration (which permissions are enabled)
  const permissionConfigArb = fc.record({
    canCreateEvents: fc.boolean(),
    canUploadExcel: fc.boolean(),
    canSendCampaigns: fc.boolean(),
    canManageAutomations: fc.boolean(),
    canDeleteGuests: fc.boolean(),
  });

  test.prop([permissionConfigArb, permissionTypeArb], { numRuns: 5 })(
    'EventManager hasPermission returns true iff permission is enabled',
    async (permConfig, permissionToCheck) => {
      // Create a test user with EventManager role
      const userId = createId();

      await db.insert(user).values({
        id: userId,
        name: 'Test Manager',
        email: `${TEST_PREFIX}${userId}@example.com`,
        role: 'EventManager',
        status: 'Active',
      });

      // Create permissions with the generated config
      await db.insert(eventManagerPermissions).values({
        userId,
        ...permConfig,
      });

      // Check the permission
      const hasPermission = await AuthorizationService.hasPermission(userId, permissionToCheck);

      // The result should match the config
      expect(hasPermission).toBe(permConfig[permissionToCheck]);
    }
  );

  test.prop([permissionTypeArb], { numRuns: 5 })(
    'Admin always has all permissions regardless of permission table',
    async (permissionToCheck) => {
      // Create a test admin user
      const userId = createId();

      await db.insert(user).values({
        id: userId,
        name: 'Test Admin',
        email: `${TEST_PREFIX}admin-${userId}@example.com`,
        role: 'Admin',
        status: 'Active',
      });

      // Admin should have permission even without a permissions record
      const hasPermission = await AuthorizationService.hasPermission(userId, permissionToCheck);
      expect(hasPermission).toBe(true);
    }
  );

  test.prop([permissionTypeArb], { numRuns: 5 })(
    'Suspended EventManager has no permissions',
    async (permissionToCheck) => {
      // Create a suspended EventManager
      const userId = createId();

      await db.insert(user).values({
        id: userId,
        name: 'Suspended Manager',
        email: `${TEST_PREFIX}suspended-${userId}@example.com`,
        role: 'EventManager',
        status: 'Suspended',
      });

      // Create permissions (even if all enabled)
      await db.insert(eventManagerPermissions).values({
        userId,
        canCreateEvents: true,
        canUploadExcel: true,
        canSendCampaigns: true,
        canManageAutomations: true,
        canDeleteGuests: true,
      });

      // Suspended user should have no permissions
      const hasPermission = await AuthorizationService.hasPermission(userId, permissionToCheck);
      expect(hasPermission).toBe(false);
    }
  );

  test.prop([permissionTypeArb], { numRuns: 5 })(
    'Deactivated user has no permissions',
    async (permissionToCheck) => {
      // Create a deactivated user
      const userId = createId();

      await db.insert(user).values({
        id: userId,
        name: 'Deactivated User',
        email: `${TEST_PREFIX}deactivated-${userId}@example.com`,
        role: 'EventManager',
        status: 'Deactivated',
      });

      // Deactivated user should have no permissions
      const hasPermission = await AuthorizationService.hasPermission(userId, permissionToCheck);
      expect(hasPermission).toBe(false);
    }
  );

  test.prop([permissionTypeArb], { numRuns: 5 })(
    'Non-existent user has no permissions',
    async (permissionToCheck) => {
      const nonExistentUserId = createId();
      
      const hasPermission = await AuthorizationService.hasPermission(nonExistentUserId, permissionToCheck);
      expect(hasPermission).toBe(false);
    }
  );
});


/**
 * Feature: event-manager-roles, Property 14: Event Manager Visibility Restriction
 * 
 * For any Event_Manager, querying events SHALL return only events where 
 * the manager is the assigned user.
 * 
 * Validates: Requirements 6.1, 6.4
 */
describe('Property 14: Event Manager Visibility Restriction', () => {
  // Test prefix specific to this describe block
  const EVENT_TEST_PREFIX = 'authz-event-test-';
  
  // Clean up all test data after all tests complete
  afterAll(async () => {
    // Find all test events by name pattern
    const testEvents = await db.query.events.findMany({
      where: like(events.name, `${EVENT_TEST_PREFIX}%`),
      columns: { id: true },
    });
    
    if (testEvents.length > 0) {
      const eventIds = testEvents.map(e => e.id);
      await db.delete(eventAssignments).where(inArray(eventAssignments.eventId, eventIds));
      await db.delete(events).where(inArray(events.id, eventIds));
    }
    
    // Find all test users by email pattern
    const testUsers = await db.query.user.findMany({
      where: like(user.email, `${EVENT_TEST_PREFIX}%`),
      columns: { id: true },
    });
    
    if (testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      await db.delete(eventManagerPermissions).where(inArray(eventManagerPermissions.userId, userIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });

  it('EventManager can only access events assigned to them', async () => {
    const numAssigned = 2;
    const numUnassigned = 2;
    const iterationId = createId();
    
    // Create an EventManager
    const managerId = createId();

    await db.insert(user).values({
      id: managerId,
      name: 'Test Manager',
      email: `${EVENT_TEST_PREFIX}manager-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Active',
    });

    // Create an Admin to assign events
    const adminId = createId();

    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${EVENT_TEST_PREFIX}admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create assigned events
    const assignedEventIds: string[] = [];
    for (let i = 0; i < numAssigned; i++) {
      const eventId = createId();
      assignedEventIds.push(eventId);

      await db.insert(events).values({
        id: eventId,
        name: `${EVENT_TEST_PREFIX}Assigned-${iterationId}-${i}`,
        type: 'Conference',
        description: 'Test description',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-02'),
        location: 'Test Location',
        hostName: 'Test Host',
        hostEmail: 'host@test.com',
      });

      await db.insert(eventAssignments).values({
        eventId,
        assignedUserId: managerId,
        assignedBy: adminId,
      });
    }

    // Create unassigned events (assigned to admin)
    const unassignedEventIds: string[] = [];
    for (let i = 0; i < numUnassigned; i++) {
      const eventId = createId();
      unassignedEventIds.push(eventId);

      await db.insert(events).values({
        id: eventId,
        name: `${EVENT_TEST_PREFIX}Unassigned-${iterationId}-${i}`,
        type: 'Conference',
        description: 'Test description',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-02'),
        location: 'Test Location',
        hostName: 'Test Host',
        hostEmail: 'host@test.com',
      });

      await db.insert(eventAssignments).values({
        eventId,
        assignedUserId: adminId,
        assignedBy: adminId,
      });
    }

    const allEventIds = [...assignedEventIds, ...unassignedEventIds];

    // Test: Manager can access assigned events
    for (const eventId of assignedEventIds) {
      const canAccess = await AuthorizationService.canAccessEvent(managerId, eventId);
      expect(canAccess).toBe(true);
    }

    // Test: Manager cannot access unassigned events
    for (const eventId of unassignedEventIds) {
      const canAccess = await AuthorizationService.canAccessEvent(managerId, eventId);
      expect(canAccess).toBe(false);
    }

    // Test: filterAccessibleEvents returns only assigned events
    const accessibleEvents = await AuthorizationService.filterAccessibleEvents(managerId, allEventIds);
    expect(accessibleEvents.sort()).toEqual(assignedEventIds.sort());
  });

  it('Admin can access all events regardless of assignment', async () => {
    const numEvents = 2;
    const iterationId = createId();
    
    // Create an Admin
    const adminId = createId();

    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${EVENT_TEST_PREFIX}admin2-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create another user to assign events to
    const otherId = createId();

    await db.insert(user).values({
      id: otherId,
      name: 'Other User',
      email: `${EVENT_TEST_PREFIX}other-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Active',
    });

    // Create events assigned to the other user
    const eventIds: string[] = [];
    for (let i = 0; i < numEvents; i++) {
      const eventId = createId();
      eventIds.push(eventId);

      await db.insert(events).values({
        id: eventId,
        name: `${EVENT_TEST_PREFIX}AdminTest-${iterationId}-${i}`,
        type: 'Conference',
        description: 'Test description',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-02'),
        location: 'Test Location',
        hostName: 'Test Host',
        hostEmail: 'host@test.com',
      });

      await db.insert(eventAssignments).values({
        eventId,
        assignedUserId: otherId,
        assignedBy: adminId,
      });
    }

    // Test: Admin can access all events even though assigned to someone else
    for (const eventId of eventIds) {
      const canAccess = await AuthorizationService.canAccessEvent(adminId, eventId);
      expect(canAccess).toBe(true);
    }

    // Test: filterAccessibleEvents returns all events for admin
    const accessibleEvents = await AuthorizationService.filterAccessibleEvents(adminId, eventIds);
    expect(accessibleEvents.sort()).toEqual(eventIds.sort());
  });

  it('Suspended EventManager cannot access any events', async () => {
    const numEvents = 2;
    const iterationId = createId();
    
    // Create a suspended EventManager
    const managerId = createId();

    await db.insert(user).values({
      id: managerId,
      name: 'Suspended Manager',
      email: `${EVENT_TEST_PREFIX}suspended-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Suspended',
    });

    // Create an Admin
    const adminId = createId();

    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${EVENT_TEST_PREFIX}admin3-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create events assigned to the suspended manager
    const eventIds: string[] = [];
    for (let i = 0; i < numEvents; i++) {
      const eventId = createId();
      eventIds.push(eventId);

      await db.insert(events).values({
        id: eventId,
        name: `${EVENT_TEST_PREFIX}SuspendedTest-${iterationId}-${i}`,
        type: 'Conference',
        description: 'Test description',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-02'),
        location: 'Test Location',
        hostName: 'Test Host',
        hostEmail: 'host@test.com',
      });

      await db.insert(eventAssignments).values({
        eventId,
        assignedUserId: managerId,
        assignedBy: adminId,
      });
    }

    // Test: Suspended manager cannot access any events
    for (const eventId of eventIds) {
      const canAccess = await AuthorizationService.canAccessEvent(managerId, eventId);
      expect(canAccess).toBe(false);
    }

    // Test: filterAccessibleEvents returns empty for suspended user
    const accessibleEvents = await AuthorizationService.filterAccessibleEvents(managerId, eventIds);
    expect(accessibleEvents).toEqual([]);
  });
});
