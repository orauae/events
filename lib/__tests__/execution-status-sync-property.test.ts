import { describe, expect, beforeEach, afterEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * @fileoverview Property-based tests for execution status sync
 *
 * Feature: automation-trigger-dev-integration, Property 20: Execution Status Sync
 *
 * For any automation execution with a pg-boss job ID, the local execution status
 * SHALL be updated to match the pg-boss job state (running, completed, failed).
 *
 * **Validates: Requirements 10.6**
 */

// Mock pg-boss queue
const mockGetJobById = vi.fn();

vi.mock('@/lib/jobs/queue', () => ({
  getQueue: vi.fn().mockResolvedValue({
    getJobById: (...args: unknown[]) => mockGetJobById(...args),
  }),
}));

// Import after mocking
import {
  ExecutionStatusSyncService,
  mapJobStateToLocal,
  type PgBossJobState,
} from '@/lib/services/execution-status-sync-service';
import type { ExecutionStatus } from '@/db/schema';

/**
 * Arbitrary for pg-boss job states.
 */
const pgBossStateArb = fc.constantFrom<PgBossJobState>(
  'created',
  'retry',
  'active',
  'completed',
  'expired',
  'cancelled',
  'failed'
);

/**
 * Arbitrary for local execution statuses.
 */
const localStatusArb = fc.constantFrom<ExecutionStatus>(
  'Running',
  'Success',
  'Failed',
  'Partial'
);

/**
 * Arbitrary for run IDs.
 */
const runIdArb = fc.string({ minLength: 10, maxLength: 30 }).filter((s) => s.length > 0);

/**
 * Feature: automation-trigger-dev-integration, Property 20: Execution Status Sync
 * **Validates: Requirements 10.6**
 */
describe('Property 20: Execution Status Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property: Status mapping is deterministic and consistent.
   */
  test.prop([pgBossStateArb], { numRuns: 100 })(
    'mapJobStateToLocal is deterministic',
    (jobState) => {
      const result1 = mapJobStateToLocal(jobState);
      const result2 = mapJobStateToLocal(jobState);

      expect(result1).toBe(result2);
      expect(['Running', 'Success', 'Failed', 'Partial']).toContain(result1);
    }
  );

  /**
   * Property: Running states map to Running.
   */
  test.prop(
    [fc.constantFrom<PgBossJobState>('created', 'retry', 'active')],
    { numRuns: 50 }
  )(
    'running pg-boss states map to Running',
    (jobState) => {
      const result = mapJobStateToLocal(jobState);
      expect(result).toBe('Running');
    }
  );

  /**
   * Property: Completed status maps to Success.
   */
  test('completed state maps to Success', () => {
    const result = mapJobStateToLocal('completed');
    expect(result).toBe('Success');
  });

  /**
   * Property: Failure states map to Failed.
   */
  test.prop(
    [fc.constantFrom<PgBossJobState>('failed', 'expired')],
    { numRuns: 50 }
  )(
    'failure pg-boss states map to Failed',
    (jobState) => {
      const result = mapJobStateToLocal(jobState);
      expect(result).toBe('Failed');
    }
  );

  /**
   * Property: Cancelled status maps to Partial.
   */
  test('cancelled state maps to Partial', () => {
    const result = mapJobStateToLocal('cancelled');
    expect(result).toBe('Partial');
  });

  /**
   * Property: All pg-boss states have a valid mapping.
   */
  test.prop([pgBossStateArb], { numRuns: 100 })(
    'all pg-boss states map to valid local statuses',
    (jobState) => {
      const result = mapJobStateToLocal(jobState);
      expect(['Running', 'Success', 'Failed', 'Partial']).toContain(result);
    }
  );

  /**
   * Property: Status sync updates local status when changed.
   */
  test.prop([runIdArb, localStatusArb, pgBossStateArb], { numRuns: 50 })(
    'syncExecution updates status when pg-boss state differs',
    async (runId, currentStatus, jobState) => {
      const expectedNewStatus = mapJobStateToLocal(jobState);

      mockGetJobById.mockResolvedValueOnce({
        id: runId,
        state: jobState,
        completedon: jobState === 'completed' ? new Date().toISOString() : null,
        output: jobState === 'failed' ? { error: 'Test error' } : null,
      });

      const result = await ExecutionStatusSyncService.syncExecution(
        'test-execution-id',
        runId,
        currentStatus
      );

      expect(mockGetJobById).toHaveBeenCalledWith(runId);
      expect(result.jobState).toBe(jobState);
      expect(result.newStatus).toBe(expectedNewStatus);

      if (currentStatus !== expectedNewStatus) {
        expect(result.updated).toBe(true);
      }
    }
  );

  /**
   * Property: Status sync handles API errors gracefully.
   */
  test.prop([runIdArb, localStatusArb], { numRuns: 20 })(
    'syncExecution handles errors gracefully',
    async (runId, currentStatus) => {
      mockGetJobById.mockRejectedValueOnce(new Error('DB connection failed'));

      const result = await ExecutionStatusSyncService.syncExecution(
        'test-execution-id',
        runId,
        currentStatus
      );

      expect(result.error).toBeDefined();
      expect(result.updated).toBe(false);
      expect(result.newStatus).toBe(currentStatus);
    }
  );

  /**
   * Property: Status sync returns unchanged when status matches.
   */
  test.prop([runIdArb], { numRuns: 20 })(
    'syncExecution returns unchanged when status already matches',
    async (runId) => {
      mockGetJobById.mockResolvedValueOnce({
        id: runId,
        state: 'completed',
        completedon: new Date().toISOString(),
      });

      const result = await ExecutionStatusSyncService.syncExecution(
        'test-execution-id',
        runId,
        'Success'
      );

      expect(result.updated).toBe(false);
      expect(result.newStatus).toBe('Success');
      expect(result.previousStatus).toBe('Success');
    }
  );

  /**
   * Property: Job not found returns appropriate error.
   */
  test.prop([runIdArb, localStatusArb], { numRuns: 10 })(
    'syncExecution handles job not found',
    async (runId, currentStatus) => {
      mockGetJobById.mockResolvedValueOnce(null);

      const result = await ExecutionStatusSyncService.syncExecution(
        'test-execution-id',
        runId,
        currentStatus
      );

      expect(result.error).toBe('Job not found in pg-boss');
      expect(result.updated).toBe(false);
    }
  );
});
