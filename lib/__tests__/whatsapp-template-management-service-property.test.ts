import { describe, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * @fileoverview Property-based tests for WhatsApp Template Management Service
 *
 * Feature: whatsapp-template-management
 * - Property 4: Create template sets PENDING status
 * - Property 5: Edit template resets to PENDING
 * - Property 6: Delete template soft-deletes locally
 * - Property 7: API error preserves local state on create/edit
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
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

// ============================================================================
// Mocks
// ============================================================================

/**
 * Build a mock `db` that simulates insert, update, and query operations
 * against the in-memory templateStore for the management service.
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
      },
      whatsappTemplates: {
        findFirst: vi.fn().mockImplementation(({ where }: { where?: unknown }) => {
          // Return the first template from the store (used by editTemplate to look up existing)
          // The actual where clause uses eq(whatsappTemplates.id, templateId)
          // We'll return the first non-deleted template for simplicity
          const found = templateStore.find((r) => !r.isDeleted);
          return Promise.resolve(found ?? undefined);
        }),
      },
    },
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => ({
        returning: vi.fn().mockImplementation(() => {
          idCounter++;
          const newRow: TemplateRow = {
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
          };
          templateStore.push(newRow);
          return Promise.resolve([newRow]);
        }),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((setVals: Record<string, unknown>) => ({
        where: vi.fn().mockImplementation(() => {
          // For editTemplate: updates status to PENDING and components
          // For deleteTemplate: sets isDeleted to true
          if (setVals.status === 'PENDING' && setVals.components !== undefined) {
            // Edit operation — update the first matching template
            const target = templateStore.find((r) => !r.isDeleted);
            if (target) {
              target.status = 'PENDING';
              target.components = setVals.components as unknown[];
              target.updatedAt = setVals.updatedAt as Date;
            }
            return {
              returning: vi.fn().mockImplementation(() =>
                Promise.resolve(target ? [target] : []),
              ),
            };
          }
          if (setVals.isDeleted === true) {
            // Delete operation — soft-delete matching templates by wabaId + name
            for (const row of templateStore) {
              if (row.wabaId === 'waba-123') {
                row.isDeleted = true;
                row.updatedAt = setVals.updatedAt as Date;
              }
            }
          }
          return Promise.resolve();
        }),
      })),
    })),
  };
}

const mockDb = buildDbMock();

vi.mock('@/db', () => ({
  db: mockDb,
}));

vi.mock('@/db/schema', () => ({
  whatsappChannels: { id: 'id', whatsappBusinessAccountId: 'waba_id' },
  whatsappTemplates: {
    id: 'id',
    wabaId: 'waba_id',
    metaTemplateId: 'meta_template_id',
    name: 'name',
    category: 'category',
    status: 'status',
    isDeleted: 'is_deleted',
  },
  whatsappTemplateFavorites: {
    userId: 'user_id',
    templateId: 'template_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  ilike: vi.fn((...args: unknown[]) => ({ type: 'ilike', args })),
  asc: vi.fn((...args: unknown[]) => ({ type: 'asc', args })),
}));

vi.mock('../services/whatsapp-channel-service', () => ({
  WhatsAppChannelService: {
    decryptAccessToken: vi.fn(() => 'decrypted-token'),
  },
}));

// ============================================================================
// Generators
// ============================================================================

const categoryArb = fc.constantFrom('MARKETING' as const, 'UTILITY' as const, 'AUTHENTICATION' as const);
const statusArb = fc.constantFrom('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED');
const languageArb = fc.constantFrom('en_US', 'ar', 'fr_FR', 'es', 'de', 'pt_BR');

/** Generates a valid TemplateComponent array. */
const componentsArb = fc
  .array(
    fc.record({
      type: fc.constantFrom('HEADER' as const, 'BODY' as const, 'FOOTER' as const, 'BUTTONS' as const),
      text: fc.stringMatching(/^[A-Za-z0-9 ]{1,50}$/),
    }),
    { minLength: 1, maxLength: 4 },
  );

/** Generates a valid CreateTemplateInput. */
const createInputArb = fc.record({
  name: fc.stringMatching(/^[a-z_]{3,20}$/),
  category: categoryArb,
  language: languageArb,
  components: componentsArb,
});

/** Generates a valid EditTemplateInput. */
const editInputArb = fc.record({
  components: componentsArb,
});

/** Generates a Meta API template ID returned on create. */
const metaTemplateIdArb = fc.stringMatching(/^[0-9]{10,18}$/);

/** Generates a local template row for pre-populating the store. */
const localTemplateRowArb = (wabaId: string) =>
  fc.record({
    metaTemplateId: fc.stringMatching(/^[0-9]{10,18}$/),
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

/** Sets up global.fetch to return a successful Meta API create response. */
function mockFetchCreateSuccess(metaId: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: metaId, status: 'PENDING', category: 'MARKETING' }),
  });
}

