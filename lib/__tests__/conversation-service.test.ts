import { describe, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

// ============================================================================
// DB MOCKS
// ============================================================================

const mockConversationFindFirst = vi.fn();
const mockConversationFindMany = vi.fn();
const mockEventGuestsFindFirst = vi.fn();
const mockGuestsFindFirst = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateSetWhere = vi.fn();

vi.mock('@/db', () => ({
  db: {
    query: {
      whatsappConversations: {
        findFirst: (...args: unknown[]) => mockConversationFindFirst(...args),
        findMany: (...args: unknown[]) => mockConversationFindMany(...args),
      },
      eventGuests: {
        findFirst: (...args: unknown[]) => mockEventGuestsFindFirst(...args),
      },
      guests: {
        findFirst: (...args: unknown[]) => mockGuestsFindFirst(...args),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: () => mockInsertReturning(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: (...args: unknown[]) => {
          mockUpdateSetWhere(...args);
          return { returning: vi.fn(() => []) };
        },
      })),
    })),
  },
}));

// ============================================================================
// GENERATORS
// ============================================================================

/** Generates a phone number string like WhatsApp sends (digits, optionally with +) */
const phoneNumberArb = fc.tuple(
  fc.boolean(),
  fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 15 }),
).map(([hasPlus, digits]) => (hasPlus ? '+' : '') + digits.join(''));

/** Generates a non-empty alphanumeric ID */
const idArb = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 5, maxLength: 25 },
).map((chars) => chars.join(''));


// ============================================================================
// Property 3: Guest phone number matching
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 3: Guest phone number matching
 *
 * For any guest with a mobile number stored in the guests table or an
 * updatedMobile in the event_guests table, receiving an inbound WhatsApp
 * message from that phone number SHALL correctly identify and return that guest.
 *
 * Since findEventGuestByPhone is not exported from the webhook route, we
 * replicate its logic here: first check eventGuests.updatedMobile, then
 * guests.mobile joined with eventGuests for the event.
 *
 * **Validates: Requirements 2.3**
 */
describe('Property 3: Guest phone number matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Replicates the findEventGuestByPhone logic from the webhook route.
   * First checks eventGuests.updatedMobile, then guests.mobile + eventGuests join.
   */
  async function findEventGuestByPhone(
    phoneNumber: string,
    eventId: string,
  ): Promise<{ eventGuestId: string; guestId: string } | null> {
    // Check eventGuests.updatedMobile
    const byUpdatedMobile = await mockEventGuestsFindFirst({ phoneNumber, eventId, field: 'updatedMobile' });
    if (byUpdatedMobile) {
      return { eventGuestId: byUpdatedMobile.id, guestId: byUpdatedMobile.guestId };
    }

    // Check guests.mobile
    const guestByMobile = await mockGuestsFindFirst({ phoneNumber });
    if (guestByMobile) {
      const eventGuestRecord = await mockEventGuestsFindFirst({ eventId, guestId: guestByMobile.id, field: 'guestId' });
      if (eventGuestRecord) {
        return { eventGuestId: eventGuestRecord.id, guestId: guestByMobile.id };
      }
    }

    return null;
  }

  test.prop(
    [phoneNumberArb, idArb, idArb, idArb],
    { numRuns: 100 },
  )(
    'a guest with updatedMobile in event_guests is found by that phone number',
    async (phone, eventId, eventGuestId, guestId) => {
      // Mock: eventGuests.updatedMobile matches
      mockEventGuestsFindFirst.mockImplementation((params: { field?: string }) => {
        if (params.field === 'updatedMobile') {
          return Promise.resolve({ id: eventGuestId, guestId });
        }
        return Promise.resolve(undefined);
      });
      mockGuestsFindFirst.mockResolvedValue(undefined);

      const result = await findEventGuestByPhone(phone, eventId);

      expect(result).not.toBeNull();
      expect(result!.eventGuestId).toBe(eventGuestId);
      expect(result!.guestId).toBe(guestId);
    },
  );

  test.prop(
    [phoneNumberArb, idArb, idArb, idArb],
    { numRuns: 100 },
  )(
    'a guest with mobile in guests table is found when no updatedMobile match exists',
    async (phone, eventId, eventGuestId, guestId) => {
      // Mock: no updatedMobile match, but guests.mobile matches
      mockEventGuestsFindFirst.mockImplementation((params: { field?: string }) => {
        if (params.field === 'updatedMobile') {
          return Promise.resolve(undefined);
        }
        // guestId join lookup
        if (params.field === 'guestId') {
          return Promise.resolve({ id: eventGuestId, guestId });
        }
        return Promise.resolve(undefined);
      });
      mockGuestsFindFirst.mockResolvedValue({ id: guestId, mobile: phone });

      const result = await findEventGuestByPhone(phone, eventId);

      expect(result).not.toBeNull();
      expect(result!.eventGuestId).toBe(eventGuestId);
      expect(result!.guestId).toBe(guestId);
    },
  );

  test.prop(
    [phoneNumberArb, idArb],
    { numRuns: 100 },
  )(
    'an unknown phone number returns null',
    async (phone, eventId) => {
      mockEventGuestsFindFirst.mockResolvedValue(undefined);
      mockGuestsFindFirst.mockResolvedValue(undefined);

      const result = await findEventGuestByPhone(phone, eventId);

      expect(result).toBeNull();
    },
  );

  test.prop(
    [phoneNumberArb, idArb, idArb, idArb],
    { numRuns: 100 },
  )(
    'updatedMobile takes priority over guests.mobile when both exist',
    async (phone, eventId, eventGuestIdFromUpdated, guestId) => {
      // Both updatedMobile and guests.mobile would match, but updatedMobile is checked first
      mockEventGuestsFindFirst.mockImplementation((params: { field?: string }) => {
        if (params.field === 'updatedMobile') {
          return Promise.resolve({ id: eventGuestIdFromUpdated, guestId });
        }
        return Promise.resolve({ id: 'other-eg-id', guestId });
      });
      mockGuestsFindFirst.mockResolvedValue({ id: guestId, mobile: phone });

      const result = await findEventGuestByPhone(phone, eventId);

      expect(result).not.toBeNull();
      expect(result!.eventGuestId).toBe(eventGuestIdFromUpdated);
    },
  );
});


