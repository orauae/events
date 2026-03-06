/**
 * Script to add SMTP settings to the database
 * Run: npx tsx scripts/add-smtp-settings.ts
 */

import 'dotenv/config';
import { db } from '../db';
import { smtpSettings } from '../db/schema';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY || '';
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

async function addSmtpSettings() {
  const password = process.env.SMTP_PASSWORD;
  if (!password) {
    console.error('SMTP_PASSWORD not set in .env');
    process.exit(1);
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const username = process.env.SMTP_USER;
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  if (!host || !username) {
    console.error('SMTP_HOST and SMTP_USER must be set in .env');
    process.exit(1);
  }

  console.log('📧 Adding SMTP Settings');
  console.log('========================');
  console.log(`   Host: ${host}`);
  console.log(`   Port: ${port}`);
  console.log(`   Username: ${username}`);
  console.log(`   From Email: ${fromEmail}`);
  console.log('');

  // Check if settings already exist
  const existing = await db.query.smtpSettings.findFirst();
  if (existing) {
    console.log('⚠️  SMTP settings already exist in database:');
    console.log(`   ID: ${existing.id}`);
    console.log(`   Name: ${existing.name}`);
    console.log(`   Is Default: ${existing.isDefault}`);
    console.log('');
    console.log('   Delete existing settings first if you want to replace them.');
    process.exit(0);
  }

  const encryptedPassword = encrypt(password);

  const [settings] = await db.insert(smtpSettings).values({
    name: 'SMTP Pulse',
    host: host!,
    port: port,
    username: username!,
    passwordEncrypted: encryptedPassword,
    encryption: 'tls',
    fromEmail: fromEmail!,
    fromName: 'Ora Events',
    isDefault: true,
    isActive: true,
  }).returning();

  console.log('✅ SMTP Settings created successfully!');
  console.log(`   ID: ${settings.id}`);
  console.log(`   Name: ${settings.name}`);
  console.log(`   Host: ${settings.host}`);
  console.log(`   Port: ${settings.port}`);
  console.log(`   From: ${settings.fromEmail}`);
  console.log(`   Is Default: ${settings.isDefault}`);
  console.log('');
  console.log('🎉 You can now send campaigns!');
}

addSmtpSettings().catch(console.error);
