import { describe, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import type { WhatsAppMessageContent } from '../services/whatsapp-message-service';

// ============================================================================
// DB Mocks
// ============================================================================

const mockFindFirst = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateSetWhere = vi.fn();

vi.mock('@/db', () => ({
  db: {
    query: {
      whatsappMessages: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
      whatsappConversations: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
      whatsappChannels: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => ({
        returning: () => mockInsertReturning(vals),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: Record<string, unknown>) => ({
        where: (...args: unknown[]) => {
          mockUpdateSetWhere(vals, ...args);
          return { returning: vi.fn(() => []) };
        },
      })),
    })),
  },
}));

vi.mock('../services/whatsapp-channel-service', () => ({
  WhatsAppChannelService: {
    decryptAccessToken: vi.fn(() => 'decrypted-token'),
  },
}));

// ============================================================================
// Generators
// ============================================================================

const messageTypeArb = fc.constantFrom(
  'text' as const,
  'image' as const,
  'document' as const,
  'location' as const,
  'interactive' as const,
  'template' as const,
);

const directionArb = fc.constantFrom('inbound' as const, 'outbound' as const);

const textContentArb: fc.Arbitrary<WhatsAppMessageContent> = fc.record({
  type: fc.constant('text' as const),
  text: fc.record({ body: fc.string({ minLength: 1, maxLength: 200 }) }),
});

const imageContentArb: fc.Arbitrary<WhatsAppMessageContent> = fc.record({
  type: fc.constant('image' as const),
  image: fc.record({
    url: fc.webUrl(),
    caption: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  }),
});

const templateContentArb: fc.Arbitrary<WhatsAppMessageContent> = fc.record({
  type: fc.constant('template' as const),
  template: fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    language: fc.record({ code: fc.constantFrom('en', 'ar', 'fr', 'es') }),
  }),
});

const anyNonInteractiveContentArb = fc.oneof(textContentArb, imageContentArb, templateContentArb);

const statusArb = fc.constantFrom(
  'pending' as const,
  'sent' as const,
  'delivered' as const,
  'read' as const,
  'failed' as const,
);

const nonFailedStatusArb = fc.constantFrom(
  'pending' as const,
  'sent' as const,
  'delivered' as const,
  'read' as const,
);

// ============================================================================
// Property 5: Message persistence with required fields
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 5: Message persistence with required fields
 *
 * For any WhatsApp message (inbound or outbound) processed by the system,
 * the stored message record SHALL contain a non-null direction, type,
 * content JSON, and timestamp.
 *
 * **Validates: Requirements 2.6, 3.7, 10.1**
 */
describe('Property 5: Message persistence with required fields', () => {
  let WhatsAppMessageService: typeof import('../services/whatsapp-message-service').WhatsAppMessageService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/whatsapp-message-service');
    WhatsAppMessageService = mod.WhatsAppMessageService;
  });

  test.prop(
    [
      fc.string({ minLength: 5, maxLength: 30 }),  // channelId
      fc.string({ minLength: 5, maxLength: 30 }),  // conversationId
      fc.string({ minLength: 5, maxLength: 30 }),  // waMessageId
      fc.string({ minLength: 5, maxLength: 20 }),  // from phone
      anyNonInteractiveContentArb,                  // content
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), // timestamp
    ],
    { numRuns: 100 },
  )(
    'inbound messages are stored with non-null direction, type, content, and timestamp',
    async (channelId, conversationId, waMessageId, from, content, timestamp) => {
      // Mock insert to return the values that were passed in
      mockInsertReturning.mockImplementation((vals: Record<string, unknown>) => [{
        id: 'msg-test',
        ...vals,
      }]);

      const result = await WhatsAppMessageService.storeInboundMessage(
        channelId, conversationId, waMessageId, from, content, timestamp
      );

      expect(result.direction).toBe('inbound');
      expect(result.direction).not.toBeNull();
      expect(result.type).not.toBeNull();
      expect(result.type).toBe(content.type);
      expect(result.content).not.toBeNull();
      expect(result.createdAt).not.toBeNull();
    },
  );

  test.prop(
    [
      fc.string({ minLength: 5, maxLength: 30 }),  // channelId
      fc.string({ minLength: 5, maxLength: 30 }),  // conversationId
      anyNonInteractiveContentArb,                  // content
      fc.boolean(),                                 // aiGenerated
    ],
    { numRuns: 100 },
  )(
    'outbound messages are stored with non-null direction, type, content, and timestamp',
    async (channelId, conversationId, content, aiGenerated) => {
      mockInsertReturning.mockImplementation((vals: Record<string, unknown>) => [{
        id: 'msg-test',
        createdAt: new Date(),
        ...vals,
      }]);

      const result = await WhatsAppMessageService.storeOutboundMessage(
        channelId, conversationId, content, aiGenerated
      );

      expect(result.direction).toBe('outbound');
      expect(result.direction).not.toBeNull();
      expect(result.type).not.toBeNull();
      expect(result.type).toBe(content.type);
      expect(result.content).not.toBeNull();
      expect(result.createdAt).not.toBeNull();
    },
  );
});

