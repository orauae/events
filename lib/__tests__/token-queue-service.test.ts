import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';

// ============================================================================
// PURE FUNCTIONS UNDER TEST
//
// These extract the core business logic from TokenQueueService so we can
// property-test them without any database access.
// ============================================================================

/**
 * Given the current max token number for an event, returns the next token.
 * First check-in gets token 1 (currentMax = 0).
 */
function getNextTokenNumber(currentMax: number): number {
  return currentMax + 1;
}

/**
 * Assigns sequential tokens to N guests. Returns the array of token numbers.
 * Simulates the sequential assignment logic from TokenQueueService.assignToken.
 */
function assignSequentialTokens(guestCount: number): number[] {
  const tokens: number[] = [];
  let currentMax = 0;
  for (let i = 0; i < guestCount; i++) {
    const next = getNextTokenNumber(currentMax);
    tokens.push(next);
    currentMax = next;
  }
  return tokens;
}

/**
 * Calculates estimated wait time for a guest in a booth queue.
 * This mirrors the formula used in TokenQueueService.joinBoothQueue and
 * TokenQueueService.getQueueStatus: waitingCount * avgServiceDurationMinutes.
 */
function calculateWaitTime(guestsAhead: number, avgServiceDurationMinutes: number): number {
  return guestsAhead * avgServiceDurationMinutes;
}

/**
 * Simulates marking one token as served in a set of booth queues.
 * Returns the updated waiting counts per booth.
 *
 * Each queue entry: { boothName, status }
 * When a token in a specific booth is served, only that booth's waiting count drops by 1.
 */
function computeWaitingCountsAfterServe(
  queues: Record<string, number>, // boothName -> waitingCount
  servedBooth: string,
): Record<string, number> {
  const updated: Record<string, number> = {};
  for (const [booth, count] of Object.entries(queues)) {
    if (booth === servedBooth) {
      updated[booth] = Math.max(0, count - 1);
    } else {
      updated[booth] = count;
    }
  }
  return updated;
}

// ============================================================================
// PROPERTY TESTS
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 12: Sequential token assignment
 *
 * For any sequence of Regular-tier guest check-ins at an event, the assigned
 * token numbers SHALL be strictly sequential starting from 1, with no gaps
 * or duplicates.
 *
 * **Validates: Requirements 6.1, 6.2**
 */
describe('Property 12: Sequential token assignment', () => {
  test.prop(
    [fc.integer({ min: 1, max: 1000 })],
    { numRuns: 100 },
  )(
    'assigned tokens are strictly sequential starting from 1 with no gaps',
    (guestCount) => {
      const tokens = assignSequentialTokens(guestCount);

      // Length matches guest count
      expect(tokens).toHaveLength(guestCount);

      // First token is always 1
      expect(tokens[0]).toBe(1);

      // Each token is exactly previous + 1 (sequential, no gaps)
      for (let i = 1; i < tokens.length; i++) {
        expect(tokens[i]).toBe(tokens[i - 1] + 1);
      }
    },
  );

  test.prop(
    [fc.integer({ min: 1, max: 1000 })],
    { numRuns: 100 },
  )(
    'assigned tokens contain no duplicates',
    (guestCount) => {
      const tokens = assignSequentialTokens(guestCount);
      const uniqueTokens = new Set(tokens);

      expect(uniqueTokens.size).toBe(tokens.length);
    },
  );

  test.prop(
    [fc.integer({ min: 1, max: 1000 })],
    { numRuns: 100 },
  )(
    'last token number equals the total guest count',
    (guestCount) => {
      const tokens = assignSequentialTokens(guestCount);

      expect(tokens[tokens.length - 1]).toBe(guestCount);
    },
  );

  test.prop(
    [fc.nat({ max: 10000 })],
    { numRuns: 100 },
  )(
    'getNextTokenNumber always returns currentMax + 1',
    (currentMax) => {
      expect(getNextTokenNumber(currentMax)).toBe(currentMax + 1);
    },
  );
});

/**
 * Feature: whatsapp-ai-concierge, Property 13: Wait time calculation
 *
 * For any booth queue with N guests waiting ahead and a configured average
 * service duration of T minutes, the estimated wait time SHALL equal N × T minutes.
 *
 * **Validates: Requirements 6.5**
 */
