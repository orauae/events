import { describe, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * @fileoverview Property-based tests for WhatsApp Template Sync Service
 *
 * Feature: whatsapp-template-management
 * - Property 1: Sync produces correct local state
 * - Property 2: Sync soft-deletes missing templates
 * - Property 3: Sync error preserves local state
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6**
 */

// ============================================================================
// In-memory DB simulation
// ============================================================================

/** Represents a row in the whatsapp_templates table. */
interface TemplateRow {
  id: string;
  wabaId: string;
  metaTemplateId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown[];
  isDeleted: boolean;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

let templateStore: TemplateRow[] = [];
let idCounter = 0;

function resetStore(initial: TemplateRow[] = []) {
  templateStore = initial.map((r) => ({ ...r }));
  idCounter = initial.length;
}

/**
 * Build a mock `db` that simulates upsert and update operations
 * against the in-memory templateStore.
 */
function buildDbMock() {
  return {
    query: {
      whatsappChannels: {
        findFirst: vi.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'channel-1',
            whatsappBusinessAccountId: 'waba-123',
            accessTokenEncrypted: 'encrypted-token',
            isActive: true,
          }),
        ),
        findMany: vi.fn().mockImplementation(() =>
          Promise.resolve([
            {
              id: 'channel-1',
              whatsappBusinessAccountId: 'waba-123',
              accessTokenEncrypted: 'encrypted-token',
              isActive: true,
            },
          ]),
        ),
      },
    },
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => ({
        onConflictDoUpdate: vi.fn().mockImplementation(
          (opts: { target: unknown; set: Record<string, unknown> }) => {
            // Simulate upsert: find existing by wabaId + metaTemplateId
            const existing = templateStore.find(
              (r) =>
                r.wabaId === vals.wabaId &&
                r.metaTemplateId === vals.metaTemplateId,
            );
            if (existing) {
              // Update
              Object.assign(existing, opts.set);
            } else {
              // Insert
              idCounter++;
              templateStore.push({
                id: `tpl-${idCounter}`,
                wabaId: vals.wabaId as string,
                metaTemplateId: vals.metaTemplateId as string,
                name: vals.name as string,
                language: vals.language as string,
                category: vals.category as string,
                status: vals.status as string,
                components: vals.components as unknown[],
                isDeleted: vals.isDeleted as boolean,
                lastSyncedAt: vals.lastSyncedAt as Date,
                createdAt: new Date(),
                updatedAt: vals.updatedAt as Date,
              });
            }
            return Promise.resolve();
          },
        ),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((setVals: Record<string, unknown>) => ({
        where: vi.fn().mockImplementation(() => {
          // Simulate the soft-delete update:
          // Mark templates for the given wabaId that are NOT in the synced set
          // The actual where clause uses and(eq(wabaId), eq(isDeleted, false), notInArray(metaTemplateId, ids))
          // We capture the intent from setVals (isDeleted: true) and apply it
          // to all non-deleted templates for the waba that weren't just synced.
          //
          // Since we can't easily parse drizzle where clauses in a mock,
          // we track which metaTemplateIds were synced and apply the logic
          // in the test assertions instead. But we DO need the mock to
          // actually perform the soft-delete for the service to work correctly.
          //
          // We'll use a different approach: intercept the update call and
          // apply it based on the tracked synced IDs.
          if (setVals.isDeleted === true) {
            softDeletePending = setVals;
          }
          return Promise.resolve();
        }),
      })),
    })),
  };
}

let softDeletePending: Record<string, unknown> | null = null;

// ============================================================================
// Mocks
// ============================================================================

const mockDb = buildDbMock();

vi.mock('@/db', () => ({
  db: mockDb,
}));

