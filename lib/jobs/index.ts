/**
 * @fileoverview Job Queue - Public API
 *
 * Re-exports the queue helpers and worker registration for use throughout
 * the application. Import from `@/lib/jobs` instead of reaching into
 * individual files.
 *
 * @module lib/jobs
 */

export { getQueue, stopQueue, sendJob, scheduleCron } from "./queue";
export { registerAllWorkers, registerScheduledAutomationHandler } from "./register-workers";

// Re-export payload types for callers
export type { BulkEmailSendPayload, SingleEmailPayload } from "./workers/bulk-email-send";
export type { BulkSmsSendPayload, SingleSmsSendPayload } from "./workers/bulk-sms-send";
export type { ConciergeRespondPayload } from "./workers/concierge-respond";
export type { WhatsAppMessageSendPayload } from "./workers/whatsapp-message-send";
export type { WhatsAppBroadcastSendPayload } from "./workers/whatsapp-broadcast-send";
export type { AutomationExecutionPayload } from "./workers/automation-execution";
export type { ScheduledAutomationPayload } from "./workers/scheduled-automation";
