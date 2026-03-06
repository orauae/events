import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  validateInteractiveMessage,
  type WhatsAppMessageContent,
} from '../services/whatsapp-message-service';

// ============================================================================
// Unit tests for validateInteractiveMessage (pure function, no DB needed)
// ============================================================================

describe('validateInteractiveMessage', () => {
  it('allows a text message (non-interactive)', () => {
    const content: WhatsAppMessageContent = { type: 'text', text: { body: 'hello' } };
    expect(() => validateInteractiveMessage(content)).not.toThrow();
  });

  it('allows an interactive button message with exactly 3 buttons', () => {
    const content: WhatsAppMessageContent = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Choose one' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: '1', title: 'A' } },
            { type: 'reply', reply: { id: '2', title: 'B' } },
            { type: 'reply', reply: { id: '3', title: 'C' } },
          ],
        },
      },
    };
    expect(() => validateInteractiveMessage(content)).not.toThrow();
  });

  it('rejects an interactive button message with more than 3 buttons', () => {
    const content: WhatsAppMessageContent = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Choose one' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: '1', title: 'A' } },
            { type: 'reply', reply: { id: '2', title: 'B' } },
            { type: 'reply', reply: { id: '3', title: 'C' } },
            { type: 'reply', reply: { id: '4', title: 'D' } },
          ],
        },
      },
    };
    expect(() => validateInteractiveMessage(content)).toThrow(/exceeds limit.*4 buttons.*maximum is 3/);
  });

  it('allows an interactive list message with exactly 10 items across sections', () => {
    const content: WhatsAppMessageContent = {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Pick items' },
        action: {
          sections: [
            {
              title: 'Section A',
              rows: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, title: `Item A${i}` })),
            },
            {
              title: 'Section B',
              rows: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, title: `Item B${i}` })),
            },
          ],
        },
      },
    };
    expect(() => validateInteractiveMessage(content)).not.toThrow();
  });

  it('rejects an interactive list message with more than 10 items total', () => {
    const content: WhatsAppMessageContent = {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Pick items' },
        action: {
          sections: [
            {
              title: 'Section A',
              rows: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, title: `Item A${i}` })),
            },
            {
              title: 'Section B',
              rows: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, title: `Item B${i}` })),
            },
          ],
        },
      },
    };
    expect(() => validateInteractiveMessage(content)).toThrow(/exceeds limit.*11 items.*maximum is 10/);
  });

  it('allows an interactive button message with 0 buttons', () => {
    const content: WhatsAppMessageContent = {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'No buttons' },
        action: { buttons: [] },
      },
    };
    expect(() => validateInteractiveMessage(content)).not.toThrow();
  });

  it('allows an interactive list message with 0 items', () => {
    const content: WhatsAppMessageContent = {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Empty list' },
        action: { sections: [] },
      },
    };
    expect(() => validateInteractiveMessage(content)).not.toThrow();
  });

  it('does not validate non-interactive message types', () => {
    const types: WhatsAppMessageContent[] = [
      { type: 'image', image: { url: 'https://example.com/img.jpg' } },
      { type: 'document', document: { url: 'https://example.com/doc.pdf', filename: 'doc.pdf' } },
      { type: 'location', location: { latitude: 0, longitude: 0 } },
      { type: 'template', template: { name: 'hello', language: { code: 'en' } } },
    ];
    for (const content of types) {
      expect(() => validateInteractiveMessage(content)).not.toThrow();
    }
  });
});

// ============================================================================
// Unit tests for WhatsAppMessageService methods (mocked DB)
// ============================================================================

// Mock the database module
const mockFindFirst = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateSetWhere = vi.fn();

vi.mock('@/db', () => ({
  db: {
    query: {
      whatsappChannels: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
      whatsappMessages: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
      whatsappConversations: {
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
        where: (...args: unknown[]) => {
          mockUpdateSetWhere(...args);
          return { returning: vi.fn(() => []) };
        },
      })),
    })),
  },
}));

// Mock fetch for WhatsApp API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the channel service
vi.mock('../services/whatsapp-channel-service', () => ({
  WhatsAppChannelService: {
    decryptAccessToken: vi.fn(() => 'decrypted-token'),
  },
}));

