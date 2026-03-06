/**
 * @fileoverview Event Manager Service Tests
 * 
 * Tests for the Event Manager Service.
 * Tests verify manager creation validation, permission persistence,
 * and status lifecycle management.
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
import { EventManagerService } from '../services/event-manager-service';
import { AuthorizationService } from '../services/authorization-service';
import { createId } from '@paralleldrive/cuid2';
import { like, inArray, eq } from 'drizzle-orm';

// Test prefix to identify test data for cleanup
const TEST_PREFIX = 'em-svc-test-';

/**
 * Feature: event-manager-roles, Property 5: Manager Creation Validation
 * 
 * For any event manager creation request missing name, email, or password,
 * the system SHALL reject the request with a validation error.
 * 
 * Validates: Requirements 3.2
 */
describe('Property 5: Manager Creation Validation', () => {
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

  // Arbitrary for valid name (non-empty string)
  const validNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
  
  // Arbitrary for valid email
  const validEmailArb = fc.emailAddress();

  // Arbitrary for empty/whitespace-only strings
  const emptyStringArb = fc.constantFrom('', '   ', '\t', '\n');

  test.prop([emptyStringArb, validEmailArb], { numRuns: 5 })(
    'Creation fails when name is empty or whitespace',
    async (invalidName, validEmail) => {
      const uniqueEmail = `${TEST_PREFIX}${createId()}@${validEmail.split('@')[1]}`;
      
      await expect(
        EventManagerService.create({
          name: invalidName,
          email: uniqueEmail,
        })
      ).rejects.toThrow();
    }
  );

  test.prop([validNameArb], { numRuns: 5 })(
    'Creation fails when email is invalid',
    async (validName) => {
      const invalidEmails = ['notanemail', 'missing@domain', '@nodomain.com', 'spaces in@email.com'];
      
      for (const invalidEmail of invalidEmails) {
        await expect(
          EventManagerService.create({
            name: validName,
            email: invalidEmail,
          })
        ).rejects.toThrow();
      }
    }
  );

  test.prop([validNameArb, validEmailArb], { numRuns: 5 })(
    'Creation succeeds with valid name and email',
    async (validName, validEmail) => {
      const uniqueEmail = `${TEST_PREFIX}${createId()}@${validEmail.split('@')[1]}`;
      
      const manager = await EventManagerService.create({
        name: validName,
        email: uniqueEmail,
      });

      expect(manager).toBeDefined();
      expect(manager.name).toBe(validName.trim()); // Name is trimmed by the service
      expect(manager.email).toBe(uniqueEmail.toLowerCase());
      expect(manager.role).toBe('EventManager');
      expect(manager.status).toBe('Active');
    }
  );

  test.prop([validNameArb, validEmailArb], { numRuns: 3 })(
    'Creation fails when email already exists',
    async (validName, validEmail) => {
      const uniqueEmail = `${TEST_PREFIX}dup-${createId()}@${validEmail.split('@')[1]}`;
      
      // Create first manager
      await EventManagerService.create({
        name: validName,
        email: uniqueEmail,
      });

      // Attempt to create second manager with same email
      await expect(
        EventManagerService.create({
          name: 'Another Name',
          email: uniqueEmail,
        })
      ).rejects.toThrow('Email already exists');
    }
  );
});


/**
 * Feature: event-manager-roles, Property 4: Permission Persistence
 * 
 * For any Event_Manager, when permissions are created or updated,
 * retrieving the permissions SHALL return the exact values that were set.
 * 
 * Validates: Requirements 2.2, 2.3, 3.4
 */
