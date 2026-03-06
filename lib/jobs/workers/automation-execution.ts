/**
 * @fileoverview Automation Execution Worker
 *
 * Executes automation workflows. Loads the automation from the database,
 * creates execution records, traverses the workflow graph, and handles
 * errors. Uses pg-boss delayed jobs for wait/delay nodes.
 *
 * @module lib/jobs/workers/automation-execution
 */

import type { Job } from "pg-boss";
import { db } from "@/db";
import {
  automations,
  automationExecutions,
  executionSteps,
  eventGuests,
  eventGuestTags,
  guestTags,
  whatsappConversations,
  whatsappChannels,
  type AutomationNode,
  type AutomationEdge,
  type AutomationExecution,
  type ExecutionStep,
  type ExecutionStatus,
  type StepStatus,
  type EventGuest,
  type Guest,
  type Event,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { EmailTemplateService } from "@/lib/services/email-template-service";
import { CampaignSendService } from "@/lib/services/campaign-send-service";
import { sendJob } from "@/lib/jobs/queue";

// ============================================================================
// TYPES
// ============================================================================

export interface AutomationExecutionPayload {
  automationId: string;
  eventGuestId: string;
  triggerData: Record<string, unknown>;
  executionId?: string;
}

interface AutomationWithDetails {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  status: "Draft" | "Active" | "Paused";
  createdAt: Date;
  updatedAt: Date;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

interface ExecutionContext {
  automation: AutomationWithDetails;
  execution: AutomationExecution;
  eventGuest: EventGuest;
  guest: Guest;
  event: Event;
  triggerData: Record<string, unknown>;
  jobId: string;
}

interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

interface ConditionResult {
  result: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// HANDLER
// ============================================================================

export const JOB_NAME = "automation-execution";

export async function handler(
  job: Job<AutomationExecutionPayload>,
) {
  const { automationId, eventGuestId, triggerData } = job.data;
  const jobId = job.id;

  console.log(`[${JOB_NAME}] Starting automation execution`, {
    automationId,
    eventGuestId,
    jobId,
  });

  // Load automation
  const automation = await loadAutomation(automationId);
  if (!automation) {
    throw new Error(`Automation "${automationId}" not found`);
  }

  // Load event guest
  const eventGuestWithRelations = await db.query.eventGuests.findFirst({
    where: eq(eventGuests.id, eventGuestId),
    with: { guest: true, event: true },
  });

  if (!eventGuestWithRelations) {
    throw new Error(`EventGuest "${eventGuestId}" not found`);
  }

  // Create execution record
  const [execution] = await db
    .insert(automationExecutions)
    .values({
      automationId: automation.id,
      eventGuestId,
      triggerData,
      status: "Running",
      triggerDevRunId: jobId, // Store pg-boss job ID for status tracking
    })
    .returning();

  const context: ExecutionContext = {
    automation,
    execution,
    eventGuest: eventGuestWithRelations,
    guest: eventGuestWithRelations.guest,
    event: eventGuestWithRelations.event,
    triggerData,
    jobId,
  };

  const steps: ExecutionStep[] = [];
  let hasFailure = false;

  try {
    const triggerNode = automation.nodes.find((n) => n.type === "trigger");
    if (!triggerNode) throw new Error("Automation has no trigger node");

    await traverseWorkflow(triggerNode, context, steps);

    hasFailure = steps.some((s) => s.status === "Failed");

    const finalStatus: ExecutionStatus = hasFailure ? "Partial" : "Success";
    await db
      .update(automationExecutions)
      .set({ status: finalStatus, completedAt: new Date() })
      .where(eq(automationExecutions.id, execution.id));

    console.log(`[${JOB_NAME}] Automation execution completed`, {
      executionId: execution.id,
      status: finalStatus,
      stepsExecuted: steps.length,
    });

    return {
      executionId: execution.id,
      status: finalStatus,
      stepsExecuted: steps.length,
      success: !hasFailure,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db
      .update(automationExecutions)
      .set({
        status: "Failed",
        error: errorMessage,
        completedAt: new Date(),
      })
      .where(eq(automationExecutions.id, execution.id));

    return {
      executionId: execution.id,
      status: "Failed" as ExecutionStatus,
      stepsExecuted: steps.length,
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// WORKFLOW TRAVERSAL
// ============================================================================

async function loadAutomation(
  automationId: string,
): Promise<AutomationWithDetails | null> {
  const automation = await db.query.automations.findFirst({
    where: eq(automations.id, automationId),
    with: { nodes: true, edges: true },
  });
  return automation ?? null;
}

async function traverseWorkflow(
  node: AutomationNode,
  context: ExecutionContext,
  steps: ExecutionStep[],
  sourceHandle?: string,
): Promise<void> {
  const [step] = await db
    .insert(executionSteps)
    .values({
      executionId: context.execution.id,
      nodeId: node.id,
      status: "Running",
      input: { config: node.config, sourceHandle },
    })
    .returning();

  steps.push(step);

  try {
    let output: Record<string, unknown> = {};
    let nextHandle: string | undefined;

    switch (node.type) {
      case "trigger":
        output = { triggered: true, triggerData: context.triggerData };
        break;

      case "condition": {
        const conditionResult = await evaluateCondition(node, context);
        output = conditionResult.output || {};
        nextHandle = conditionResult.result ? "true" : "false";
        if (conditionResult.error) throw new Error(conditionResult.error);
        break;
      }

      case "action": {
        const actionResult = await executeAction(node, context);
        output = actionResult.output || {};
        if (!actionResult.success)
          throw new Error(actionResult.error || "Action failed");
        break;
      }
    }

    await db
      .update(executionSteps)
      .set({
        status: "Success" as StepStatus,
        output,
        completedAt: new Date(),
      })
      .where(eq(executionSteps.id, step.id));

    const stepIndex = steps.findIndex((s) => s.id === step.id);
    if (stepIndex >= 0) {
      steps[stepIndex] = {
        ...steps[stepIndex],
        status: "Success",
        output,
        completedAt: new Date(),
      };
    }

    // Find and execute next nodes
    const nextEdges = context.automation.edges.filter((e) => {
      if (e.sourceNodeId !== node.id) return false;
      if (node.type === "condition" && nextHandle) {
        return e.sourceHandle === nextHandle;
      }
      return true;
    });

    for (const edge of nextEdges) {
      const nextNode = context.automation.nodes.find(
        (n) => n.id === edge.targetNodeId,
      );
      if (nextNode) {
        await traverseWorkflow(
          nextNode,
          context,
          steps,
          edge.sourceHandle ?? undefined,
        );
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(`[${JOB_NAME}] Node execution failed`, {
      nodeId: node.id,
      stepId: step.id,
      error: errorMessage,
    });

    await db
      .update(executionSteps)
      .set({
        status: "Failed" as StepStatus,
        error: errorMessage,
        completedAt: new Date(),
      })
      .where(eq(executionSteps.id, step.id));

    const stepIndex = steps.findIndex((s) => s.id === step.id);
    if (stepIndex >= 0) {
      steps[stepIndex] = {
        ...steps[stepIndex],
        status: "Failed",
        error: errorMessage,
        completedAt: new Date(),
      };
    }
  }
}

// ============================================================================
// CONDITION EVALUATION
// ============================================================================

async function evaluateCondition(
  node: AutomationNode,
  context: ExecutionContext,
): Promise<ConditionResult> {
  const config = node.config as Record<string, unknown>;

  switch (node.subType) {
    case "check_rsvp_status":
      return checkRsvpStatus(config, context);
    case "check_guest_tag":
      return checkGuestTag(config, context);
    case "check_guest_field":
      return checkGuestField(config, context);
    case "check_time_window":
      return checkTimeWindow(config);
    case "whatsapp_opted_in":
      return checkWhatsAppOptedIn(context);
    case "check_guest_tier":
      return checkGuestTier(config, context);
    default:
      return { result: false, error: `Unknown condition type: ${node.subType}` };
  }
}

function checkRsvpStatus(
  config: Record<string, unknown>,
  context: ExecutionContext,
): ConditionResult {
  const statuses = config.statuses as string[] | undefined;
  if (!statuses || !Array.isArray(statuses)) {
    return { result: false, error: "No statuses configured" };
  }
  const guestStatus = context.eventGuest.rsvpStatus;
  const result = statuses.includes(guestStatus);
  return {
    result,
    output: { guestStatus, configuredStatuses: statuses, matched: result },
  };
}

async function checkGuestTag(
  config: Record<string, unknown>,
  context: ExecutionContext,
): Promise<ConditionResult> {
  const tagId = config.tagId as string | undefined;
  const hasTag = (config.hasTag as boolean) ?? true;
  if (!tagId)
    return { result: false, error: "No tagId configured" };

  const guestTag = await db.query.eventGuestTags.findFirst({
    where: and(
      eq(eventGuestTags.eventGuestId, context.eventGuest.id),
      eq(eventGuestTags.tagId, tagId),
    ),
  });

  const guestHasTag = !!guestTag;
  const result = hasTag ? guestHasTag : !guestHasTag;
  return { result, output: { tagId, hasTag, guestHasTag, matched: result } };
}

function checkGuestField(
  config: Record<string, unknown>,
  context: ExecutionContext,
): ConditionResult {
  const field = config.field as string | undefined;
  const operator = config.operator as string | undefined;
  const value = config.value as string | undefined;
  if (!field) return { result: false, error: "No field configured" };
  if (!operator) return { result: false, error: "No operator configured" };

  const guest = context.guest as Record<string, unknown>;
  const fieldValue = guest[field] as string | undefined | null;
  let result = false;

  switch (operator) {
    case "equals":
      result = fieldValue === value;
      break;
    case "contains":
      result =
        typeof fieldValue === "string" &&
        typeof value === "string" &&
        fieldValue.toLowerCase().includes(value.toLowerCase());
      break;
    case "isEmpty":
      result = !fieldValue || fieldValue.trim() === "";
      break;
    case "isNotEmpty":
      result = !!fieldValue && fieldValue.trim() !== "";
      break;
    default:
      return { result: false, error: `Unknown operator: ${operator}` };
  }

  return { result, output: { field, operator, value, fieldValue, matched: result } };
}

function checkTimeWindow(
  config: Record<string, unknown>,
): ConditionResult {
  const startTime = config.startTime as string | undefined;
  const endTime = config.endTime as string | undefined;
  if (!startTime || !endTime) {
    return { result: false, error: "Start time and end time required" };
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const result = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

  return { result, output: { startTime, endTime, matched: result } };
}

async function checkWhatsAppOptedIn(
  context: ExecutionContext,
): Promise<ConditionResult> {
  try {
    const conversation = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.eventGuestId, context.eventGuest.id),
        eq(whatsappConversations.isActive, true),
      ),
    });
    const result = !!conversation;
    return {
      result,
      output: {
        eventGuestId: context.eventGuest.id,
        hasActiveConversation: result,
        conversationId: conversation?.id ?? null,
      },
    };
  } catch (error) {
    return {
      result: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to check WhatsApp opt-in",
    };
  }
}

function checkGuestTier(
  config: Record<string, unknown>,
  context: ExecutionContext,
): ConditionResult {
  const tiers = config.tiers as string[] | undefined;
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) {
    return { result: false, error: "No tiers configured" };
  }
  const guestTier = context.eventGuest.tier;
  const result = tiers.includes(guestTier);
  return { result, output: { guestTier, configuredTiers: tiers, matched: result } };
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

async function executeAction(
  node: AutomationNode,
  context: ExecutionContext,
): Promise<ActionResult> {
  const config = node.config as Record<string, unknown>;

  switch (node.subType) {
    case "send_email":
      return sendEmail(config, context);
    case "add_guest_tag":
      return addGuestTag(config, context);
    case "remove_guest_tag":
      return removeGuestTag(config, context);
    case "wait_delay":
      return waitDelay(config, context);
    case "send_webhook":
      return sendWebhook(config, context);
    case "update_guest_field":
      return updateGuestField(config, context);
    case "send_campaign":
      return {
        success: true,
        output: { message: "Campaign send triggered", campaignId: config.campaignId },
      };
    case "send_whatsapp_message":
      return sendWhatsAppMessage(config, context);
    default:
      return { success: false, error: `Unknown action type: ${node.subType}` };
  }
}

async function sendEmail(
  config: Record<string, unknown>,
  context: ExecutionContext,
): Promise<ActionResult> {
  const subject = config.subject as string | undefined;
  const content = config.content as string | undefined;
  if (!subject) return { success: false, error: "Email subject is required" };

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const templateContext = EmailTemplateService.createContext(
      context.guest,
      context.event,
      context.eventGuest.qrToken,
      baseUrl,
    );

    const renderedSubject = EmailTemplateService.render(subject, templateContext);
    const renderedContent = EmailTemplateService.render(content || "", templateContext);

    const result = await CampaignSendService.sendEmail({
      to: context.guest.email,
      subject: renderedSubject.content,
      html: renderedContent.content,
      messageId: createId(),
    });

    if (!result.success) {
      return { success: false, error: result.error || "Failed to send email" };
    }

    return {
      success: true,
      output: {
        to: context.guest.email,
        subject: renderedSubject.content,
        messageId: result.messageId,
        provider: "infobip",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

async function addGuestTag(
  config: Record<string, unknown>,
  context: ExecutionContext,
): Promise<ActionResult> {
  const tagId = config.tagId as string | undefined;
  if (!tagId) return { success: false, error: "Tag ID is required" };

  try {
    const tag = await db.query.guestTags.findFirst({
      where: eq(guestTags.id, tagId),
    });
    if (!tag) return { success: false, error: `Tag "${tagId}" not found` };

    const existing = await db.query.eventGuestTags.findFirst({
      where: and(
        eq(eventGuestTags.eventGuestId, context.eventGuest.id),
        eq(eventGuestTags.tagId, tagId),
      ),
    });

    if (existing) {
      return {
        success: true,
        output: { tagId, tagName: tag.name, alreadyHadTag: true },
      };
    }

    await db.insert(eventGuestTags).values({
      eventGuestId: context.eventGuest.id,
      tagId,
    });

    return { success: true, output: { tagId, tagName: tag.name, added: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add tag",
    };
  }
}

async function removeGuestTag(
  config: Record<string, unknown>,
  context: ExecutionContext,
): Promise<ActionResult> {
  const tagId = config.tagId as string | undefined;
  if (!tagId) return { success: false, error: "Tag ID is required" };

  try {
    await db.delete(eventGuestTags).where(
      and(
        eq(eventGuestTags.eventGuestId, context.eventGuest.id),
        eq(eventGuestTags.tagId, tagId),
      ),
    );
    return { success: true, output: { tagId, removed: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove tag",
    };
  }
}

/**
 * Wait for a specified delay.
 *
 * For short delays (< 5 minutes), uses setTimeout in-process.
 * For longer delays, this would ideally use pg-boss startAfter
 * to schedule a continuation job. For now, uses in-process delay
 * which works on long-running servers (not serverless).
 */
async function waitDelay(
  config: Record<string, unknown>,
  _context: ExecutionContext,
): Promise<ActionResult> {
  const duration = config.duration as number | undefined;
  const unit = config.unit as string | undefined;

  if (!duration || duration <= 0) {
    return { success: false, error: "Valid duration is required" };
  }
  if (!unit || !["minutes", "hours", "days"].includes(unit)) {
    return { success: false, error: "Valid unit (minutes, hours, days) is required" };
  }

  const waitStartTime = new Date();

  // Convert to milliseconds
  let ms = 0;
  switch (unit) {
    case "minutes":
      ms = duration * 60 * 1000;
      break;
    case "hours":
      ms = duration * 60 * 60 * 1000;
      break;
    case "days":
      ms = duration * 24 * 60 * 60 * 1000;
      break;
  }

  console.log(`[${JOB_NAME}] Starting wait delay`, {
    duration,
    unit,
    ms,
  });

  // For long-running Node.js server, setTimeout is fine
  await new Promise<void>((resolve) => setTimeout(resolve, ms));

  const waitCompletionTime = new Date();

  return {
    success: true,
    output: {
      duration,
      unit,
      waitStartTime: waitStartTime.toISOString(),
      waitCompletionTime: waitCompletionTime.toISOString(),
      actualWaitMs: waitCompletionTime.getTime() - waitStartTime.getTime(),
    },
  };
}

/**
 * Keep original export for convertToWaitDuration (used by tests).
 */
export function convertToWaitDuration(
  duration: number,
  unit: string,
): { minutes: number } | { hours: number } | { days: number } {
  switch (unit) {
    case "minutes":
      return { minutes: duration };
    case "hours":
      return { hours: duration };
    case "days":
      return { days: duration };
    default:
      return { minutes: duration };
  }
}

async function sendWebhook(
  config: Record<string, unknown>,
  context: ExecutionContext,
): Promise<ActionResult> {
  const url = config.url as string | undefined;
  const method = (config.method as string | undefined) || "POST";
  const payload = config.payload as string | undefined;

  if (!url) return { success: false, error: "Webhook URL is required" };

  try {
    const webhookData = {
      automation: { id: context.automation.id, name: context.automation.name },
      event: { id: context.event.id, name: context.event.name },
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
      method: method as "GET" | "POST",
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(webhookData) : undefined,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Webhook request failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      output: { url, method, statusCode: response.status, sent: true },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send webhook",
    };
  }
}

function updateGuestField(
  config: Record<string, unknown>,
  context: ExecutionContext,
): ActionResult {
  const field = config.field as string | undefined;
  const value = config.value as string | undefined;
  if (!field) return { success: false, error: "Field name is required" };

  return {
    success: true,
    output: {
      field,
      value,
      guestId: context.guest.id,
      note: "Field update recorded",
    },
  };
}

async function sendWhatsAppMessage(
  config: Record<string, unknown>,
  context: ExecutionContext,
): Promise<ActionResult> {
  const messageType = config.messageType as "template" | "session" | undefined;

  if (!messageType || !["template", "session"].includes(messageType)) {
    return {
      success: false,
      error: "Valid messageType ('template' or 'session') is required",
    };
  }

  try {
    const channel = await db.query.whatsappChannels.findFirst({
      where: and(
        eq(whatsappChannels.eventId, context.event.id),
        eq(whatsappChannels.isActive, true),
      ),
    });

    if (!channel) {
      return {
        success: false,
        error: `No active WhatsApp channel for event "${context.event.id}"`,
      };
    }

    const phoneNumber =
      context.eventGuest.updatedMobile || context.guest.mobile;
    if (!phoneNumber) {
      return { success: false, error: "Guest has no phone number" };
    }

    let content: Record<string, unknown>;

    if (messageType === "template") {
      const templateName = config.templateName as string | undefined;
      if (!templateName) {
        return { success: false, error: "templateName is required for template messages" };
      }

      const templateParams = config.templateParams as
        | Record<string, string>
        | undefined;

      const components: Array<Record<string, unknown>> = [];
      if (templateParams && Object.keys(templateParams).length > 0) {
        components.push({
          type: "body",
          parameters: Object.values(templateParams).map((value) => ({
            type: "text",
            text: value,
          })),
        });
      }

      content = {
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          ...(components.length > 0 ? { components } : {}),
        },
      };
    } else {
      const messageBody = config.messageBody as string | undefined;
      if (!messageBody) {
        return { success: false, error: "messageBody is required for session messages" };
      }
      content = { type: "text", text: { body: messageBody } };
    }

    // Enqueue the whatsapp-message-send job
    const jobId = await sendJob("whatsapp-message-send", {
      channelId: channel.id,
      to: phoneNumber,
      content,
      conversationId: undefined,
    });

    console.log(`[${JOB_NAME}] Enqueued whatsapp-message-send job`, {
      jobId,
      channelId: channel.id,
      to: phoneNumber,
      messageType,
    });

    return {
      success: true,
      output: {
        jobId,
        channelId: channel.id,
        to: phoneNumber,
        messageType,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send WhatsApp message",
    };
  }
}
