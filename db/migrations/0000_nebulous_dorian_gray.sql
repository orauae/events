CREATE TYPE "public"."automation_status" AS ENUM('Draft', 'Active', 'Paused');--> statement-breakpoint
CREATE TYPE "public"."bounce_type" AS ENUM('hard', 'soft');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('Draft', 'Scheduled', 'Queued', 'Sending', 'Sent', 'Paused', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('Invitation', 'Reminder', 'LastChance', 'EventDayInfo', 'ThankYou', 'Feedback');--> statement-breakpoint
CREATE TYPE "public"."check_in_status" AS ENUM('NotCheckedIn', 'CheckedIn');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('Conference', 'Private', 'Corporate', 'Exhibition', 'ProductLaunch', 'OpenHouse');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('Running', 'Success', 'Failed', 'Partial');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('Pending', 'Sent', 'Delivered', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."manager_status" AS ENUM('Active', 'Suspended', 'Deactivated');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('Pending', 'Sent', 'Delivered', 'Failed', 'Bounced');--> statement-breakpoint
CREATE TYPE "public"."node_type" AS ENUM('trigger', 'condition', 'action');--> statement-breakpoint
CREATE TYPE "public"."recurrence_pattern" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('Pending', 'Attending', 'Maybe', 'NotAttending');--> statement-breakpoint
CREATE TYPE "public"."smtp_encryption" AS ENUM('tls', 'ssl', 'none');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('Pending', 'Running', 'Success', 'Failed', 'Skipped');--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('Invitation', 'Reminder', 'LastChance', 'EventDay', 'ThankYou', 'Feedback', 'Custom');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('Admin', 'EventManager');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"source_handle" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"event_guest_id" text,
	"trigger_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "execution_status" DEFAULT 'Running' NOT NULL,
	"error" text,
	"trigger_dev_run_id" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "automation_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"type" "node_type" NOT NULL,
	"sub_type" text NOT NULL,
	"label" text NOT NULL,
	"position_x" text NOT NULL,
	"position_y" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"trigger_dev_schedule_id" text,
	"cron_expression" text NOT NULL,
	"timezone" text DEFAULT 'UTC',
	"is_active" boolean DEFAULT false,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "automation_status" DEFAULT 'Draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" text PRIMARY KEY NOT NULL,
	"event_guest_id" text NOT NULL,
	"qr_token" text NOT NULL,
	"pdf_url" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "badges_event_guest_id_unique" UNIQUE("event_guest_id")
);
--> statement-breakpoint
CREATE TABLE "bounces" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_message_id" text,
	"email" text NOT NULL,
	"bounce_type" "bounce_type" NOT NULL,
	"bounce_reason" text,
	"bounced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_links" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"original_url" text NOT NULL,
	"tracking_url" text NOT NULL,
	"label" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_links_tracking_url_unique" UNIQUE("tracking_url")
);
--> statement-breakpoint
CREATE TABLE "campaign_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"event_guest_id" text NOT NULL,
	"status" "message_status" DEFAULT 'Pending' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"bounce_type" "bounce_type",
	"resend_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_pattern" "recurrence_pattern",
	"recurrence_end_date" timestamp,
	"reminder_sent_24h" boolean DEFAULT false NOT NULL,
	"reminder_sent_1h" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_schedules_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "campaign_type" NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"design_json" jsonb,
	"status" "campaign_status" DEFAULT 'Draft' NOT NULL,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"clicked_count" integer DEFAULT 0 NOT NULL,
	"bounced_count" integer DEFAULT 0 NOT NULL,
	"unsubscribed_count" integer DEFAULT 0 NOT NULL,
	"is_ab_test" boolean DEFAULT false NOT NULL,
	"ab_test_config" jsonb,
	"winning_variant" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"original_filename" text NOT NULL,
	"r2_key" text NOT NULL,
	"public_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"optimized_size" integer,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"original_filename" text NOT NULL,
	"r2_key" text NOT NULL,
	"public_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_opens" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_message_id" text NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "template_category" NOT NULL,
	"subject" text NOT NULL,
	"design_json" jsonb NOT NULL,
	"html_content" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"thumbnail_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"assigned_user_id" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" text NOT NULL,
	CONSTRAINT "event_assignments_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "event_date_trigger_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"event_id" text NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_date_trigger_executions_automation_id_event_id_unique" UNIQUE("automation_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "event_guest_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"event_guest_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_guests" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"guest_id" text NOT NULL,
	"invitation_status" "invitation_status" DEFAULT 'Pending' NOT NULL,
	"rsvp_status" "rsvp_status" DEFAULT 'Pending' NOT NULL,
	"check_in_status" "check_in_status" DEFAULT 'NotCheckedIn' NOT NULL,
	"check_in_time" timestamp,
	"qr_token" text NOT NULL,
	"representing_company" boolean DEFAULT false,
	"company_represented" text,
	"updated_mobile" text,
	"rsvp_submitted_at" timestamp,
	"rsvp_ip_address" text,
	"rsvp_user_agent" text,
	"rsvp_device_info" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_guests_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