describe('Property 4: Permission Persistence', () => {
  // Clean up all test data after all tests complete
  afterAll(async () => {
    // Find all test users by email pattern
    const testUsers = await db.query.user.findMany({
      where: like(user.email, `${TEST_PREFIX}perm-%`),
      columns: { id: true },
    });
    
    if (testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      await db.delete(eventManagerPermissions).where(inArray(eventManagerPermissions.userId, userIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });

  // Arbitrary for permission configuration
  const permissionConfigArb = fc.record({
    canCreateEvents: fc.boolean(),
    canUploadExcel: fc.boolean(),
    canSendCampaigns: fc.boolean(),
    canManageAutomations: fc.boolean(),
    canDeleteGuests: fc.boolean(),
  });

  test.prop([permissionConfigArb], { numRuns: 10 })(
    'Permissions set during creation are persisted correctly',
    async (permConfig) => {
      const uniqueEmail = `${TEST_PREFIX}perm-create-${createId()}@example.com`;
      
      // Create manager with specific permissions
      const manager = await EventManagerService.create({
        name: 'Test Manager',
        email: uniqueEmail,
        permissions: permConfig,
      });

      // Retrieve permissions
      const permissions = await AuthorizationService.getPermissions(manager.id);

      expect(permissions).not.toBeNull();
      expect(permissions!.canCreateEvents).toBe(permConfig.canCreateEvents);
      expect(permissions!.canUploadExcel).toBe(permConfig.canUploadExcel);
      expect(permissions!.canSendCampaigns).toBe(permConfig.canSendCampaigns);
      expect(permissions!.canManageAutomations).toBe(permConfig.canManageAutomations);
      expect(permissions!.canDeleteGuests).toBe(permConfig.canDeleteGuests);
    }
  );

  test.prop([permissionConfigArb, permissionConfigArb], { numRuns: 5 })(
    'Permissions updated via updatePermissions are persisted correctly',
    async (initialConfig, updatedConfig) => {
      const uniqueEmail = `${TEST_PREFIX}perm-update-${createId()}@example.com`;
      
      // Create manager with initial permissions
      const manager = await EventManagerService.create({
        name: 'Test Manager',
        email: uniqueEmail,
        permissions: initialConfig,
      });

      // Update permissions
      await EventManagerService.updatePermissions(manager.id, updatedConfig);

      // Retrieve permissions
      const permissions = await AuthorizationService.getPermissions(manager.id);

      expect(permissions).not.toBeNull();
      expect(permissions!.canCreateEvents).toBe(updatedConfig.canCreateEvents);
      expect(permissions!.canUploadExcel).toBe(updatedConfig.canUploadExcel);
      expect(permissions!.canSendCampaigns).toBe(updatedConfig.canSendCampaigns);
      expect(permissions!.canManageAutomations).toBe(updatedConfig.canManageAutomations);
      expect(permissions!.canDeleteGuests).toBe(updatedConfig.canDeleteGuests);
    }
  );

  // Arbitrary for partial permission updates
  const partialPermissionArb = fc.record({
    canCreateEvents: fc.option(fc.boolean(), { nil: undefined }),
    canUploadExcel: fc.option(fc.boolean(), { nil: undefined }),
    canSendCampaigns: fc.option(fc.boolean(), { nil: undefined }),
    canManageAutomations: fc.option(fc.boolean(), { nil: undefined }),
    canDeleteGuests: fc.option(fc.boolean(), { nil: undefined }),
  });

  test.prop([permissionConfigArb, partialPermissionArb], { numRuns: 5 })(
    'Partial permission updates only change specified fields',
    async (initialConfig, partialUpdate) => {
      const uniqueEmail = `${TEST_PREFIX}perm-partial-${createId()}@example.com`;
      
      // Create manager with initial permissions
      const manager = await EventManagerService.create({
        name: 'Test Manager',
        email: uniqueEmail,
        permissions: initialConfig,
      });

      // Update with partial permissions
      await EventManagerService.updatePermissions(manager.id, partialUpdate);

      // Retrieve permissions
      const permissions = await AuthorizationService.getPermissions(manager.id);

      expect(permissions).not.toBeNull();
      
      // Check each permission - should be updated value if provided, otherwise initial
      expect(permissions!.canCreateEvents).toBe(
        partialUpdate.canCreateEvents !== undefined ? partialUpdate.canCreateEvents : initialConfig.canCreateEvents
      );
      expect(permissions!.canUploadExcel).toBe(
        partialUpdate.canUploadExcel !== undefined ? partialUpdate.canUploadExcel : initialConfig.canUploadExcel
      );
      expect(permissions!.canSendCampaigns).toBe(
        partialUpdate.canSendCampaigns !== undefined ? partialUpdate.canSendCampaigns : initialConfig.canSendCampaigns
      );
      expect(permissions!.canManageAutomations).toBe(
        partialUpdate.canManageAutomations !== undefined ? partialUpdate.canManageAutomations : initialConfig.canManageAutomations
      );
      expect(permissions!.canDeleteGuests).toBe(
        partialUpdate.canDeleteGuests !== undefined ? partialUpdate.canDeleteGuests : initialConfig.canDeleteGuests
      );
    }
  );
});


/**
 * Feature: event-manager-roles, Property 7: Suspension Blocks Access
 * 
 * For any suspended Event_Manager, authentication attempts SHALL fail
 * while their event assignments remain unchanged.
 * 
 * Validates: Requirements 4.2
 */
describe('Property 7: Suspension Blocks Access', () => {
  // Clean up all test data after all tests complete
  afterAll(async () => {
    // Find all test events by name pattern
    const testEvents = await db.query.events.findMany({
      where: like(events.name, `${TEST_PREFIX}suspend-%`),
      columns: { id: true },
    });
    
    if (testEvents.length > 0) {
      const eventIds = testEvents.map(e => e.id);
      await db.delete(eventAssignments).where(inArray(eventAssignments.eventId, eventIds));
      await db.delete(events).where(inArray(events.id, eventIds));
    }
    
    // Find all test users by email pattern
    const testUsers = await db.query.user.findMany({
      where: like(user.email, `${TEST_PREFIX}suspend-%`),
      columns: { id: true },
    });
    
    if (testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      await db.delete(eventManagerPermissions).where(inArray(eventManagerPermissions.userId, userIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });

  it('Suspended manager loses all permissions but keeps event assignments', async () => {
    const numEvents = 2;
    const iterationId = createId();
    const uniqueEmail = `${TEST_PREFIX}suspend-${iterationId}@example.com`;
    
    const permConfig = {
      canCreateEvents: true,
      canUploadExcel: true,
      canSendCampaigns: true,
      canManageAutomations: false,
      canDeleteGuests: false,
    };
    
    // Create manager with permissions
    const manager = await EventManagerService.create({
      name: 'Test Manager',
      email: uniqueEmail,
      permissions: permConfig,
    });

    // Create an admin for assigning events
    const adminId = createId();
    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${TEST_PREFIX}suspend-admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create and assign events
    const eventIds: string[] = [];
    for (let i = 0; i < numEvents; i++) {
      const eventId = createId();
      eventIds.push(eventId);

      await db.insert(events).values({
        id: eventId,
        name: `${TEST_PREFIX}suspend-Event-${iterationId}-${i}`,
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
        assignedUserId: manager.id,
        assignedBy: adminId,
      });
    }

    // Verify manager has permissions before suspension
    const hasPerm = await AuthorizationService.hasPermission(manager.id, 'canCreateEvents');
    expect(hasPerm).toBe(true);

    // Suspend the manager
    const suspendedManager = await EventManagerService.suspend(manager.id);
    expect(suspendedManager.status).toBe('Suspended');

    // Verify manager loses all permissions after suspension
    for (const perm of ['canCreateEvents', 'canUploadExcel', 'canSendCampaigns', 'canManageAutomations', 'canDeleteGuests'] as const) {
      const hasPermAfter = await AuthorizationService.hasPermission(manager.id, perm);
      expect(hasPermAfter).toBe(false);
    }

    // Verify manager cannot access events after suspension
    for (const eventId of eventIds) {
      const canAccess = await AuthorizationService.canAccessEvent(manager.id, eventId);
      expect(canAccess).toBe(false);
    }

    // Verify event assignments are preserved (check database directly)
    const assignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, manager.id),
    });
    expect(assignments.length).toBe(numEvents);
  });

  it('Cannot suspend already suspended user', async () => {
    const uniqueEmail = `${TEST_PREFIX}suspend-double-${createId()}@example.com`;
    
    // Create and suspend manager
    const manager = await EventManagerService.create({
      name: 'Test Manager',
      email: uniqueEmail,
    });

    await EventManagerService.suspend(manager.id);

    // Attempt to suspend again
    await expect(
      EventManagerService.suspend(manager.id)
    ).rejects.toThrow('User is already suspended');
  });
});


/**
 * Feature: event-manager-roles, Property 8: Reactivation Restores Access
 * 
 * For any Event_Manager who is suspended then reactivated, their authentication
 * capability and event assignments SHALL be equivalent to their state before suspension.
 * 
 * Validates: Requirements 4.3
 */
describe('Property 8: Reactivation Restores Access', () => {
  // Clean up all test data after all tests complete
  afterAll(async () => {
    // Find all test events by name pattern
    const testEvents = await db.query.events.findMany({
      where: like(events.name, `${TEST_PREFIX}react-%`),
      columns: { id: true },
    });
    
    if (testEvents.length > 0) {
      const eventIds = testEvents.map(e => e.id);
      await db.delete(eventAssignments).where(inArray(eventAssignments.eventId, eventIds));
      await db.delete(events).where(inArray(events.id, eventIds));
    }
    
    // Find all test users by email pattern
    const testUsers = await db.query.user.findMany({
      where: like(user.email, `${TEST_PREFIX}react-%`),
      columns: { id: true },
    });
    
    if (testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      await db.delete(eventManagerPermissions).where(inArray(eventManagerPermissions.userId, userIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });

  it('Suspend then reactivate restores original access state', async () => {
    const numEvents = 2;
    const iterationId = createId();
    const uniqueEmail = `${TEST_PREFIX}react-${iterationId}@example.com`;
    
    const permConfig = {
      canCreateEvents: true,
      canUploadExcel: true,
      canSendCampaigns: false,
      canManageAutomations: false,
      canDeleteGuests: false,
    };
    
    // Create manager with permissions
    const manager = await EventManagerService.create({
      name: 'Test Manager',
      email: uniqueEmail,
      permissions: permConfig,
    });

    // Create an admin for assigning events
    const adminId = createId();
    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${TEST_PREFIX}react-admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create and assign events
    const eventIds: string[] = [];
    for (let i = 0; i < numEvents; i++) {
      const eventId = createId();
      eventIds.push(eventId);

      await db.insert(events).values({
        id: eventId,
        name: `${TEST_PREFIX}react-Event-${iterationId}-${i}`,
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
        assignedUserId: manager.id,
        assignedBy: adminId,
      });
    }

    // Record original state
    const originalPermissions: Record<string, boolean> = {};
    for (const perm of ['canCreateEvents', 'canUploadExcel', 'canSendCampaigns', 'canManageAutomations', 'canDeleteGuests'] as const) {
      originalPermissions[perm] = await AuthorizationService.hasPermission(manager.id, perm);
    }

    const originalEventAccess: Record<string, boolean> = {};
    for (const eventId of eventIds) {
      originalEventAccess[eventId] = await AuthorizationService.canAccessEvent(manager.id, eventId);
    }

    // Suspend the manager
    await EventManagerService.suspend(manager.id);

    // Verify access is blocked
    for (const perm of ['canCreateEvents', 'canUploadExcel', 'canSendCampaigns', 'canManageAutomations', 'canDeleteGuests'] as const) {
      const hasPerm = await AuthorizationService.hasPermission(manager.id, perm);
      expect(hasPerm).toBe(false);
    }

    // Reactivate the manager
    const reactivatedManager = await EventManagerService.reactivate(manager.id);
    expect(reactivatedManager.status).toBe('Active');

    // Verify permissions are restored
    for (const perm of ['canCreateEvents', 'canUploadExcel', 'canSendCampaigns', 'canManageAutomations', 'canDeleteGuests'] as const) {
      const hasPerm = await AuthorizationService.hasPermission(manager.id, perm);
      expect(hasPerm).toBe(originalPermissions[perm]);
    }

    // Verify event access is restored
    for (const eventId of eventIds) {
      const canAccess = await AuthorizationService.canAccessEvent(manager.id, eventId);
      expect(canAccess).toBe(originalEventAccess[eventId]);
    }
  });

  it('Cannot reactivate already active user', async () => {
    const uniqueEmail = `${TEST_PREFIX}react-active-${createId()}@example.com`;
    
    // Create active manager
    const manager = await EventManagerService.create({
      name: 'Test Manager',
      email: uniqueEmail,
    });

    // Attempt to reactivate active user
    await expect(
      EventManagerService.reactivate(manager.id)
    ).rejects.toThrow('User is already active');
  });
});


/**
 * Feature: event-manager-roles, Property 10: Deactivation Transfer Completeness
 * 
 * For any Event_Manager being deactivated with assigned events, after deactivation
 * completes, all previously assigned events SHALL be assigned to the specified
 * destination and the manager status SHALL be Deactivated.
 * 
 * Validates: Requirements 4.6
 */
describe('Property 10: Deactivation Transfer Completeness', () => {
  // Clean up all test data after all tests complete
  afterAll(async () => {
    // Find all test events by name pattern
    const testEvents = await db.query.events.findMany({
      where: like(events.name, `${TEST_PREFIX}deact-%`),
      columns: { id: true },
    });
    
    if (testEvents.length > 0) {
      const eventIds = testEvents.map(e => e.id);
      await db.delete(eventAssignments).where(inArray(eventAssignments.eventId, eventIds));
      await db.delete(events).where(inArray(events.id, eventIds));
    }
    
    // Find all test users by email pattern
    const testUsers = await db.query.user.findMany({
      where: like(user.email, `${TEST_PREFIX}deact-%`),
      columns: { id: true },
    });
    
    if (testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      await db.delete(eventManagerPermissions).where(inArray(eventManagerPermissions.userId, userIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });

  it('Deactivation transfers all events to destination and sets status to Deactivated', async () => {
    const numEvents = 2;
    const iterationId = createId();
    
    // Create manager to be deactivated
    const manager = await EventManagerService.create({
      name: 'Manager To Deactivate',
      email: `${TEST_PREFIX}deact-source-${iterationId}@example.com`,
    });

    // Create destination manager
    const destination = await EventManagerService.create({
      name: 'Destination Manager',
      email: `${TEST_PREFIX}deact-dest-${iterationId}@example.com`,
    });

    // Create an admin for assigning events
    const adminId = createId();
    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${TEST_PREFIX}deact-admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create and assign events to the manager
    const eventIds: string[] = [];
    for (let i = 0; i < numEvents; i++) {
      const eventId = createId();
      eventIds.push(eventId);

      await db.insert(events).values({
        id: eventId,
        name: `${TEST_PREFIX}deact-Event-${iterationId}-${i}`,
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
        assignedUserId: manager.id,
        assignedBy: adminId,
      });
    }

    // Verify events are assigned to source manager
    const beforeAssignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, manager.id),
    });
    expect(beforeAssignments.length).toBe(numEvents);

    // Deactivate with transfer
    await EventManagerService.deactivate(manager.id, destination.id);

    // Verify manager is deactivated
    const deactivatedManager = await EventManagerService.getById(manager.id);
    expect(deactivatedManager?.status).toBe('Deactivated');

    // Verify all events are now assigned to destination
    const afterAssignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, destination.id),
    });
    
    // Check that all original events are now assigned to destination
    const transferredEventIds = afterAssignments.map(a => a.eventId);
    for (const eventId of eventIds) {
      expect(transferredEventIds).toContain(eventId);
    }

    // Verify source manager has no more assignments
    const sourceAssignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, manager.id),
    });
    expect(sourceAssignments.length).toBe(0);
  });

  it('Deactivation fails without transfer destination when events exist', async () => {
    const numEvents = 2;
    const iterationId = createId();
    
    // Create manager with events
    const manager = await EventManagerService.create({
      name: 'Manager With Events',
      email: `${TEST_PREFIX}deact-notr-${iterationId}@example.com`,
    });

    // Create an admin for assigning events
    const adminId = createId();
    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${TEST_PREFIX}deact-notr-admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create and assign events
    for (let i = 0; i < numEvents; i++) {
      const eventId = createId();

      await db.insert(events).values({
        id: eventId,
        name: `${TEST_PREFIX}deact-notr-Event-${iterationId}-${i}`,
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
        assignedUserId: manager.id,
        assignedBy: adminId,
      });
    }

    // Attempt to deactivate without transfer destination
    await expect(
      EventManagerService.deactivate(manager.id)
    ).rejects.toThrow('Transfer destination required');
  });

  it('Deactivation succeeds without transfer when no events assigned', async () => {
    const uniqueEmail = `${TEST_PREFIX}deact-noevents-${createId()}@example.com`;
    
    // Create manager without events
    const manager = await EventManagerService.create({
      name: 'Manager Without Events',
      email: uniqueEmail,
    });

    // Deactivate without transfer (should succeed)
    await EventManagerService.deactivate(manager.id);

    // Verify manager is deactivated
    const deactivatedManager = await EventManagerService.getById(manager.id);
    expect(deactivatedManager?.status).toBe('Deactivated');
  });
});
