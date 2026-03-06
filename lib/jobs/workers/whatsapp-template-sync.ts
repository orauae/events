/**
 * @fileoverview WhatsApp Template Sync Worker
 *
 * Periodically syncs WhatsApp message templates from the Meta API.
 * Scheduled as a pg-boss cron job (every 30 minutes).
 *
 * @module lib/jobs/workers/whatsapp-template-sync
 */

import type { Job } from "pg-boss";
import { WhatsAppTemplateSyncService } from "@/lib/services/whatsapp-template-sync-service";

export const JOB_NAME = "whatsapp-template-sync";
export const CRON = "*/30 * * * *";

export async function handler(_job: Job) {
  console.log(`[${JOB_NAME}] Starting WhatsApp template sync for all channels`);
  await WhatsAppTemplateSyncService.syncAllChannels();
  console.log(`[${JOB_NAME}] WhatsApp template sync completed`);
}
