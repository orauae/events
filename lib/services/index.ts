/**
 * @fileoverview Service Layer Exports
 * 
 * This module serves as the central export point for all business logic services
 * in the ORA Events platform. Services encapsulate domain logic and database
 * operations, providing a clean API for the application layer.
 * 
 * ## Service Categories
 * 
 * ### Core Services
 * - EventService: Event CRUD and management
 * - GuestService: Guest contact management
 * - EventGuestService: Guest-event relationships and RSVP
 * 
 * ### Campaign Services
 * - CampaignService: Email campaign management
 * - CampaignSendService: Email delivery orchestration
 * - EmailTemplateService: Template rendering with merge tags
 * - EmailGenerationService: HTML email generation
 * 
 * ### Automation Services
 * - AutomationService: Workflow definition management
 * - WorkflowEngine: Automation execution engine
 * - ExecutionService: Execution history and logging
 * - TriggerListenerService: Event trigger processing
 * 
 * ### Analytics & Tracking
 * - AnalyticsService: Event and campaign analytics
 * - LinkTrackingService: Click tracking
 * - OpenTrackingService: Email open tracking
 * - BounceService: Bounce handling and categorization
 * 
 * ### Administration
 * - AuthorizationService: Permission checking
 * - AdminAuthorizationService: Admin-level access control
 * - EventManagerService: Event manager user management
 * - SMTPService: SMTP configuration management
 * 
 * @module lib/services
 * @see {@link EventService} for event operations
 * @see {@link CampaignService} for campaign operations
 * @see {@link AutomationService} for automation operations
 */

// ============================================================================
// CORE SERVICES
// ============================================================================

export { EventService, createEventSchema, updateEventSchema } from './event-service';
export type { CreateEventInput, UpdateEventInput } from './event-service';

export { GuestService, createGuestSchema, updateGuestSchema } from './guest-service';
export type { CreateGuestInput, UpdateGuestInput, ImportResult, PaginatedGuests } from './guest-service';

export { EventGuestService, addGuestToEventSchema, updateRSVPSchema } from './event-guest-service';
export type { AddGuestToEventInput, UpdateRSVPInput, EventGuestWithRelations, CheckInResult } from './event-guest-service';

export { CampaignService, createCampaignSchema, updateCampaignSchema, CAMPAIGN_TYPES, CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES } from './campaign-service';
export type { 
  CreateCampaignInput, 
  UpdateCampaignInput, 
  CampaignWithEvent,
  CampaignRecipient,
  SendProgress,
  CampaignFilters,
  PaginationOptions,
  PaginatedResult,
} from './campaign-service';

export { EmailTemplateService, TEMPLATE_VARIABLES, templateContextSchema } from './email-template-service';
export type { TemplateContext, TemplateVariable, RenderResult } from './email-template-service';

export { CampaignSendService, setEmailSender } from './campaign-send-service';
export type { SendCampaignResult, SendEmailResult, ResendWebhookPayload as CampaignSendWebhookPayload, EmailSender } from './campaign-send-service';

export { BadgeService, generateBadgeSchema } from './badge-service';
export type { GenerateBadgeInput, BadgeWithRelations, BadgeContent } from './badge-service';

export { RSVPConfirmationService } from './rsvp-confirmation-service';
export type { RSVPConfirmationResult, EventGuestWithRelations as RSVPEventGuestWithRelations } from './rsvp-confirmation-service';

export { AnalyticsService } from './analytics-service';
export type { EventAnalytics, CampaignAnalytics } from './analytics-service';

export { ExportService } from './export-service';

export { R2StorageService } from './r2-storage-service';
export type { UploadResult } from './r2-storage-service';

export { ImageOptimizerService } from './image-optimizer-service';
export type { OptimizationResult, ImageMetadata } from './image-optimizer-service';

export { MJMLGeneratorService } from './mjml-generator-service';

export { AutomationService, createAutomationSchema, updateAutomationSchema, automationNodeInputSchema, automationEdgeInputSchema } from './automation-service';
export type { 
  CreateAutomationInput, 
  UpdateAutomationInput, 
  AutomationNodeInput, 
  AutomationEdgeInput, 
  AutomationWithDetails, 
  ValidationResult as AutomationValidationResult, 
  ValidationError,
  TriggerType,
  ConditionType,
  ActionType,
} from './automation-service';