// ============================================================================
// Property 6: Message status state transitions
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 6: Message status state transitions
 *
 * For any outbound WhatsApp message, receiving a status update SHALL update
 * the message record's status field, and the status SHALL only transition
 * forward in the sequence: pending → sent → delivered → read
 * (no backward transitions).
 *
 * **Validates: Requirements 2.7**
 */
describe('Property 6: Message status state transitions', () => {
  let WhatsAppMessageService: typeof import('../services/whatsapp-message-service').WhatsAppMessageService;

  const STATUS_ORDER: Record<string, number> = {
    pending: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    failed: -1,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/whatsapp-message-service');
    WhatsAppMessageService = mod.WhatsAppMessageService;
  });

  test.prop(
    [
      nonFailedStatusArb, // current status
      nonFailedStatusArb, // new status
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    ],
    { numRuns: 100 },
  )(
    'forward transitions are applied, backward transitions are silently ignored',
    async (currentStatus, newStatus, timestamp) => {
      mockFindFirst.mockResolvedValue({
        id: 'msg-1',
        waMessageId: 'wamid.test',
        status: currentStatus,
      });
      mockUpdateSetWhere.mockClear();

      await WhatsAppMessageService.updateMessageStatus('wamid.test', newStatus, timestamp);

      const currentOrder = STATUS_ORDER[currentStatus];
      const newOrder = STATUS_ORDER[newStatus];

      if (newOrder > currentOrder) {
        // Forward transition — update should have been called
        expect(mockUpdateSetWhere).toHaveBeenCalled();
        const setArg = mockUpdateSetWhere.mock.calls[0][0];
        expect(setArg.status).toBe(newStatus);
      } else {
        // Backward or same — update should NOT have been called
        expect(mockUpdateSetWhere).not.toHaveBeenCalled();
      }
    },
  );

  test.prop(
    [
      nonFailedStatusArb, // current status (any non-failed)
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    ],
    { numRuns: 100 },
  )(
    'failed status can be set from any state',
    async (currentStatus, timestamp) => {
      mockFindFirst.mockResolvedValue({
        id: 'msg-1',
        waMessageId: 'wamid.test',
        status: currentStatus,
      });
      mockUpdateSetWhere.mockClear();

      await WhatsAppMessageService.updateMessageStatus('wamid.test', 'failed', timestamp);

      expect(mockUpdateSetWhere).toHaveBeenCalled();
      const setArg = mockUpdateSetWhere.mock.calls[0][0];
      expect(setArg.status).toBe('failed');
    },
  );
});

// ============================================================================
// Property 7: Session window enforcement
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 7: Session window enforcement
 *
 * For any Conversation, if the session window is active (expiry timestamp
 * is in the future), the system SHALL allow sending session messages.
 * If the session window is expired or absent, the system SHALL require
 * template messages for outbound communication.
 *
 * **Validates: Requirements 3.1, 3.2, 7.7**
 */