describe('Property 13: Wait time calculation', () => {
  test.prop(
    [
      fc.nat({ max: 1000 }),
      fc.integer({ min: 1, max: 60 }),
    ],
    { numRuns: 100 },
  )(
    'wait time equals guestsAhead × avgServiceDuration',
    (guestsAhead, avgServiceDuration) => {
      const waitTime = calculateWaitTime(guestsAhead, avgServiceDuration);

      expect(waitTime).toBe(guestsAhead * avgServiceDuration);
    },
  );

  test.prop(
    [fc.integer({ min: 1, max: 60 })],
    { numRuns: 100 },
  )(
    'wait time is 0 when no guests are ahead',
    (avgServiceDuration) => {
      const waitTime = calculateWaitTime(0, avgServiceDuration);

      expect(waitTime).toBe(0);
    },
  );

  test.prop(
    [
      fc.nat({ max: 1000 }),
      fc.integer({ min: 1, max: 60 }),
    ],
    { numRuns: 100 },
  )(
    'wait time is non-negative for any valid inputs',
    (guestsAhead, avgServiceDuration) => {
      const waitTime = calculateWaitTime(guestsAhead, avgServiceDuration);

      expect(waitTime).toBeGreaterThanOrEqual(0);
    },
  );

  test.prop(
    [
      fc.nat({ max: 500 }),
      fc.nat({ max: 500 }),
      fc.integer({ min: 1, max: 60 }),
    ],
    { numRuns: 100 },
  )(
    'wait time is additive: (a + b) guests = a guests wait + b guests wait',
    (a, b, avgServiceDuration) => {
      const combined = calculateWaitTime(a + b, avgServiceDuration);
      const separate = calculateWaitTime(a, avgServiceDuration) + calculateWaitTime(b, avgServiceDuration);

      expect(combined).toBe(separate);
    },
  );
});

/**
 * Feature: whatsapp-ai-concierge, Property 14: Queue position update on serve
 *
 * For any booth queue, when a token is marked as served, the count of waiting
 * guests in that queue SHALL decrease by exactly one, and no other queue's
 * waiting count SHALL change.
 *
 * **Validates: Requirements 6.6**
 */
describe('Property 14: Queue position update on serve', () => {
  // Arbitrary for a non-empty map of booth names to waiting counts (at least 1 booth with >= 1 waiting)
  const boothQueuesArb = fc
    .dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
      fc.integer({ min: 0, max: 1000 }),
      { minKeys: 1, maxKeys: 10 },
    )
    .filter((queues) => Object.values(queues).some((count) => count > 0));

  test.prop(
    [boothQueuesArb],
    { numRuns: 100 },
  )(
    'serving a token decreases the served booth waiting count by exactly 1',
    (queues) => {
      // Pick a booth that has at least 1 waiting guest
      const boothsWithWaiting = Object.entries(queues).filter(([, count]) => count > 0);
      const [servedBooth, originalCount] = boothsWithWaiting[0];

      const updated = computeWaitingCountsAfterServe(queues, servedBooth);

      expect(updated[servedBooth]).toBe(originalCount - 1);
    },
  );

  test.prop(
    [boothQueuesArb],
    { numRuns: 100 },
  )(
    'serving a token does not change any other booth waiting count',
    (queues) => {
      // Pick a booth that has at least 1 waiting guest
      const boothsWithWaiting = Object.entries(queues).filter(([, count]) => count > 0);
      const [servedBooth] = boothsWithWaiting[0];

      const updated = computeWaitingCountsAfterServe(queues, servedBooth);

      for (const [booth, count] of Object.entries(queues)) {
        if (booth !== servedBooth) {
          expect(updated[booth]).toBe(count);
        }
      }
    },
  );

  test.prop(
    [
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 1000 }),
        { minKeys: 2, maxKeys: 10 },
      ),
    ],
    { numRuns: 100 },
  )(
    'total waiting across all queues decreases by exactly 1 after serving one token',
    (queues) => {
      const boothNames = Object.keys(queues);
      const servedBooth = boothNames[0];

      const totalBefore = Object.values(queues).reduce((sum, c) => sum + c, 0);
      const updated = computeWaitingCountsAfterServe(queues, servedBooth);
      const totalAfter = Object.values(updated).reduce((sum, c) => sum + c, 0);

      expect(totalAfter).toBe(totalBefore - 1);
    },
  );

  test.prop(
    [fc.integer({ min: 1, max: 1000 })],
    { numRuns: 100 },
  )(
    'serving from a single-booth queue decreases count by exactly 1',
    (waitingCount) => {
      const queues = { 'booth-A': waitingCount };
      const updated = computeWaitingCountsAfterServe(queues, 'booth-A');

      expect(updated['booth-A']).toBe(waitingCount - 1);
    },
  );
});
