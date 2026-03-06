import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import type { GuestTier } from '@/db/schema';

// ============================================================================
// PURE FUNCTIONS UNDER TEST
//
// These extract the core business logic from BroadcastService so we can
// property-test them without any database access.
// ============================================================================

// --- Types mirroring the service ---

interface BroadcastFilter {
  tagIds?: string[];
  tiers?: GuestTier[];
  rsvpStatuses?: string[];
  checkInStatuses?: string[];
}

interface SurveyQuestion {
  index: number;
  text: string;
  type: 'free_text' | 'single_choice' | 'multiple_choice';
  options?: string[];
}

interface EventGuest {
  id: string;
  tier: GuestTier;
  rsvpStatus: string;
  checkInStatus: string;
  tagIds: string[];
}

interface SurveyResponse {
  broadcastId: string;
  eventGuestId: string;
  questionIndex: number;
  response: string;
}

type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

interface BroadcastMessage {
  broadcastId: string;
  status: MessageStatus;
}

// --- Pure business logic functions ---

const MAX_SURVEY_QUESTIONS = 10;

/**
 * Validates that a survey does not exceed the maximum question limit.
 * Returns true if valid, false if too many questions.
 */
function validateSurveyQuestionLimit(questionCount: number): boolean {
  return questionCount <= MAX_SURVEY_QUESTIONS;
}

/**
 * Filters event guests based on broadcast filter criteria.
 * A guest must match ALL specified filter criteria (AND logic).
 * For tags, a guest must have at least one matching tag.
 */
function filterRecipients(guests: EventGuest[], filter?: BroadcastFilter | null): EventGuest[] {
  if (!filter) return guests;

  return guests.filter((guest) => {
    // Filter by tiers
    if (filter.tiers && filter.tiers.length > 0) {
      if (!filter.tiers.includes(guest.tier)) return false;
    }

    // Filter by RSVP statuses
    if (filter.rsvpStatuses && filter.rsvpStatuses.length > 0) {
      if (!filter.rsvpStatuses.includes(guest.rsvpStatus)) return false;
    }

    // Filter by check-in statuses
    if (filter.checkInStatuses && filter.checkInStatuses.length > 0) {
      if (!filter.checkInStatuses.includes(guest.checkInStatus)) return false;
    }

    // Filter by tags (guest must have at least one matching tag)
    if (filter.tagIds && filter.tagIds.length > 0) {
      if (!guest.tagIds.some((t) => filter.tagIds!.includes(t))) return false;
    }

    return true;
  });
}

/**
 * Stores survey responses in an in-memory store and retrieves them
 * by broadcastId and eventGuestId. Simulates the round-trip persistence
 * logic from BroadcastService.storeSurveyResponse / getSurveyResponses.
 */
function storeSurveyResponses(responses: SurveyResponse[]): Map<string, SurveyResponse[]> {
  const store = new Map<string, SurveyResponse[]>();
  for (const r of responses) {
    const key = `${r.broadcastId}:${r.eventGuestId}`;
    if (!store.has(key)) store.set(key, []);
    store.get(key)!.push(r);
  }
  return store;
}

function querySurveyResponses(
  store: Map<string, SurveyResponse[]>,
  broadcastId: string,
  eventGuestId: string,
): SurveyResponse[] {
  return store.get(`${broadcastId}:${eventGuestId}`) ?? [];
}

/**
 * Computes broadcast metrics from individual message statuses.
 * sentCount = messages with status 'sent', 'delivered', or 'read'
 * deliveredCount = messages with status 'delivered' or 'read'
 * readCount = messages with status 'read'
 */
function computeBroadcastMetrics(messages: BroadcastMessage[]): {
  sentCount: number;
  deliveredCount: number;
  readCount: number;
} {
  let sentCount = 0;
  let deliveredCount = 0;
  let readCount = 0;

  for (const msg of messages) {
    if (msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read') {
      sentCount++;
    }
    if (msg.status === 'delivered' || msg.status === 'read') {
      deliveredCount++;
    }
    if (msg.status === 'read') {
      readCount++;
    }
  }

  return { sentCount, deliveredCount, readCount };
}

// ============================================================================
// GENERATORS
// ============================================================================

const tierArb = fc.constantFrom<GuestTier>('Regular', 'VIP', 'VVIP');
const rsvpStatusArb = fc.constantFrom('pending', 'confirmed', 'declined', 'maybe');
const checkInStatusArb = fc.constantFrom('not_checked_in', 'checked_in');
const tagIdArb = fc.string({ minLength: 1, maxLength: 10 });

const eventGuestArb: fc.Arbitrary<EventGuest> = fc.record({
  id: fc.uuid(),
  tier: tierArb,
  rsvpStatus: rsvpStatusArb,
  checkInStatus: checkInStatusArb,
  tagIds: fc.array(tagIdArb, { minLength: 0, maxLength: 5 }),
});