vi.mock('@/db/schema', () => ({
  whatsappChannels: { id: 'id', isActive: 'is_active' },
  whatsappTemplates: {
    wabaId: 'waba_id',
    metaTemplateId: 'meta_template_id',
    isDeleted: 'is_deleted',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  notInArray: vi.fn((...args: unknown[]) => ({ type: 'notInArray', args })),
}));

vi.mock('../services/whatsapp-channel-service', () => ({
  WhatsAppChannelService: {
    decryptAccessToken: vi.fn(() => 'decrypted-token'),
  },
}));

// ============================================================================
// Generators
// ============================================================================

const categoryArb = fc.constantFrom('MARKETING', 'UTILITY', 'AUTHENTICATION');
const statusArb = fc.constantFrom('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED');
const languageArb = fc.constantFrom('en_US', 'ar', 'fr_FR', 'es', 'de', 'pt_BR');

/** Generates a Meta API template object. */
const metaTemplateArb = fc.record({
  id: fc.stringMatching(/^[a-z0-9]{8,16}$/),
  name: fc.stringMatching(/^[a-z_]{3,20}$/),
  language: languageArb,
  category: categoryArb,
  status: statusArb,
  components: fc.constant([{ type: 'BODY', text: 'Hello {{1}}' }]),
});

/** Generates a non-empty array of unique Meta templates (unique by id). */
const uniqueMetaTemplatesArb = fc
  .uniqueArray(metaTemplateArb, {
    minLength: 1,
    maxLength: 15,
    comparator: (a, b) => a.id === b.id,
  });

/** Generates a local template row for pre-populating the store. */
const localTemplateRowArb = (wabaId: string) =>
  fc.record({
    metaTemplateId: fc.stringMatching(/^[a-z0-9]{8,16}$/),
    name: fc.stringMatching(/^[a-z_]{3,20}$/),
    language: languageArb,
    category: categoryArb,
    status: statusArb,
  }).map((t) => ({
    id: `local-${t.metaTemplateId}`,
    wabaId,
    metaTemplateId: t.metaTemplateId,
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    components: [{ type: 'BODY', text: 'Hello' }] as unknown[],
    isDeleted: false,
    lastSyncedAt: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }));

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sets up global.fetch to return a paginated Meta API response.
 */
function mockFetchWithTemplates(templates: Array<{ id: string; name: string; language: string; category: string; status: string; components: unknown[] }>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: templates, paging: {} }),
  });
}

/**
 * Sets up global.fetch to return an error.
 */
function mockFetchWithError() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: () => Promise.resolve({ error: { message: 'API Error' } }),
  });
}

// ============================================================================
// Property 1: Sync produces correct local state
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 1: Sync produces correct local state
 *
 * For any set of templates returned by the Meta API for a given WABA ID,
 * after sync completes, the local whatsapp_templates table should contain
 * a record for each template in the API response with matching waba_id,
 * meta_template_id, name, language, category, status, and components fields,
 * and is_deleted set to false.
 *
 * **Validates: Requirements 1.1, 1.2, 1.4**
 */
describe('Property 1: Sync produces correct local state', () => {
  let WhatsAppTemplateSyncService: typeof import('../services/whatsapp-template-sync-service').WhatsAppTemplateSyncService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStore();
    softDeletePending = null;
    const mod = await import('../services/whatsapp-template-sync-service');
    WhatsAppTemplateSyncService = mod.WhatsAppTemplateSyncService;
  });

  test.prop(
    [uniqueMetaTemplatesArb],
    { numRuns: 100 },
  )(
    'after sync, local store contains a matching record for each API template with is_deleted=false',
    async (apiTemplates) => {
      mockFetchWithTemplates(apiTemplates);

      const result = await WhatsAppTemplateSyncService.syncTemplatesForChannel('channel-1');

      expect(result.synced).toBe(apiTemplates.length);
      expect(result.errors).toBe(0);

      // For each API template, verify a matching local record exists
      for (const tpl of apiTemplates) {
        const local = templateStore.find(
          (r) => r.wabaId === 'waba-123' && r.metaTemplateId === tpl.id,
        );
        expect(local).toBeDefined();
        expect(local!.name).toBe(tpl.name);
        expect(local!.language).toBe(tpl.language);
        expect(local!.category).toBe(tpl.category);
        expect(local!.status).toBe(tpl.status);
        expect(local!.components).toEqual(tpl.components);
        expect(local!.isDeleted).toBe(false);
      }
    },
  );
});

// ============================================================================
// Property 2: Sync soft-deletes missing templates
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 2: Sync soft-deletes missing templates
 *
 * For any set of locally cached templates and any API response that is a
 * strict subset, after sync, every local template whose meta_template_id
 * is absent from the API response should have is_deleted set to true,
 * while templates present in the response should have is_deleted set to false.
 *
 * **Validates: Requirements 1.3**
 */
