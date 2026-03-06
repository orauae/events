import { describe, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * @fileoverview Property-based tests for WhatsApp Template Favorites
 *
 * Feature: whatsapp-template-management
 * - Property 9: Favorite/unfavorite round-trip
 * - Property 10: Favorites ordering
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

// ============================================================================
// In-memory DB simulation
// ============================================================================

interface FavoriteRow {
  id: string;
  userId: string;
  templateId: string;
  createdAt: Date;
}

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

let favoriteStore: FavoriteRow[] = [];
let templateStore: TemplateRow[] = [];
let favIdCounter = 0;

function resetStores(
  templates: TemplateRow[] = [],
  favorites: FavoriteRow[] = [],
) {
  templateStore = templates.map((r) => ({ ...r }));
  favoriteStore = favorites.map((r) => ({ ...r }));
  favIdCounter = favorites.length;
}

// ============================================================================
// Mocks
// ============================================================================

function buildDbMock() {
  return {
    query: {
      whatsappChannels: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'channel-1',
          whatsappBusinessAccountId: 'waba-123',
          accessTokenEncrypted: 'encrypted-token',
          isActive: true,
        }),
      },
      whatsappTemplates: {
        findFirst: vi.fn().mockImplementation(() => {
          const found = templateStore.find((r) => !r.isDeleted);
          return Promise.resolve(found ?? undefined);
        }),
      },
      whatsappTemplateFavorites: {
        findFirst: vi.fn().mockImplementation((_opts?: unknown) => {
          // The service calls findFirst with a where clause matching userId + templateId.
          // We intercept via the toggleFavorite flow — the mock is overridden per-test.
          return Promise.resolve(undefined);
        }),
      },
    },
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        // Favorites insert
        if (vals.userId !== undefined && vals.templateId !== undefined) {
          favIdCounter++;
          const newRow: FavoriteRow = {
            id: `fav-${favIdCounter}`,
            userId: vals.userId as string,
            templateId: vals.templateId as string,
            createdAt: new Date(),
          };
          favoriteStore.push(newRow);
          return Promise.resolve([newRow]);
        }
        // Template insert (not used in favorites tests but keep for safety)
        return {
          returning: vi.fn().mockResolvedValue([]),
        };
      }),
    })),
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        // Deletion is handled per-test by overriding the mock
        return Promise.resolve();
      }),
    })),
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          // Default: return empty. Overridden per-test.
          return Promise.resolve([]);
        }),
        orderBy: vi.fn().mockImplementation(() => {
          return Promise.resolve([]);
        }),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
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
    id: 'id',
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

const userIdArb = fc.stringMatching(/^user-[a-z0-9]{4,10}$/);
const templateIdArb = fc.stringMatching(/^tpl-[a-z0-9]{4,10}$/);

const categoryArb = fc.constantFrom(
  'MARKETING' as const,
  'UTILITY' as const,
  'AUTHENTICATION' as const,
);
const statusArb = fc.constantFrom(
  'APPROVED',
  'PENDING',
  'REJECTED',
  'PAUSED',
  'DISABLED',
);
const languageArb = fc.constantFrom('en_US', 'ar', 'fr_FR', 'es', 'de', 'pt_BR');

