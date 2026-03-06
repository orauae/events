/**
 * @fileoverview Automation Service - Workflow automation management
 * 
 * This service handles the creation and management of event automations.
 * Automations are visual workflows built with React Flow that automate
 * actions based on triggers (RSVP, check-in, etc.).
 * 
 * @module lib/services/automation-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 * @requires @paralleldrive/cuid2 - ID generation
 * 
 * @example
 * ```typescript
 * import { AutomationService } from '@/lib/services';
 * 
 * // Create a simple automation
 * const automation = await AutomationService.create('event123', {
 *   name: 'Welcome Email',
 *   description: 'Send welcome email on RSVP',
 *   nodes: [
 *     { type: 'trigger', subType: 'guest_rsvp_received', ... },
 *     { type: 'action', subType: 'send_email', ... }
 *   ],
 *   edges: [{ sourceNodeId: '0', targetNodeId: '1' }]
 * });
 * ```
 */

import { z } from 'zod';
import { db } from '@/db';
import {
  automations,
  automationNodes,
  automationEdges,
  type Automation,
  type AutomationNode,
  type AutomationEdge,
  type AutomationStatus,
  type NodeType,
} from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { TriggerRegistrationService } from './trigger-registration-service';
import { isValidCronExpression } from '@/lib/utils/cron-validator';

/**
 * Trigger types that can start an automation workflow.
 * 
 * - guest_rsvp_received: Fires when a guest responds to an invitation
 * - guest_checked_in: Fires when a guest checks in at the event
 * - event_date_approaching: Fires X days before/after the event
 * - campaign_sent: Fires when a campaign is sent
 * - guest_added_to_event: Fires when a guest is linked to the event
 * - guest_tag_changed: Fires when specific tags are added/removed
 */
export type TriggerType =
  | 'guest_rsvp_received'
  | 'guest_checked_in'
  | 'event_date_approaching'
  | 'campaign_sent'
  | 'guest_added_to_event'
  | 'guest_tag_changed';

export type ConditionType =
  | 'check_rsvp_status'
  | 'check_guest_tag'
  | 'check_guest_field'
  | 'check_time_window';

export type ActionType =
  | 'send_email'
  | 'send_campaign'
  | 'add_guest_tag'
  | 'remove_guest_tag'
  | 'update_guest_field'
  | 'wait_delay'
  | 'send_webhook';

// Validation schemas
export const automationNodeInputSchema = z.object({
  type: z.enum(['trigger', 'condition', 'action']),
  subType: z.string().min(1, 'Node subtype is required'),
  label: z.string().min(1, 'Node label is required'),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.any()).default({}),
  clientId: z.string().optional(), // React Flow node ID for edge mapping
});

export const automationEdgeInputSchema = z.object({
  sourceNodeId: z.string().min(1, 'Source node ID is required'),
  targetNodeId: z.string().min(1, 'Target node ID is required'),
  sourceHandle: z.string().optional(),
});


export const createAutomationSchema = z.object({
  name: z.string().trim().min(1, 'Automation name is required'),
  description: z.string().optional(),
  nodes: z.array(automationNodeInputSchema).default([]),
  edges: z.array(automationEdgeInputSchema).default([]),
});

export const updateAutomationSchema = z.object({
  name: z.string().trim().min(1, 'Automation name is required').optional(),
  description: z.string().optional(),
  nodes: z.array(automationNodeInputSchema).optional(),
  edges: z.array(automationEdgeInputSchema).optional(),
});

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type AutomationNodeInput = z.infer<typeof automationNodeInputSchema>;
export type AutomationEdgeInput = z.infer<typeof automationEdgeInputSchema>;

