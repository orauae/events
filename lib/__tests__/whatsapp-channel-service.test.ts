import { describe, expect, beforeEach, afterEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { encryptPassword, decryptPassword } from '../services/smtp-service';

// Set up encryption key for tests
process.env.SMTP_ENCRYPTION_KEY = 'test-encryption-key-for-whatsapp-channel-tests';

// Mock the database module — the whatsapp_channels table may not exist yet.
// Property 1 (encryption round-trip) doesn't touch the DB at all.
// Property 2 (one-to-one constraint) uses mocked DB responses.
const mockFindFirst = vi.fn();
const mockInsertReturning = vi.fn();

vi.mock('@/db', () => ({
  db: {
    query: {
      whatsappChannels: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: () => mockInsertReturning(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => []),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
  whatsappChannels: {},
  events: {},
}));

/**
 * Feature: whatsapp-ai-concierge, Property 1: Access token encryption round-trip
 *
 * For any valid WhatsApp access token string, encrypting the token using the
 * system's encryption function and then decrypting the result SHALL produce
 * the original token string.
 *
 * **Validates: Requirements 1.3**
 */
describe('Property 1: Access token encryption round-trip', () => {
  test.prop(
    [fc.string({ minLength: 1, maxLength: 500 })],
    { numRuns: 100 },
  )(
    'encrypting and decrypting any access token string produces the original token',
    (token) => {
      const encrypted = encryptPassword(token);
      const decrypted = decryptPassword(encrypted);

      expect(decrypted).toBe(token);
    },
  );

  test.prop(
    [fc.string({ minLength: 1, maxLength: 200 })],
    { numRuns: 100 },
  )(
    'encrypted output is always different from the plaintext input',
    (token) => {
      const encrypted = encryptPassword(token);

      expect(encrypted).not.toBe(token);
    },
  );

  test.prop(
    [fc.string({ minLength: 1, maxLength: 200 })],
    { numRuns: 100 },
  )(
    'two encryptions of the same token produce different ciphertexts (random IV)',
    (token) => {
      const encrypted1 = encryptPassword(token);
      const encrypted2 = encryptPassword(token);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decryptPassword(encrypted1)).toBe(token);
      expect(decryptPassword(encrypted2)).toBe(token);
    },
  );

  test.prop(
    [fc.string({ minLength: 1, maxLength: 300, unit: 'grapheme' })],
    { numRuns: 100 },
  )(
    'round-trip works for tokens with unicode/grapheme characters',
    (token) => {
      const encrypted = encryptPassword(token);
      const decrypted = decryptPassword(encrypted);

      expect(decrypted).toBe(token);
    },
  );
});


/**
 * Feature: whatsapp-ai-concierge, Property 2: One-to-one event-channel constraint
 *
 * For any event that already has a WhatsApp_Channel, attempting to create a
 * second WhatsApp_Channel for the same event SHALL be rejected by the system.
 *
 * **Validates: Requirements 1.5**
 */
describe('Property 2: One-to-one event-channel constraint', () => {
  let WhatsAppChannelService: typeof import('../services/whatsapp-channel-service').WhatsAppChannelService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/whatsapp-channel-service');
    WhatsAppChannelService = mod.WhatsAppChannelService;

    // Mock validateCredentials to always succeed — we're testing the constraint, not Meta API
    vi.spyOn(WhatsAppChannelService, 'validateCredentials').mockResolvedValue({
      valid: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.prop(
    [
      fc.record({
        eventId: fc.string({ minLength: 5, maxLength: 30 }).filter((s) => s.trim().length > 0),
        phoneNumberId: fc.string({ minLength: 5, maxLength: 30 }).filter((s) => s.trim().length > 0),
        whatsappBusinessAccountId: fc.string({ minLength: 5, maxLength: 30 }).filter((s) => s.trim().length > 0),
        accessToken: fc.string({ minLength: 10, maxLength: 100 }).filter((s) => s.trim().length > 0),
        verifyToken: fc.string({ minLength: 5, maxLength: 50 }).filter((s) => s.trim().length > 0),
      }),
    ],
    { numRuns: 100 },
  )(
    'creating a second channel for an event that already has one is rejected',
    async (config) => {
      // Simulate that a channel already exists for this event
      mockFindFirst.mockResolvedValue({
        id: 'existing-channel-id',
        eventId: config.eventId,
        phoneNumberId: 'existing-phone',
        whatsappBusinessAccountId: 'existing-waba',
        accessTokenEncrypted: 'encrypted',
        verifyToken: 'verify',
        isActive: true,
      });

      await expect(
        WhatsAppChannelService.create(config),
      ).rejects.toThrow(/already has a WhatsApp channel/);
    },
  );

  test.prop(
    [
      fc.record({
        eventId: fc.string({ minLength: 5, maxLength: 30 }).filter((s) => s.trim().length > 0),
        phoneNumberId: fc.string({ minLength: 5, maxLength: 30 }).filter((s) => s.trim().length > 0),
        whatsappBusinessAccountId: fc.string({ minLength: 5, maxLength: 30 }).filter((s) => s.trim().length > 0),
        accessToken: fc.string({ minLength: 10, maxLength: 100 }).filter((s) => s.trim().length > 0),
        verifyToken: fc.string({ minLength: 5, maxLength: 50 }).filter((s) => s.trim().length > 0),
      }),
    ],
    { numRuns: 100 },
  )(
    'creating the first channel for an event succeeds when no channel exists',
    async (config) => {
      // Simulate no existing channel
      mockFindFirst.mockResolvedValue(undefined);

      // Simulate successful insert
      const fakeChannel = {
        id: 'new-channel-id',
        eventId: config.eventId,
        phoneNumberId: config.phoneNumberId,
        whatsappBusinessAccountId: config.whatsappBusinessAccountId,
        accessTokenEncrypted: encryptPassword(config.accessToken),
        verifyToken: config.verifyToken,
        unknownGuestTemplateId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockInsertReturning.mockResolvedValue([fakeChannel]);

      const result = await WhatsAppChannelService.create(config);

      expect(result).toBeDefined();
      expect(result.eventId).toBe(config.eventId);
    },
  );
});
