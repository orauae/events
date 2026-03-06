-- Convert any existing 'Maybe' RSVP statuses to 'Pending' before removing the enum value
UPDATE "event_guests" SET "rsvp_status" = 'Pending' WHERE "rsvp_status" = 'Maybe';--> statement-breakpoint
ALTER TABLE "event_guests" ALTER COLUMN "rsvp_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "event_guests" ALTER COLUMN "rsvp_status" SET DEFAULT 'Pending'::text;--> statement-breakpoint
DROP TYPE "public"."rsvp_status";--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('Pending', 'Attending', 'NotAttending');--> statement-breakpoint
ALTER TABLE "event_guests" ALTER COLUMN "rsvp_status" SET DEFAULT 'Pending'::"public"."rsvp_status";--> statement-breakpoint
ALTER TABLE "event_guests" ALTER COLUMN "rsvp_status" SET DATA TYPE "public"."rsvp_status" USING "rsvp_status"::"public"."rsvp_status";
