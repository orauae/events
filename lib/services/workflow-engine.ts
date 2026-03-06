/**
 * @fileoverview Workflow Engine - Executes automation workflows
 * 
 * This service is the runtime engine for automation workflows. It:
 * - Traverses the workflow graph from trigger to actions
 * - Evaluates condition nodes to determine branching
 * - Executes action nodes (send email, add tag, etc.)
 * - Records execution history for debugging
 * 
 * @module lib/services/workflow-engine
 * @requires drizzle-orm - Database ORM
 * @requires @paralleldrive/cuid2 - ID generation
 * 
 * @example
 * ```typescript
 * import { WorkflowEngine } from '@/lib/services';
 * 
 * // Execute an automation for a guest
 * const result = await WorkflowEngine.execute(
 *   automation,
 *   eventGuestId,
 *   { rsvpStatus: 'Attending' }
 * );
 * 
 * if (result.success) {
 *   console.log(`Executed ${result.steps.length} steps`);
 * }
 * ```
 */

import { db } from '@/db';
import {
  automationExecutions,
  executionSteps,
  eventGuests,
  eventGuestTags,
  guestTags,
  type AutomationNode,
  type AutomationEdge,
  type AutomationExecution,
  type ExecutionStep,
  type ExecutionStatus,
  type StepStatus,
  type EventGuest,
  type Guest,
  type Event,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import type { AutomationWithDetails } from './automation-service';
import { EmailTemplateService } from './email-template-service';
import { CampaignSendService } from './campaign-send-service';

/**
 * Execution context containing all data needed during workflow execution.
 * Passed to each node during traversal.
 * 
 * @property automation - The automation being executed
 * @property execution - The execution record for tracking
 * @property eventGuest - The guest triggering the automation
 * @property guest - The guest's contact information
 * @property event - The event context
 * @property triggerData - Additional data from the trigger
 */
export interface ExecutionContext {
  automation: AutomationWithDetails;
  execution: AutomationExecution;
  eventGuest: EventGuest;
  guest: Guest;
  event: Event;
  triggerData: Record<string, unknown>;
}

/**
 * Result of executing an action node
 */
export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * Result of evaluating a condition node
 */
export interface ConditionResult {
  result: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * Full execution result with all steps
 */
export interface WorkflowExecutionResult {
  execution: AutomationExecution;
  steps: ExecutionStep[];
  success: boolean;
  error?: string;
}


/**
 * WorkflowEngine - Executes automation workflows.
 * 
 * The engine traverses the workflow graph, executing each node in sequence.
 * For condition nodes, it evaluates the condition and follows the appropriate
 * branch (true/false). All execution is recorded for debugging and analytics.
 * 
 * @remarks
 * The engine handles:
 * - Graph traversal from trigger node
 * - Condition evaluation (RSVP status, tags, fields, time)
 * - Action execution (email, tags, webhooks, delays)
 * - Error handling and partial execution tracking
 * 
 * Requirements: 4.7, 7.1
 */
export const WorkflowEngine = {
  /**
   * Executes an automation workflow for a specific event guest.
   * 
   * Creates an execution record, traverses the workflow graph starting
   * from the trigger node, and records each step's result.
   * 
   * @param automation - The automation to execute
   * @param eventGuestId - The guest triggering the automation
   * @param triggerData - Additional context data from the trigger
   * @returns Execution result with all steps and final status
   * @throws {Error} If eventGuest not found
   * @throws {Error} If automation has no trigger node
   * 
   * @example
   * ```typescript
   * const result = await WorkflowEngine.execute(
   *   automation,
   *   'eventGuest123',
   *   { rsvpStatus: 'Attending', previousStatus: 'Pending' }
   * );
   * 
   * console.log(`Status: ${result.execution.status}`);
   * console.log(`Steps executed: ${result.steps.length}`);
   * ```
   * 
   * Requirements: 4.7, 7.1
   */
  async execute(
    automation: AutomationWithDetails,
    eventGuestId: string,
    triggerData: Record<string, unknown> = {}
  ): Promise<WorkflowExecutionResult> {
    // Fetch event guest with relations
    const eventGuestWithRelations = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, eventGuestId),
      with: {
        guest: true,
        event: true,
      },
    });

    if (!eventGuestWithRelations) {
      throw new Error(`EventGuest with ID "${eventGuestId}" not found`);
    }

    // Create execution record
    const [execution] = await db.insert(automationExecutions).values({
      automationId: automation.id,
      eventGuestId,
      triggerData,
      status: 'Running',
    }).returning();

    const context: ExecutionContext = {
      automation,
      execution,
      eventGuest: eventGuestWithRelations,
      guest: eventGuestWithRelations.guest,
      event: eventGuestWithRelations.event,
      triggerData,
    };

    const steps: ExecutionStep[] = [];
    let hasFailure = false;
    let errorMessage: string | undefined;

    try {
      // Find the trigger node (starting point)
      const triggerNode = automation.nodes.find(n => n.type === 'trigger');
      if (!triggerNode) {
        throw new Error('Automation has no trigger node');
      }

      // Execute workflow starting from trigger
      await this.traverseWorkflow(triggerNode, context, steps);

      // Check if any step failed
      hasFailure = steps.some(s => s.status === 'Failed');

      // Update execution status
      const finalStatus: ExecutionStatus = hasFailure ? 'Partial' : 'Success';
      await db.update(automationExecutions)
        .set({ status: finalStatus, completedAt: new Date() })
        .where(eq(automationExecutions.id, execution.id));

      return {
        execution: { ...execution, status: finalStatus, completedAt: new Date() },
        steps,
        success: !hasFailure,
      };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update execution as failed
      await db.update(automationExecutions)
        .set({ 
          status: 'Failed', 
          error: errorMessage,
          completedAt: new Date() 
        })
        .where(eq(automationExecutions.id, execution.id));

      return {
        execution: { ...execution, status: 'Failed', error: errorMessage, completedAt: new Date() },
        steps,
        success: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Traverse the workflow graph from a starting node
   */
  async traverseWorkflow(
    node: AutomationNode,
    context: ExecutionContext,
    steps: ExecutionStep[],
    sourceHandle?: string
  ): Promise<void> {
    // Create step record for this node
    const [step] = await db.insert(executionSteps).values({
      executionId: context.execution.id,
      nodeId: node.id,
      status: 'Running',
      input: { config: node.config, sourceHandle },
    }).returning();

    steps.push(step);

    try {
      let output: Record<string, unknown> = {};
      let nextHandle: string | undefined;

      // Execute based on node type
      switch (node.type) {
        case 'trigger':
          // Trigger nodes just pass through
          output = { triggered: true, triggerData: context.triggerData };
          break;

        case 'condition':
          const conditionResult = await this.evaluateCondition(node, context);
          output = conditionResult.output || {};
          nextHandle = conditionResult.result ? 'true' : 'false';
          
          if (conditionResult.error) {
            throw new Error(conditionResult.error);
          }
          break;

        case 'action':
          const actionResult = await this.executeAction(node, context);
          output = actionResult.output || {};
          
          if (!actionResult.success) {
            throw new Error(actionResult.error || 'Action failed');
          }
          break;
      }

      // Update step as successful
      await db.update(executionSteps)
        .set({ 
          status: 'Success' as StepStatus, 
          output,
          completedAt: new Date() 
        })
        .where(eq(executionSteps.id, step.id));

      // Update step in our array
      const stepIndex = steps.findIndex(s => s.id === step.id);
      if (stepIndex >= 0) {
        steps[stepIndex] = { ...steps[stepIndex], status: 'Success', output, completedAt: new Date() };
      }

      // Find and execute next nodes
      const nextEdges = context.automation.edges.filter(e => {
        if (e.sourceNodeId !== node.id) return false;
        // For condition nodes, match the handle
        if (node.type === 'condition' && nextHandle) {
          return e.sourceHandle === nextHandle;
        }
        return true;
      });

      for (const edge of nextEdges) {
        const nextNode = context.automation.nodes.find(n => n.id === edge.targetNodeId);
        if (nextNode) {
          await this.traverseWorkflow(nextNode, context, steps, edge.sourceHandle ?? undefined);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update step as failed
      await db.update(executionSteps)
        .set({ 
          status: 'Failed' as StepStatus, 
          error: errorMessage,
          completedAt: new Date() 
        })
        .where(eq(executionSteps.id, step.id));

      // Update step in our array
      const stepIndex = steps.findIndex(s => s.id === step.id);
      if (stepIndex >= 0) {
        steps[stepIndex] = { ...steps[stepIndex], status: 'Failed', error: errorMessage, completedAt: new Date() };
      }

      // Re-throw to propagate the error
      throw error;
    }
  },


  /**
   * Evaluate a condition node
   * Requirements: 3.2, 3.3, 3.4, 3.5
   */
  async evaluateCondition(node: AutomationNode, context: ExecutionContext): Promise<ConditionResult> {
    const config = node.config as Record<string, unknown>;

    switch (node.subType) {
      case 'check_rsvp_status':
        return this.checkRsvpStatus(config, context);

      case 'check_guest_tag':
        return this.checkGuestTag(config, context);

      case 'check_guest_field':
        return this.checkGuestField(config, context);

      case 'check_time_window':
        return this.checkTimeWindow(config, context);

      default:
        return { result: false, error: `Unknown condition type: ${node.subType}` };
    }
  },

  /**
   * Check if guest's RSVP status matches any of the specified statuses
   * Requirements: 3.3
   */
  checkRsvpStatus(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): ConditionResult {
    const statuses = config.statuses as string[] | undefined;
    if (!statuses || !Array.isArray(statuses)) {
      return { result: false, error: 'No statuses configured for check_rsvp_status' };
    }

    const guestStatus = context.eventGuest.rsvpStatus;
    const result = statuses.includes(guestStatus);

    return {
      result,
      output: { guestStatus, configuredStatuses: statuses, matched: result },
    };
  },

  /**
   * Check if guest has a specific tag
   * Requirements: 3.2
   */
  async checkGuestTag(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ConditionResult> {
    const tagId = config.tagId as string | undefined;
    const hasTag = config.hasTag as boolean ?? true;

    if (!tagId) {
      return { result: false, error: 'No tagId configured for check_guest_tag' };
    }

    // Check if the event guest has this tag
    const guestTag = await db.query.eventGuestTags.findFirst({
      where: and(
        eq(eventGuestTags.eventGuestId, context.eventGuest.id),
        eq(eventGuestTags.tagId, tagId)
      ),
    });

    const guestHasTag = !!guestTag;
    const result = hasTag ? guestHasTag : !guestHasTag;

    return {
      result,
      output: { tagId, hasTag, guestHasTag, matched: result },
    };
  },

  /**
   * Check a guest field value
   * Requirements: 3.4
   */
  checkGuestField(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): ConditionResult {
    const field = config.field as string | undefined;
    const operator = config.operator as string | undefined;
    const value = config.value as string | undefined;

    if (!field) {
      return { result: false, error: 'No field configured for check_guest_field' };
    }
    if (!operator) {
      return { result: false, error: 'No operator configured for check_guest_field' };
    }

    // Get the field value from guest
    const guest = context.guest as Record<string, unknown>;
    const fieldValue = guest[field] as string | undefined | null;

    let result = false;

    switch (operator) {
      case 'equals':
        result = fieldValue === value;
        break;
      case 'contains':
        result = typeof fieldValue === 'string' && typeof value === 'string' && 
                 fieldValue.toLowerCase().includes(value.toLowerCase());
        break;
      case 'isEmpty':
        result = !fieldValue || fieldValue.trim() === '';
        break;
      case 'isNotEmpty':
        result = !!fieldValue && fieldValue.trim() !== '';
        break;
      default:
        return { result: false, error: `Unknown operator: ${operator}` };
    }

    return {
      result,
      output: { field, operator, value, fieldValue, matched: result },
    };
  },

  /**
   * Check if current time is within a specified window
   * Requirements: 3.5
   */
  checkTimeWindow(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): ConditionResult {
    const startTime = config.startTime as string | undefined;
    const endTime = config.endTime as string | undefined;

    if (!startTime || !endTime) {
      return { result: false, error: 'Start time and end time are required for check_time_window' };
    }

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeMinutes = currentHours * 60 + currentMinutes;

    // Parse start and end times (format: "HH:MM")
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startTimeMinutes = startHours * 60 + startMinutes;
    const endTimeMinutes = endHours * 60 + endMinutes;

    const result = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;

    return {
      result,
      output: { 
        startTime, 
        endTime, 
        currentTime: `${currentHours.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`,
        matched: result 
      },
    };
  },


  /**
   * Execute an action node
   * Requirements: 4.2, 4.3, 4.4, 4.5
   */
  async executeAction(node: AutomationNode, context: ExecutionContext): Promise<ActionResult> {
    const config = node.config as Record<string, unknown>;

    switch (node.subType) {
      case 'send_email':
        return this.sendEmail(config, context);

      case 'add_guest_tag':
        return this.addGuestTag(config, context);

      case 'remove_guest_tag':
        return this.removeGuestTag(config, context);

      case 'wait_delay':
        return this.waitDelay(config, context);

      case 'send_webhook':
        return this.sendWebhook(config, context);

      case 'update_guest_field':
        return this.updateGuestField(config, context);

      case 'send_campaign':
        // send_campaign is handled differently - it sends to all guests
        // For automation context, we just log that it was triggered
        return { 
          success: true, 
          output: { message: 'Campaign send triggered', campaignId: config.campaignId } 
        };

      default:
        return { success: false, error: `Unknown action type: ${node.subType}` };
    }
  },

  /**
   * Send an email to the guest
   * Requirements: 4.2
   */
  async sendEmail(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const subject = config.subject as string | undefined;
    const content = config.content as string | undefined;

    if (!subject) {
      return { success: false, error: 'Email subject is required' };
    }

    try {
      // Create template context
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const templateContext = EmailTemplateService.createContext(
        context.guest,
        context.event,
        context.eventGuest.qrToken,
        baseUrl
      );

      // Render subject and content
      const renderedSubject = EmailTemplateService.render(subject, templateContext);
      const renderedContent = EmailTemplateService.render(content || '', templateContext);

      // Send email using CampaignSendService
      const result = await CampaignSendService.sendEmail({
        to: context.guest.email,
        subject: renderedSubject.content,
        html: renderedContent.content,
        messageId: createId(), // Generate a unique message ID for tracking
      });

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to send email' };
      }

      return {
        success: true,
        output: {
          to: context.guest.email,
          subject: renderedSubject.content,
          messageId: result.messageId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  },

  /**
   * Add a tag to the guest
   * Triggers automation workflows for tag changes
   * Requirements: 4.4
   */
  async addGuestTag(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const tagId = config.tagId as string | undefined;

    if (!tagId) {
      return { success: false, error: 'Tag ID is required' };
    }

    try {
      // Check if tag exists
      const tag = await db.query.guestTags.findFirst({
        where: eq(guestTags.id, tagId),
      });

      if (!tag) {
        return { success: false, error: `Tag with ID "${tagId}" not found` };
      }

      // Check if guest already has this tag
      const existingTag = await db.query.eventGuestTags.findFirst({
        where: and(
          eq(eventGuestTags.eventGuestId, context.eventGuest.id),
          eq(eventGuestTags.tagId, tagId)
        ),
      });

      if (existingTag) {
        return {
          success: true,
          output: { tagId, tagName: tag.name, alreadyHadTag: true },
        };
      }

      // Add the tag
      await db.insert(eventGuestTags).values({
        eventGuestId: context.eventGuest.id,
        tagId,
      });

      // Trigger automation workflows for tag changes
      // Import TriggerListenerService dynamically to avoid circular dependency
      try {
        const { TriggerListenerService } = await import('./trigger-listener-service');
        await TriggerListenerService.onGuestTagChanged(context.eventGuest.id, tagId, 'added');
      } catch (error) {
        // Log error but don't fail the tag addition
        console.error('Failed to trigger automations for tag change:', error);
      }

      return {
        success: true,
        output: { tagId, tagName: tag.name, added: true },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add tag',
      };
    }
  },

  /**
   * Remove a tag from the guest
   * Triggers automation workflows for tag changes
   * Requirements: 4.4
   */
  async removeGuestTag(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const tagId = config.tagId as string | undefined;

    if (!tagId) {
      return { success: false, error: 'Tag ID is required' };
    }

    try {
      // Delete the tag association
      await db.delete(eventGuestTags).where(
        and(
          eq(eventGuestTags.eventGuestId, context.eventGuest.id),
          eq(eventGuestTags.tagId, tagId)
        )
      );

      // Trigger automation workflows for tag changes
      // Import TriggerListenerService dynamically to avoid circular dependency
      try {
        const { TriggerListenerService } = await import('./trigger-listener-service');
        await TriggerListenerService.onGuestTagChanged(context.eventGuest.id, tagId, 'removed');
      } catch (error) {
        // Log error but don't fail the tag removal
        console.error('Failed to trigger automations for tag change:', error);
      }

      return {
        success: true,
        output: { tagId, removed: true },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove tag',
      };
    }
  },

  /**
   * Wait for a specified delay
   * Requirements: 4.3
   * Note: In a real implementation, this would schedule a delayed job.
   * For now, we just record the delay and continue.
   */
  async waitDelay(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const duration = config.duration as number | undefined;
    const unit = config.unit as string | undefined;

    if (!duration || duration <= 0) {
      return { success: false, error: 'Valid duration is required' };
    }
    if (!unit || !['minutes', 'hours', 'days'].includes(unit)) {
      return { success: false, error: 'Valid unit (minutes, hours, days) is required' };
    }

    // Calculate delay in milliseconds
    let delayMs = duration;
    switch (unit) {
      case 'minutes':
        delayMs = duration * 60 * 1000;
        break;
      case 'hours':
        delayMs = duration * 60 * 60 * 1000;
        break;
      case 'days':
        delayMs = duration * 24 * 60 * 60 * 1000;
        break;
    }

    // In a production system, this would schedule a job to continue execution later
    // For now, we just record the delay information
    return {
      success: true,
      output: {
        duration,
        unit,
        delayMs,
        scheduledContinuation: new Date(Date.now() + delayMs).toISOString(),
        note: 'Delay recorded. In production, execution would continue after the delay.',
      },
    };
  },

  /**
   * Send a webhook request
   * Requirements: 4.5
   */
  async sendWebhook(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const url = config.url as string | undefined;
    const method = (config.method as string | undefined) || 'POST';
    const payload = config.payload as string | undefined;

    if (!url) {
      return { success: false, error: 'Webhook URL is required' };
    }

    try {
      // Build webhook payload with context data
      const webhookData = {
        automation: {
          id: context.automation.id,
          name: context.automation.name,
        },
        event: {
          id: context.event.id,
          name: context.event.name,
        },
        guest: {
          id: context.guest.id,
          firstName: context.guest.firstName,
          lastName: context.guest.lastName,
          email: context.guest.email,
        },
        eventGuest: {
          id: context.eventGuest.id,
          rsvpStatus: context.eventGuest.rsvpStatus,
          checkInStatus: context.eventGuest.checkInStatus,
        },
        triggerData: context.triggerData,
        customPayload: payload ? JSON.parse(payload) : undefined,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(url, {
        method: method as 'GET' | 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: method === 'POST' ? JSON.stringify(webhookData) : undefined,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Webhook request failed with status ${response.status}`,
        };
      }

      return {
        success: true,
        output: {
          url,
          method,
          statusCode: response.status,
          sent: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send webhook',
      };
    }
  },

  /**
   * Update a guest field
   */
  async updateGuestField(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const field = config.field as string | undefined;
    const value = config.value as string | undefined;

    if (!field) {
      return { success: false, error: 'Field name is required' };
    }

    // For now, we just record the update request
    // In a full implementation, this would update the guest record
    return {
      success: true,
      output: {
        field,
        value,
        guestId: context.guest.id,
        note: 'Field update recorded',
      },
    };
  },
};

export default WorkflowEngine;
