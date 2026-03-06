/**
 * Test script to test the API endpoint for sending campaigns
 * This simulates what happens when a user clicks "Send Campaign" in the UI
 * 
 * Run: npx tsx scripts/test-api-send.ts
 */

import 'dotenv/config';
import { db } from '../db';
import { campaigns } from '../db/schema';
import { eq } from 'drizzle-orm';

async function testApiSend() {
  // Reset campaign to Draft status
  const campaignId = 'h8iftg1m85c8kuveqapz0k0k';
  
  await db.update(campaigns)
    .set({ status: 'Draft' })
    .where(eq(campaigns.id, campaignId));
  
  console.log('📧 Testing API Endpoint with Auth Cookie');
  console.log('Campaign ID:', campaignId);
  console.log('');
  
  // Use the session token from the dev server logs
  const sessionToken = '2Fg4cqFoc9XUJXP8C8ichF3G30W7m4d0.QmHgMXE1puYgOiMG619qLZzr3rr6ayQCGfyRRP1VgZ0=';
  
  try {
    const response = await fetch('http://localhost:3000/api/admin/campaigns/' + campaignId + '/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=' + sessionToken,
      },
    });
    
    console.log('Response Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('');
      console.log('✅ Campaign sent successfully!');
      console.log('   Sent:', data.sent);
      console.log('   Failed:', data.failed);
    } else {
      console.log('');
      console.log('❌ Campaign send failed');
      console.log('   Error:', data.message || data.code);
    }
  } catch (error) {
    console.error('Error calling API:', error);
  }
}

testApiSend();
