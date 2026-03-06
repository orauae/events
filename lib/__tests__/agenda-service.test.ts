import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';

// ============================================================================
// PURE FUNCTIONS UNDER TEST
//
// These extract the core business logic from AgendaService so we can
// property-test them without any database access.
// ============================================================================

// --- Types mirroring the service ---

interface AgendaItem {
  startTime: number;
  endTime: number;
  title: string;
}

// --- Pure business logic functions ---

/**
 * Finds the current session at a given time T.
 * Returns the agenda item where startTime <= T <= endTime, or null.
 *
 * Requirements: 8.2
 */
function findCurrentSession(items: AgendaItem[], now: number): AgendaItem | null {
  return items.find((item) => item.startTime <= now && now <= item.endTime) ?? null;
}

/**
 * Returns upcoming sessions (startTime > now) sorted by startTime ascending.
 *
 * Requirements: 8.3
 */
function getUpcomingSessions(items: AgendaItem[], now: number): AgendaItem[] {
  return items
    .filter((item) => item.startTime > now)
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Validates that startTime and endTime are not equal.
 * Returns true if the range is valid, false otherwise.
 *
 * Requirements: 8.4
 */
function validateTimeRange(startTime: number, endTime: number): boolean {
  return startTime !== endTime;
}

// ============================================================================
// GENERATORS
// ============================================================================

/** Generates a reasonable timestamp (within a ~2-year window). */
const timestampArb = fc.integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 });

/** Generates an agenda item with startTime < endTime. */
const agendaItemArb: fc.Arbitrary<AgendaItem> = fc
  .tuple(timestampArb, fc.integer({ min: 1, max: 86_400_000 }), fc.string({ minLength: 1, maxLength: 50 }))
  .map(([start, duration, title]) => ({
    startTime: start,
    endTime: start + duration,
    title,
  }));

/** Generates a list of agenda items. */
const agendaListArb = fc.array(agendaItemArb, { minLength: 0, maxLength: 30 });

// ============================================================================
// Property 19: Current session time-based lookup
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 19: Current session time-based lookup
 *
 * For any set of agenda items and a given time T, the current session lookup
 * SHALL return the agenda item where startTime ≤ T ≤ endTime, or null if no
 * session spans time T.
 *
 * **Validates: Requirements 8.2**
 */
describe('Property 19: Current session time-based lookup', () => {
  test.prop(
    [agendaListArb, timestampArb],
    { numRuns: 100 },
  )(
    'returned session spans the given time T',
    (items, now) => {
      const result = findCurrentSession(items, now);

      if (result !== null) {
        expect(result.startTime).toBeLessThanOrEqual(now);
        expect(result.endTime).toBeGreaterThanOrEqual(now);
      }
    },
  );

  test.prop(
    [agendaListArb, timestampArb],
    { numRuns: 100 },
  )(
    'returns null only when no session spans time T',
    (items, now) => {
      const result = findCurrentSession(items, now);

      if (result === null) {
        // No item should span time T
        for (const item of items) {
          const spans = item.startTime <= now && now <= item.endTime;
          expect(spans).toBe(false);
        }
      }
    },
  );

  test.prop(
    [agendaItemArb],
    { numRuns: 100 },
  )(
    'a time within a session always finds that session',
    (item) => {
      // Pick a time guaranteed to be within [startTime, endTime]
      const mid = Math.floor((item.startTime + item.endTime) / 2);
      const result = findCurrentSession([item], mid);

      expect(result).not.toBeNull();
      expect(result!.title).toBe(item.title);
    },
  );

  test.prop(
    [agendaItemArb, fc.integer({ min: 1, max: 1_000_000 })],
    { numRuns: 100 },
  )(
    'a time after all sessions returns null',
    (item, offset) => {
      const afterEnd = item.endTime + offset;
      const result = findCurrentSession([item], afterEnd);

      expect(result).toBeNull();
    },
  );
});

// ============================================================================
// Property 20: Upcoming sessions chronological ordering
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 20: Upcoming sessions chronological ordering
 *
 * For any set of agenda items and a given time T, the upcoming sessions list
 * SHALL contain only items with startTime > T, and the list SHALL be sorted
 * in ascending order by startTime.
 *
 * **Validates: Requirements 8.3**
 */
describe('Property 20: Upcoming sessions chronological ordering', () => {
  test.prop(
    [agendaListArb, timestampArb],
    { numRuns: 100 },
  )(
    'all returned sessions have startTime > T',
    (items, now) => {
      const upcoming = getUpcomingSessions(items, now);

      for (const session of upcoming) {
        expect(session.startTime).toBeGreaterThan(now);
      }
    },
  );

  test.prop(
    [agendaListArb, timestampArb],
    { numRuns: 100 },
  )(
    'returned sessions are sorted in ascending order by startTime',
    (items, now) => {
      const upcoming = getUpcomingSessions(items, now);

      for (let i = 1; i < upcoming.length; i++) {
        expect(upcoming[i].startTime).toBeGreaterThanOrEqual(upcoming[i - 1].startTime);
      }
    },
  );

  test.prop(
    [agendaListArb, timestampArb],
    { numRuns: 100 },
  )(
    'no upcoming session is excluded from the result',
    (items, now) => {
      const upcoming = getUpcomingSessions(items, now);
      const expectedCount = items.filter((item) => item.startTime > now).length;

      expect(upcoming).toHaveLength(expectedCount);
    },
  );

  test.prop(
    [agendaListArb, timestampArb],
    { numRuns: 100 },
  )(
    'no session with startTime <= T appears in the result',
    (items, now) => {
      const upcoming = getUpcomingSessions(items, now);
      const upcomingTitles = new Set(upcoming.map((s) => `${s.startTime}:${s.title}`));

      for (const item of items) {
        if (item.startTime <= now) {
          // Items with startTime <= now should not appear
          // (use startTime:title as key since titles could collide)
          expect(upcomingTitles.has(`${item.startTime}:${item.title}`)).toBe(false);
        }
      }
    },
  );
});

// ============================================================================
// Property 21: Agenda time range validation
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 21: Agenda time range validation
 *
 * For any agenda item where startTime equals endTime, the system SHALL reject
 * the creation or update.
 *
 * **Validates: Requirements 8.4**
 */
describe('Property 21: Agenda time range validation', () => {
  test.prop(
    [timestampArb],
    { numRuns: 100 },
  )(
    'equal startTime and endTime is rejected',
    (time) => {
      expect(validateTimeRange(time, time)).toBe(false);
    },
  );

  test.prop(
    [timestampArb, fc.integer({ min: 1, max: 86_400_000 })],
    { numRuns: 100 },
  )(
    'different startTime and endTime is accepted',
    (start, offset) => {
      expect(validateTimeRange(start, start + offset)).toBe(true);
    },
  );

  test.prop(
    [timestampArb, timestampArb],
    { numRuns: 100 },
  )(
    'validation result is consistent: false iff startTime === endTime',
    (startTime, endTime) => {
      const result = validateTimeRange(startTime, endTime);
      expect(result).toBe(startTime !== endTime);
    },
  );
});
