import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * @fileoverview Property-based tests for Auto-Save Retry functionality
 *
 * Feature: react-email-editor-migration, Property 8: Auto-Save Retry on Failure
 *
 * Property 8: For any auto-save operation that fails, the system SHALL retry
 * the save operation at least once before notifying the user of the failure.
 *
 * **Validates: Requirements 10.2**
 */

// ============================================================================
// TYPES
// ============================================================================

interface UnlayerDesignJson {
  counters: Record<string, number>;
  body: {
    id?: string;
    rows: unknown[];
    values: Record<string, unknown>;
  };
  schemaVersion?: number;
}

interface UnlayerExportResult {
  design: UnlayerDesignJson;
  html: string;
}

interface AutoSaveResult {
  success: boolean;
  retryCount: number;
  error?: Error;
  notifiedUser: boolean;
}

// ============================================================================
// AUTO-SAVE LOGIC (extracted for testing)
// ============================================================================

/**
 * Auto-save with retry logic
 * This mirrors the logic in the StepDesign component
 * 
 * Requirements: 10.2 - Auto-save retry on failure
 */
async function performAutoSaveWithRetry(
  exportFn: () => Promise<UnlayerExportResult>,
  saveFn: (data: UnlayerExportResult) => Promise<void>,
  onError: (error: Error) => void,
  retryDelayMs: number = 2000
): Promise<AutoSaveResult> {
  let retryCount = 0;
  let notifiedUser = false;

  // First attempt
  try {
    const result = await exportFn();
    await saveFn(result);
    return { success: true, retryCount: 0, notifiedUser: false };
  } catch (firstError) {
    retryCount = 1;
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    
    // Retry attempt
    try {
      const result = await exportFn();
      await saveFn(result);
      return { success: true, retryCount: 1, notifiedUser: false };
    } catch (retryError) {
      // Both attempts failed - notify user
      const error = retryError instanceof Error 
        ? retryError 
        : new Error('Auto-save failed');
      onError(error);
      notifiedUser = true;
      
      return { 
        success: false, 
        retryCount: 1, 
        error, 
        notifiedUser: true 
      };
    }
  }
}

// ============================================================================
// ARBITRARIES
// ============================================================================

/**
 * Arbitrary for Unlayer design JSON
 */
const unlayerDesignArb = fc.record({
  counters: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z_]+$/.test(s)),
    fc.integer({ min: 0, max: 100 })
  ),
  body: fc.record({
    id: fc.option(fc.string({ minLength: 5, maxLength: 20 })),
    rows: fc.array(fc.anything(), { maxLength: 5 }),
    values: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean())
    ),
  }),
  schemaVersion: fc.option(fc.integer({ min: 1, max: 10 })),
}) as fc.Arbitrary<UnlayerDesignJson>;

/**
 * Arbitrary for HTML content
 */
const htmlContentArb = fc.string({ minLength: 10, maxLength: 1000 })
  .map(s => `<!DOCTYPE html><html><body>${s}</body></html>`);

/**
 * Arbitrary for export results
 */
const exportResultArb = fc.record({
  design: unlayerDesignArb,
  html: htmlContentArb,
}) as fc.Arbitrary<UnlayerExportResult>;

/**
 * Arbitrary for error messages
 */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length > 0)
  .map(s => s.trim() || 'An error occurred');

// ============================================================================
// PROPERTY TESTS
// ============================================================================

/**
 * Feature: react-email-editor-migration, Property 8: Auto-Save Retry on Failure
 * **Validates: Requirements 10.2**
 */
