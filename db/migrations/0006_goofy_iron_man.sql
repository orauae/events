ALTER TABLE "campaigns" ADD COLUMN "sms_body" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "sms_sender_id" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "sms_encoding" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "sms_segment_count" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "sms_opt_out_footer" boolean DEFAULT true;