describe('WhatsAppMessageService', () => {
  let WhatsAppMessageService: typeof import('../services/whatsapp-message-service').WhatsAppMessageService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/whatsapp-message-service');
    WhatsAppMessageService = mod.WhatsAppMessageService;
  });

  describe('sendMessage', () => {
    it('sends a text message via the WhatsApp API', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'channel-1',
        phoneNumberId: 'phone-123',
        isActive: true,
        accessTokenEncrypted: 'encrypted',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.abc123' }] }),
      });

      const result = await WhatsAppMessageService.sendMessage(
        'channel-1',
        '+1234567890',
        { type: 'text', text: { body: 'Hello!' } }
      );

      expect(result.messageId).toBe('wamid.abc123');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('throws when channel is inactive', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'channel-1',
        phoneNumberId: 'phone-123',
        isActive: false,
        accessTokenEncrypted: 'encrypted',
      });

      await expect(
        WhatsAppMessageService.sendMessage('channel-1', '+1234567890', { type: 'text', text: { body: 'Hi' } })
      ).rejects.toThrow(/inactive/);
    });

    it('throws when channel is not found', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      await expect(
        WhatsAppMessageService.sendMessage('nonexistent', '+1234567890', { type: 'text', text: { body: 'Hi' } })
      ).rejects.toThrow(/not found/);
    });

    it('rejects interactive messages exceeding button limit before API call', async () => {
      const content: WhatsAppMessageContent = {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Choose' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: '1', title: 'A' } },
              { type: 'reply', reply: { id: '2', title: 'B' } },
              { type: 'reply', reply: { id: '3', title: 'C' } },
              { type: 'reply', reply: { id: '4', title: 'D' } },
            ],
          },
        },
      };

      await expect(
        WhatsAppMessageService.sendMessage('channel-1', '+1234567890', content)
      ).rejects.toThrow(/exceeds limit/);

      // API should NOT have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('updateMessageStatus', () => {
    it('updates status forward from pending to sent', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'msg-1',
        waMessageId: 'wamid.abc',
        status: 'pending',
      });

      await WhatsAppMessageService.updateMessageStatus('wamid.abc', 'sent', new Date());

      // Should have called update
      expect(mockUpdateSetWhere).toHaveBeenCalled();
    });

    it('ignores backward status transition (read → sent)', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'msg-1',
        waMessageId: 'wamid.abc',
        status: 'read',
      });

      await WhatsAppMessageService.updateMessageStatus('wamid.abc', 'sent', new Date());

      // Should NOT have called update
      expect(mockUpdateSetWhere).not.toHaveBeenCalled();
    });

    it('allows failed status from any state', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'msg-1',
        waMessageId: 'wamid.abc',
        status: 'delivered',
      });

      await WhatsAppMessageService.updateMessageStatus('wamid.abc', 'failed', new Date());

      expect(mockUpdateSetWhere).toHaveBeenCalled();
    });

    it('silently ignores unknown message IDs', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      await WhatsAppMessageService.updateMessageStatus('wamid.unknown', 'sent', new Date());

      expect(mockUpdateSetWhere).not.toHaveBeenCalled();
    });
  });

  describe('isSessionWindowActive', () => {
    it('returns true when session window is in the future', async () => {
      const future = new Date();
      future.setHours(future.getHours() + 12);

      mockFindFirst.mockResolvedValue({
        id: 'conv-1',
        sessionWindowExpiresAt: future,
      });

      const result = await WhatsAppMessageService.isSessionWindowActive('conv-1');
      expect(result).toBe(true);
    });

    it('returns false when session window is in the past', async () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);

      mockFindFirst.mockResolvedValue({
        id: 'conv-1',
        sessionWindowExpiresAt: past,
      });

      const result = await WhatsAppMessageService.isSessionWindowActive('conv-1');
      expect(result).toBe(false);
    });

    it('returns false when session window is null', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'conv-1',
        sessionWindowExpiresAt: null,
      });

      const result = await WhatsAppMessageService.isSessionWindowActive('conv-1');
      expect(result).toBe(false);
    });

    it('returns false when conversation is not found', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const result = await WhatsAppMessageService.isSessionWindowActive('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('storeInboundMessage', () => {
    it('stores an inbound message with correct fields', async () => {
      const timestamp = new Date();
      const content: WhatsAppMessageContent = { type: 'text', text: { body: 'Hello' } };

      mockInsertReturning.mockResolvedValue([{
        id: 'msg-1',
        conversationId: 'conv-1',
        channelId: 'ch-1',
        waMessageId: 'wamid.abc',
        direction: 'inbound',
        type: 'text',
        content,
        status: 'delivered',
        aiGenerated: false,
        createdAt: timestamp,
      }]);

      const result = await WhatsAppMessageService.storeInboundMessage(
        'ch-1', 'conv-1', 'wamid.abc', '+1234567890', content, timestamp
      );

      expect(result.direction).toBe('inbound');
      expect(result.status).toBe('delivered');
      expect(result.aiGenerated).toBe(false);
    });
  });

  describe('storeOutboundMessage', () => {
    it('stores an outbound message with pending status', async () => {
      const content: WhatsAppMessageContent = { type: 'text', text: { body: 'Reply' } };

      mockInsertReturning.mockResolvedValue([{
        id: 'msg-2',
        conversationId: 'conv-1',
        channelId: 'ch-1',
        direction: 'outbound',
        type: 'text',
        content,
        status: 'pending',
        aiGenerated: true,
      }]);

      const result = await WhatsAppMessageService.storeOutboundMessage(
        'ch-1', 'conv-1', content, true
      );

      expect(result.direction).toBe('outbound');
      expect(result.status).toBe('pending');
      expect(result.aiGenerated).toBe(true);
    });
  });
});