/** Generates a local template row with a unique name for ordering tests. */
const templateRowArb = fc
  .record({
    id: templateIdArb,
    name: fc.stringMatching(/^[a-z]{3,15}$/),
    language: languageArb,
    category: categoryArb,
    status: statusArb,
  })
  .map((t) => ({
    id: t.id,
    wabaId: 'waba-123',
    metaTemplateId: `meta-${t.id}`,
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

/** Generates a list of unique templates (unique by id). */
const uniqueTemplatesArb = fc.uniqueArray(templateRowArb, {
  minLength: 2,
  maxLength: 15,
  comparator: (a, b) => a.id === b.id,
});

// ============================================================================
// Property 9: Favorite/unfavorite round-trip
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 9: Favorite/unfavorite round-trip
 *
 * For any user and any template, favoriting and then unfavoriting should
 * result in no favorite association existing for that (user, template) pair,
 * and the favorites table should return to its original state for that pair.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Property 9: Favorite/unfavorite round-trip', () => {
  let WhatsAppTemplateManagementService: typeof import('../services/whatsapp-template-management-service').WhatsAppTemplateManagementService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStores();
    const mod = await import('../services/whatsapp-template-management-service');
    WhatsAppTemplateManagementService = mod.WhatsAppTemplateManagementService;
  });

  test.prop(
    [userIdArb, templateIdArb],
    { numRuns: 100 },
  )(
    'favoriting then unfavoriting leaves no favorite association',
    async (userId, templateId) => {
      // Start with empty favorites
      resetStores();

      // --- Mock for first call (favorite): findFirst returns undefined ---
      mockDb.query.whatsappTemplateFavorites.findFirst.mockResolvedValueOnce(
        undefined,
      );

      // Mock insert to add to the store
      mockDb.insert.mockImplementationOnce(() => ({
        values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
          favIdCounter++;
          const newRow: FavoriteRow = {
            id: `fav-${favIdCounter}`,
            userId: vals.userId as string,
            templateId: vals.templateId as string,
            createdAt: new Date(),
          };
          favoriteStore.push(newRow);
          return Promise.resolve([newRow]);
        }),
      }));

      // First toggle: should favorite
      const result1 =
        await WhatsAppTemplateManagementService.toggleFavorite(
          userId,
          templateId,
        );
      expect(result1.favorited).toBe(true);

      // Verify the favorite exists in the store
      const afterFavorite = favoriteStore.filter(
        (f) => f.userId === userId && f.templateId === templateId,
      );
      expect(afterFavorite.length).toBe(1);

      // --- Mock for second call (unfavorite): findFirst returns the existing row ---
      const existingFav = afterFavorite[0];
      mockDb.query.whatsappTemplateFavorites.findFirst.mockResolvedValueOnce(
        existingFav,
      );

      // Mock delete to remove from the store
      mockDb.delete.mockImplementationOnce(() => ({
        where: vi.fn().mockImplementation(() => {
          const idx = favoriteStore.findIndex((f) => f.id === existingFav.id);
          if (idx !== -1) favoriteStore.splice(idx, 1);
          return Promise.resolve();
        }),
      }));

      // Second toggle: should unfavorite
      const result2 =
        await WhatsAppTemplateManagementService.toggleFavorite(
          userId,
          templateId,
        );
      expect(result2.favorited).toBe(false);

      // Verify no favorite association exists for this pair
      const afterUnfavorite = favoriteStore.filter(
        (f) => f.userId === userId && f.templateId === templateId,
      );
      expect(afterUnfavorite.length).toBe(0);

      // The store should be back to empty (original state)
      expect(favoriteStore.length).toBe(0);
    },
  );

  test.prop(
    [
      userIdArb,
      templateIdArb,
      // Generate some pre-existing favorites for other users/templates
      fc.array(
        fc.record({ userId: userIdArb, templateId: templateIdArb }),
        { minLength: 0, maxLength: 5 },
      ),
    ],
    { numRuns: 100 },
  )(
    'round-trip does not affect other favorites in the store',
    async (userId, templateId, otherFavorites) => {
      // Pre-populate with other favorites (ensure none match our pair)
      const initialFavorites: FavoriteRow[] = otherFavorites
        .filter((f) => !(f.userId === userId && f.templateId === templateId))
        .map((f, i) => ({
          id: `other-fav-${i}`,
          userId: f.userId,
          templateId: f.templateId,
          createdAt: new Date(),
        }));

      resetStores([], initialFavorites);
      const initialCount = favoriteStore.length;
      const initialSnapshot = favoriteStore.map((f) => ({ ...f }));

      // --- Favorite ---
      mockDb.query.whatsappTemplateFavorites.findFirst.mockResolvedValueOnce(
        undefined,
      );
      mockDb.insert.mockImplementationOnce(() => ({
        values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
          favIdCounter++;
          const newRow: FavoriteRow = {
            id: `fav-${favIdCounter}`,
            userId: vals.userId as string,
            templateId: vals.templateId as string,
            createdAt: new Date(),
          };
          favoriteStore.push(newRow);
          return Promise.resolve([newRow]);
        }),
      }));

      await WhatsAppTemplateManagementService.toggleFavorite(userId, templateId);

      // --- Unfavorite ---
      const addedFav = favoriteStore.find(
        (f) => f.userId === userId && f.templateId === templateId,
      )!;
      mockDb.query.whatsappTemplateFavorites.findFirst.mockResolvedValueOnce(
        addedFav,
      );
      mockDb.delete.mockImplementationOnce(() => ({
        where: vi.fn().mockImplementation(() => {
          const idx = favoriteStore.findIndex((f) => f.id === addedFav.id);
          if (idx !== -1) favoriteStore.splice(idx, 1);
          return Promise.resolve();
        }),
      }));

      await WhatsAppTemplateManagementService.toggleFavorite(userId, templateId);

      // Other favorites should be untouched
      expect(favoriteStore.length).toBe(initialCount);
      for (const original of initialSnapshot) {
        const stillExists = favoriteStore.find((f) => f.id === original.id);
        expect(stillExists).toBeDefined();
        expect(stillExists!.userId).toBe(original.userId);
        expect(stillExists!.templateId).toBe(original.templateId);
      }
    },
  );
});