describe('Property 8: Auto-Save Retry on Failure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.prop([exportResultArb])(
    'successful auto-save on first attempt does not retry',
    async (exportResult) => {
      const exportFn = vi.fn().mockResolvedValue(exportResult);
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const onError = vi.fn();

      const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(0);
      expect(result.notifiedUser).toBe(false);
      expect(exportFn).toHaveBeenCalledTimes(1);
      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    }
  );

  test.prop([exportResultArb, errorMessageArb])(
    'failed first attempt triggers exactly one retry',
    async (exportResult, errorMessage) => {
      const exportFn = vi.fn()
        .mockRejectedValueOnce(new Error(errorMessage))
        .mockResolvedValueOnce(exportResult);
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const onError = vi.fn();

      const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(result.notifiedUser).toBe(false);
      expect(exportFn).toHaveBeenCalledTimes(2);
      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    }
  );

  test.prop([errorMessageArb, errorMessageArb])(
    'both attempts failing notifies user with error',
    async (firstErrorMsg, secondErrorMsg) => {
      const exportFn = vi.fn()
        .mockRejectedValueOnce(new Error(firstErrorMsg))
        .mockRejectedValueOnce(new Error(secondErrorMsg));
      const saveFn = vi.fn();
      const onError = vi.fn();

      const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(1);
      expect(result.notifiedUser).toBe(true);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe(secondErrorMsg);
      expect(exportFn).toHaveBeenCalledTimes(2);
      expect(saveFn).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    }
  );

  test.prop([exportResultArb, errorMessageArb])(
    'save failure on first attempt triggers retry',
    async (exportResult, errorMessage) => {
      const exportFn = vi.fn().mockResolvedValue(exportResult);
      const saveFn = vi.fn()
        .mockRejectedValueOnce(new Error(errorMessage))
        .mockResolvedValueOnce(undefined);
      const onError = vi.fn();

      const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(result.notifiedUser).toBe(false);
      expect(exportFn).toHaveBeenCalledTimes(2);
      expect(saveFn).toHaveBeenCalledTimes(2);
      expect(onError).not.toHaveBeenCalled();
    }
  );

  test.prop([exportResultArb, errorMessageArb, errorMessageArb])(
    'save failure on both attempts notifies user',
    async (exportResult, firstErrorMsg, secondErrorMsg) => {
      const exportFn = vi.fn().mockResolvedValue(exportResult);
      const saveFn = vi.fn()
        .mockRejectedValueOnce(new Error(firstErrorMsg))
        .mockRejectedValueOnce(new Error(secondErrorMsg));
      const onError = vi.fn();

      const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(1);
      expect(result.notifiedUser).toBe(true);
      expect(result.error).toBeInstanceOf(Error);
      expect(onError).toHaveBeenCalledTimes(1);
    }
  );
});

// ============================================================================
// UNIT TESTS FOR EDGE CASES
// ============================================================================

describe('Auto-Save Retry Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles non-Error exceptions gracefully', async () => {
    const exportFn = vi.fn()
      .mockRejectedValueOnce('string error')
      .mockRejectedValueOnce({ message: 'object error' });
    const saveFn = vi.fn();
    const onError = vi.fn();

    const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('Auto-save failed');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('waits for retry delay before retrying', async () => {
    const exportFn = vi.fn()
      .mockRejectedValueOnce(new Error('first error'))
      .mockResolvedValueOnce({ design: { counters: {}, body: { rows: [], values: {} } }, html: '<html></html>' });
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const retryDelayMs = 2000;

    const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, retryDelayMs);
    
    // First call should happen immediately
    expect(exportFn).toHaveBeenCalledTimes(1);
    
    // Advance time by less than retry delay
    await vi.advanceTimersByTimeAsync(1000);
    expect(exportFn).toHaveBeenCalledTimes(1);
    
    // Advance time to complete retry delay
    await vi.advanceTimersByTimeAsync(1000);
    expect(exportFn).toHaveBeenCalledTimes(2);
    
    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.retryCount).toBe(1);
  });

  it('preserves original error message on retry failure', async () => {
    const originalError = new Error('Network connection lost');
    const exportFn = vi.fn()
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockRejectedValueOnce(originalError);
    const saveFn = vi.fn();
    const onError = vi.fn();

    const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.error?.message).toBe('Network connection lost');
    expect(onError).toHaveBeenCalledWith(originalError);
  });

  it('calls save function with correct export result', async () => {
    const exportResult: UnlayerExportResult = {
      design: {
        counters: { u_row: 1, u_column: 2 },
        body: {
          id: 'test-body',
          rows: [{ id: 'row-1' }],
          values: { backgroundColor: '#ffffff' },
        },
        schemaVersion: 6,
      },
      html: '<!DOCTYPE html><html><body>Test content</body></html>',
    };
    
    const exportFn = vi.fn().mockResolvedValue(exportResult);
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(saveFn).toHaveBeenCalledWith(exportResult);
    expect(saveFn).toHaveBeenCalledWith(
      expect.objectContaining({
        design: expect.objectContaining({
          counters: { u_row: 1, u_column: 2 },
        }),
        html: expect.stringContaining('Test content'),
      })
    );
  });

  it('does not notify user on successful retry', async () => {
    const exportFn = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ design: { counters: {}, body: { rows: [], values: {} } }, html: '<html></html>' });
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    const resultPromise = performAutoSaveWithRetry(exportFn, saveFn, onError, 0);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.notifiedUser).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });
});
