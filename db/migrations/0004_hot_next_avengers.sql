CREATE TYPE "public"."campaign_channel" AS ENUM('email', 'whatsapp', 'sms');--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "channel" "campaign_channel" DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "whatsapp_template_id" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "whatsapp_content" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "whatsapp_media_url" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "whatsapp_media_type" text;