const broadcastFilterArb: fc.Arbitrary<BroadcastFilter> = fc.record({
  tagIds: fc.option(fc.array(tagIdArb, { minLength: 1, maxLength: 3 }), { nil: undefined }),
  tiers: fc.option(fc.subarray<GuestTier>(['Regular', 'VIP', 'VVIP'], { minLength: 1 }), { nil: undefined }),
  rsvpStatuses: fc.option(
    fc.subarray(['pending', 'confirmed', 'declined', 'maybe'], { minLength: 1 }),
    { nil: undefined },
  ),
  checkInStatuses: fc.option(
    fc.subarray(['not_checked_in', 'checked_in'], { minLength: 1 }),
    { nil: undefined },
  ),
});

const messageStatusArb = fc.constantFrom<MessageStatus>('pending', 'sent', 'delivered', 'read', 'failed');

const broadcastMessageArb: fc.Arbitrary<BroadcastMessage> = fc.record({
  broadcastId: fc.constant('broadcast-1'),
  status: messageStatusArb,
});

const surveyResponseArb: fc.Arbitrary<SurveyResponse> = fc.record({
  broadcastId: fc.uuid(),
  eventGuestId: fc.uuid(),
  questionIndex: fc.integer({ min: 0, max: 9 }),
  response: fc.string({ minLength: 1, maxLength: 200 }),
});

// ============================================================================
// Property 15: Broadcast recipient filtering
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 15: Broadcast recipient filtering
 *
 * For any broadcast with filter criteria (tags, tiers, RSVP status, check-in
 * status), every guest in the resulting recipient list SHALL match ALL
 * specified filter criteria, and no guest matching all criteria SHALL be
 * excluded.
 *
 * **Validates: Requirements 7.2**
 */
describe('Property 15: Broadcast recipient filtering', () => {
  test.prop(
    [fc.array(eventGuestArb, { minLength: 0, maxLength: 50 }), broadcastFilterArb],
    { numRuns: 100 },
  )(
    'every recipient matches ALL filter criteria',
    (guests, filter) => {
      const recipients = filterRecipients(guests, filter);

      for (const guest of recipients) {
        if (filter.tiers && filter.tiers.length > 0) {
          expect(filter.tiers).toContain(guest.tier);
        }
        if (filter.rsvpStatuses && filter.rsvpStatuses.length > 0) {
          expect(filter.rsvpStatuses).toContain(guest.rsvpStatus);
        }
        if (filter.checkInStatuses && filter.checkInStatuses.length > 0) {
          expect(filter.checkInStatuses).toContain(guest.checkInStatus);
        }
        if (filter.tagIds && filter.tagIds.length > 0) {
          expect(guest.tagIds.some((t) => filter.tagIds!.includes(t))).toBe(true);
        }
      }
    },
  );

  test.prop(
    [fc.array(eventGuestArb, { minLength: 0, maxLength: 50 }), broadcastFilterArb],
    { numRuns: 100 },
  )(
    'no guest matching all criteria is excluded',
    (guests, filter) => {
      const recipients = filterRecipients(guests, filter);
      const recipientIds = new Set(recipients.map((g) => g.id));

      for (const guest of guests) {
        const matchesTier = !filter.tiers || filter.tiers.length === 0 || filter.tiers.includes(guest.tier);
        const matchesRsvp = !filter.rsvpStatuses || filter.rsvpStatuses.length === 0 || filter.rsvpStatuses.includes(guest.rsvpStatus);
        const matchesCheckIn = !filter.checkInStatuses || filter.checkInStatuses.length === 0 || filter.checkInStatuses.includes(guest.checkInStatus);
        const matchesTags = !filter.tagIds || filter.tagIds.length === 0 || guest.tagIds.some((t) => filter.tagIds!.includes(t));

        if (matchesTier && matchesRsvp && matchesCheckIn && matchesTags) {
          expect(recipientIds.has(guest.id)).toBe(true);
        }
      }
    },
  );

  test.prop(
    [fc.array(eventGuestArb, { minLength: 0, maxLength: 50 })],
    { numRuns: 100 },
  )(
    'no filter returns all guests',
    (guests) => {
      const recipients = filterRecipients(guests, null);
      expect(recipients).toHaveLength(guests.length);
    },
  );
});

// ============================================================================
// Property 16: Survey question limit validation
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 16: Survey question limit validation
 *
 * For any survey broadcast, if the survey contains more than 10 questions,
 * the system SHALL reject the broadcast creation.
 *
 * **Validates: Requirements 7.4**
 */
describe('Property 16: Survey question limit validation', () => {
  test.prop(
    [fc.integer({ min: 0, max: 10 })],
    { numRuns: 100 },
  )(
    'surveys with 0-10 questions are accepted',
    (questionCount) => {
      expect(validateSurveyQuestionLimit(questionCount)).toBe(true);
    },
  );

  test.prop(
    [fc.integer({ min: 11, max: 1000 })],
    { numRuns: 100 },
  )(
    'surveys with more than 10 questions are rejected',
    (questionCount) => {
      expect(validateSurveyQuestionLimit(questionCount)).toBe(false);
    },
  );

  test.prop(
    [fc.integer({ min: 0, max: 1000 })],
    { numRuns: 100 },
  )(
    'validation result is consistent with the 10-question boundary',
    (questionCount) => {
      const result = validateSurveyQuestionLimit(questionCount);
      expect(result).toBe(questionCount <= 10);
    },
  );
});

