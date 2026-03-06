/**
 * @fileoverview Database Schema - Drizzle ORM table definitions
 * 
 * This module defines all database tables, enums, and types for the EventOS platform.
 * Uses Drizzle ORM with PostgreSQL (Neon).
 * 
 * ## Entity Overview
 * 
 * - **Events**: Core event entity with dates, location, and host info
 * - **Guests**: Central contact database (unique by email)
 * - **EventGuests**: Guest participation in events (RSVP, check-in)
 * - **Campaigns**: Email campaigns for events
 * - **Automations**: Workflow automations with nodes and edges
 * - **GuestTags**: Labels for categorizing guests
 * 
 * ## Relationships
 * 
 * ```
 * Event (1) ─── (N) EventGuest (N) ─── (1) Guest
 *   │                   │
 *   ├── (N) Campaign    └── (1) Badge
 *   ├── (N) Automation
 *   └── (N) GuestTag
 * ```
 * 
 * @module db/schema
 * @requires drizzle-orm/pg-core
 * @requires @paralleldrive/cuid2
 */

import { pgTable, text, timestamp, pgEnum, uniqueIndex, boolean, jsonb, integer, unique } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Event type classification.
 * Determines the nature and typical format of the event.
 */
export const eventTypeEnum = pgEnum('event_type', ['Conference', 'Private', 'Corporate', 'Exhibition', 'ProductLaunch', 'OpenHouse']);

/**
 * Invitation delivery status.
 * Tracks whether the invitation email was sent and delivered.
 */
export const invitationStatusEnum = pgEnum('invitation_status', ['Pending', 'Sent', 'Delivered', 'Failed']);

/**
 * Guest RSVP response status.
 * Indicates the guest's response to the event invitation.
 */
export const rsvpStatusEnum = pgEnum('rsvp_status', ['Pending', 'Attending', 'NotAttending']);

/**
 * Guest check-in status at the event.
 */
export const checkInStatusEnum = pgEnum('check_in_status', ['NotCheckedIn', 'CheckedIn']);

/**
 * Campaign type classification.
 * Determines the purpose and timing of the email campaign.
 */
export const campaignTypeEnum = pgEnum('campaign_type', ['Invitation', 'Reminder', 'LastChance', 'EventDayInfo', 'ThankYou', 'Feedback']);

/**
 * Campaign channel - the delivery medium for the campaign.
 * - email: Traditional email campaign (default)
 * - whatsapp: WhatsApp Business API campaign
 * - sms: Via infobip sms api
 */
export const campaignChannelEnum = pgEnum('campaign_channel', ['email', 'whatsapp', 'sms']);

/**
 * Campaign delivery status.
 * Tracks the campaign's progress through the send pipeline.
 * 
 * - Draft: Campaign is being created/edited
 * - Scheduled: Campaign is scheduled for future delivery
 * - Queued: Campaign is queued for immediate processing (background task triggered)
 * - Sending: Campaign is currently being sent
 * - Sent: Campaign has been fully sent
 * - Paused: Campaign sending has been paused (can be resumed)
 * - Cancelled: Campaign has been cancelled (cannot be resumed)
 */
export const campaignStatusEnum = pgEnum('campaign_status', ['Draft', 'Scheduled', 'Queued', 'Sending', 'Sent', 'Paused', 'Cancelled']);

/**
 * Individual message delivery status.
 * Tracks each email's delivery progress.
 */
export const messageStatusEnum = pgEnum('message_status', ['Pending', 'Sent', 'Delivered', 'Failed', 'Bounced']);

// Automation Enums

/**
 * Automation workflow status.
 * Controls whether the automation is active and processing triggers.
 */
export const automationStatusEnum = pgEnum('automation_status', ['Draft', 'Active', 'Paused']);

/**
 * Automation node type.
 * Categorizes nodes by their function in the workflow.
 */
export const nodeTypeEnum = pgEnum('node_type', ['trigger', 'condition', 'action']);

/**
 * Automation execution status.
 * Indicates the overall result of running an automation.
 */
export const executionStatusEnum = pgEnum('execution_status', ['Running', 'Success', 'Failed', 'Partial']);

/**
 * Individual execution step status.
 * Tracks each node's execution result.
 */
export const stepStatusEnum = pgEnum('step_status', ['Pending', 'Running', 'Success', 'Failed', 'Skipped']);

/**
 * User role classification.
 * Determines the access level and capabilities of a user.
 */
export const userRoleEnum = pgEnum('user_role', ['Admin', 'EventManager']);

/**
 * Event manager account status.
 * Controls the lifecycle state of an event manager account.
 */
export const managerStatusEnum = pgEnum('manager_status', ['Active', 'Suspended', 'Deactivated']);

/**
 * SMTP encryption type.
 * Determines the encryption method for SMTP connections.
 */
export const smtpEncryptionEnum = pgEnum('smtp_encryption', ['tls', 'ssl', 'none']);

/**
 * Bounce type classification.
 * Categorizes email bounces as permanent or temporary.
 */
export const bounceTypeEnum = pgEnum('bounce_type', ['hard', 'soft']);

/**
 * Email template category.
 * Categorizes templates by their intended use case.
 */
export const templateCategoryEnum = pgEnum('template_category', ['Invitation', 'Reminder', 'LastChance', 'EventDay', 'ThankYou', 'Feedback', 'Custom']);

