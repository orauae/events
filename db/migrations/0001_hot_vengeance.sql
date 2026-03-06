CREATE TABLE "addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"formatted_address" text NOT NULL,
	"latitude" text NOT NULL,
	"longitude" text NOT NULL,
	"place_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "latitude" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "longitude" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "address_id" text;