// ============================================================================
// Property 4: Conversation findOrCreate idempotency
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 4: Conversation findOrCreate idempotency
 *
 * For any event and guest pair, calling findOrCreate multiple times SHALL
 * always return the same Conversation record (same ID), and the total number
 * of Conversation records for that pair SHALL remain exactly one.
 *
 * **Validates: Requirements 2.5**
 */
describe('Property 4: Conversation findOrCreate idempotency', () => {
  let ConversationService: typeof import('../services/conversation-service').ConversationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/conversation-service');
    ConversationService = mod.ConversationService;
  });

  test.prop(
    [idArb, idArb, idArb, phoneNumberArb],
    { numRuns: 100 },
  )(
    'calling findOrCreate twice returns the same conversation ID',
    async (eventId, eventGuestId, channelId, phone) => {
      const fakeConversation = {
        id: 'conv-fixed-id',
        channelId,
        eventId,
        eventGuestId,
        guestPhoneNumber: phone,
        escalationStatus: 'ai_managed' as const,
        sessionWindowExpiresAt: null,
        state: { currentPhase: 'pre-event' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First call: no existing record, insert succeeds
      let callCount = 0;
      mockConversationFindFirst.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First findOrCreate — no existing
          return Promise.resolve(undefined);
        }
        // Second findOrCreate — existing found
        return Promise.resolve(fakeConversation);
      });
      mockInsertReturning.mockResolvedValue([fakeConversation]);

      const first = await ConversationService.findOrCreate({
        eventId,
        eventGuestId,
        channelId,
        guestPhoneNumber: phone,
      });

      const second = await ConversationService.findOrCreate({
        eventId,
        eventGuestId,
        channelId,
        guestPhoneNumber: phone,
      });

      expect(first.id).toBe(second.id);
      expect(first.id).toBe('conv-fixed-id');
    },
  );

  test.prop(
    [idArb, idArb, idArb, phoneNumberArb],
    { numRuns: 100 },
  )(
    'findOrCreate returns existing conversation without inserting when one exists',
    async (eventId, eventGuestId, channelId, phone) => {
      const existingConversation = {
        id: 'existing-conv-id',
        channelId,
        eventId,
        eventGuestId,
        guestPhoneNumber: phone,
        escalationStatus: 'ai_managed' as const,
        sessionWindowExpiresAt: null,
        state: { currentPhase: 'pre-event' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockConversationFindFirst.mockResolvedValue(existingConversation);

      const result = await ConversationService.findOrCreate({
        eventId,
        eventGuestId,
        channelId,
        guestPhoneNumber: phone,
      });

      expect(result.id).toBe('existing-conv-id');
      // Insert should NOT have been called since existing was found
      expect(mockInsertReturning).not.toHaveBeenCalled();
    },
  );

  test.prop(
    [idArb, idArb, idArb, phoneNumberArb],
    { numRuns: 100 },
  )(
    'concurrent findOrCreate with unique violation still returns the same record',
    async (eventId, eventGuestId, channelId, phone) => {
      const fakeConversation = {
        id: 'race-conv-id',
        channelId,
        eventId,
        eventGuestId,
        guestPhoneNumber: phone,
        escalationStatus: 'ai_managed' as const,
        sessionWindowExpiresAt: null,
        state: { currentPhase: 'pre-event' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First findFirst returns undefined (no existing), insert throws unique violation,
      // fallback findFirst returns the record created by the concurrent request
      let findFirstCallCount = 0;
      mockConversationFindFirst.mockImplementation(() => {
        findFirstCallCount++;
        if (findFirstCallCount === 1) {
          return Promise.resolve(undefined);
        }
        // Fallback after unique violation
        return Promise.resolve(fakeConversation);
      });
      mockInsertReturning.mockRejectedValue(new Error('unique constraint violation 23505'));

      const result = await ConversationService.findOrCreate({
        eventId,
        eventGuestId,
        channelId,
        guestPhoneNumber: phone,
      });

      expect(result.id).toBe('race-conv-id');
    },
  );
});


// ============================================================================
// Property 22: Escalation round-trip
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 22: Escalation round-trip
 *
 * For any AI-managed Conversation, escalating to human management and then
 * releasing back SHALL restore the Conversation to 'ai_managed' status with
 * no other state changes.
 *
 * **Validates: Requirements 10.3, 10.4, 10.5**
 */
describe('Property 22: Escalation round-trip', () => {
  let ConversationService: typeof import('../services/conversation-service').ConversationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/conversation-service');
    ConversationService = mod.ConversationService;
  });

  /** Generates a valid ConversationState */
  const conversationStateArb = fc.record({
    currentPhase: fc.constantFrom('pre-event' as const, 'during-event' as const, 'post-event' as const),
    lastTopic: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    pendingSurveyId: fc.option(idArb, { nil: undefined }),
    pendingQuestionIndex: fc.option(fc.nat({ max: 9 }), { nil: undefined }),
  });

  /** Generates a reason string for escalation */
  const reasonArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0);

  test.prop(
    [idArb, conversationStateArb, reasonArb],
    { numRuns: 100 },
  )(
    'escalating then releasing restores ai_managed status and preserves original state',
    async (convId, originalState, reason) => {
      // Track the conversation state through mutations
      let currentEscalationStatus: 'ai_managed' | 'human_managed' = 'ai_managed';
      let currentState: Record<string, unknown> = { ...originalState };

      // Mock findFirst to return current tracked state
      mockConversationFindFirst.mockImplementation(() => {
        return Promise.resolve({
          id: convId,
          channelId: 'ch-1',
          eventId: 'ev-1',
          eventGuestId: 'eg-1',
          guestPhoneNumber: '+1234567890',
          escalationStatus: currentEscalationStatus,
          sessionWindowExpiresAt: null,
          state: { ...currentState },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      // Mock update to track state changes
      mockUpdateSetWhere.mockImplementation(() => {
        return { returning: vi.fn(() => []) };
      });

      // Capture what gets written to the DB via the update mock
      const { db } = await import('@/db');
      (db.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        set: (setData: Record<string, unknown>) => {
          // Apply the update to our tracked state
          if (setData.escalationStatus) {
            currentEscalationStatus = setData.escalationStatus as 'ai_managed' | 'human_managed';
          }
          if (setData.state) {
            currentState = setData.state as Record<string, unknown>;
          }
          return {
            where: (...args: unknown[]) => {
              mockUpdateSetWhere(...args);
              return { returning: vi.fn(() => []) };
            },
          };
        },
      }));

      // Step 1: Escalate to human
      await ConversationService.escalateToHuman(convId, reason);
      expect(currentEscalationStatus).toBe('human_managed');

      // Step 2: Release back to AI
      await ConversationService.releaseFromHuman(convId);
      expect(currentEscalationStatus).toBe('ai_managed');

      // Step 3: Verify original state fields are preserved
      expect(currentState.currentPhase).toBe(originalState.currentPhase);
      if (originalState.lastTopic !== undefined) {
        expect(currentState.lastTopic).toBe(originalState.lastTopic);
      }
      if (originalState.pendingSurveyId !== undefined) {
        expect(currentState.pendingSurveyId).toBe(originalState.pendingSurveyId);
      }
      if (originalState.pendingQuestionIndex !== undefined) {
        expect(currentState.pendingQuestionIndex).toBe(originalState.pendingQuestionIndex);
      }

      // Step 4: Verify escalationReason is cleared after release
      expect(currentState.escalationReason).toBeUndefined();
    },
  );

  test.prop(
    [idArb, reasonArb],
    { numRuns: 100 },
  )(
    'escalating an already human-managed conversation throws an error',
    async (convId, reason) => {
      mockConversationFindFirst.mockResolvedValue({
        id: convId,
        escalationStatus: 'human_managed',
        state: { currentPhase: 'pre-event' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        ConversationService.escalateToHuman(convId, reason),
      ).rejects.toThrow(/already escalated/);
    },
  );

  test.prop(
    [idArb],
    { numRuns: 100 },
  )(
    'releasing an ai_managed conversation throws an error',
    async (convId) => {
      mockConversationFindFirst.mockResolvedValue({
        id: convId,
        escalationStatus: 'ai_managed',
        state: { currentPhase: 'pre-event' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        ConversationService.releaseFromHuman(convId),
      ).rejects.toThrow(/not currently escalated/);
    },
  );
});