CREATE TABLE "event_manager_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"can_create_events" boolean DEFAULT false NOT NULL,
	"can_upload_excel" boolean DEFAULT true NOT NULL,
	"can_send_campaigns" boolean DEFAULT true NOT NULL,
	"can_manage_automations" boolean DEFAULT false NOT NULL,
	"can_delete_guests" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_manager_permissions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "event_type" NOT NULL,
	"description" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"location" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"node_id" text NOT NULL,
	"status" "step_status" DEFAULT 'Pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "guest_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"r2_key" text NOT NULL,
	"public_url" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guest_photos_guest_id_unique" UNIQUE("guest_id")
);
--> statement-breakpoint
CREATE TABLE "guest_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#B8956B' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"mobile" text,
	"company" text,
	"job_title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guests_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"user_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"total_rows" integer,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"status" "import_job_status" DEFAULT 'pending' NOT NULL,
	"column_mapping" jsonb,
	"error_report_url" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"link_id" text NOT NULL,
	"campaign_message_id" text,
	"recipient_email" text NOT NULL,
	"clicked_at" timestamp DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"referer" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "smtp_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"username" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"encryption" "smtp_encryption" DEFAULT 'tls' NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text NOT NULL,
	"reply_to_email" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"daily_limit" integer,
	"hourly_limit" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribes" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"campaign_id" text,
	"reason" text,
	"unsubscribed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unsubscribes_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'EventManager' NOT NULL,
	"status" "manager_status" DEFAULT 'Active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_edges" ADD CONSTRAINT "automation_edges_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_event_guest_id_event_guests_id_fk" FOREIGN KEY ("event_guest_id") REFERENCES "public"."event_guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_nodes" ADD CONSTRAINT "automation_nodes_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_schedules" ADD CONSTRAINT "automation_schedules_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_event_guest_id_event_guests_id_fk" FOREIGN KEY ("event_guest_id") REFERENCES "public"."event_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounces" ADD CONSTRAINT "bounces_campaign_message_id_campaign_messages_id_fk" FOREIGN KEY ("campaign_message_id") REFERENCES "public"."campaign_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_links" ADD CONSTRAINT "campaign_links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_schedules" ADD CONSTRAINT "campaign_schedules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_assets" ADD CONSTRAINT "email_assets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_opens" ADD CONSTRAINT "email_opens_campaign_message_id_campaign_messages_id_fk" FOREIGN KEY ("campaign_message_id") REFERENCES "public"."campaign_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_assignments" ADD CONSTRAINT "event_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_assignments" ADD CONSTRAINT "event_assignments_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_assignments" ADD CONSTRAINT "event_assignments_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_date_trigger_executions" ADD CONSTRAINT "event_date_trigger_executions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_date_trigger_executions" ADD CONSTRAINT "event_date_trigger_executions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guest_tags" ADD CONSTRAINT "event_guest_tags_event_guest_id_event_guests_id_fk" FOREIGN KEY ("event_guest_id") REFERENCES "public"."event_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guest_tags" ADD CONSTRAINT "event_guest_tags_tag_id_guest_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."guest_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guests" ADD CONSTRAINT "event_guests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guests" ADD CONSTRAINT "event_guests_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_manager_permissions" ADD CONSTRAINT "event_manager_permissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_automation_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."automation_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_photos" ADD CONSTRAINT "guest_photos_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_tags" ADD CONSTRAINT "guest_tags_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_link_id_campaign_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."campaign_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_campaign_message_id_campaign_messages_id_fk" FOREIGN KEY ("campaign_message_id") REFERENCES "public"."campaign_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_tag_unique" ON "event_guest_tags" USING btree ("event_guest_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_guest_unique" ON "event_guests" USING btree ("event_id","guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_tag_unique" ON "guest_tags" USING btree ("event_id","name");