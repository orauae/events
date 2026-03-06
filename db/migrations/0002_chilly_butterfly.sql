CREATE TYPE "public"."guest_tier" AS ENUM('Regular', 'VIP', 'VVIP');--> statement-breakpoint
CREATE TYPE "public"."kb_category" AS ENUM('wifi', 'parking', 'emergency', 'restrooms', 'food_beverage', 'transportation', 'general');--> statement-breakpoint
CREATE TYPE "public"."queue_item_status" AS ENUM('waiting', 'serving', 'served', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."survey_question_type" AS ENUM('free_text', 'single_choice', 'multiple_choice');--> statement-breakpoint
CREATE TYPE "public"."wa_escalation_status" AS ENUM('ai_managed', 'human_managed');--> statement-breakpoint
CREATE TYPE "public"."wa_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."wa_message_status" AS ENUM('pending', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wa_message_type" AS ENUM('text', 'image', 'document', 'location', 'interactive', 'template');--> statement-breakpoint
CREATE TABLE "event_agendas" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"speaker_name" text,
	"description" text,
	"hall_location" text,
	"slide_bullet_points" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"category" "kb_category" NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_broadcast_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"broadcast_id" text NOT NULL,
	"event_guest_id" text NOT NULL,
	"question_index" integer NOT NULL,
	"response" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"filter" jsonb,
	"survey" jsonb,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"responded_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"whatsapp_business_account_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"verify_token" text NOT NULL,
	"unknown_guest_template_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_channels_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_guest_id" text NOT NULL,
	"guest_phone_number" text NOT NULL,
	"escalation_status" "wa_escalation_status" DEFAULT 'ai_managed' NOT NULL,
	"session_window_expires_at" timestamp,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"wa_message_id" text,
	"direction" "wa_message_direction" NOT NULL,
	"type" "wa_message_type" NOT NULL,
	"content" jsonb NOT NULL,
	"status" "wa_message_status" DEFAULT 'pending' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"topic_category" text,
	"status_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_token_queues" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_guest_id" text NOT NULL,
	"token_number" integer NOT NULL,
	"booth_name" text,
	"status" "queue_item_status" DEFAULT 'waiting' NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"served_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "event_guests" ADD COLUMN "tier" "guest_tier" DEFAULT 'Regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_agendas" ADD CONSTRAINT "event_agendas_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_knowledge_base" ADD CONSTRAINT "event_knowledge_base_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_responses" ADD CONSTRAINT "whatsapp_broadcast_responses_broadcast_id_whatsapp_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."whatsapp_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_responses" ADD CONSTRAINT "whatsapp_broadcast_responses_event_guest_id_event_guests_id_fk" FOREIGN KEY ("event_guest_id") REFERENCES "public"."event_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ADD CONSTRAINT "whatsapp_broadcasts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ADD CONSTRAINT "whatsapp_broadcasts_channel_id_whatsapp_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."whatsapp_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_channel_id_whatsapp_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."whatsapp_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_event_guest_id_event_guests_id_fk" FOREIGN KEY ("event_guest_id") REFERENCES "public"."event_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_channel_id_whatsapp_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."whatsapp_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_token_queues" ADD CONSTRAINT "whatsapp_token_queues_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_token_queues" ADD CONSTRAINT "whatsapp_token_queues_event_guest_id_event_guests_id_fk" FOREIGN KEY ("event_guest_id") REFERENCES "public"."event_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wa_conv_event_guest_unique" ON "whatsapp_conversations" USING btree ("event_id","event_guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_event_token_unique" ON "whatsapp_token_queues" USING btree ("event_id","token_number");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_event_guest_booth_unique" ON "whatsapp_token_queues" USING btree ("event_id","event_guest_id","booth_name");