/**
 * Import job status.
 * Tracks the progress of guest import operations.
 */
export const importJobStatusEnum = pgEnum('import_job_status', ['pending', 'processing', 'completed', 'failed', 'cancelled']);

/**
 * Recurrence pattern for scheduled campaigns.
 * Defines how often a recurring campaign should be sent.
 */
export const recurrencePatternEnum = pgEnum('recurrence_pattern', ['daily', 'weekly', 'monthly']);

// WhatsApp AI Concierge Enums

/**
 * Guest tier classification.
 * Determines queue behavior, AI tone, and service priority.
 */
export const guestTierEnum = pgEnum('guest_tier', ['Regular', 'VIP', 'VVIP']);

/**
 * WhatsApp message type.
 * Categorizes the content format of a WhatsApp message.
 */
export const waMessageTypeEnum = pgEnum('wa_message_type', ['text', 'image', 'document', 'location', 'interactive', 'template']);

/**
 * WhatsApp message direction.
 * Indicates whether a message was sent or received.
 */
export const waMessageDirectionEnum = pgEnum('wa_message_direction', ['inbound', 'outbound']);

/**
 * WhatsApp message delivery status.
 * Tracks the delivery lifecycle of an outbound message.
 */
export const waMessageStatusEnum = pgEnum('wa_message_status', ['pending', 'sent', 'delivered', 'read', 'failed']);

/**
 * Conversation escalation status.
 * Indicates whether the conversation is managed by AI or a human operator.
 */
export const waEscalationStatusEnum = pgEnum('wa_escalation_status', ['ai_managed', 'human_managed']);

/**
 * Knowledge base entry category.
 * Categorizes FAQ entries for the event concierge.
 */
export const kbCategoryEnum = pgEnum('kb_category', ['wifi', 'parking', 'emergency', 'restrooms', 'food_beverage', 'transportation', 'general']);

/**
 * Survey question response type.
 * Determines how guests can respond to a survey question.
 */
export const surveyQuestionTypeEnum = pgEnum('survey_question_type', ['free_text', 'single_choice', 'multiple_choice']);

/**
 * Queue item status.
 * Tracks a guest's position lifecycle in a booth queue.
 */
export const queueItemStatusEnum = pgEnum('queue_item_status', ['waiting', 'serving', 'served', 'skipped']);

// WhatsApp Template Management Enums

/**
 * WhatsApp template approval status.
 * Tracks the Meta review status of a WhatsApp message template.
 */
export const waTemplateStatusEnum = pgEnum('wa_template_status', [
  'APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'
]);

/**
 * WhatsApp template category.
 * Categorizes templates by their intended use case per Meta's classification.
 */
export const waTemplateCategoryEnum = pgEnum('wa_template_category', [
  'MARKETING', 'UTILITY', 'AUTHENTICATION'
]);

// ============================================================================
// TABLES
// ============================================================================

/**
 * Events table - Core event entity.
 * 
 * Stores event details including dates, location, and host information.
 * Events are the top-level entity that guests, campaigns, and automations
 * are associated with.
 */
