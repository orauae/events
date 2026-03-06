/**
 * @fileoverview Event Assignment Service Property Tests
 * 
 * Property-based tests for the Event Assignment Service using fast-check.
 * Tests verify event transfer operations and assignment management.
 * 
 * Feature: event-manager-roles
 */

import { describe, expect, afterAll, it, beforeEach } from 'vitest';
import { db } from '@/db';
import { 
  user, 
  eventManagerPermissions,
  events,
  eventAssignments,
} from '@/db/schema';
import { EventAssignmentService } from '../services/event-assignment-service';
import { createId } from '@paralleldrive/cuid2';
import { like, inArray } from 'drizzle-orm';

// Test prefix to identify test data for cleanup
const TEST_PREFIX = 'ea-svc-test-';

/**
 * Feature: event-manager-roles, Property 12: Event Transfer Updates Assignment
 * 
 * For any event transfer operation, the event's assignment SHALL be updated
 * to the new user and the previous assignment SHALL no longer exist.
 * 
 * Validates: Requirements 5.3, 5.4
 */
describe('Property 12: Event Transfer Updates Assignment', () => {
  // Clean up all test data after all tests complete
  afterAll(async () => {
    // Find all test events by name pattern
    const testEvents = await db.query.events.findMany({
      where: like(events.name, `${TEST_PREFIX}%`),
      columns: { id: true },
    });
    
    if (testEvents.length > 0) {
      const eventIds = testEvents.map(e => e.id);
      await db.delete(eventAssignments).where(inArray(eventAssignments.eventId, eventIds));
      await db.delete(events).where(inArray(events.id, eventIds));
    }
    
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

  it('Transfer updates assignment to new user and removes previous assignment', async () => {
    const iterationId = createId();
    
    // Create source manager directly in DB
    const sourceManagerId = createId();
    await db.insert(user).values({
      id: sourceManagerId,
      name: 'Source Manager',
      email: `${TEST_PREFIX}transfer-source-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Active',
    });

    // Create target manager directly in DB
    const targetManagerId = createId();
    await db.insert(user).values({
      id: targetManagerId,
      name: 'Target Manager',
      email: `${TEST_PREFIX}transfer-target-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Active',
    });

    // Create an admin for assigning events
    const adminId = createId();
    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${TEST_PREFIX}transfer-admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create an event
    const eventId = createId();
    await db.insert(events).values({
      id: eventId,
      name: `${TEST_PREFIX}transfer-Event-${iterationId}`,
      type: 'Conference',
      description: 'Test description',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    });

    // Assign event to source manager directly
    await db.insert(eventAssignments).values({
      eventId,
      assignedUserId: sourceManagerId,
      assignedBy: adminId,
    });

    // Verify initial assignment
    const initialAssignment = await EventAssignmentService.getAssignment(eventId);
    expect(initialAssignment).not.toBeNull();
    expect(initialAssignment!.assignedUserId).toBe(sourceManagerId);

    // Transfer event to target manager
    const transferredAssignment = await EventAssignmentService.transferEvent(
      eventId, 
      targetManagerId, 
      adminId
    );

    // Verify transfer result
    expect(transferredAssignment.assignedUserId).toBe(targetManagerId);
    expect(transferredAssignment.eventId).toBe(eventId);

    // Verify assignment is now to target user
    const finalAssignment = await EventAssignmentService.getAssignment(eventId);
    expect(finalAssignment).not.toBeNull();
    expect(finalAssignment!.assignedUserId).toBe(targetManagerId);

    // Verify source manager no longer has this event
    const sourceEvents = await EventAssignmentService.getEventsByUser(sourceManagerId);
    const hasEvent = sourceEvents.some(e => e.id === eventId);
    expect(hasEvent).toBe(false);

    // Verify target manager now has this event
    const targetEvents = await EventAssignmentService.getEventsByUser(targetManagerId);
    const targetHasEvent = targetEvents.some(e => e.id === eventId);
    expect(targetHasEvent).toBe(true);
  });

  it('Bulk transfer moves all events from source to target', async () => {
    const numEvents = 3;
    const iterationId = createId();
    
    // Create source manager directly in DB
    const sourceManagerId = createId();
    await db.insert(user).values({
      id: sourceManagerId,
      name: 'Bulk Source Manager',
      email: `${TEST_PREFIX}bulk-source-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Active',
    });

    // Create target manager directly in DB
    const targetManagerId = createId();
    await db.insert(user).values({
      id: targetManagerId,
      name: 'Bulk Target Manager',
      email: `${TEST_PREFIX}bulk-target-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Active',
    });

    // Create an admin for assigning events
    const adminId = createId();
    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${TEST_PREFIX}bulk-admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create and assign multiple events to source manager
    const eventIds: string[] = [];
    for (let i = 0; i < numEvents; i++) {
      const eventId = createId();
      eventIds.push(eventId);

      await db.insert(events).values({
        id: eventId,
        name: `${TEST_PREFIX}bulk-Event-${iterationId}-${i}`,
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
        assignedUserId: sourceManagerId,
        assignedBy: adminId,
      });
    }

    // Verify source has all events
    const sourceEventsBefore = await EventAssignmentService.getEventsByUser(sourceManagerId);
    expect(sourceEventsBefore.length).toBe(numEvents);

    // Bulk transfer all events
    const transferredCount = await EventAssignmentService.bulkTransfer(
      sourceManagerId,
      targetManagerId,
      adminId
    );

    // Verify correct count transferred
    expect(transferredCount).toBe(numEvents);

    // Verify source has no events
    const sourceEventsAfter = await EventAssignmentService.getEventsByUser(sourceManagerId);
    expect(sourceEventsAfter.length).toBe(0);

    // Verify target has all events
    const targetEventsAfter = await EventAssignmentService.getEventsByUser(targetManagerId);
    expect(targetEventsAfter.length).toBe(numEvents);

    // Verify each event is now assigned to target
    for (const eventId of eventIds) {
      const assignment = await EventAssignmentService.getAssignment(eventId);
      expect(assignment).not.toBeNull();
      expect(assignment!.assignedUserId).toBe(targetManagerId);
    }
  });

  it('Transfer fails when target user is inactive', async () => {
    const iterationId = createId();
    
    // Create source manager directly in DB
    const sourceManagerId = createId();
    await db.insert(user).values({
      id: sourceManagerId,
      name: 'Source Manager',
      email: `${TEST_PREFIX}inactive-source-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Active',
    });

    // Create target manager and set as suspended
    const targetManagerId = createId();
    await db.insert(user).values({
      id: targetManagerId,
      name: 'Target Manager',
      email: `${TEST_PREFIX}inactive-target-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Suspended',
    });

    // Create an admin for assigning events
    const adminId = createId();
    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${TEST_PREFIX}inactive-admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Create an event
    const eventId = createId();
    await db.insert(events).values({
      id: eventId,
      name: `${TEST_PREFIX}inactive-Event-${iterationId}`,
      type: 'Conference',
      description: 'Test description',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    });

    // Assign event to source manager directly
    await db.insert(eventAssignments).values({
      eventId,
      assignedUserId: sourceManagerId,
      assignedBy: adminId,
    });

    // Attempt to transfer to inactive user
    await expect(
      EventAssignmentService.transferEvent(eventId, targetManagerId, adminId)
    ).rejects.toThrow('Cannot transfer event to inactive user');

    // Verify assignment unchanged
    const assignment = await EventAssignmentService.getAssignment(eventId);
    expect(assignment).not.toBeNull();
    expect(assignment!.assignedUserId).toBe(sourceManagerId);
  });

  it('Cannot transfer to same user', async () => {
    const iterationId = createId();
    
    // Create a manager directly in DB
    const managerId = createId();
    await db.insert(user).values({
      id: managerId,
      name: 'Manager',
      email: `${TEST_PREFIX}same-user-${iterationId}@example.com`,
      role: 'EventManager',
      status: 'Active',
    });

    // Create an admin for assigning events
    const adminId = createId();
    await db.insert(user).values({
      id: adminId,
      name: 'Test Admin',
      email: `${TEST_PREFIX}same-admin-${iterationId}@example.com`,
      role: 'Admin',
      status: 'Active',
    });

    // Attempt bulk transfer to same user
    await expect(
      EventAssignmentService.bulkTransfer(managerId, managerId, adminId)
    ).rejects.toThrow('Cannot transfer events to the same user');
  });
});