// ============================================================================
// Property 10: Favorites ordering
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 10: Favorites ordering
 *
 * For any list of templates where some are favorited by a user, the listing
 * function should return all favorited templates before all non-favorited
 * templates, with alphabetical ordering preserved within each group.
 *
 * **Validates: Requirements 4.3**
 */
describe('Property 10: Favorites ordering', () => {
  let WhatsAppTemplateManagementService: typeof import('../services/whatsapp-template-management-service').WhatsAppTemplateManagementService;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStores();
    const mod = await import('../services/whatsapp-template-management-service');
    WhatsAppTemplateManagementService = mod.WhatsAppTemplateManagementService;
  });

  test.prop(
    [
      uniqueTemplatesArb,
      // Fraction of templates to mark as favorites (between 10% and 90%)
      fc.double({ min: 0.1, max: 0.9, noNaN: true }),
      userIdArb,
    ],
    { numRuns: 100 },
  )(
    'favorited templates appear before non-favorited, alphabetical within each group',
    async (templates, favFraction, userId) => {
      // Sort templates alphabetically by name for the DB mock
      const sortedTemplates = [...templates].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      // Split into favorites and non-favorites
      const splitIndex = Math.max(
        1,
        Math.floor(sortedTemplates.length * favFraction),
      );
      const favoriteTemplates = sortedTemplates.slice(0, splitIndex);
      const favoriteIds = new Set(favoriteTemplates.map((t) => t.id));

      resetStores(sortedTemplates);

      // The service makes two db.select() calls:
      // 1st: select({ templateId }).from(favorites).where(...) → returns favorite IDs
      // 2nd: select().from(templates).where(...).orderBy(...) → returns all templates
      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => {
        selectCallCount++;
        const callNum = selectCallCount;
        return {
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              if (callNum === 1) {
                // First call: favorites query (no orderBy chained)
                return Promise.resolve(
                  favoriteTemplates.map((t) => ({ templateId: t.id })),
                );
              }
              // Second call: templates query (orderBy chained)
              return {
                orderBy: vi.fn().mockImplementation(() =>
                  Promise.resolve(
                    sortedTemplates.filter((t) => !t.isDeleted),
                  ),
                ),
              };
            }),
          })),
        };
      });

      const result = await WhatsAppTemplateManagementService.listTemplates(
        'waba-123',
        { userId },
      );

      // Find the boundary between favorites and non-favorites in the result
      let lastFavIndex = -1;
      let firstNonFavIndex = result.length;

      for (let i = 0; i < result.length; i++) {
        if (favoriteIds.has(result[i].id)) {
          lastFavIndex = i;
        } else if (firstNonFavIndex === result.length) {
          firstNonFavIndex = i;
        }
      }

      // All favorites should come before all non-favorites
      expect(lastFavIndex).toBeLessThan(firstNonFavIndex);

      // Extract the two groups from the result
      const resultFavs = result.filter((t) => favoriteIds.has(t.id));
      const resultNonFavs = result.filter((t) => !favoriteIds.has(t.id));

      // Favorites group should be alphabetically ordered
      for (let i = 1; i < resultFavs.length; i++) {
        expect(
          resultFavs[i - 1].name.localeCompare(resultFavs[i].name),
        ).toBeLessThanOrEqual(0);
      }

      // Non-favorites group should be alphabetically ordered
      for (let i = 1; i < resultNonFavs.length; i++) {
        expect(
          resultNonFavs[i - 1].name.localeCompare(resultNonFavs[i].name),
        ).toBeLessThanOrEqual(0);
      }

      // Total count should match
      expect(result.length).toBe(sortedTemplates.filter((t) => !t.isDeleted).length);
    },
  );

  test.prop(
    [uniqueTemplatesArb, userIdArb],
    { numRuns: 100 },
  )(
    'with no favorites, all templates are returned in alphabetical order',
    async (templates, userId) => {
      const sortedTemplates = [...templates].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      resetStores(sortedTemplates);

      // Two db.select() calls: 1st for favorites (empty), 2nd for templates
      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => {
        selectCallCount++;
        const callNum = selectCallCount;
        return {
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              if (callNum === 1) {
                return Promise.resolve([]); // No favorites
              }
              return {
                orderBy: vi.fn().mockImplementation(() =>
                  Promise.resolve(
                    sortedTemplates.filter((t) => !t.isDeleted),
                  ),
                ),
              };
            }),
          })),
        };
      });

      const result = await WhatsAppTemplateManagementService.listTemplates(
        'waba-123',
        { userId },
      );

      // All templates should be in alphabetical order
      for (let i = 1; i < result.length; i++) {
        expect(
          result[i - 1].name.localeCompare(result[i].name),
        ).toBeLessThanOrEqual(0);
      }
    },
  );
});