export { TemplateService } from './template-service';
export { automationTemplates } from '../automation-templates';
export type { AutomationTemplate, TemplateCategory } from '../automation-templates';

export { WorkflowEngine } from './workflow-engine';
export type { 
  ExecutionContext, 
  ActionResult, 
  ConditionResult, 
  WorkflowExecutionResult 
} from './workflow-engine';

export { ExecutionService } from './execution-service';
export type { 
  ExecutionWithSteps, 
  PaginatedExecutions 
} from './execution-service';

export { TriggerListenerService } from './trigger-listener-service';
export type { 
  TriggerEventType, 
  TriggerEventData, 
  TriggerProcessResult 
} from './trigger-listener-service';

export { AuthorizationService } from './authorization-service';
export type { PermissionType } from './authorization-service';

export { 
  EventManagerService, 
  createEventManagerSchema, 
  updateEventManagerSchema, 
  updatePermissionsSchema 
} from './event-manager-service';
export type { 
  CreateEventManagerInput, 
  UpdateEventManagerInput, 
  UpdatePermissionsInput,
  EventManagerWithStats,
  EventManagerDetail,
  Permissions,
  ListOptions,
} from './event-manager-service';

export { EventAssignmentService } from './event-assignment-service';
export type { 
  EventAssignmentWithEvent,
  EventAssignmentWithUser,
  AssignableUser,
} from './event-assignment-service';