describe('Property 2: Sync soft-deletes missing templates', () => {
  let WhatsAppTemplateSyncService: typeof import('../services/whatsapp-template-sync-service').WhatsAppTemplateSyncService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStore();
    softDeletePending = null;
    const mod = await import('../services/whatsapp-template-sync-service');
    WhatsAppTemplateSyncService = mod.WhatsAppTemplateSyncService;
  });

  test.prop(
    [
      // Generate local templates (some will be "missing" from API)
      fc.uniqueArray(
        localTemplateRowArb('waba-123'),
        { minLength: 2, maxLength: 10, comparator: (a, b) => a.metaTemplateId === b.metaTemplateId },
      ),
      // Fraction of local templates to keep in API response (0 < fraction < 1)
      fc.double({ min: 0.1, max: 0.9, noNaN: true }),
    ],
    { numRuns: 100 },
  )(
    'templates absent from API response are soft-deleted; present ones have is_deleted=false',
    async (localTemplates, keepFraction) => {
      // Split local templates into "kept" (in API) and "removed" (not in API)
      const splitIndex = Math.max(1, Math.floor(localTemplates.length * keepFraction));
      const keptTemplates = localTemplates.slice(0, splitIndex);
      const removedTemplates = localTemplates.slice(splitIndex);

      // Pre-populate the store with all local templates
      resetStore(localTemplates);

      // Build API response with only the kept templates
      const apiTemplates = keptTemplates.map((t) => ({
        id: t.metaTemplateId,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components as unknown[],
      }));

      mockFetchWithTemplates(apiTemplates);

      // Override the update mock to actually perform soft-deletes on the store
      const syncedMetaIds = apiTemplates.map((t) => t.id);
      mockDb.update.mockImplementation(() => ({
        set: vi.fn().mockImplementation((setVals: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => {
            if (setVals.isDeleted === true) {
              // Soft-delete templates not in the synced set
              for (const row of templateStore) {
                if (
                  row.wabaId === 'waba-123' &&
                  !row.isDeleted &&
                  !syncedMetaIds.includes(row.metaTemplateId)
                ) {
                  row.isDeleted = true;
                  row.updatedAt = setVals.updatedAt as Date;
                }
              }
            }
            return Promise.resolve();
          }),
        })),
      }));

      await WhatsAppTemplateSyncService.syncTemplatesForChannel('channel-1');

      // Verify: kept templates should have is_deleted = false
      for (const kept of keptTemplates) {
        const local = templateStore.find(
          (r) => r.metaTemplateId === kept.metaTemplateId,
        );
        expect(local).toBeDefined();
        expect(local!.isDeleted).toBe(false);
      }

      // Verify: removed templates should have is_deleted = true
      for (const removed of removedTemplates) {
        const local = templateStore.find(
          (r) => r.metaTemplateId === removed.metaTemplateId,
        );
        expect(local).toBeDefined();
        expect(local!.isDeleted).toBe(true);
      }
    },
  );
});

// ============================================================================
// Property 3: Sync error preserves local state
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 3: Sync error preserves local state
 *
 * For any existing set of locally cached templates, if the Meta API returns
 * an error during sync, the local whatsapp_templates table should remain
 * identical to its state before the sync attempt.
 *
 * **Validates: Requirements 1.6**
 */
describe('Property 3: Sync error preserves local state', () => {
  let WhatsAppTemplateSyncService: typeof import('../services/whatsapp-template-sync-service').WhatsAppTemplateSyncService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStore();
    softDeletePending = null;
    const mod = await import('../services/whatsapp-template-sync-service');
    WhatsAppTemplateSyncService = mod.WhatsAppTemplateSyncService;
  });

  test.prop(
    [
      fc.uniqueArray(
        localTemplateRowArb('waba-123'),
        { minLength: 0, maxLength: 10, comparator: (a, b) => a.metaTemplateId === b.metaTemplateId },
      ),
    ],
    { numRuns: 100 },
  )(
    'on API error, local state remains identical to pre-sync state',
    async (localTemplates) => {
      // Pre-populate the store
      resetStore(localTemplates);

      // Deep-copy the state before sync
      const stateBefore = templateStore.map((r) => ({ ...r }));

      // Mock fetch to return an error
      mockFetchWithError();

      const result = await WhatsAppTemplateSyncService.syncTemplatesForChannel('channel-1');

      // Service should report error
      expect(result.synced).toBe(0);
      expect(result.errors).toBe(1);

      // Verify: store is identical to before
      expect(templateStore.length).toBe(stateBefore.length);
      for (let i = 0; i < stateBefore.length; i++) {
        expect(templateStore[i].metaTemplateId).toBe(stateBefore[i].metaTemplateId);
        expect(templateStore[i].name).toBe(stateBefore[i].name);
        expect(templateStore[i].language).toBe(stateBefore[i].language);
        expect(templateStore[i].category).toBe(stateBefore[i].category);
        expect(templateStore[i].status).toBe(stateBefore[i].status);
        expect(templateStore[i].isDeleted).toBe(stateBefore[i].isDeleted);
        expect(templateStore[i].components).toEqual(stateBefore[i].components);
      }
    },
  );
});
