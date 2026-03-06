/**
 * @fileoverview Execution Status Sync Service - Syncs execution status from pg-boss
 *
 * This service provides functionality to sync automation execution status
 * from pg-boss to the local database. It fetches job status from
 * pg-boss and updates local execution records accordingly.
 *
 * @module lib/services/execution-status-sync-service
 * @requires pg-boss - Job queue for status lookup
 *
 * Requirements: 10.6
 */

import { getQueue } from "@/lib/jobs/queue";
import { JOB_NAME as AUTOMATION_EXECUTION_QUEUE } from "@/lib/jobs/workers/automation-execution";
import { db } from "@/db";
import { automationExecutions, type ExecutionStatus } from "@/db/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";

/**
 * pg-boss job state types.
 * These are the possible states for a pg-boss job.
 */
export type PgBossJobState =
  | "created"
  | "retry"
  | "active"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed";

/**
 * Result of syncing a single execution.
 */
export interface SyncResult {
  executionId: string;
  triggerDevRunId: string;
  previousStatus: ExecutionStatus;
  newStatus: ExecutionStatus;
  jobState: PgBossJobState;
  updated: boolean;
  error?: string;
}

/**
 * Result of syncing multiple executions.
 */
export interface BatchSyncResult {
  synced: number;
  failed: number;
  unchanged: number;
  results: SyncResult[];
}

/**
 * Maps pg-boss job state to local execution status.
 *
 * @param jobState - The state from pg-boss
 * @returns The corresponding local execution status
 */
export function mapJobStateToLocal(
  jobState: PgBossJobState
): ExecutionStatus {
  switch (jobState) {
    // Running states
    case "created":
    case "retry":
    case "active":
      return "Running";

    // Success state
    case "completed":
      return "Success";

    // Failure states
    case "failed":
    case "expired":
      return "Failed";

    // Cancelled is treated as partial (user intervention)
    case "cancelled":
      return "Partial";

    default:
      return "Running";
  }
}

/**
 * ExecutionStatusSyncService - Syncs execution status from Trigger.dev
 *
 * Requirements: 10.6
 */
export const ExecutionStatusSyncService = {
  /**
   * Sync status for a single execution by its Trigger.dev run ID.
   *
   * @param triggerDevRunId - The Trigger.dev run ID
   * @returns The sync result
   */
  async syncByRunId(triggerDevRunId: string): Promise<SyncResult | null> {
    // Find the execution with this run ID
    const execution = await db.query.automationExecutions.findFirst({
      where: eq(automationExecutions.triggerDevRunId, triggerDevRunId),
    });

    if (!execution) {
      return null;
    }

    return this.syncExecution(execution.id, triggerDevRunId, execution.status);
  },

  /**
   * Sync status for a single execution by its local execution ID.
   *
   * @param executionId - The local execution ID
   * @returns The sync result
   */
  async syncByExecutionId(executionId: string): Promise<SyncResult | null> {
    const execution = await db.query.automationExecutions.findFirst({
      where: eq(automationExecutions.id, executionId),
    });

    if (!execution || !execution.triggerDevRunId) {
      return null;
    }

    return this.syncExecution(
      execution.id,
      execution.triggerDevRunId,
      execution.status
    );
  },

  /**
   * Sync a single execution with pg-boss.
   *
   * @param executionId - The local execution ID
   * @param triggerDevRunId - The pg-boss job ID (stored as triggerDevRunId for compatibility)
   * @param currentStatus - The current local status
   * @returns The sync result
   */
  async syncExecution(
    executionId: string,
    triggerDevRunId: string,
    currentStatus: ExecutionStatus
  ): Promise<SyncResult> {
    try {
      // Fetch job status from pg-boss
      const boss = await getQueue();
      const job = await boss.getJobById(AUTOMATION_EXECUTION_QUEUE, triggerDevRunId);

      if (!job) {
        return {
          executionId,
          triggerDevRunId,
          previousStatus: currentStatus,
          newStatus: currentStatus,
          jobState: "created" as PgBossJobState,
          updated: false,
          error: "Job not found in pg-boss",
        };
      }

      const jobState = job.state as PgBossJobState;
      const newStatus = mapJobStateToLocal(jobState);

      // Only update if status has changed
      if (newStatus !== currentStatus) {
        const updateData: {
          status: ExecutionStatus;
          completedAt?: Date;
          error?: string;
        } = {
          status: newStatus,
        };

        // Set completedAt for terminal states
        if (
          newStatus === "Success" ||
          newStatus === "Failed" ||
          newStatus === "Partial"
        ) {
          updateData.completedAt = job.completedOn
            ? new Date(job.completedOn)
            : new Date();
        }

        // Set error message for failed jobs
        if (newStatus === "Failed" && job.output) {
          const output = typeof job.output === 'object' ? job.output : {};
          const errorMsg = (output as Record<string, unknown>).error ?? (output as Record<string, unknown>).message;
          if (errorMsg) {
            updateData.error = String(errorMsg);
          }
        }

        await db
          .update(automationExecutions)
          .set(updateData)
          .where(eq(automationExecutions.id, executionId));

        return {
          executionId,
          triggerDevRunId,
          previousStatus: currentStatus,
          newStatus,
          jobState,
          updated: true,
        };
      }

      return {
        executionId,
        triggerDevRunId,
        previousStatus: currentStatus,
        newStatus: currentStatus,
        jobState,
        updated: false,
      };
    } catch (error) {
      return {
        executionId,
        triggerDevRunId,
        previousStatus: currentStatus,
        newStatus: currentStatus,
        jobState: "created" as PgBossJobState,
        updated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  /**
   * Sync all running executions with pg-boss.
   * This is useful for batch updates or periodic sync jobs.
   *
   * @param automationId - Optional automation ID to filter by
   * @returns The batch sync result
   */
  async syncRunningExecutions(automationId?: string): Promise<BatchSyncResult> {
    // Find all running executions with Trigger.dev run IDs
    const whereConditions = [
      eq(automationExecutions.status, "Running"),
      isNotNull(automationExecutions.triggerDevRunId),
    ];

    if (automationId) {
      whereConditions.push(eq(automationExecutions.automationId, automationId));
    }

    const runningExecutions = await db.query.automationExecutions.findMany({
      where: and(...whereConditions),
    });

    const results: SyncResult[] = [];
    let synced = 0;
    let failed = 0;
    let unchanged = 0;

    for (const execution of runningExecutions) {
      if (!execution.triggerDevRunId) continue;

      const result = await this.syncExecution(
        execution.id,
        execution.triggerDevRunId,
        execution.status
      );

      results.push(result);

      if (result.error) {
        failed++;
      } else if (result.updated) {
        synced++;
      } else {
        unchanged++;
      }
    }

    return {
      synced,
      failed,
      unchanged,
      results,
    };
  },
};

export default ExecutionStatusSyncService;
