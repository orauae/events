/**
 * @fileoverview Database Seeder
 * 
 * Seeds the database with initial data:
 * - 1 Admin user
 * - 1 Event Manager user
 * 
 * This is a minimal prototype seed - no events or guests.
 * Uses better-auth compatible password hashing.
 * 
 * Run with: npm run db:seed
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { createId } from '@paralleldrive/cuid2';
import { hashPassword } from 'better-auth/crypto';
import * as schema from './schema';
import { config } from 'dotenv';

// Load environment variables
config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// Seed data - only 2 users
const ADMIN_USER = {
  id: createId(),
  name: 'Admin User',
  email: 'admin@eventos.com',
  password: 'Admin123!',
  role: 'Admin' as const,
  status: 'Active' as const,
};

const EVENT_MANAGER_USER = {
  id: createId(),
  name: 'Event Manager',
  email: 'manager@eventos.com',
  password: 'Manager123!',
  role: 'EventManager' as const,
  status: 'Active' as const,
};

async function clearAllData() {
  console.log('🧹 Clearing ALL database data...\n');
  
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  // Delete in order to respect foreign key constraints
  // Start with tables that have foreign keys pointing to others
  
  // Analytics & tracking tables
  await pool.query('TRUNCATE TABLE "link_clicks" CASCADE');
  await pool.query('TRUNCATE TABLE "email_opens" CASCADE');
  await pool.query('TRUNCATE TABLE "bounces" CASCADE');
  await pool.query('TRUNCATE TABLE "unsubscribes" CASCADE');
  await pool.query('TRUNCATE TABLE "campaign_links" CASCADE');
  
  // Campaign related
  await pool.query('TRUNCATE TABLE "campaign_messages" CASCADE');
  await pool.query('TRUNCATE TABLE "email_assets" CASCADE');
  await pool.query('TRUNCATE TABLE "campaigns" CASCADE');
  
  // Automation related
  await pool.query('TRUNCATE TABLE "execution_steps" CASCADE');
  await pool.query('TRUNCATE TABLE "automation_executions" CASCADE');
  await pool.query('TRUNCATE TABLE "automation_schedules" CASCADE');
  await pool.query('TRUNCATE TABLE "event_date_trigger_executions" CASCADE');
  await pool.query('TRUNCATE TABLE "automation_edges" CASCADE');
  await pool.query('TRUNCATE TABLE "automation_nodes" CASCADE');
  await pool.query('TRUNCATE TABLE "automations" CASCADE');
  
  // Guest related
  await pool.query('TRUNCATE TABLE "event_guest_tags" CASCADE');
  await pool.query('TRUNCATE TABLE "guest_tags" CASCADE');
  await pool.query('TRUNCATE TABLE "badges" CASCADE');
  await pool.query('TRUNCATE TABLE "guest_photos" CASCADE');
  await pool.query('TRUNCATE TABLE "event_guests" CASCADE');
  await pool.query('TRUNCATE TABLE "guests" CASCADE');
  
  // Event related
  await pool.query('TRUNCATE TABLE "event_assignments" CASCADE');
  await pool.query('TRUNCATE TABLE "events" CASCADE');
  
  // User related
  await pool.query('TRUNCATE TABLE "event_manager_permissions" CASCADE');
  await pool.query('TRUNCATE TABLE "session" CASCADE');
  await pool.query('TRUNCATE TABLE "verification" CASCADE');
  await pool.query('TRUNCATE TABLE "account" CASCADE');
  await pool.query('TRUNCATE TABLE "user" CASCADE');
  
  // Settings
  await pool.query('TRUNCATE TABLE "smtp_settings" CASCADE');
  await pool.query('TRUNCATE TABLE "email_templates" CASCADE');
  
  await pool.end();
  
  console.log('   ✓ All tables cleared\n');
}

async function seed() {
  console.log('🌱 Starting database seed (minimal prototype)...\n');

  try {
    // Clear all existing data
    await clearAllData();

    // Hash passwords using better-auth's hashPassword
    console.log('🔐 Hashing passwords with better-auth...');
    const adminPasswordHash = await hashPassword(ADMIN_USER.password);
    const managerPasswordHash = await hashPassword(EVENT_MANAGER_USER.password);
    
    console.log('   ✓ Admin hash generated');
    console.log('   ✓ Manager hash generated\n');

    // Create Admin User
    console.log('👤 Creating admin user...');
    await db.insert(schema.user).values({
      id: ADMIN_USER.id,
      name: ADMIN_USER.name,
      email: ADMIN_USER.email,
      emailVerified: true,
      role: ADMIN_USER.role,
      status: ADMIN_USER.status,
    });

    // Create account for admin (with password)
    await db.insert(schema.account).values({
      id: createId(),
      accountId: ADMIN_USER.email,
      providerId: 'credential',
      userId: ADMIN_USER.id,
      password: adminPasswordHash,
    });
    console.log('   ✓ Admin created');

    // Create Event Manager User
    console.log('👤 Creating event manager user...');
    await db.insert(schema.user).values({
      id: EVENT_MANAGER_USER.id,
      name: EVENT_MANAGER_USER.name,
      email: EVENT_MANAGER_USER.email,
      emailVerified: true,
      role: EVENT_MANAGER_USER.role,
      status: EVENT_MANAGER_USER.status,
    });

    // Create account for event manager (with password)
    await db.insert(schema.account).values({
      id: createId(),
      accountId: EVENT_MANAGER_USER.email,
      providerId: 'credential',
      userId: EVENT_MANAGER_USER.id,
      password: managerPasswordHash,
    });

    // Create permissions for event manager
    await db.insert(schema.eventManagerPermissions).values({
      id: createId(),
      userId: EVENT_MANAGER_USER.id,
      canCreateEvents: true,
      canUploadExcel: true,
      canSendCampaigns: true,
      canManageAutomations: false,
      canDeleteGuests: false,
    });
    console.log('   ✓ Event Manager created with permissions\n');

    console.log('═══════════════════════════════════════════');
    console.log('✅ Database seeded successfully!');
    console.log('═══════════════════════════════════════════\n');
    console.log('📧 Login credentials:');
    console.log('───────────────────────────────────────────');
    console.log(`  Admin:         ${ADMIN_USER.email} / ${ADMIN_USER.password}`);
    console.log(`  Event Manager: ${EVENT_MANAGER_USER.email} / ${EVENT_MANAGER_USER.password}`);
    console.log('───────────────────────────────────────────\n');
    console.log('📊 Database state:');
    console.log('   • 2 users (1 admin, 1 manager)');
    console.log('   • 0 events');
    console.log('   • 0 guests');
    console.log('───────────────────────────────────────────\n');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed().then(() => process.exit(0));
