CREATE TYPE "public"."wa_template_category" AS ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION');--> statement-breakpoint
CREATE TYPE "public"."wa_template_status" AS ENUM('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED');--> statement-breakpoint
CREATE TABLE "whatsapp_template_favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"template_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"waba_id" text NOT NULL,
	"meta_template_id" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"category" "wa_template_category" NOT NULL,
	"status" "wa_template_status" NOT NULL,
	"components" jsonb NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_template_favorites" ADD CONSTRAINT "whatsapp_template_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_template_favorites" ADD CONSTRAINT "whatsapp_template_favorites_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_template_unique" ON "whatsapp_template_favorites" USING btree ("user_id","template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waba_template_unique" ON "whatsapp_templates" USING btree ("waba_id","meta_template_id");