/** Sets up global.fetch to return a successful Meta API edit response. */
function mockFetchEditSuccess() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
}

/** Sets up global.fetch to return a successful Meta API delete response. */
function mockFetchDeleteSuccess() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
}

/** Sets up global.fetch to return a Meta API validation error. */
function mockFetchWithError(message = 'Invalid template format') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ error: { message, type: 'OAuthException', code: 100 } }),
  });
}

// ============================================================================
// Property 4: Create template sets PENDING status
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 4: Create template sets PENDING status
 *
 * For any valid create template input (name, category, language, components),
 * after a successful create operation, the resulting local record should have
 * status equal to PENDING and contain the meta_template_id returned by the
 * Meta API.
 *
 * **Validates: Requirements 2.1, 2.5**
 */
describe('Property 4: Create template sets PENDING status', () => {
  let WhatsAppTemplateManagementService: typeof import('../services/whatsapp-template-management-service').WhatsAppTemplateManagementService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStore();
    // Rebuild mock to reset call tracking
    mockDb.query.whatsappChannels.findFirst.mockImplementation(() =>
      Promise.resolve({
        id: 'channel-1',
        whatsappBusinessAccountId: 'waba-123',
        accessTokenEncrypted: 'encrypted-token',
        isActive: true,
      }),
    );
    const mod = await import('../services/whatsapp-template-management-service');
    WhatsAppTemplateManagementService = mod.WhatsAppTemplateManagementService;
  });

  test.prop(
    [createInputArb, metaTemplateIdArb],
    { numRuns: 100 },
  )(
    'after create, local record has PENDING status and correct meta_template_id',
    async (input, metaId) => {
      mockFetchCreateSuccess(metaId);

      const result = await WhatsAppTemplateManagementService.createTemplate('channel-1', input);

      // The returned record should have PENDING status
      expect(result.status).toBe('PENDING');
      // The returned record should contain the meta_template_id from Meta API
      expect(result.metaTemplateId).toBe(metaId);
      // The record should exist in the store
      const stored = templateStore.find((r) => r.metaTemplateId === metaId);
      expect(stored).toBeDefined();
      expect(stored!.status).toBe('PENDING');
      expect(stored!.name).toBe(input.name);
      expect(stored!.category).toBe(input.category);
      expect(stored!.language).toBe(input.language);
      expect(stored!.isDeleted).toBe(false);
    },
  );
});

// ============================================================================
// Property 5: Edit template resets to PENDING
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 5: Edit template resets to PENDING
 *
 * For any existing template with any status, after a successful edit operation,
 * the local record's status should be PENDING.
 *
 * **Validates: Requirements 2.2**
 */
describe('Property 5: Edit template resets to PENDING', () => {
  let WhatsAppTemplateManagementService: typeof import('../services/whatsapp-template-management-service').WhatsAppTemplateManagementService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStore();
    mockDb.query.whatsappChannels.findFirst.mockImplementation(() =>
      Promise.resolve({
        id: 'channel-1',
        whatsappBusinessAccountId: 'waba-123',
        accessTokenEncrypted: 'encrypted-token',
        isActive: true,
      }),
    );
    const mod = await import('../services/whatsapp-template-management-service');
    WhatsAppTemplateManagementService = mod.WhatsAppTemplateManagementService;
  });

  test.prop(
    [localTemplateRowArb('waba-123'), editInputArb],
    { numRuns: 100 },
  )(
    'after edit, local record status is PENDING regardless of previous status',
    async (existingTemplate, editInput) => {
      // Pre-populate the store with the existing template
      resetStore([existingTemplate]);

      // Mock the query to find the existing template by ID
      mockDb.query.whatsappTemplates.findFirst.mockImplementation(() =>
        Promise.resolve(existingTemplate),
      );

      // Mock the update to apply changes to the store
      mockDb.update.mockImplementation(() => ({
        set: vi.fn().mockImplementation((setVals: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => {
            // Apply the edit to the store
            const target = templateStore.find((r) => r.id === existingTemplate.id);
            if (target) {
              target.status = setVals.status as string;
              target.components = setVals.components as unknown[];
              target.updatedAt = setVals.updatedAt as Date;
            }
            return {
              returning: vi.fn().mockImplementation(() =>
                Promise.resolve(target ? [target] : []),
              ),
            };
          }),
        })),
      }));

      mockFetchEditSuccess();

      const previousStatus = existingTemplate.status;
      const result = await WhatsAppTemplateManagementService.editTemplate(
        'channel-1',
        existingTemplate.id,
        editInput,
      );

      // Status should be PENDING regardless of what it was before
      expect(result.status).toBe('PENDING');
      // Verify in the store as well
      const stored = templateStore.find((r) => r.id === existingTemplate.id);
      expect(stored).toBeDefined();
      expect(stored!.status).toBe('PENDING');
      // The previous status could have been anything
      expect(['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED']).toContain(previousStatus);
    },
  );
});

