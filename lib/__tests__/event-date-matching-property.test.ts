import { describe, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import {
  calculateTargetEventDate,
  eventDateMatches,
} from "@/lib/jobs/workers/event-date-checker";

/**
 * @fileoverview Property-based tests for event date matching
 *
 * Feature: automation-trigger-dev-integration, Property 14: Event Date Matching
 *
 * For any event with a date and automation with an event_date_approaching trigger
 * configured with days before/after, the matching function SHALL correctly identify
 * when the current date matches the trigger condition, supporting both positive
 * (before) and negative (after) offsets.
 *
 * **Validates: Requirements 5.3, 5.4**
 */

/**
 * Feature: automation-trigger-dev-integration, Property 14: Event Date Matching
 * **Validates: Requirements 5.3, 5.4**
 */
describe("Property 14: Event Date Matching", () => {
  // Arbitrary for days before/after offset
  // Positive values = days before event (event is in the future)
  // Negative values = days after event (event was in the past)
  const daysOffsetArb = fc.integer({ min: -365, max: 365 });

  // Arbitrary for a date within a reasonable range
  const dateArb = fc.date({
    min: new Date("2020-01-01"),
    max: new Date("2030-12-31"),
  });

  test.prop([daysOffsetArb], { numRuns: 100 })(
    "calculateTargetEventDate returns a date that is daysBefore days from today",
    (daysBefore) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = calculateTargetEventDate(daysBefore);

      // Calculate expected date
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() + daysBefore);

      // Compare year, month, day (ignoring time)
      expect(targetDate.getFullYear()).toBe(expectedDate.getFullYear());
      expect(targetDate.getMonth()).toBe(expectedDate.getMonth());
      expect(targetDate.getDate()).toBe(expectedDate.getDate());
    }
  );

  test.prop([daysOffsetArb], { numRuns: 100 })(
    "positive daysBefore values target future event dates",
    (daysBefore) => {
      // Only test positive values
      fc.pre(daysBefore > 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = calculateTargetEventDate(daysBefore);

      // Target date should be in the future
      expect(targetDate.getTime()).toBeGreaterThan(today.getTime());
    }
  );

  test.prop([daysOffsetArb], { numRuns: 100 })(
    "negative daysBefore values target past event dates (days after)",
    (daysBefore) => {
      // Only test negative values
      fc.pre(daysBefore < 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = calculateTargetEventDate(daysBefore);

      // Target date should be in the past
      expect(targetDate.getTime()).toBeLessThan(today.getTime());
    }
  );

  test.prop([fc.constant(0)], { numRuns: 1 })(
    "zero daysBefore targets today's date",
    (daysBefore) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = calculateTargetEventDate(daysBefore);

      // Target date should be today
      expect(targetDate.getFullYear()).toBe(today.getFullYear());
      expect(targetDate.getMonth()).toBe(today.getMonth());
      expect(targetDate.getDate()).toBe(today.getDate());
    }
  );

  test.prop([dateArb, dateArb], { numRuns: 100 })(
    "eventDateMatches returns true only when dates are the same day",
    (eventDate, targetDate) => {
      const result = eventDateMatches(eventDate, targetDate);

      // Normalize both dates to compare
      const normalizedEvent = new Date(eventDate);
      normalizedEvent.setHours(0, 0, 0, 0);

      const normalizedTarget = new Date(targetDate);
      normalizedTarget.setHours(0, 0, 0, 0);

      const sameDay =
        normalizedEvent.getFullYear() === normalizedTarget.getFullYear() &&
        normalizedEvent.getMonth() === normalizedTarget.getMonth() &&
        normalizedEvent.getDate() === normalizedTarget.getDate();

      expect(result).toBe(sameDay);
    }
  );

  test.prop([dateArb, fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 })], { numRuns: 50 })(
    "eventDateMatches ignores time component",
    (baseDate, hours, minutes) => {
      // Create two dates on the same day but different times
      const date1 = new Date(baseDate);
      date1.setHours(0, 0, 0, 0);

      const date2 = new Date(baseDate);
      date2.setHours(hours, minutes, 0, 0);

      // Should match because they're the same day
      expect(eventDateMatches(date1, date2)).toBe(true);
      expect(eventDateMatches(date2, date1)).toBe(true);
    }
  );

  test.prop([dateArb], { numRuns: 50 })(
    "eventDateMatches is reflexive (date matches itself)",
    (date) => {
      expect(eventDateMatches(date, date)).toBe(true);
    }
  );

  test.prop([dateArb, dateArb], { numRuns: 100 })(
    "eventDateMatches is symmetric",
    (date1, date2) => {
      const result1 = eventDateMatches(date1, date2);
      const result2 = eventDateMatches(date2, date1);

      expect(result1).toBe(result2);
    }
  );

  test.prop([daysOffsetArb], { numRuns: 100 })(
    "event scheduled for daysBefore days from now matches calculateTargetEventDate",
    (daysBefore) => {
      // Create an event date that is daysBefore days from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const eventDate = new Date(today);
      eventDate.setDate(eventDate.getDate() + daysBefore);

      // Calculate target date using the function
      const targetDate = calculateTargetEventDate(daysBefore);

      // The event date should match the target date
      expect(eventDateMatches(eventDate, targetDate)).toBe(true);
    }
  );

  test.prop([daysOffsetArb, fc.integer({ min: 1, max: 365 })], { numRuns: 100 })(
    "event NOT scheduled for daysBefore days from now does NOT match",
    (daysBefore, offset) => {
      // Create an event date that is NOT daysBefore days from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Event is at a different offset
      const eventDate = new Date(today);
      eventDate.setDate(eventDate.getDate() + daysBefore + offset);

      // Calculate target date using the function
      const targetDate = calculateTargetEventDate(daysBefore);

      // The event date should NOT match the target date
      expect(eventDateMatches(eventDate, targetDate)).toBe(false);
    }
  );

  // Test specific edge cases
  describe("edge cases", () => {
    test("daysBefore of 7 targets event 7 days in the future", () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = calculateTargetEventDate(7);

      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() + 7);

      expect(eventDateMatches(targetDate, expectedDate)).toBe(true);
    });

    test("daysBefore of -3 targets event 3 days in the past (days after)", () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = calculateTargetEventDate(-3);

      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - 3);

      expect(eventDateMatches(targetDate, expectedDate)).toBe(true);
    });

    test("daysBefore of 0 targets today", () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = calculateTargetEventDate(0);

      expect(eventDateMatches(targetDate, today)).toBe(true);
    });
  });
});
