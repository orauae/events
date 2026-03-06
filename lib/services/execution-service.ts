import { db } from '@/db';
import {
  automationExecutions,
  executionSteps,
  type AutomationExecution,
  type ExecutionStep,
} from '@/db/schema';
import { eq, desc, count } from 'drizzle-orm';

/**
 * Execution with its steps
 */
export interface ExecutionWithSteps extends AutomationExecution {
  steps: ExecutionStep[];
}

/**
 * Paginated execution result
 */
export interface PaginatedExecutions {
  executions: AutomationExecution[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * ExecutionService - Handles querying automation execution logs
 * Requirements: 7.2, 7.3
 */
export const ExecutionService = {
  /**
   * Get executions for an automation with pagination
   * Returns at most the requested limit (default 100), ordered by most recent first
   * Requirements: 7.2
   */
  async getByAutomation(
    automationId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<PaginatedExecutions> {
    const limit = Math.min(options.limit ?? 100, 100); // Cap at 100
    const offset = options.offset ?? 0;

    // Get total count
    const [countResult] = await db
      .select({ count: count() })
      .from(automationExecutions)
      .where(eq(automationExecutions.automationId, automationId));

    const total = countResult?.count ?? 0;

    // Get paginated executions ordered by most recent first
    const executions = await db.query.automationExecutions.findMany({
      where: eq(automationExecutions.automationId, automationId),
      orderBy: desc(automationExecutions.startedAt),
      limit,
      offset,
    });

    return {
      executions,
      total,
      limit,
      offset,
    };
  },

  /**
   * Get a single execution by ID with its steps
   * Requirements: 7.3
   */
  async getById(id: string): Promise<ExecutionWithSteps | null> {
    const execution = await db.query.automationExecutions.findFirst({
      where: eq(automationExecutions.id, id),
      with: {
        steps: {
          orderBy: desc(executionSteps.startedAt),
        },
      },
    });

    return execution ?? null;
  },

  /**
   * Get steps for an execution
   * Requirements: 7.3
   */
  async getSteps(executionId: string): Promise<ExecutionStep[]> {
    const steps = await db.query.executionSteps.findMany({
      where: eq(executionSteps.executionId, executionId),
      orderBy: desc(executionSteps.startedAt),
    });

    return steps;
  },
};

export default ExecutionService;