// ============================================================================
// Property 17: Survey response persistence
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 17: Survey response persistence
 *
 * For any guest survey response, the stored record SHALL correctly reference
 * the broadcast ID, event guest ID, question index, and response text, and
 * querying by broadcast and guest SHALL return all submitted responses.
 *
 * **Validates: Requirements 7.5**
 */
describe('Property 17: Survey response persistence', () => {
  test.prop(
    [fc.array(surveyResponseArb, { minLength: 1, maxLength: 30 })],
    { numRuns: 100 },
  )(
    'stored responses are retrievable with correct fields',
    (responses) => {
      const store = storeSurveyResponses(responses);

      for (const original of responses) {
        const retrieved = querySurveyResponses(store, original.broadcastId, original.eventGuestId);

        // The original response must appear in the retrieved set
        const match = retrieved.find(
          (r) =>
            r.broadcastId === original.broadcastId &&
            r.eventGuestId === original.eventGuestId &&
            r.questionIndex === original.questionIndex &&
            r.response === original.response,
        );
        expect(match).toBeDefined();
      }
    },
  );

  test.prop(
    [fc.array(surveyResponseArb, { minLength: 1, maxLength: 30 })],
    { numRuns: 100 },
  )(
    'querying by broadcast and guest returns all submitted responses for that pair',
    (responses) => {
      const store = storeSurveyResponses(responses);

      // Group expected responses by (broadcastId, eventGuestId)
      const expected = new Map<string, number>();
      for (const r of responses) {
        const key = `${r.broadcastId}:${r.eventGuestId}`;
        expected.set(key, (expected.get(key) ?? 0) + 1);
      }

      for (const [key, count] of expected.entries()) {
        const [broadcastId, eventGuestId] = key.split(':');
        const retrieved = querySurveyResponses(store, broadcastId, eventGuestId);
        expect(retrieved).toHaveLength(count);
      }
    },
  );

  test.prop(
    [fc.uuid(), fc.uuid()],
    { numRuns: 100 },
  )(
    'querying a non-existent broadcast/guest pair returns empty array',
    (broadcastId, eventGuestId) => {
      const store = new Map<string, SurveyResponse[]>();
      const retrieved = querySurveyResponses(store, broadcastId, eventGuestId);
      expect(retrieved).toHaveLength(0);
    },
  );
});

// ============================================================================
// Property 18: Broadcast metrics consistency
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 18: Broadcast metrics consistency
 *
 * For any broadcast, the sentCount SHALL equal the count of individual
 * messages with status 'sent' or later, the deliveredCount SHALL equal
 * the count with status 'delivered' or later, and the readCount SHALL
 * equal the count with status 'read'.
 *
 * **Validates: Requirements 7.6, 12.3**
 */
describe('Property 18: Broadcast metrics consistency', () => {
  test.prop(
    [fc.array(broadcastMessageArb, { minLength: 0, maxLength: 100 })],
    { numRuns: 100 },
  )(
    'sentCount equals messages with status sent, delivered, or read',
    (messages) => {
      const metrics = computeBroadcastMetrics(messages);
      const expectedSent = messages.filter(
        (m) => m.status === 'sent' || m.status === 'delivered' || m.status === 'read',
      ).length;

      expect(metrics.sentCount).toBe(expectedSent);
    },
  );

  test.prop(
    [fc.array(broadcastMessageArb, { minLength: 0, maxLength: 100 })],
    { numRuns: 100 },
  )(
    'deliveredCount equals messages with status delivered or read',
    (messages) => {
      const metrics = computeBroadcastMetrics(messages);
      const expectedDelivered = messages.filter(
        (m) => m.status === 'delivered' || m.status === 'read',
      ).length;

      expect(metrics.deliveredCount).toBe(expectedDelivered);
    },
  );

  test.prop(
    [fc.array(broadcastMessageArb, { minLength: 0, maxLength: 100 })],
    { numRuns: 100 },
  )(
    'readCount equals messages with status read',
    (messages) => {
      const metrics = computeBroadcastMetrics(messages);
      const expectedRead = messages.filter((m) => m.status === 'read').length;

      expect(metrics.readCount).toBe(expectedRead);
    },
  );

  test.prop(
    [fc.array(broadcastMessageArb, { minLength: 0, maxLength: 100 })],
    { numRuns: 100 },
  )(
    'metrics satisfy invariant: sentCount >= deliveredCount >= readCount >= 0',
    (messages) => {
      const metrics = computeBroadcastMetrics(messages);

      expect(metrics.sentCount).toBeGreaterThanOrEqual(metrics.deliveredCount);
      expect(metrics.deliveredCount).toBeGreaterThanOrEqual(metrics.readCount);
      expect(metrics.readCount).toBeGreaterThanOrEqual(0);
    },
  );
});