// ============================================================================
// Property 6: Delete template soft-deletes locally
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 6: Delete template soft-deletes locally
 *
 * For any existing template, after a successful delete operation, the local
 * record's is_deleted should be true.
 *
 * **Validates: Requirements 2.3**
 */
describe('Property 6: Delete template soft-deletes locally', () => {
  let WhatsAppTemplateManagementService: typeof import('../services/whatsapp-template-management-service').WhatsAppTemplateManagementService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStore();
    mockDb.query.whatsappChannels.findFirst.mockImplementation(() =>
      Promise.resolve({
        id: 'channel-1',
        whatsappBusinessAccountId: 'waba-123',
        accessTokenEncrypted: 'encrypted-token',
        isActive: true,
      }),
    );
    const mod = await import('../services/whatsapp-template-management-service');
    WhatsAppTemplateManagementService = mod.WhatsAppTemplateManagementService;
  });

  test.prop(
    [localTemplateRowArb('waba-123')],
    { numRuns: 100 },
  )(
    'after delete, local record has is_deleted=true',
    async (existingTemplate) => {
      // Pre-populate the store
      resetStore([existingTemplate]);

      // Mock the update to apply soft-delete to the store
      mockDb.update.mockImplementation(() => ({
        set: vi.fn().mockImplementation((setVals: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => {
            if (setVals.isDeleted === true) {
              // Soft-delete templates matching the name and wabaId
              for (const row of templateStore) {
                if (row.wabaId === 'waba-123' && row.name === existingTemplate.name) {
                  row.isDeleted = true;
                  row.updatedAt = setVals.updatedAt as Date;
                }
              }
            }
            return Promise.resolve();
          }),
        })),
      }));

      mockFetchDeleteSuccess();

      await WhatsAppTemplateManagementService.deleteTemplate(
        'channel-1',
        existingTemplate.name,
      );

      // Verify the template is soft-deleted
      const stored = templateStore.find((r) => r.id === existingTemplate.id);
      expect(stored).toBeDefined();
      expect(stored!.isDeleted).toBe(true);
    },
  );
});

// ============================================================================
// Property 7: API error preserves local state on create/edit
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 7: API error preserves local state on create/edit
 *
 * For any existing local template state, if the Meta API returns a validation
 * error during a create or edit operation, the local whatsapp_templates table
 * should remain identical to its state before the operation.
 *
 * **Validates: Requirements 2.4**
 */
describe('Property 7: API error preserves local state on create/edit', () => {
  let WhatsAppTemplateManagementService: typeof import('../services/whatsapp-template-management-service').WhatsAppTemplateManagementService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStore();
    mockDb.query.whatsappChannels.findFirst.mockImplementation(() =>
      Promise.resolve({
        id: 'channel-1',
        whatsappBusinessAccountId: 'waba-123',
        accessTokenEncrypted: 'encrypted-token',
        isActive: true,
      }),
    );
    const mod = await import('../services/whatsapp-template-management-service');
    WhatsAppTemplateManagementService = mod.WhatsAppTemplateManagementService;
  });

  test.prop(
    [
      fc.uniqueArray(
        localTemplateRowArb('waba-123'),
        { minLength: 0, maxLength: 5, comparator: (a, b) => a.metaTemplateId === b.metaTemplateId },
      ),
      createInputArb,
    ],
    { numRuns: 100 },
  )(
    'on API error during create, local state remains unchanged',
    async (existingTemplates, createInput) => {
      // Pre-populate the store
      resetStore(existingTemplates);

      // Deep-copy the state before the operation
      const stateBefore = templateStore.map((r) => ({ ...r }));

      // Mock fetch to return an error
      mockFetchWithError();

      // The create should throw
      await expect(
        WhatsAppTemplateManagementService.createTemplate('channel-1', createInput),
      ).rejects.toThrow();

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

  test.prop(
    [localTemplateRowArb('waba-123'), editInputArb],
    { numRuns: 100 },
  )(
    'on API error during edit, local state remains unchanged',
    async (existingTemplate, editInput) => {
      // Pre-populate the store
      resetStore([existingTemplate]);

      // Mock the query to find the existing template
      mockDb.query.whatsappTemplates.findFirst.mockImplementation(() =>
        Promise.resolve(existingTemplate),
      );

      // Deep-copy the state before the operation
      const stateBefore = templateStore.map((r) => ({ ...r }));

      // Mock fetch to return an error
      mockFetchWithError();

      // The edit should throw
      await expect(
        WhatsAppTemplateManagementService.editTemplate(
          'channel-1',
          existingTemplate.id,
          editInput,
        ),
      ).rejects.toThrow();

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