describe('Property 7: Session window enforcement', () => {
  let WhatsAppMessageService: typeof import('../services/whatsapp-message-service').WhatsAppMessageService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/whatsapp-message-service');
    WhatsAppMessageService = mod.WhatsAppMessageService;
  });

  test.prop(
    [
      fc.integer({ min: 1, max: 24 * 365 }), // hours in the future
    ],
    { numRuns: 100 },
  )(
    'session window is active when expiry is in the future',
    async (hoursAhead) => {
      const future = new Date();
      future.setHours(future.getHours() + hoursAhead);

      mockFindFirst.mockResolvedValue({
        id: 'conv-1',
        sessionWindowExpiresAt: future,
      });

      const active = await WhatsAppMessageService.isSessionWindowActive('conv-1');
      expect(active).toBe(true);
    },
  );

  test.prop(
    [
      fc.integer({ min: 1, max: 24 * 365 }), // hours in the past
    ],
    { numRuns: 100 },
  )(
    'session window is inactive when expiry is in the past',
    async (hoursBehind) => {
      const past = new Date();
      past.setHours(past.getHours() - hoursBehind);

      mockFindFirst.mockResolvedValue({
        id: 'conv-1',
        sessionWindowExpiresAt: past,
      });

      const active = await WhatsAppMessageService.isSessionWindowActive('conv-1');
      expect(active).toBe(false);
    },
  );

  test.prop(
    [fc.string({ minLength: 5, maxLength: 30 })], // conversationId
    { numRuns: 100 },
  )(
    'session window is inactive when expiry is null',
    async (conversationId) => {
      mockFindFirst.mockResolvedValue({
        id: conversationId,
        sessionWindowExpiresAt: null,
      });

      const active = await WhatsAppMessageService.isSessionWindowActive(conversationId);
      expect(active).toBe(false);
    },
  );

  test.prop(
    [fc.string({ minLength: 5, maxLength: 30 })], // conversationId
    { numRuns: 100 },
  )(
    'session window is inactive when conversation is not found',
    async (conversationId) => {
      mockFindFirst.mockResolvedValue(undefined);

      const active = await WhatsAppMessageService.isSessionWindowActive(conversationId);
      expect(active).toBe(false);
    },
  );
});

// ============================================================================
// Property 8: Interactive message validation limits
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 8: Interactive message validation limits
 *
 * For any interactive WhatsApp message, if the message contains buttons,
 * the count SHALL be at most 3. If the message contains a list, the total
 * row count across all sections SHALL be at most 10. Messages exceeding
 * these limits SHALL be rejected.
 *
 * **Validates: Requirements 3.3**
 */
describe('Property 8: Interactive message validation limits', () => {
  let validateInteractiveMessage: typeof import('../services/whatsapp-message-service').validateInteractiveMessage;

  beforeEach(async () => {
    const mod = await import('../services/whatsapp-message-service');
    validateInteractiveMessage = mod.validateInteractiveMessage;
  });

  // Generator for a button reply object
  const buttonArb = fc.record({
    type: fc.constant('reply' as const),
    reply: fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      title: fc.string({ minLength: 1, maxLength: 20 }),
    }),
  });

  // Generator for a list row
  const rowArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    title: fc.string({ minLength: 1, maxLength: 20 }),
    description: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  });

  // Generator for a list section with a given number of rows
  const sectionArb = (rowCount: number) => fc.record({
    title: fc.string({ minLength: 1, maxLength: 30 }),
    rows: fc.array(rowArb, { minLength: rowCount, maxLength: rowCount }),
  });

  test.prop(
    [fc.integer({ min: 0, max: 3 })],
    { numRuns: 100 },
  )(
    'button messages with 0-3 buttons are accepted',
    (buttonCount) => {
      const buttons = Array.from({ length: buttonCount }, (_, i) => ({
        type: 'reply' as const,
        reply: { id: `btn-${i}`, title: `Button ${i}` },
      }));

      const content: WhatsAppMessageContent = {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Choose' },
          action: { buttons },
        },
      };

      expect(() => validateInteractiveMessage(content)).not.toThrow();
    },
  );

  test.prop(
    [fc.integer({ min: 4, max: 20 })],
    { numRuns: 100 },
  )(
    'button messages with more than 3 buttons are rejected',
    (buttonCount) => {
      const buttons = Array.from({ length: buttonCount }, (_, i) => ({
        type: 'reply' as const,
        reply: { id: `btn-${i}`, title: `Button ${i}` },
      }));

      const content: WhatsAppMessageContent = {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Choose' },
          action: { buttons },
        },
      };

      expect(() => validateInteractiveMessage(content)).toThrow(/exceeds limit/);
    },
  );

  test.prop(
    [fc.integer({ min: 0, max: 10 })],
    { numRuns: 100 },
  )(
    'list messages with 0-10 total rows are accepted',
    (totalRows) => {
      // Distribute rows across 1-3 sections
      const sections = [];
      let remaining = totalRows;
      while (remaining > 0) {
        const count = Math.min(remaining, Math.ceil(remaining / 2));
        sections.push({
          title: `Section ${sections.length}`,
          rows: Array.from({ length: count }, (_, i) => ({
            id: `row-${sections.length}-${i}`,
            title: `Row ${i}`,
          })),
        });
        remaining -= count;
      }

      const content: WhatsAppMessageContent = {
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: 'Pick' },
          action: { sections },
        },
      };

      expect(() => validateInteractiveMessage(content)).not.toThrow();
    },
  );

  test.prop(
    [fc.integer({ min: 11, max: 30 })],
    { numRuns: 100 },
  )(
    'list messages with more than 10 total rows are rejected',
    (totalRows) => {
      // Put all rows in a single section for simplicity
      const content: WhatsAppMessageContent = {
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: 'Pick' },
          action: {
            sections: [{
              title: 'All items',
              rows: Array.from({ length: totalRows }, (_, i) => ({
                id: `row-${i}`,
                title: `Row ${i}`,
              })),
            }],
          },
        },
      };

      expect(() => validateInteractiveMessage(content)).toThrow(/exceeds limit/);
    },
  );

  test.prop(
    [anyNonInteractiveContentArb],
    { numRuns: 100 },
  )(
    'non-interactive messages are never rejected by interactive validation',
    (content) => {
      expect(() => validateInteractiveMessage(content)).not.toThrow();
    },
  );
});

