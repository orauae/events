/**
 * Test script to send a campaign manually
 * Run: npx tsx scripts/test-campaign-send.ts <campaignId>
 * 
 * This script tests the campaign send functionality directly using SMTP
 */

import 'dotenv/config';
import { db } from '../db';
import { campaigns, eventGuests, events } from '../db/schema';
import { eq } from 'drizzle-orm';
import { CampaignSendService } from '../lib/services/campaign-send-service';

async function testCampaignSend() {
  const campaignId = process.argv[2];
  
  if (!campaignId) {
    // List available campaigns
    console.log('📋 Available campaigns:');
    console.log('');
    
    const allCampaigns = await db.query.campaigns.findMany({
      with: {
        event: true,
      },
      orderBy: (campaigns, { desc }) => [desc(campaigns.createdAt)],
      limit: 10,
    });
    
    if (allCampaigns.length === 0) {
      console.log('   No campaigns found. Create a campaign first.');
      process.exit(0);
    }
    
    for (const campaign of allCampaigns) {
      console.log(`   ${campaign.id}`);
      console.log(`      Name: ${campaign.name}`);
      console.log(`      Event: ${campaign.event?.name || 'Unknown'}`);
      console.log(`      Status: ${campaign.status}`);
      console.log(`      Subject: ${campaign.subject}`);
      console.log('');
    }
    
    console.log('Usage: npx tsx scripts/test-campaign-send.ts <campaignId>');
    process.exit(0);
  }
  
  // Get campaign details
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
    with: {
      event: true,
    },
  });
  
  if (!campaign) {
    console.error(`❌ Campaign not found: ${campaignId}`);
    process.exit(1);
  }
  
  console.log('📧 Campaign Send Test');
  console.log('═══════════════════════════════════════════════════');
  console.log(`   Campaign: ${campaign.name}`);
  console.log(`   Subject: ${campaign.subject}`);
  console.log(`   Event: ${campaign.event?.name || 'Unknown'}`);
  console.log(`   Status: ${campaign.status}`);
  console.log('');
  
  // Get recipients count
  const recipients = await db.query.eventGuests.findMany({
    where: eq(eventGuests.eventId, campaign.eventId),
    with: {
      guest: true,
    },
  });
  
  console.log(`   Total Recipients: ${recipients.length}`);
  console.log('');
  
  // Check SMTP configuration
  console.log('📮 SMTP Configuration:');
  console.log(`   Host: ${process.env.SMTP_HOST}`);
  console.log(`   Port: ${process.env.SMTP_PORT}`);
  console.log(`   From: ${process.env.SMTP_FROM_EMAIL}`);
  console.log('');
  
  if (recipients.length === 0) {
    console.log('⚠️  No recipients found for this event. Add guests first.');
    process.exit(0);
  }
  
  // Confirm before sending
  console.log('⚠️  This will send real emails to all recipients!');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...');
  console.log('');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('🚀 Starting campaign send...');
  console.log('');
  
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const result = await CampaignSendService.send(campaignId, baseUrl, {
      batchSize: 10, // Smaller batches for testing
      batchDelayMs: 2000, // 2 second delay between batches
    });
    
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 Send Results:');
    console.log(`   ✅ Sent: ${result.sent}`);
    console.log(`   ❌ Failed: ${result.failed}`);
    console.log(`   ⏭️  Skipped: ${result.skipped}`);
    console.log(`   📦 Batches Processed: ${result.batchesProcessed}`);
    console.log(`   Success: ${result.success ? '✅ Yes' : '❌ No'}`);
    
    if (result.errors.length > 0) {
      console.log('');
      console.log('❌ Errors:');
      for (const err of result.errors) {
        console.log(`   - Guest ${err.eventGuestId}: ${err.error}`);
      }
    }
    
    console.log('');
    console.log('🎉 Campaign send complete!');
    
  } catch (error) {
    console.error('❌ Failed to send campaign:');
    console.error(error);
    process.exit(1);
  }
}

testCampaignSend();
