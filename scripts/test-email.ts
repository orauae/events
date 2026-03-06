/**
 * Quick test script to send a test email via SMTP
 * Run: npx tsx scripts/test-email.ts
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';

async function sendTestEmail() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-pulse.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD, // Plain password required
    },
  });

  console.log('📧 Testing SMTP configuration...');
  console.log(`   Host: ${process.env.SMTP_HOST}`);
  console.log(`   Port: ${process.env.SMTP_PORT}`);
  console.log(`   User: ${process.env.SMTP_USER}`);
  console.log(`   From: ${process.env.SMTP_FROM_EMAIL}`);
  console.log('');

  try {
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!');
    console.log('');

    // Send test email
    const result = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'ORA Events'}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: 'datripplenet@gmail.com',
      subject: '🎉 ORA Events - SMTP Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #B8956B;">ORA Events - Email Test</h1>
          <p>This is a test email to verify that the SMTP configuration is working correctly.</p>
          <p style="background: #F5F5F0; padding: 15px; border-radius: 8px;">
            <strong>Test Details:</strong><br/>
            Sent at: ${new Date().toISOString()}<br/>
            From: ${process.env.SMTP_FROM_EMAIL}<br/>
            SMTP Host: ${process.env.SMTP_HOST}
          </p>
          <p style="color: #5C8A6B; font-weight: bold;">✅ If you receive this email, campaigns can go out!</p>
          <hr style="border: none; border-top: 1px solid #E8E4DF; margin: 20px 0;" />
          <p style="color: #6B6B6B; font-size: 12px;">
            This is an automated test email from ORA Event Management System.
          </p>
        </div>
      `,
      text: `ORA Events - SMTP Test Email\n\nThis is a test email to verify that the SMTP configuration is working correctly.\n\nSent at: ${new Date().toISOString()}\nFrom: ${process.env.SMTP_FROM_EMAIL}\n\nIf you receive this email, campaigns can go out!`,
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   To: datripplenet@gmail.com`);
    console.log('');
    console.log('🎉 SMTP is configured correctly - campaigns can go out!');
    
  } catch (error) {
    console.error('❌ Failed to send test email:');
    console.error(error);
    process.exit(1);
  }
}

sendTestEmail();