// ============================================================================
// Property 9: Session window refresh on inbound message
// ============================================================================

/**
 * Feature: whatsapp-ai-concierge, Property 9: Session window refresh on inbound message
 *
 * For any Conversation, when an inbound message is received, the session
 * window expiry timestamp SHALL be updated to exactly 24 hours from the
 * message receipt time.
 *
 * **Validates: Requirements 3.5**
 */
describe('Property 9: Session window refresh on inbound message', () => {
  let WhatsAppMessageService: typeof import('../services/whatsapp-message-service').WhatsAppMessageService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/whatsapp-message-service');
    WhatsAppMessageService = mod.WhatsAppMessageService;
  });

  test.prop(
    [fc.string({ minLength: 5, maxLength: 30 })], // conversationId
    { numRuns: 100 },
  )(
    'refreshSessionWindow sets expiry to 24 hours from now',
    async (conversationId) => {
      mockUpdateSetWhere.mockClear();

      const beforeCall = new Date();
      await WhatsAppMessageService.refreshSessionWindow(conversationId);
      const afterCall = new Date();

      expect(mockUpdateSetWhere).toHaveBeenCalled();
      const setArg = mockUpdateSetWhere.mock.calls[0][0];
      const expiresAt = setArg.sessionWindowExpiresAt as Date;

      expect(expiresAt).toBeInstanceOf(Date);

      // The expiry should be ~24 hours from now (within a small tolerance)
      const expectedMin = new Date(beforeCall.getTime() + 24 * 60 * 60 * 1000 - 5000);
      const expectedMax = new Date(afterCall.getTime() + 24 * 60 * 60 * 1000 + 5000);

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    },
  );

  test.prop(
    [
      fc.string({ minLength: 5, maxLength: 30 }), // conversationId
      fc.string({ minLength: 5, maxLength: 30 }), // another conversationId
    ],
    { numRuns: 100 },
  )(
    'each refresh call produces a new expiry timestamp',
    async (convId1, convId2) => {
      mockUpdateSetWhere.mockClear();

      await WhatsAppMessageService.refreshSessionWindow(convId1);
      const firstExpiry = (mockUpdateSetWhere.mock.calls[0][0] as Record<string, unknown>).sessionWindowExpiresAt as Date;

      mockUpdateSetWhere.mockClear();

      await WhatsAppMessageService.refreshSessionWindow(convId2);
      const secondExpiry = (mockUpdateSetWhere.mock.calls[0][0] as Record<string, unknown>).sessionWindowExpiresAt as Date;

      // Both should be approximately 24 hours from now
      const now = new Date();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const tolerance = 10000; // 10 seconds

      expect(Math.abs(firstExpiry.getTime() - now.getTime() - twentyFourHoursMs)).toBeLessThan(tolerance);
      expect(Math.abs(secondExpiry.getTime() - now.getTime() - twentyFourHoursMs)).toBeLessThan(tolerance);
    },
  );
});
