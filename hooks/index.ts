/**
 * @fileoverview Hooks barrel export
 * 
 * This module re-exports all TanStack Query hooks for the application.
 * Import hooks from this module for cleaner imports.
 * 
 * @module hooks
 * 
 * @example
 * ```tsx
 * import {
 *   useEvents,
 *   useCreateEvent,
 *   useGuests,
 *   useEventGuests,
 *   useEventAnalytics
 * } from '@/hooks';
 * ```
 */

export {
  eventKeys,
  useEvents,
  useEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  type CreateEventWithAssignmentInput,
} from "./use-events"

export {
  guestKeys,
  useGuests,
  useGuestsPaginated,
  useGuest,
  useCreateGuest,
  useUpdateGuest,
  useImportGuests,
} from "./use-guests"

export {
  campaignKeys,
  useCampaignsByEvent,
  useCampaign,
  useCreateCampaign,
  useSendCampaign,
  useCampaignAssets,
  useUploadAsset,
  useDeleteAsset,
  useSaveCampaignDesign,
  useSaveCampaignContent,
  usePreviewCampaign,
  useSendTestEmail,
} from "./use-campaigns"

export {
  eventGuestKeys,
  useEventGuests,
  useAddGuestToEvent,
  useAddGuestsToEvent,
  useRemoveGuestFromEvent,
  type EventGuestWithRelations,
} from "./use-event-guests"

export {
  analyticsKeys,
  useEventAnalytics,
  useCampaignAnalytics,
  useDashboardStats,
} from "./use-analytics"

export {
  useExport,
  useExportGuestList,
  useExportAttendance,
  useExportCampaignReport,
} from "./use-export"

export {
  automationKeys,
  useAutomationsByEvent,
  useAutomation,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
  useDuplicateAutomation,
  useSetAutomationStatus,
  type AutomationWithDetails,
} from "./use-automations"

export {
  executionKeys,
  useAutomationExecutions,
  useExecutionDetails,
  type ExecutionWithSteps,
  type PaginatedExecutions,
} from "./use-automation-executions"

export {
  templateKeys,
  useAutomationTemplates,
  useAutomationTemplate,
  useImportTemplate,
} from "./use-automation-templates"

export {
  guestTagKeys,
  useGuestTagsByEvent,
  useCreateGuestTag,
  useDeleteGuestTag,
} from "./use-guest-tags"

export {
  useUndoRedo,
  areStatesEqual,
  type CanvasState,
  type UseUndoRedoOptions,
  type UseUndoRedoReturn,
} from "./use-undo-redo"


// Event Manager hooks
export {
  eventManagerKeys,
  useEventManagers,
  useEventManager,
  useCreateEventManager,
  useUpdateEventManager,
  useSuspendEventManager,
  useReactivateEventManager,
  useDeactivateEventManager,
  useUpdatePermissions,
} from "./use-event-managers"

// Authorization hooks
export {
  authKeys,
  useRole,
  usePermissions,
  useCanAccessEvent,
  useHasPermission,
  useCanAccess,
  type UserAuthInfo,
} from "./use-auth"

// Event Assignment hooks
export {
  eventAssignmentKeys,
  useEventAssignment,
  useAssignableUsers,
  useAssignEvent,
  useTransferEvent,
  type EventAssignmentWithUser,
  type AssignableUser,
} from "./use-event-assignment"

// Guest Photo hooks
export {
  guestPhotoKeys,
  useGuestPhoto,
  useUploadPhoto,
  useDeletePhoto,
  validatePhotoFile,
  type PhotoUploadResponse,
} from "./use-guest-photo"

// Admin Authorization hooks
export {
  adminAuthKeys,
  useAdminAuth,
  useAdminInfo,
  useAdminAccess,
  type AdminUserInfo,
  type AdminVerificationResult,
} from "./use-admin-auth"

// SMTP Settings hooks
export {
  smtpSettingsKeys,
  useSMTPSettings,
  useSMTPSettingsById,
  useCreateSMTPSettings,
  useUpdateSMTPSettings,
  useDeleteSMTPSettings,
  useSetDefaultSMTPSettings,
  useTestSMTPConnection,
  type SMTPSettingsPublic,
  type CreateSMTPSettingsInput,
  type UpdateSMTPSettingsInput,
  type TestConnectionResult,
} from "./use-smtp-settings"

// Admin Campaign hooks
export {
  adminCampaignKeys,
  useAdminCampaigns,
  useBulkCampaignActions,
  useCampaignDraft,
  useCampaignReport,
  useExportCampaignReportWithFormat,
  type AdminCampaignWithEvent,
  type PaginatedCampaigns,
  type AdminCampaignFilters,
  type CampaignDraftData,
  type CampaignReport,
  type ExportFormat,
} from "./use-admin-campaigns"

// Admin Events hooks
export {
  adminEventKeys,
  useAdminEventsWithGuestCounts,
  useEventGuestCount,
  type EventWithGuestCount,
} from "./use-admin-events"

// Email Template Library hooks
export {
  emailTemplateKeys,
  useEmailTemplates,
  useEmailTemplate,
  useEmailTemplatesForWizard,
  useEmailTemplatesByCategory,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
  useDuplicateEmailTemplate,
  // Aliases for template library UI
  useEmailTemplates as useTemplates,
  useEmailTemplate as useTemplate,
} from "./use-email-templates"

// Scheduled Campaigns hooks
export {
  useScheduledCampaigns,
  useScheduledCampaignsForMonth,
  useUpcomingScheduledCampaigns,
} from "./use-scheduled-campaigns"

// File Upload hooks
export {
  useFileUpload,
  type UploadedFile,
  type UploadProgress,
  type UseFileUploadOptions,
} from "./use-file-upload"

// WhatsApp Template Management hooks
export {
  whatsappTemplateKeys,
  useWhatsAppTemplates,
  useWhatsAppTemplate,
  useCreateWhatsAppTemplate,
  useEditWhatsAppTemplate,
  useDeleteWhatsAppTemplate,
  useSyncWhatsAppTemplates,
  useToggleTemplateFavorite,
  useWhatsAppTemplateFavorites,
  useWhatsAppChannel,
} from "./use-whatsapp-templates"