// Validation result types
export interface ValidationError {
  nodeId?: string;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Full automation type with nodes and edges
export interface AutomationWithDetails extends Automation {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}


/**
 * AutomationService - Manages event automation workflows.
 * 
 * Provides methods for creating, updating, and managing automation workflows.
 * Automations consist of:
 * - Trigger nodes: Start the workflow (RSVP, check-in, etc.)
 * - Condition nodes: Branch based on guest data
 * - Action nodes: Perform operations (send email, add tag, etc.)
 * - Edges: Connect nodes to define the flow
 * 
 * @remarks
 * Automations must be validated before activation. The validate() method
 * checks for proper structure and required configurations.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 8.1
 */
export const AutomationService = {
  /**
   * Creates a new automation with nodes and edges.
   * 
   * Handles ID mapping for template imports where nodes are referenced
   * by index. Creates all nodes first, then maps edge references to
   * the new node IDs.
   * 
   * @param eventId - The event this automation belongs to
   * @param input - Automation definition with nodes and edges
   * @returns The created automation with all nodes and edges
   * 
   * @example
   * ```typescript
   * const automation = await AutomationService.create('event123', {
   *   name: 'RSVP Welcome',
   *   nodes: [
   *     { type: 'trigger', subType: 'guest_rsvp_received', label: 'On RSVP', position: { x: 0, y: 0 }, config: {} },
   *     { type: 'action', subType: 'send_email', label: 'Send Welcome', position: { x: 0, y: 100 }, config: { subject: 'Welcome!' } }
   *   ],
   *   edges: [{ sourceNodeId: '0', targetNodeId: '1' }]
   * });
   * ```
   * 
   * Requirements: 6.1, 8.1
   */
  async create(eventId: string, input: CreateAutomationInput): Promise<AutomationWithDetails> {
    const validated = createAutomationSchema.parse(input);

    // Create the automation
    const [automation] = await db.insert(automations).values({
      eventId,
      name: validated.name,
      description: validated.description,
      status: 'Draft',
    }).returning();

    // Create a mapping from temporary IDs to real IDs for nodes
    const nodeIdMap = new Map<string, string>();
    const createdNodes: AutomationNode[] = [];

    // Create nodes with new IDs
    for (let i = 0; i < validated.nodes.length; i++) {
      const nodeInput = validated.nodes[i];
      const newId = createId();
      // Map by clientId (React Flow node ID) if provided, otherwise fallback to array index
      const mapKey = nodeInput.clientId || String(i);
      nodeIdMap.set(mapKey, newId);

      const [node] = await db.insert(automationNodes).values({
        id: newId,
        automationId: automation.id,
        type: nodeInput.type as NodeType,
        subType: nodeInput.subType,
        label: nodeInput.label,
        positionX: String(nodeInput.position.x),
        positionY: String(nodeInput.position.y),
        config: nodeInput.config,
      }).returning();

      createdNodes.push(node);
    }


    // Create edges with mapped node IDs
    const createdEdges: AutomationEdge[] = [];
    for (const edgeInput of validated.edges) {
      // Map source and target node IDs if they're template indices
      const sourceNodeId = nodeIdMap.get(edgeInput.sourceNodeId) ?? edgeInput.sourceNodeId;
      const targetNodeId = nodeIdMap.get(edgeInput.targetNodeId) ?? edgeInput.targetNodeId;

      const [edge] = await db.insert(automationEdges).values({
        automationId: automation.id,
        sourceNodeId,
        targetNodeId,
        sourceHandle: edgeInput.sourceHandle,
      }).returning();

      createdEdges.push(edge);
    }

    return {
      ...automation,
      nodes: createdNodes,
      edges: createdEdges,
    };
  },

  /**
   * Get an automation by ID with its nodes and edges
   * Requirements: 6.1
   */
  async getById(id: string): Promise<AutomationWithDetails | null> {
    const automation = await db.query.automations.findFirst({
      where: eq(automations.id, id),
      with: {
        nodes: true,
        edges: true,
      },
    });

    return automation ?? null;
  },


  /**
   * Get all automations for an event
   * Requirements: 6.1, 8.1
   */
  async getByEvent(eventId: string): Promise<AutomationWithDetails[]> {
    const result = await db.query.automations.findMany({
      where: eq(automations.eventId, eventId),
      with: {
        nodes: true,
        edges: true,
      },
      orderBy: desc(automations.createdAt),
    });

    return result;
  },

  /**
   * Update an automation
   * 
   * If the automation has a scheduled trigger and the cron expression changes,
   * the Trigger.dev schedule is updated accordingly.
   * 
   * Requirements: 6.4, 6.6
   */
  async update(id: string, input: UpdateAutomationInput): Promise<AutomationWithDetails> {
    const validated = updateAutomationSchema.parse(input);

    // Get the current automation to check for schedule changes
    const currentAutomation = await this.getById(id);
    if (!currentAutomation) {
      throw new Error('Automation not found');
    }

    // Update automation metadata
    const updateData: Partial<typeof automations.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;

    const [automation] = await db.update(automations)
      .set(updateData)
      .where(eq(automations.id, id))
      .returning();

    if (!automation) {
      throw new Error('Automation not found');
    }


    // If nodes are provided, replace all nodes
    let updatedNodes: AutomationNode[] = [];
    if (validated.nodes !== undefined) {
      // Delete existing nodes (edges will cascade delete)
      await db.delete(automationNodes).where(eq(automationNodes.automationId, id));

      // Create new nodes
      const nodeIdMap = new Map<string, string>();
      for (let i = 0; i < validated.nodes.length; i++) {
        const nodeInput = validated.nodes[i];
        const newId = createId();
        // Map by clientId (React Flow node ID) if provided, otherwise fallback to array index
        const mapKey = nodeInput.clientId || String(i);
        nodeIdMap.set(mapKey, newId);

        const [node] = await db.insert(automationNodes).values({
          id: newId,
          automationId: id,
          type: nodeInput.type as NodeType,
          subType: nodeInput.subType,
          label: nodeInput.label,
          positionX: String(nodeInput.position.x),
          positionY: String(nodeInput.position.y),
          config: nodeInput.config,
        }).returning();

        updatedNodes.push(node);
      }

      // If edges are also provided, create them with mapped IDs
      if (validated.edges !== undefined) {
        await db.delete(automationEdges).where(eq(automationEdges.automationId, id));

        for (const edgeInput of validated.edges) {
          const sourceNodeId = nodeIdMap.get(edgeInput.sourceNodeId) ?? edgeInput.sourceNodeId;
          const targetNodeId = nodeIdMap.get(edgeInput.targetNodeId) ?? edgeInput.targetNodeId;

          await db.insert(automationEdges).values({
            automationId: id,
            sourceNodeId,
            targetNodeId,
            sourceHandle: edgeInput.sourceHandle,
          });
        }
      }
    } else if (validated.edges !== undefined) {
      // Only edges are being updated
      await db.delete(automationEdges).where(eq(automationEdges.automationId, id));

      for (const edgeInput of validated.edges) {
        await db.insert(automationEdges).values({
          automationId: id,
          sourceNodeId: edgeInput.sourceNodeId,
          targetNodeId: edgeInput.targetNodeId,
          sourceHandle: edgeInput.sourceHandle,
        });
      }
    }

    // Fetch the updated automation with all relations
    const result = await this.getById(id);
    if (!result) {
      throw new Error('Automation not found after update');
    }

    // Handle schedule updates if the automation is active and has a scheduled trigger
    // Requirement 6.6: Update schedule when cron expression changes
    if (automation.status === 'Active' && validated.nodes !== undefined) {
      const oldScheduledTrigger = currentAutomation.nodes.find(
        n => n.type === 'trigger' && n.subType === 'scheduled'
      );
      const newScheduledTrigger = result.nodes.find(
        n => n.type === 'trigger' && n.subType === 'scheduled'
      );

      if (oldScheduledTrigger && newScheduledTrigger) {
        const oldConfig = oldScheduledTrigger.config as Record<string, unknown>;
        const newConfig = newScheduledTrigger.config as Record<string, unknown>;
        const oldCron = oldConfig.cronExpression as string | undefined;
        const newCron = newConfig.cronExpression as string | undefined;
        const newTimezone = (newConfig.timezone as string) || 'UTC';

        // Update schedule if cron expression changed
        if (oldCron !== newCron && newCron) {
          await TriggerRegistrationService.updateScheduledTrigger(id, newCron, newTimezone);
        }
      } else if (!oldScheduledTrigger && newScheduledTrigger) {
        // New scheduled trigger added - register it
        const newConfig = newScheduledTrigger.config as Record<string, unknown>;
        const newCron = newConfig.cronExpression as string | undefined;
        const newTimezone = (newConfig.timezone as string) || 'UTC';
        if (newCron) {
          await TriggerRegistrationService.registerScheduledTrigger(id, newCron, newTimezone);
        }
      } else if (oldScheduledTrigger && !newScheduledTrigger) {
        // Scheduled trigger removed - unregister it
        await TriggerRegistrationService.unregisterScheduledTrigger(id);
      }
    }

    return result;
  },


  /**
   * Delete an automation
   * 
   * Also unregisters any associated Trigger.dev schedules.
   * 
   * Requirements: 6.3, 6.4
   */
  async delete(id: string): Promise<void> {
    // Unregister any schedules before deleting (Requirement 6.3)
    await TriggerRegistrationService.unregisterScheduledTrigger(id);
    await TriggerRegistrationService.unregisterEventDateTrigger(id);
    
    await db.delete(automations).where(eq(automations.id, id));
  },

  /**
   * Duplicates an automation with all its nodes and edges.
   * 
   * Creates a copy with:
   * - Name suffixed with "(Copy)"
   * - Status set to Draft
   * - New IDs for all nodes and edges
   * - Same configuration and positions
   * 
   * @param id - The automation ID to duplicate
   * @returns The new duplicated automation
   * @throws {Error} If automation not found
   * 
   * @example
   * ```typescript
   * const copy = await AutomationService.duplicate('auto123');
   * console.log(copy.name); // "Original Name (Copy)"
   * ```
   * 
   * Requirements: 6.3
   */
  async duplicate(id: string): Promise<AutomationWithDetails> {
    const original = await this.getById(id);
    if (!original) {
      throw new Error('Automation not found');
    }

    // Create a copy with "(Copy)" suffix and Draft status
    const [newAutomation] = await db.insert(automations).values({
      eventId: original.eventId,
      name: `${original.name} (Copy)`,
      description: original.description,
      status: 'Draft',
    }).returning();

    // Create a mapping from old node IDs to new node IDs
    const nodeIdMap = new Map<string, string>();
    const newNodes: AutomationNode[] = [];

    // Copy nodes with new IDs
    for (const node of original.nodes) {
      const newId = createId();
      nodeIdMap.set(node.id, newId);

      const [newNode] = await db.insert(automationNodes).values({
        id: newId,
        automationId: newAutomation.id,
        type: node.type,
        subType: node.subType,
        label: node.label,
        positionX: node.positionX,
        positionY: node.positionY,
        config: node.config,
      }).returning();

      newNodes.push(newNode);
    }


    // Copy edges with mapped node IDs
    const newEdges: AutomationEdge[] = [];
    for (const edge of original.edges) {
      const newSourceId = nodeIdMap.get(edge.sourceNodeId);
      const newTargetId = nodeIdMap.get(edge.targetNodeId);

      if (newSourceId && newTargetId) {
        const [newEdge] = await db.insert(automationEdges).values({
          automationId: newAutomation.id,
          sourceNodeId: newSourceId,
          targetNodeId: newTargetId,
          sourceHandle: edge.sourceHandle,
        }).returning();

        newEdges.push(newEdge);
      }
    }

    return {
      ...newAutomation,
      nodes: newNodes,
      edges: newEdges,
    };
  },

  /**
   * Sets the automation status (Draft, Active, Paused).
   * 
   * When activating (setting to Active), validates the automation first.
   * Invalid automations cannot be activated.
   * 
   * For automations with scheduled triggers, this method also manages
   * Trigger.dev schedule registration:
   * - On activation: registers the schedule with Trigger.dev
   * - On pause: unregisters the schedule from Trigger.dev
   * 
   * @param id - The automation ID
   * @param status - The new status
   * @returns The updated automation
   * @throws {Error} If automation not found
   * @throws {Error} If validation fails when activating
   * 
   * @example
   * ```typescript
   * // Activate an automation
   * try {
   *   await AutomationService.setStatus('auto123', 'Active');
   * } catch (error) {
   *   console.log('Cannot activate:', error.message);
   * }
   * ```
   * 
   * Requirements: 4.5, 4.6, 6.2, 6.3, 6.5
   */
  async setStatus(id: string, status: AutomationStatus): Promise<AutomationWithDetails> {
    const automation = await this.getById(id);
    if (!automation) {
      throw new Error('Automation not found');
    }

    // Validate before activation
    if (status === 'Active') {
      const validation = this.validate(automation);
      if (!validation.valid) {
        const errorMessages = validation.errors.map(e => e.message).join('; ');
        throw new Error(`Cannot activate automation: ${errorMessages}`);
      }
    }

    const [updated] = await db.update(automations)
      .set({ status, updatedAt: new Date() })
      .where(eq(automations.id, id))
      .returning();

    // Handle schedule registration/unregistration for scheduled triggers
    // Requirements: 4.5, 4.6, 6.2, 6.3
    const scheduledTrigger = automation.nodes.find(
      n => n.type === 'trigger' && n.subType === 'scheduled'
    );

    if (scheduledTrigger) {
      const config = scheduledTrigger.config as Record<string, unknown>;
      const cronExpression = config.cronExpression as string | undefined;
      const timezone = (config.timezone as string) || 'UTC';

      if (status === 'Active' && cronExpression) {
        // Register schedule when activating (Requirement 4.5, 6.2)
        await TriggerRegistrationService.registerScheduledTrigger(
          id,
          cronExpression,
          timezone
        );
      } else if (status === 'Paused' || status === 'Draft') {
        // Unregister schedule when pausing (Requirement 4.6, 6.3)
        await TriggerRegistrationService.unregisterScheduledTrigger(id);
      }
    }

    // Handle event_date_approaching triggers
    const eventDateTrigger = automation.nodes.find(
      n => n.type === 'trigger' && n.subType === 'event_date_approaching'
    );

    if (eventDateTrigger) {
      if (status === 'Active') {
        await TriggerRegistrationService.registerEventDateTrigger(id);
      } else if (status === 'Paused' || status === 'Draft') {
        await TriggerRegistrationService.unregisterEventDateTrigger(id);
      }
    }

    return {
      ...updated,
      nodes: automation.nodes,
      edges: automation.edges,
    };
  },


  /**
   * Validates an automation workflow for activation.
   * 
   * Checks:
   * - Exactly one trigger node exists
   * - All nodes are connected to the workflow
   * - Required configuration fields are present per node type
   * 
   * @param automation - The automation to validate
   * @returns Validation result with any errors found
   * 
   * @example
   * ```typescript
   * const result = AutomationService.validate(automation);
   * if (!result.valid) {
   *   console.log('Validation errors:', result.errors);
   * }
   * ```
   * 
   * Requirements: 2.5, 6.5
   */
  validate(automation: AutomationWithDetails): ValidationResult {
    const errors: ValidationError[] = [];

    // Check for exactly one trigger node
    const triggers = automation.nodes.filter(n => n.type === 'trigger');
    if (triggers.length === 0) {
      errors.push({ message: 'Automation must have exactly one trigger node' });
    } else if (triggers.length > 1) {
      errors.push({ message: 'Automation can only have one trigger node' });
    }

    // Check for disconnected nodes (nodes that are not connected to any edge)
    // Trigger nodes only need to be a source, other nodes need to be a target
    const sourceNodeIds = new Set(automation.edges.map(e => e.sourceNodeId));
    const targetNodeIds = new Set(automation.edges.map(e => e.targetNodeId));

    for (const node of automation.nodes) {
      if (node.type === 'trigger') {
        // Trigger nodes should be a source (have outgoing edges)
        if (automation.nodes.length > 1 && !sourceNodeIds.has(node.id)) {
          errors.push({
            nodeId: node.id,
            message: `Trigger node "${node.label}" has no outgoing connections`,
          });
        }
      } else {
        // Non-trigger nodes should be a target (have incoming edges)
        if (!targetNodeIds.has(node.id)) {
          errors.push({
            nodeId: node.id,
            message: `Node "${node.label}" is not connected to the workflow`,
          });
        }
      }
    }

    // Validate required config fields per node type
    for (const node of automation.nodes) {
      const configErrors = this.validateNodeConfig(node);
      errors.push(...configErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },


  /**
   * Validate node configuration based on node type
   * Requirements: 6.5, 8.7
   */
  validateNodeConfig(node: AutomationNode): ValidationError[] {
    const errors: ValidationError[] = [];
    const config = node.config as Record<string, unknown>;

    switch (node.subType) {
      // Trigger validations
      case 'scheduled':
        // Requirement 8.7: Validate cron expressions for scheduled triggers
        if (!config.cronExpression || typeof config.cronExpression !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'cronExpression',
            message: `Node "${node.label}" requires a cron expression`,
          });
        } else if (!isValidCronExpression(config.cronExpression)) {
          errors.push({
            nodeId: node.id,
            field: 'cronExpression',
            message: `Node "${node.label}" has an invalid cron expression`,
          });
        }
        break;

      case 'event_date_approaching':
        if (config.daysBefore === undefined || typeof config.daysBefore !== 'number') {
          errors.push({
            nodeId: node.id,
            field: 'daysBefore',
            message: `Node "${node.label}" requires daysBefore configuration`,
          });
        }
        break;

      case 'guest_tag_changed':
        if (!config.tagIds || !Array.isArray(config.tagIds) || config.tagIds.length === 0) {
          errors.push({
            nodeId: node.id,
            field: 'tagIds',
            message: `Node "${node.label}" requires at least one tag to monitor`,
          });
        }
        break;

      // Condition validations
      case 'check_rsvp_status':
        if (!config.statuses || !Array.isArray(config.statuses) || config.statuses.length === 0) {
          errors.push({
            nodeId: node.id,
            field: 'statuses',
            message: `Node "${node.label}" requires at least one RSVP status to check`,
          });
        }
        break;

      case 'check_guest_tag':
        if (!config.tagId || typeof config.tagId !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'tagId',
            message: `Node "${node.label}" requires a tag to check`,
          });
        }
        break;

      case 'check_guest_field':
        if (!config.field || typeof config.field !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'field',
            message: `Node "${node.label}" requires a field to check`,
          });
        }
        if (!config.operator || typeof config.operator !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'operator',
            message: `Node "${node.label}" requires an operator`,
          });
        }
        break;

      case 'check_time_window':
        if (!config.startTime || typeof config.startTime !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'startTime',
            message: `Node "${node.label}" requires a start time`,
          });
        }
        if (!config.endTime || typeof config.endTime !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'endTime',
            message: `Node "${node.label}" requires an end time`,
          });
        }
        break;


      // Action validations
      case 'send_email':
        if (!config.subject || typeof config.subject !== 'string' || config.subject.trim() === '') {
          errors.push({
            nodeId: node.id,
            field: 'subject',
            message: `Node "${node.label}" requires an email subject`,
          });
        }
        break;

      case 'send_campaign':
        if (!config.campaignId || typeof config.campaignId !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'campaignId',
            message: `Node "${node.label}" requires a campaign to send`,
          });
        }
        break;

      case 'add_guest_tag':
      case 'remove_guest_tag':
        if (!config.tagId || typeof config.tagId !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'tagId',
            message: `Node "${node.label}" requires a tag`,
          });
        }
        break;

      case 'wait_delay':
        if (config.duration === undefined || typeof config.duration !== 'number' || config.duration <= 0) {
          errors.push({
            nodeId: node.id,
            field: 'duration',
            message: `Node "${node.label}" requires a positive duration`,
          });
        }
        if (!config.unit || !['minutes', 'hours', 'days'].includes(config.unit as string)) {
          errors.push({
            nodeId: node.id,
            field: 'unit',
            message: `Node "${node.label}" requires a valid time unit (minutes, hours, or days)`,
          });
        }
        break;

      case 'send_webhook':
        if (!config.url || typeof config.url !== 'string' || config.url.trim() === '') {
          errors.push({
            nodeId: node.id,
            field: 'url',
            message: `Node "${node.label}" requires a webhook URL`,
          });
        }
        if (!config.method || !['GET', 'POST'].includes(config.method as string)) {
          errors.push({
            nodeId: node.id,
            field: 'method',
            message: `Node "${node.label}" requires a valid HTTP method (GET or POST)`,
          });
        }
        break;

      case 'update_guest_field':
        if (!config.field || typeof config.field !== 'string') {
          errors.push({
            nodeId: node.id,
            field: 'field',
            message: `Node "${node.label}" requires a field to update`,
          });
        }
        break;
    }

    return errors;
  },
};

export default AutomationService;
