import { describe, expect, beforeEach, afterEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Anthropic client — we control the AI response (including confidence)
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: function Anthropic() {
      return {
        messages: { create: mockCreate },
      };
    },
  };
});

// Mock the database module — buildContext is not under test here
vi.mock('@/db', () => ({
  db: {
    query: {
      whatsappConversations: { findFirst: vi.fn() },
      events: { findFirst: vi.fn() },
      eventGuests: { findFirst: vi.fn() },
      guests: { findFirst: vi.fn() },
      whatsappTokenQueues: { findFirst: vi.fn() },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      })),
    })),
  },
}));

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Creates a mock Anthropic messages.create response that returns a content
 * block with the given confidence score and an arbitrary response text.
 */
function makeMockAnthropicResponse(confidence: number, responseText = 'Test response') {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          response: responseText,
          confidence,
          topicCategory: 'general',
        }),
      },
    ],
  };
}

/**
 * Builds a minimal ConciergeContext for testing generateResponse.
 */
function makeMinimalContext() {
  return {
    event: {
      id: 'evt-1',
      name: 'Test Event',
      type: 'conference',
      description: 'A test event',
      location: 'Test Venue',
      startDate: new Date('2025-01-01T09:00:00Z'),
      endDate: new Date('2025-12-31T18:00:00Z'),
      latitude: null,
      longitude: null,
    },
    guest: {
      id: 'guest-1',
      firstName: 'Test',
      lastName: 'Guest',
      email: 'test@example.com',
      company: null,
      jobTitle: null,
    },
    eventGuest: {
      id: 'eg-1',
      tier: 'Regular',
      rsvpStatus: 'confirmed',
      checkInStatus: 'not_checked_in',
    },
    conversation: {
      id: 'conv-1',
      channelId: 'ch-1',
      eventId: 'evt-1',
      eventGuestId: 'eg-1',
      guestPhoneNumber: '+1234567890',
      escalationStatus: 'ai_managed',
      state: {},
    },
    recentMessages: [],
    knowledgeBase: [],
    agenda: [],
    eventPhase: 'during-event' as const,
    tokenNumber: undefined,
  };
}

/** A minimal inbound text message record. */
function makeInboundMessage(text = 'Hello') {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    channelId: 'ch-1',
    waMessageId: 'wa-msg-1',
    direction: 'inbound' as const,
    type: 'text' as const,
    content: { type: 'text', text: { body: text } },
    status: 'delivered' as const,
    aiGenerated: false,
    topicCategory: null,
    statusUpdatedAt: null,
    createdAt: new Date(),
  };
}

// ============================================================================
// PROPERTY 10: Low confidence triggers escalation
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 10: Low confidence triggers escalation
 *
 * For any AI-generated response where the confidence score is below the
 * configured threshold, the Conversation SHALL be transitioned to
 * 'human_managed' escalation status.
 *
 * **Validates: Requirements 4.7**
 */
describe('Property 10: Low confidence triggers escalation', () => {
  // Import at module level — the mock is hoisted so this is safe
  let ConciergeService: typeof import('../services/concierge-service').ConciergeService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/concierge-service');
    ConciergeService = mod.ConciergeService;
  });

  afterEach(() => {
    // Clean up env var overrides
    delete process.env.CONCIERGE_ESCALATION_THRESHOLD;
  });

  // --------------------------------------------------------------------------
  // Property: confidence < threshold ⟹ shouldEscalate === true
  // --------------------------------------------------------------------------
  test.prop(
    [
      // Random confidence value strictly below the default threshold (0.5)
      fc.double({ min: 0, max: 0.4999999, noNaN: true }),
    ],
    { numRuns: 100 },
  )(
    'shouldEscalate is true when confidence is below the default threshold (0.5)',
    async (confidence) => {
      mockCreate.mockResolvedValue(makeMockAnthropicResponse(confidence));

      const result = await ConciergeService.generateResponse(
        makeInboundMessage() as any,
        makeMinimalContext() as any,
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.confidence).toBeLessThan(0.5);
    },
  );

  // --------------------------------------------------------------------------
  // Property: confidence >= threshold ⟹ shouldEscalate === false
  // --------------------------------------------------------------------------
  test.prop(
    [
      // Random confidence value at or above the default threshold (0.5)
      fc.double({ min: 0.5, max: 1, noNaN: true }),
    ],
    { numRuns: 100 },
  )(
    'shouldEscalate is false when confidence is at or above the default threshold (0.5)',
    async (confidence) => {
      mockCreate.mockResolvedValue(makeMockAnthropicResponse(confidence));

      const result = await ConciergeService.generateResponse(
        makeInboundMessage() as any,
        makeMinimalContext() as any,
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    },
  );

  // --------------------------------------------------------------------------
  // Property: with a custom threshold, confidence < threshold ⟹ escalation
  // --------------------------------------------------------------------------
  test.prop(
    [
      // Random threshold between 0.1 and 0.9
      fc.double({ min: 0.1, max: 0.9, noNaN: true }),
    ],
    { numRuns: 100 },
  )(
    'shouldEscalate is true when confidence is below a custom threshold',
    async (threshold) => {
      process.env.CONCIERGE_ESCALATION_THRESHOLD = String(threshold);

      // Pick a confidence strictly below the threshold
      const confidence = threshold * 0.5; // always < threshold since threshold >= 0.1

      mockCreate.mockResolvedValue(makeMockAnthropicResponse(confidence));

      const result = await ConciergeService.generateResponse(
        makeInboundMessage() as any,
        makeMinimalContext() as any,
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.confidence).toBeLessThan(threshold);
    },
  );

  // --------------------------------------------------------------------------
  // Property: with a custom threshold, confidence >= threshold ⟹ no escalation
  // --------------------------------------------------------------------------
  test.prop(
    [
      // Random threshold between 0.1 and 0.9
      fc.double({ min: 0.1, max: 0.9, noNaN: true }),
    ],
    { numRuns: 100 },
  )(
    'shouldEscalate is false when confidence is at or above a custom threshold',
    async (threshold) => {
      process.env.CONCIERGE_ESCALATION_THRESHOLD = String(threshold);

      // Pick a confidence at or above the threshold
      const confidence = Math.min(threshold + (1 - threshold) * 0.5, 1); // always >= threshold

      mockCreate.mockResolvedValue(makeMockAnthropicResponse(confidence));

      const result = await ConciergeService.generateResponse(
        makeInboundMessage() as any,
        makeMinimalContext() as any,
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(threshold);
    },
  );

  // --------------------------------------------------------------------------
  // Property: confidence and threshold drawn independently
  // --------------------------------------------------------------------------
  test.prop(
    [
      fc.double({ min: 0, max: 1, noNaN: true }), // confidence
      fc.double({ min: 0.01, max: 0.99, noNaN: true }), // threshold
    ],
    { numRuns: 100 },
  )(
    'shouldEscalate matches (confidence < threshold) for any confidence/threshold pair',
    async (confidence, threshold) => {
      process.env.CONCIERGE_ESCALATION_THRESHOLD = String(threshold);

      mockCreate.mockResolvedValue(makeMockAnthropicResponse(confidence));

      const result = await ConciergeService.generateResponse(
        makeInboundMessage() as any,
        makeMinimalContext() as any,
      );

      const expectedEscalate = confidence < threshold;
      expect(result.shouldEscalate).toBe(expectedEscalate);
    },
  );
});