export { GuestPhotoService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from './guest-photo-service';
export type { ValidationResult as PhotoValidationResult, FileInput } from './guest-photo-service';

export { StatisticsService } from './statistics-service';
export type { EventStats, DashboardStats, PresentationStats } from './statistics-service';

export { AdminAuthorizationService, AdminAccessDeniedError } from './admin-authorization-service';
export type { AdminVerificationResult, AdminUserInfo } from './admin-authorization-service';

export { 
  SMTPService, 
  createSMTPSettingsSchema, 
  updateSMTPSettingsSchema,
  encryptPassword,
  decryptPassword,
  SMTP_ENCRYPTION_TYPES,
  DEFAULT_RATE_LIMIT_CONFIG,
} from './smtp-service';
export type { 
  CreateSMTPSettingsInput, 
  UpdateSMTPSettingsInput, 
  SMTPSettingsPublic,
  TestConnectionResult,
  RateLimitConfig,
  RateLimitStatus,
} from './smtp-service';

export { SMTPEmailSender } from './smtp-email-sender';
export type { 
  SMTPSendOptions,
  SMTPSenderConfig,
  SMTPSendResult,
  BatchEmailItem,
  BatchSendResult,
  RateLimitInfo,
} from './smtp-email-sender';

export { InfobipSMSSender } from './infobip-sms-sender';
export type {
  InfobipSMSConfig,
  SMSSendOptions as InfobipSMSSendOptions,
  SMSSendResult as InfobipSMSSendResult,
  BatchSMSItem,
  BatchSMSResult,
} from './infobip-sms-sender';

export { InfobipEmailSender } from './infobip-email-sender';
export type {
  InfobipEmailSendOptions,
  InfobipEmailSendResult,
} from './infobip-email-sender';

export { 
  LinkTrackingService, 
  clickMetadataSchema,
  DEFAULT_DEDUP_WINDOW_MINUTES,
} from './link-tracking-service';
export type { 
  ClickMetadata, 
  LinkClickStats, 
  CampaignClickStats,
  UTMParams,
} from './link-tracking-service';

export { 
  OpenTrackingService, 
  openMetadataSchema,
  DEFAULT_OPEN_DEDUP_WINDOW_MINUTES,
} from './open-tracking-service';
export type { 
  OpenMetadata, 
  CampaignOpenStats,
  RecordOpenResult,
} from './open-tracking-service';

export { 
  EmailTemplateLibraryService, 
  createEmailTemplateSchema, 
  updateEmailTemplateSchema,
  listEmailTemplatesSchema,
  importFromHtmlSchema,
  exportedTemplateSchema,
} from './email-template-library-service';
export type { 
  CreateEmailTemplateInput, 
  UpdateEmailTemplateInput, 
  ListEmailTemplatesInput,
  ImportFromHtmlInput,
  ExportedTemplate,
  EmailTemplateWithDesign,
  PaginatedTemplates,
  ExportResult,
} from './email-template-library-service';

export { ReportService } from './report-service';
export type { 
  DeliveryMetrics, 
  EngagementMetrics, 
  LinkPerformance,
  RecipientStatus,
  RecipientFilters,
  PaginatedRecipientStatus,
  TimelineDataPoint,
  CampaignReport,
  ExportFormat,
} from './report-service';

export { 
  ImportService, 
  columnMappingSchema, 
  importOptionsSchema,
  DEFAULT_BATCH_SIZE as IMPORT_DEFAULT_BATCH_SIZE,
  MAX_FILE_SIZE as IMPORT_MAX_FILE_SIZE,
  MAX_ROWS,
} from './import-service';
export type { 
  ImportFileType,
  ColumnMapping,
  RowValidationError,
  ValidationResult as ImportValidationResult,
  ParsedRow,
  ImportProgress,
  ImportOptions,
  ImportJobResult,
  FileParseResult,
} from './import-service';

export { 
  WebhookService, 
  resendWebhookPayloadSchema,
  SOFT_BOUNCE_THRESHOLD,
} from './webhook-service';
export type { 
  ResendEventType,
  ResendWebhookPayload,
  WebhookProcessResult,
  BounceCategorizationResult,
  SoftBounceCount,
} from './webhook-service';

export { 
  BounceService, 
  SOFT_BOUNCE_THRESHOLD as BOUNCE_SOFT_THRESHOLD,
  UNDELIVERABLE_REASONS,
} from './bounce-service';
export type { 
  EmailBounceStats,
  CampaignBounceStats,
  RecordBounceResult,
  DeliverabilityResult,
  BulkDeliverabilityResult,
  UndeliverableReason,
} from './bounce-service';

export { 
  SchedulingService, 
  scheduleCampaignSchema, 
  updateScheduleSchema,
  MIN_SCHEDULE_LEAD_TIME_MINUTES,
  REMINDER_THRESHOLDS,
  RECURRENCE_PATTERNS,
  COMMON_TIMEZONES,
} from './scheduling-service';
export type { 
  ScheduleCampaignInput, 
  UpdateScheduleInput, 
  ScheduleWithCampaign,
  DueCampaign,
  ReminderDueCampaign,
  ScheduleResult,
  ProcessScheduledResult,
  NextOccurrence,
} from './scheduling-service';

export { 
  ScheduledCampaignProcessor, 
  setNotificationHandler, 
  resetNotificationHandler,
} from './scheduled-campaign-processor';
export type { 
  ProcessRemindersResult,
  ReminderNotificationHandler,
} from './scheduled-campaign-processor';


export { ABTestService } from './ab-test-service';
export type { 
  StartABTestResult,
  SelectWinnerResult,
  SendWinnerResult,
} from './ab-test-service';

export { TriggerRegistrationService } from './trigger-registration-service';
export type { 
  ScheduleRegistrationResult,
  ScheduleUnregistrationResult,
  ScheduleUpdateResult,
} from './trigger-registration-service';

export { EmailGenerationService } from './email-generation-service';
export type { 
  EmailGenerationResult,
  HtmlValidationResult,
  MergeTagContext,
  SampleContext,
} from './email-generation-service';

// ============================================================================
// WHATSAPP CONCIERGE SERVICES
// ============================================================================

export { WhatsAppChannelService } from './whatsapp-channel-service';

export { WhatsAppMessageService, whatsAppMessageContentSchema, validateInteractiveMessage } from './whatsapp-message-service';
export type { WhatsAppMessageContent, MessageType, MessageDirection } from './whatsapp-message-service';

export { ConversationService } from './conversation-service';

export { ConciergeService } from './concierge-service';

export { TokenQueueService } from './token-queue-service';
export type { TokenAssignment, BoothQueuePosition, QueueStatus } from './token-queue-service';

export { BroadcastService } from './broadcast-service';

export { AgendaService } from './agenda-service';

export { KnowledgeBaseService } from './knowledge-base-service';

export { WhatsAppAnalyticsService } from './whatsapp-analytics-service';
export type {
  MessageCountMetrics,
  AIResolutionMetrics,
  BroadcastEngagementMetrics,
  TokenQueueMetrics,
  TopicBreakdown,
  TierMetrics,
  WhatsAppAnalytics,
} from './whatsapp-analytics-service';
