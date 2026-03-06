/**
 * Test Resend email sending
 * Run: npx tsx scripts/test-resend.ts
 */
import "dotenv/config";
import { Resend } from "resend";

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set");
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  console.log("Testing Resend email...");
  console.log("API Key:", apiKey.substring(0, 10) + "...");

  const result = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: "orauaetech@gmail.com",
    subject: "ORA Events - Email Test",
    html: `
      <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #B8956B;">ORA Events - Email Test</h1>
        <p>This is a test email sent via Resend to verify the connection works.</p>
        <p style="background: #F5F5F0; padding: 15px; border-radius: 8px;">
          <strong>Test Details:</strong><br/>
          Sent at: ${new Date().toISOString()}<br/>
          Provider: Resend
        </p>
        <p style="color: #5C8A6B; font-weight: bold;">Email sending is working!</p>
      </div>
    `,
  });

  if (result.data) {
    console.log("Email sent successfully! ID:", result.data.id);
  } else {
    console.log("Email failed:", result.error?.message);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
