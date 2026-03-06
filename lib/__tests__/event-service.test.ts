import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db, events } from '@/db';
import { EventService, createEventSchema } from '../services/event-service';
import { ZodError } from 'zod';

/**
 * Feature: event-os-mvp, Property 1: Event CRUD Round-Trip
 * 
 * For any valid event data, creating an event and then retrieving it by ID
 * should return an event with all the same field values that were provided
 * during creation.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3
 */
describe('Property 1: Event CRUD Round-Trip', () => {
  afterEach(async () => {
    // Clean up test data
    await db.delete(events);
  });

  // Arbitrary for valid event types
  const eventTypeArb = fc.constantFrom('Conference', 'Private', 'Corporate', 'Exhibition') as fc.Arbitrary<'Conference' | 'Private' | 'Corporate' | 'Exhibition'>;

  // Arbitrary for valid date pairs (endDate >= startDate)
  const validDatePairArb = fc.tuple(
    fc.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') }),
    fc.integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }) // 0 to 1 year in ms
  ).map(([startDate, durationMs]) => ({
    startDate,
    endDate: new Date(startDate.getTime() + durationMs),
  }));

  // Arbitrary for valid event input
  // Using a custom email generator that produces emails Zod will accept
  const validEmailArb = fc.tuple(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
    fc.constantFrom('com', 'org', 'net', 'io', 'co')
  ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

  const validEventInputArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    type: eventTypeArb,
    description: fc.string({ maxLength: 500 }),
    location: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
    hostName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  }).chain(base => 
    fc.tuple(validDatePairArb, validEmailArb).map(([dates, email]) => ({
      ...base,
      ...dates,
      hostEmail: email,
    }))
  );

  test.prop([validEventInputArb], { numRuns: 5 })(
    'creating an event and retrieving it should return the same field values',
    async (eventInput) => {
      // Create the event
      const createdEvent = await EventService.create(eventInput);

      // Retrieve the event by ID
      const retrievedEvent = await EventService.getById(createdEvent.id);

      // Verify the event was retrieved
      expect(retrievedEvent).not.toBeNull();

      // Verify all field values match (accounting for trimming on name, location, hostName)
      expect(retrievedEvent!.name).toBe(eventInput.name.trim());
      expect(retrievedEvent!.type).toBe(eventInput.type);
      expect(retrievedEvent!.description).toBe(eventInput.description);
      expect(retrievedEvent!.location).toBe(eventInput.location.trim());
      expect(retrievedEvent!.hostName).toBe(eventInput.hostName.trim());
      expect(retrievedEvent!.hostEmail).toBe(eventInput.hostEmail);
      expect(retrievedEvent!.startDate.getTime()).toBe(eventInput.startDate.getTime());
      expect(retrievedEvent!.endDate.getTime()).toBe(eventInput.endDate.getTime());

      // Verify system-generated fields exist
      expect(retrievedEvent!.id).toBeDefined();
      expect(retrievedEvent!.createdAt).toBeDefined();
      expect(retrievedEvent!.updatedAt).toBeDefined();
    }
  );
});

/**
 * Feature: event-os-mvp, Property 2: Event Validation Rejects Invalid Data
 * 
 * For any event creation input missing required fields (name, type, startDate,
 * endDate, location), the system should reject the creation and return
 * validation errors.
 * 
 * Validates: Requirements 1.5, 1.6
 */
describe('Property 2: Event Validation Rejects Invalid Data', () => {
  afterEach(async () => {
    // Clean up test data
    await db.delete(events);
  });

  // Valid base event for testing missing fields
  const validBaseEvent = {
    name: 'Test Event',
    type: 'Conference' as const,
    description: 'Test description',
    startDate: new Date('2026-02-01'),
    endDate: new Date('2026-02-02'),
    location: 'Test Location',
    hostName: 'Test Host',
    hostEmail: 'host@test.com',
  };

  // Arbitrary for empty or whitespace-only strings
  const emptyOrWhitespaceArb = fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.constant('\t'),
    fc.constant('\n'),
    fc.constant('  \t  ')
  );

  test.prop([emptyOrWhitespaceArb], { numRuns: 5 })(
    'should reject event creation with empty or whitespace-only name',
    async (invalidName) => {
      const invalidInput = { ...validBaseEvent, name: invalidName };

      await expect(EventService.create(invalidInput)).rejects.toThrow();
    }
  );

  test.prop([emptyOrWhitespaceArb], { numRuns: 5 })(
    'should reject event creation with empty or whitespace-only location',
    async (invalidLocation) => {
      const invalidInput = { ...validBaseEvent, location: invalidLocation };

      await expect(EventService.create(invalidInput)).rejects.toThrow();
    }
  );

  test.prop([emptyOrWhitespaceArb], { numRuns: 5 })(
    'should reject event creation with empty or whitespace-only hostName',
    async (invalidHostName) => {
      const invalidInput = { ...validBaseEvent, hostName: invalidHostName };

      await expect(EventService.create(invalidInput)).rejects.toThrow();
    }
  );

  // Arbitrary for invalid email formats
  const invalidEmailArb = fc.oneof(
    fc.constant(''),
    fc.constant('notanemail'),
    fc.constant('missing@domain'),
    fc.constant('@nodomain.com'),
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('@') || !s.includes('.'))
  );

  test.prop([invalidEmailArb], { numRuns: 5 })(
    'should reject event creation with invalid hostEmail',
    async (invalidEmail) => {
      const invalidInput = { ...validBaseEvent, hostEmail: invalidEmail };

      await expect(EventService.create(invalidInput)).rejects.toThrow();
    }
  );

  // Arbitrary for invalid event types
  const invalidEventTypeArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => !['Conference', 'Private', 'Corporate', 'Exhibition'].includes(s));

  test.prop([invalidEventTypeArb], { numRuns: 5 })(
    'should reject event creation with invalid event type',
    async (invalidType) => {
      const invalidInput = { ...validBaseEvent, type: invalidType as any };

      await expect(EventService.create(invalidInput)).rejects.toThrow();
    }
  );

  // Test for endDate before startDate
  test.prop([
    fc.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') }),
    fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }) // 1ms to 1 year
  ], { numRuns: 5 })(
    'should reject event creation when endDate is before startDate',
    async (startDate, durationMs) => {
      const endDate = new Date(startDate.getTime() - durationMs); // endDate before startDate
      const invalidInput = { ...validBaseEvent, startDate, endDate };

      await expect(EventService.create(invalidInput)).rejects.toThrow();
    }
  );
});