export const events = pgTable('events', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  type: eventTypeEnum('type').notNull(),
  description: text('description').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  location: text('location').notNull(),
  latitude: text('latitude'),
  longitude: text('longitude'),
  addressId: text('address_id'),
  tierConfig: jsonb('tier_config'), // Per-event tier-specific configuration (collection points, priority lanes)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Addresses table - Saved/reusable locations.
 * 
 * Stores location details with coordinates for reuse across events.
 * Enables quick location selection and Google Maps direction links.
 */
export const addresses = pgTable('addresses', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  formattedAddress: text('formatted_address').notNull(),
  latitude: text('latitude').notNull(),
  longitude: text('longitude').notNull(),
  placeId: text('place_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Guests table - Central contact database.
 * 
 * Stores contact information for all guests. Each guest has a unique email.
 * Guests can be invited to multiple events via EventGuest records.
 */
export const guests = pgTable('guests', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  mobile: text('mobile'),
  company: text('company'),
  jobTitle: text('job_title'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});


/**
 * EventGuests table - Guest participation records.
 * 
 * Links guests to events and tracks their participation status:
 * - Invitation status (sent, delivered, failed)
 * - RSVP status (pending, attending, not attending)
 * - Check-in status and time
 * - Unique QR token for RSVP links and check-in
 * 
 * Has a unique constraint on (eventId, guestId) to prevent duplicates.
 */
export const eventGuests = pgTable('event_guests', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  guestId: text('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  invitationStatus: invitationStatusEnum('invitation_status').default('Pending').notNull(),
  rsvpStatus: rsvpStatusEnum('rsvp_status').default('Pending').notNull(),
  tier: guestTierEnum('tier').default('Regular').notNull(),
  checkInStatus: checkInStatusEnum('check_in_status').default('NotCheckedIn').notNull(),
  checkInTime: timestamp('check_in_time'),
  qrToken: text('qr_token').notNull().unique().$defaultFn(() => createId()),
  // RSVP form fields - guest-submitted data during RSVP
  representingCompany: boolean('representing_company').default(false),
  companyRepresented: text('company_represented'), // Company name entered by guest during RSVP
  updatedMobile: text('updated_mobile'), // Corrected phone number from RSVP (preserves original in guests table)
  rsvpSubmittedAt: timestamp('rsvp_submitted_at'), // When the RSVP form was submitted
  // RSVP device/location tracking for analytics
  rsvpIpAddress: text('rsvp_ip_address'), // IP address when RSVP was submitted
  rsvpUserAgent: text('rsvp_user_agent'), // Browser user agent string
  rsvpDeviceInfo: jsonb('rsvp_device_info'), // Parsed device info (browser, OS, device type, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  eventGuestUnique: uniqueIndex('event_guest_unique').on(table.eventId, table.guestId),
}));

/**
 * Campaigns table - Email campaigns for events.
 * 
 * Stores campaign metadata and content. Each campaign is associated
 * with an event and can be of various types (Invitation, Reminder, etc.).
 * The designJson field stores the visual email builder state.
 * 
 * Includes analytics counters for tracking campaign performance:
 * - recipientCount: Total number of recipients
 * - sentCount: Number of emails sent
 * - deliveredCount: Number of emails delivered
 * - openedCount: Number of unique opens
 * - clickedCount: Number of unique clicks
 * - bouncedCount: Number of bounced emails
 * - unsubscribedCount: Number of unsubscribes
 * 
 * A/B testing support:
 * - isAbTest: Whether this is an A/B test campaign
 * - abTestConfig: Configuration for A/B test variants
 * - winningVariant: The winning variant after test completion
 */
export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: campaignTypeEnum('type').notNull(),
  channel: campaignChannelEnum('channel').default('email').notNull(),
  subject: text('subject').notNull(),
  content: text('content').notNull(),
  designJson: jsonb('design_json'), // Visual email builder JSON structure
  // WhatsApp-specific fields
  whatsappTemplateId: text('whatsapp_template_id'), // Meta-approved template name
  whatsappContent: jsonb('whatsapp_content'), // WhatsAppMessageContent JSON
  whatsappMediaUrl: text('whatsapp_media_url'), // Optional media attachment URL
  whatsappMediaType: text('whatsapp_media_type'), // 'image' | 'document' | 'video'
  // SMS-specific fields
  smsBody: text('sms_body'), // SMS message body text
  smsSenderId: text('sms_sender_id'), // Alphanumeric sender ID (max 11 chars)
  smsEncoding: text('sms_encoding'), // 'GSM-7' | 'UCS-2'
  smsSegmentCount: integer('sms_segment_count'), // Number of SMS segments
  smsOptOutFooter: boolean('sms_opt_out_footer').default(true), // Whether opt-out footer is appended
  status: campaignStatusEnum('status').default('Draft').notNull(),
  scheduledAt: timestamp('scheduled_at'),
  sentAt: timestamp('sent_at'),
  // Analytics counters
  recipientCount: integer('recipient_count').default(0).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  deliveredCount: integer('delivered_count').default(0).notNull(),
  openedCount: integer('opened_count').default(0).notNull(),
  clickedCount: integer('clicked_count').default(0).notNull(),
  bouncedCount: integer('bounced_count').default(0).notNull(),
  unsubscribedCount: integer('unsubscribed_count').default(0).notNull(),
  // A/B testing support
  isAbTest: boolean('is_ab_test').default(false).notNull(),
  abTestConfig: jsonb('ab_test_config'),
  winningVariant: text('winning_variant'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * EmailAssets table - Uploaded images for email campaigns.
 * 
 * Stores metadata for images uploaded via the visual email builder.
 * Images are stored in Cloudflare R2 and referenced by their public URL.
 */
export const emailAssets = pgTable('email_assets', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  originalFilename: text('original_filename').notNull(),
  r2Key: text('r2_key').notNull(),
  publicUrl: text('public_url').notNull(),
  fileSize: integer('file_size').notNull(),
  optimizedSize: integer('optimized_size'),
  mimeType: text('mime_type').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * EmailAttachments table - File attachments for email campaigns.
 * 
 * Stores metadata for files attached to emails (PDFs, documents, etc.).
 * Attachments are stored in Cloudflare R2 with private access.
 * Unlike inline images (emailAssets), these are included as email attachments.
 */
export const emailAttachments = pgTable('email_attachments', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  originalFilename: text('original_filename').notNull(),
  r2Key: text('r2_key').notNull(),
  publicUrl: text('public_url').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * CampaignMessages table - Individual email delivery tracking.
 * 
 * Tracks the delivery status of each email sent as part of a campaign.
 * One record per recipient per campaign.
 * 
 * Engagement tracking:
 * - openedAt: Timestamp when the email was first opened
 * - clickedAt: Timestamp when a link was first clicked
 * 
 * Bounce handling:
 * - bounceType: Type of bounce (hard/soft) if the email bounced
 * - resendMessageId: ID of the resent message if this was a retry
 */
export const campaignMessages = pgTable('campaign_messages', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  eventGuestId: text('event_guest_id').notNull(),
  status: messageStatusEnum('status').default('Pending').notNull(),
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
  bounceType: bounceTypeEnum('bounce_type'),
  resendMessageId: text('resend_message_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Badges table - Event badges for guests.
 * 
 * Stores badge records for guests who have confirmed attendance.
 * Each badge has a QR token (same as EventGuest) for check-in.
 * Badges are automatically generated when RSVP status is "Attending".
 */
export const badges = pgTable('badges', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventGuestId: text('event_guest_id').notNull().unique().references(() => eventGuests.id, { onDelete: 'cascade' }),
  qrToken: text('qr_token').notNull(),
  pdfUrl: text('pdf_url'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

/**
 * Automations table - Workflow automation definitions.
 * 
 * Stores automation metadata. The actual workflow is defined by
 * AutomationNodes and AutomationEdges. Automations must be validated
 * before they can be activated.
 */
export const automations = pgTable('automations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: automationStatusEnum('status').default('Draft').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * AutomationNodes table - Workflow nodes.
 * 
 * Stores individual nodes in an automation workflow:
 * - Trigger nodes: Start the workflow (RSVP, check-in, etc.)
 * - Condition nodes: Branch based on guest data
 * - Action nodes: Perform operations (send email, add tag, etc.)
 * 
 * The config field stores node-specific configuration as JSON.
 */
export const automationNodes = pgTable('automation_nodes', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  automationId: text('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  type: nodeTypeEnum('type').notNull(),
  subType: text('sub_type').notNull(),
  label: text('label').notNull(),
  positionX: text('position_x').notNull(),
  positionY: text('position_y').notNull(),
  config: jsonb('config').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * AutomationEdges table - Workflow connections.
 * 
 * Defines connections between nodes in an automation workflow.
 * For condition nodes, sourceHandle indicates which branch (true/false).
 */
export const automationEdges = pgTable('automation_edges', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  automationId: text('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  sourceNodeId: text('source_node_id').notNull(),
  targetNodeId: text('target_node_id').notNull(),
  sourceHandle: text('source_handle'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * AutomationExecutions table - Workflow execution records.
 * 
 * Records each time an automation is triggered and executed.
 * Stores the trigger data and overall execution status.
 * Includes Trigger.dev run ID for tracking durable executions.
 */
export const automationExecutions = pgTable('automation_executions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  automationId: text('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  eventGuestId: text('event_guest_id').references(() => eventGuests.id),
  triggerData: jsonb('trigger_data').default({}).notNull(),
  status: executionStatusEnum('status').default('Running').notNull(),
  error: text('error'),
  triggerDevRunId: text('trigger_dev_run_id'), // Trigger.dev run ID for tracking
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

/**
 * ExecutionSteps table - Individual node execution records.
 * 
 * Records the execution of each node during an automation run.
 * Stores input, output, and any errors for debugging.
 */
export const executionSteps = pgTable('execution_steps', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  executionId: text('execution_id').notNull().references(() => automationExecutions.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  status: stepStatusEnum('status').default('Pending').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

/**
 * AutomationSchedules table - Trigger.dev schedule tracking.
 * 
 * Tracks Trigger.dev schedules for automations with scheduled triggers.
 * Links automations to their Trigger.dev schedule IDs for management.
 * Used for registering, updating, and unregistering schedules.
 */
export const automationSchedules = pgTable('automation_schedules', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  automationId: text('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  triggerDevScheduleId: text('trigger_dev_schedule_id'), // Trigger.dev schedule ID
  cronExpression: text('cron_expression').notNull(),
  timezone: text('timezone').default('UTC'),
  isActive: boolean('is_active').default(false),
  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * EventDateTriggerExecutions table - Event date trigger deduplication.
 * 
 * Tracks which event/automation combinations have already fired
 * for event_date_approaching triggers. Prevents duplicate triggers
 * for the same event and automation.
 */
export const eventDateTriggerExecutions = pgTable('event_date_trigger_executions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  automationId: text('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate triggers
  uniqueAutomationEvent: unique().on(table.automationId, table.eventId),
}));

/**
 * GuestTags table - Labels for categorizing guests.
 * 
 * Event-specific tags that can be applied to guests.
 * Used for segmentation and automation conditions.
 * Has a unique constraint on (eventId, name).
 */
export const guestTags = pgTable('guest_tags', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').default('#B8956B').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  eventTagUnique: uniqueIndex('event_tag_unique').on(table.eventId, table.name),
}));

/**
 * EventGuestTags table - Junction table for guest tags.
 * 
 * Links EventGuests to GuestTags. A guest can have multiple tags,
 * and a tag can be applied to multiple guests.
 */
export const eventGuestTags = pgTable('event_guest_tags', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventGuestId: text('event_guest_id').notNull().references(() => eventGuests.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => guestTags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  guestTagUnique: uniqueIndex('guest_tag_unique').on(table.eventGuestId, table.tagId),
}));


// ============================================================================
// BETTER AUTH TABLES
// ============================================================================

/**
 * User table - Authentication users.
 * Managed by Better Auth with role-based access control extensions.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: userRoleEnum('role').default('EventManager').notNull(),
  status: managerStatusEnum('status').default('Active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Session table - User sessions.
 * Managed by Better Auth.
 */
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

/**
 * Account table - OAuth provider accounts.
 * Managed by Better Auth.
 */
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Verification table - Email verification tokens.
 * Managed by Better Auth.
 */
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});


// ============================================================================
// EVENT MANAGER ROLES & PERMISSIONS TABLES
// ============================================================================

/**
 * EventManagerPermissions table - Granular permissions for event managers.
 * 
 * Stores configurable permissions for each Event_Manager user.
 * Each permission flag controls access to specific features.
 * Has a unique constraint on userId (one permission record per user).
 */
export const eventManagerPermissions = pgTable('event_manager_permissions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  canCreateEvents: boolean('can_create_events').default(false).notNull(),
  canUploadExcel: boolean('can_upload_excel').default(true).notNull(),
  canSendCampaigns: boolean('can_send_campaigns').default(true).notNull(),
  canManageAutomations: boolean('can_manage_automations').default(false).notNull(),
  canDeleteGuests: boolean('can_delete_guests').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * EventAssignments table - Links events to assigned managers.
 * 
 * Tracks which user (Admin or Event_Manager) is responsible for each event.
 * Has a unique constraint on eventId (one assignment per event).
 * Uses 'restrict' on delete for assignedUserId to prevent orphaned events.
 */
export const eventAssignments = pgTable('event_assignments', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().unique().references(() => events.id, { onDelete: 'cascade' }),
  assignedUserId: text('assigned_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  assignedBy: text('assigned_by').notNull().references(() => user.id),
});

/**
 * GuestPhotos table - Photo metadata for guests.
 * 
 * Stores metadata for uploaded guest photos used for identification
 * during check-in and badge personalization.
 * Has a unique constraint on guestId (one photo per guest).
 */
export const guestPhotos = pgTable('guest_photos', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  guestId: text('guest_id').notNull().unique().references(() => guests.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  publicUrl: text('public_url').notNull(),
  originalFilename: text('original_filename').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


// ============================================================================
// ADMIN EMAIL CAMPAIGN MANAGEMENT TABLES
// ============================================================================

/**
 * SMTPSettings table - SMTP configuration for email delivery.
 * 
 * Stores SMTP server configurations with encrypted passwords.
 * Supports multiple providers with one marked as default.
 * Includes rate limiting configuration per provider.
 */
export const smtpSettings = pgTable('smtp_settings', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  username: text('username').notNull(),
  passwordEncrypted: text('password_encrypted').notNull(),
  encryption: smtpEncryptionEnum('encryption').default('tls').notNull(),
  fromEmail: text('from_email').notNull(),
  fromName: text('from_name').notNull(),
  replyToEmail: text('reply_to_email'),
  isDefault: boolean('is_default').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  dailyLimit: integer('daily_limit'),
  hourlyLimit: integer('hourly_limit'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * CampaignLinks table - Link tracking for campaigns.
 * 
 * Stores tracking URLs for links in email campaigns.
 * Each link has a unique tracking URL and optional UTM parameters.
 * Used to measure click-through rates and engagement.
 */
export const campaignLinks = pgTable('campaign_links', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  originalUrl: text('original_url').notNull(),
  trackingUrl: text('tracking_url').notNull().unique(),
  label: text('label'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * LinkClicks table - Click tracking for campaign links.
 * 
 * Records each click on a tracked link with metadata.
 * Used for analytics and engagement measurement.
 * Includes deduplication support via timestamp comparison.
 */
export const linkClicks = pgTable('link_clicks', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  linkId: text('link_id').notNull().references(() => campaignLinks.id, { onDelete: 'cascade' }),
  campaignMessageId: text('campaign_message_id').references(() => campaignMessages.id, { onDelete: 'set null' }),
  recipientEmail: text('recipient_email').notNull(),
  clickedAt: timestamp('clicked_at').defaultNow().notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  referer: text('referer'),
});

/**
 * EmailOpens table - Open tracking for campaign emails.
 * 
 * Records email opens via tracking pixel.
 * Tracks unique opens per recipient with metadata.
 */
export const emailOpens = pgTable('email_opens', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  campaignMessageId: text('campaign_message_id').notNull().references(() => campaignMessages.id, { onDelete: 'cascade' }),
  openedAt: timestamp('opened_at').defaultNow().notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
});

/**
 * Bounces table - Email bounce tracking.
 * 
 * Records email bounces with categorization (hard/soft).
 * Used for list hygiene and sender reputation management.
 * Hard bounces mark recipients as undeliverable.
 */
export const bounces = pgTable('bounces', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  campaignMessageId: text('campaign_message_id').references(() => campaignMessages.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  bounceType: bounceTypeEnum('bounce_type').notNull(),
  bounceReason: text('bounce_reason'),
  bouncedAt: timestamp('bounced_at').defaultNow().notNull(),
});

/**
 * Unsubscribes table - Unsubscribe management.
 * 
 * Tracks unsubscribed email addresses.
 * Prevents sending to unsubscribed recipients.
 * Has unique constraint on email to prevent duplicates.
 */
export const unsubscribes = pgTable('unsubscribes', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  campaignId: text('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  reason: text('reason'),
  unsubscribedAt: timestamp('unsubscribed_at').defaultNow().notNull(),
});

/**
 * EmailTemplates table - Reusable email template library.
 * 
 * Stores email templates with visual builder JSON and HTML content.
 * Templates are categorized and can be marked as default per category.
 * Used as starting points for campaign creation.
 */
export const emailTemplates = pgTable('email_templates', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description'),
  category: templateCategoryEnum('category').notNull(),
  subject: text('subject').notNull(),
  designJson: jsonb('design_json').notNull(),
  htmlContent: text('html_content'),
  isDefault: boolean('is_default').default(false).notNull(),
  thumbnailUrl: text('thumbnail_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * ImportJobs table - Guest import job tracking.
 * 
 * Tracks bulk guest import operations with progress.
 * Stores column mapping and error reports.
 * Supports resuming interrupted imports.
 */
export const importJobs = pgTable('import_jobs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  totalRows: integer('total_rows'),
  processedRows: integer('processed_rows').default(0).notNull(),
  successCount: integer('success_count').default(0).notNull(),
  errorCount: integer('error_count').default(0).notNull(),
  status: importJobStatusEnum('status').default('pending').notNull(),
  columnMapping: jsonb('column_mapping'),
  errorReportUrl: text('error_report_url'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * CampaignSchedules table - Campaign scheduling.
 * 
 * Stores scheduling information for campaigns.
 * Supports one-time and recurring schedules.
 * Tracks reminder notification status.
 */
export const campaignSchedules = pgTable('campaign_schedules', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  campaignId: text('campaign_id').notNull().unique().references(() => campaigns.id, { onDelete: 'cascade' }),
  scheduledAt: timestamp('scheduled_at').notNull(),
  timezone: text('timezone').default('UTC').notNull(),
  isRecurring: boolean('is_recurring').default(false).notNull(),
  recurrencePattern: recurrencePatternEnum('recurrence_pattern'),
  recurrenceEndDate: timestamp('recurrence_end_date'),
  reminderSent24h: boolean('reminder_sent_24h').default(false).notNull(),
  reminderSent1h: boolean('reminder_sent_1h').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


// ============================================================================
// WHATSAPP AI CONCIERGE TABLES
// ============================================================================

/**
 * WhatsApp Channels table - Per-event WhatsApp Business Account configuration.
 *
 * Links a WhatsApp Business Account (phone number, access token) to a specific event.
 * Enforces one-to-one relationship via unique constraint on eventId.
 */
export const whatsappChannels = pgTable('whatsapp_channels', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().unique().references(() => events.id, { onDelete: 'cascade' }),
  phoneNumberId: text('phone_number_id').notNull(),
  whatsappBusinessAccountId: text('whatsapp_business_account_id').notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  verifyToken: text('verify_token').notNull().$defaultFn(() => createId()),
  unknownGuestTemplateId: text('unknown_guest_template_id'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * WhatsApp Conversations table - Stateful sessions between guests and the concierge.
 *
 * Tracks message history, escalation status, session window, and conversation state.
 * Unique constraint on (eventId, eventGuestId) ensures one conversation per guest per event.
 */
export const whatsappConversations = pgTable('whatsapp_conversations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  channelId: text('channel_id').notNull().references(() => whatsappChannels.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  eventGuestId: text('event_guest_id').notNull().references(() => eventGuests.id, { onDelete: 'cascade' }),
  guestPhoneNumber: text('guest_phone_number').notNull(),
  escalationStatus: waEscalationStatusEnum('escalation_status').default('ai_managed').notNull(),
  sessionWindowExpiresAt: timestamp('session_window_expires_at'),
  state: jsonb('state').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  eventGuestUnique: uniqueIndex('wa_conv_event_guest_unique').on(table.eventId, table.eventGuestId),
}));

/**
 * WhatsApp Messages table - Individual message records.
 *
 * Stores every inbound and outbound WhatsApp message with content as structured JSON.
 * Tracks delivery status, AI generation flag, and topic classification.
 * Optional broadcastId links messages sent as part of a broadcast for metric aggregation.
 */
export const whatsappMessages = pgTable('whatsapp_messages', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  conversationId: text('conversation_id').notNull().references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => whatsappChannels.id, { onDelete: 'cascade' }),
  broadcastId: text('broadcast_id').references(() => whatsappBroadcasts.id, { onDelete: 'set null' }),
  waMessageId: text('wa_message_id'),
  direction: waMessageDirectionEnum('direction').notNull(),
  type: waMessageTypeEnum('type').notNull(),
  content: jsonb('content').notNull(),
  status: waMessageStatusEnum('status').default('pending').notNull(),
  aiGenerated: boolean('ai_generated').default(false).notNull(),
  topicCategory: text('topic_category'),
  statusUpdatedAt: timestamp('status_updated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * WhatsApp Broadcasts table - Organizer-initiated bulk messages.
 *
 * Stores broadcast content, recipient filters, optional survey questions,
 * and delivery metric counters.
 */
export const whatsappBroadcasts = pgTable('whatsapp_broadcasts', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => whatsappChannels.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull(),
  filter: jsonb('filter'),
  survey: jsonb('survey'),
  totalRecipients: integer('total_recipients').default(0).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  deliveredCount: integer('delivered_count').default(0).notNull(),
  readCount: integer('read_count').default(0).notNull(),
  respondedCount: integer('responded_count').default(0).notNull(),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * WhatsApp Broadcast Responses table - Individual survey responses.
 *
 * Links a guest's response to a specific broadcast question.
 */
export const whatsappBroadcastResponses = pgTable('whatsapp_broadcast_responses', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  broadcastId: text('broadcast_id').notNull().references(() => whatsappBroadcasts.id, { onDelete: 'cascade' }),
  eventGuestId: text('event_guest_id').notNull().references(() => eventGuests.id, { onDelete: 'cascade' }),
  questionIndex: integer('question_index').notNull(),
  response: text('response').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * WhatsApp Token Queues table - Token assignment and booth queue management.
 *
 * Assigns sequential token numbers to guests and tracks booth queue positions.
 * Unique constraints prevent duplicate tokens per event and duplicate queue entries.
 */
export const whatsappTokenQueues = pgTable('whatsapp_token_queues', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  eventGuestId: text('event_guest_id').notNull().references(() => eventGuests.id, { onDelete: 'cascade' }),
  tokenNumber: integer('token_number').notNull(),
  boothName: text('booth_name'),
  status: queueItemStatusEnum('status').default('waiting').notNull(),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  servedAt: timestamp('served_at'),
}, (table) => ({
  eventTokenUnique: uniqueIndex('wa_event_token_unique').on(table.eventId, table.tokenNumber),
  eventGuestBoothUnique: uniqueIndex('wa_event_guest_booth_unique').on(table.eventId, table.eventGuestId, table.boothName),
}));

/**
 * Event Agendas table - Structured event session schedule.
 *
 * Stores agenda items with time, speaker, location, and optional slide bullet points.
 * Used by the concierge to answer guest questions about sessions.
 */
export const eventAgendas = pgTable('event_agendas', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  speakerName: text('speaker_name'),
  description: text('description'),
  hallLocation: text('hall_location'),
  slideBulletPoints: jsonb('slide_bullet_points'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Event Knowledge Base table - FAQ entries for the AI concierge.
 *
 * Stores categorized question/answer pairs per event.
 * The concierge uses these to answer common guest questions accurately.
 */
export const eventKnowledgeBase = pgTable('event_knowledge_base', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  category: kbCategoryEnum('category').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});


// ============================================================================
// WHATSAPP TEMPLATE MANAGEMENT TABLES
// ============================================================================

/**
 * WhatsApp Templates table - Locally cached WhatsApp message templates.
 *
 * Stores templates synced from the Meta Business Management API.
 * Templates are upserted during periodic sync and updated via webhooks.
 * Soft-deleted when removed from Meta to preserve campaign history references.
 * Unique constraint on (wabaId, metaTemplateId) prevents duplicate entries.
 */
export const whatsappTemplates = pgTable('whatsapp_templates', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wabaId: text('waba_id').notNull(),
  metaTemplateId: text('meta_template_id').notNull(),
  name: text('name').notNull(),
  language: text('language').notNull(),
  category: waTemplateCategoryEnum('category').notNull(),
  status: waTemplateStatusEnum('status').notNull(),
  components: jsonb('components').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  wabaTemplateUnique: uniqueIndex('waba_template_unique').on(table.wabaId, table.metaTemplateId),
}));

/**
 * WhatsApp Template Favorites table - User-specific template favorites.
 *
 * Links users to their favorited templates for quick access.
 * Unique constraint on (userId, templateId) prevents duplicate favorites.
 * Cascades on delete for both user and template references.
 */
export const whatsappTemplateFavorites = pgTable('whatsapp_template_favorites', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  templateId: text('template_id').notNull().references(() => whatsappTemplates.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userTemplateUnique: uniqueIndex('user_template_unique').on(table.userId, table.templateId),
}));


// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Inferred types for database operations.
 * Use these types for type-safe database queries and mutations.
 * 
 * - `Type`: Select type (reading from DB)
 * - `NewType`: Insert type (writing to DB)
 */

// Event types
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;
export type EventGuest = typeof eventGuests.$inferSelect;
export type NewEventGuest = typeof eventGuests.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignMessage = typeof campaignMessages.$inferSelect;
export type NewCampaignMessage = typeof campaignMessages.$inferInsert;
export type Badge = typeof badges.$inferSelect;
export type NewBadge = typeof badges.$inferInsert;
export type EmailAsset = typeof emailAssets.$inferSelect;
export type NewEmailAsset = typeof emailAssets.$inferInsert;
export type EmailAttachment = typeof emailAttachments.$inferSelect;
export type NewEmailAttachment = typeof emailAttachments.$inferInsert;
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
export type EventManagerPermission = typeof eventManagerPermissions.$inferSelect;
export type NewEventManagerPermission = typeof eventManagerPermissions.$inferInsert;
export type EventAssignment = typeof eventAssignments.$inferSelect;
export type NewEventAssignment = typeof eventAssignments.$inferInsert;
export type GuestPhoto = typeof guestPhotos.$inferSelect;
export type NewGuestPhoto = typeof guestPhotos.$inferInsert;

// Admin Email Campaign Management types
export type SMTPSettings = typeof smtpSettings.$inferSelect;
export type NewSMTPSettings = typeof smtpSettings.$inferInsert;
export type CampaignLink = typeof campaignLinks.$inferSelect;
export type NewCampaignLink = typeof campaignLinks.$inferInsert;
export type LinkClick = typeof linkClicks.$inferSelect;
export type NewLinkClick = typeof linkClicks.$inferInsert;
export type EmailOpen = typeof emailOpens.$inferSelect;
export type NewEmailOpen = typeof emailOpens.$inferInsert;
export type Bounce = typeof bounces.$inferSelect;
export type NewBounce = typeof bounces.$inferInsert;
export type Unsubscribe = typeof unsubscribes.$inferSelect;
export type NewUnsubscribe = typeof unsubscribes.$inferInsert;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
export type CampaignSchedule = typeof campaignSchedules.$inferSelect;
export type NewCampaignSchedule = typeof campaignSchedules.$inferInsert;

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type AutomationNode = typeof automationNodes.$inferSelect;
export type NewAutomationNode = typeof automationNodes.$inferInsert;
export type AutomationEdge = typeof automationEdges.$inferSelect;
export type NewAutomationEdge = typeof automationEdges.$inferInsert;
export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type NewAutomationExecution = typeof automationExecutions.$inferInsert;
export type ExecutionStep = typeof executionSteps.$inferSelect;
export type NewExecutionStep = typeof executionSteps.$inferInsert;
export type AutomationSchedule = typeof automationSchedules.$inferSelect;
export type NewAutomationSchedule = typeof automationSchedules.$inferInsert;
export type EventDateTriggerExecution = typeof eventDateTriggerExecutions.$inferSelect;
export type NewEventDateTriggerExecution = typeof eventDateTriggerExecutions.$inferInsert;
export type GuestTag = typeof guestTags.$inferSelect;
export type NewGuestTag = typeof guestTags.$inferInsert;
export type EventGuestTag = typeof eventGuestTags.$inferSelect;
export type NewEventGuestTag = typeof eventGuestTags.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;

// WhatsApp AI Concierge types
export type WhatsAppChannel = typeof whatsappChannels.$inferSelect;
export type NewWhatsAppChannel = typeof whatsappChannels.$inferInsert;
export type WhatsAppConversation = typeof whatsappConversations.$inferSelect;
export type NewWhatsAppConversation = typeof whatsappConversations.$inferInsert;
export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsAppMessage = typeof whatsappMessages.$inferInsert;
export type WhatsAppBroadcast = typeof whatsappBroadcasts.$inferSelect;
export type NewWhatsAppBroadcast = typeof whatsappBroadcasts.$inferInsert;
export type WhatsAppBroadcastResponse = typeof whatsappBroadcastResponses.$inferSelect;
export type NewWhatsAppBroadcastResponse = typeof whatsappBroadcastResponses.$inferInsert;
export type WhatsAppTokenQueue = typeof whatsappTokenQueues.$inferSelect;
export type NewWhatsAppTokenQueue = typeof whatsappTokenQueues.$inferInsert;
export type EventAgenda = typeof eventAgendas.$inferSelect;
export type NewEventAgenda = typeof eventAgendas.$inferInsert;
export type EventKnowledgeBase = typeof eventKnowledgeBase.$inferSelect;
export type NewEventKnowledgeBase = typeof eventKnowledgeBase.$inferInsert;

// WhatsApp Template Management types
export type WhatsAppTemplate = typeof whatsappTemplates.$inferSelect;
export type NewWhatsAppTemplate = typeof whatsappTemplates.$inferInsert;
export type WhatsAppTemplateFavorite = typeof whatsappTemplateFavorites.$inferSelect;
export type NewWhatsAppTemplateFavorite = typeof whatsappTemplateFavorites.$inferInsert;

// ============================================================================
// ENUM TYPE EXPORTS
// ============================================================================

/**
 * TypeScript types for enum values.
 * Use these for type-safe enum handling.
 */
export type EventType = typeof eventTypeEnum.enumValues[number];
export type InvitationStatus = typeof invitationStatusEnum.enumValues[number];
export type RSVPStatus = typeof rsvpStatusEnum.enumValues[number];
export type CheckInStatus = typeof checkInStatusEnum.enumValues[number];
export type CampaignType = typeof campaignTypeEnum.enumValues[number];
export type CampaignChannel = typeof campaignChannelEnum.enumValues[number];
export type CampaignStatus = typeof campaignStatusEnum.enumValues[number];
export type MessageStatus = typeof messageStatusEnum.enumValues[number];
export type AutomationStatus = typeof automationStatusEnum.enumValues[number];
export type NodeType = typeof nodeTypeEnum.enumValues[number];
export type ExecutionStatus = typeof executionStatusEnum.enumValues[number];
export type StepStatus = typeof stepStatusEnum.enumValues[number];
export type UserRole = typeof userRoleEnum.enumValues[number];
export type ManagerStatus = typeof managerStatusEnum.enumValues[number];
export type SMTPEncryption = typeof smtpEncryptionEnum.enumValues[number];
export type BounceType = typeof bounceTypeEnum.enumValues[number];
export type TemplateCategory = typeof templateCategoryEnum.enumValues[number];
export type ImportJobStatus = typeof importJobStatusEnum.enumValues[number];
export type RecurrencePattern = typeof recurrencePatternEnum.enumValues[number];

// WhatsApp AI Concierge enum types
export type GuestTier = typeof guestTierEnum.enumValues[number];
export type WAMessageType = typeof waMessageTypeEnum.enumValues[number];
export type WAMessageDirection = typeof waMessageDirectionEnum.enumValues[number];
export type WAMessageStatus = typeof waMessageStatusEnum.enumValues[number];
export type WAEscalationStatus = typeof waEscalationStatusEnum.enumValues[number];
export type KBCategory = typeof kbCategoryEnum.enumValues[number];
export type SurveyQuestionType = typeof surveyQuestionTypeEnum.enumValues[number];
export type QueueItemStatus = typeof queueItemStatusEnum.enumValues[number];

// WhatsApp Template Management enum types
export type WATemplateStatus = typeof waTemplateStatusEnum.enumValues[number];
export type WATemplateCategory = typeof waTemplateCategoryEnum.enumValues[number];
