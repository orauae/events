import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  SMTPService, 
  createSMTPSettingsSchema, 
  encryptPassword, 
  decryptPassword,
  SMTP_ENCRYPTION_TYPES,
  DEFAULT_RATE_LIMIT_CONFIG,
} from '../services/smtp-service';
import { db, smtpSettings } from '@/db';

// Mock nodemailer for connection testing
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: vi.fn().mockResolvedValue(true),
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    })),
  },
  createTransport: vi.fn(() => ({
    verify: vi.fn().mockResolvedValue(true),
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  })),
}));

// Set up encryption key for tests
process.env.SMTP_ENCRYPTION_KEY = 'test-encryption-key-for-smtp-service-tests';

describe('SMTPService', () => {
  beforeEach(async () => {
    // Clean up any existing test data
    await db.delete(smtpSettings);
  });

  afterEach(async () => {
    await db.delete(smtpSettings);
  });

  describe('Password Encryption', () => {
    it('should encrypt and decrypt passwords correctly', () => {
      const originalPassword = 'my-secret-password-123!@#';
      
      const encrypted = encryptPassword(originalPassword);
      const decrypted = decryptPassword(encrypted);
      
      expect(encrypted).not.toBe(originalPassword);
      expect(decrypted).toBe(originalPassword);
    });

    it('should produce different ciphertexts for the same password (due to random IV)', () => {
      const password = 'test-password';
      
      const encrypted1 = encryptPassword(password);
      const encrypted2 = encryptPassword(password);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same value
      expect(decryptPassword(encrypted1)).toBe(password);
      expect(decryptPassword(encrypted2)).toBe(password);
    });

    it('should handle special characters in passwords', () => {
      const specialPassword = 'p@$$w0rd!#$%^&*()_+-=[]{}|;:,.<>?';
      
      const encrypted = encryptPassword(specialPassword);
      const decrypted = decryptPassword(encrypted);
      
      expect(decrypted).toBe(specialPassword);
    });

    it('should handle unicode characters in passwords', () => {
      const unicodePassword = 'пароль密码🔐';
      
      const encrypted = encryptPassword(unicodePassword);
      const decrypted = decryptPassword(encrypted);
      
      expect(decrypted).toBe(unicodePassword);
    });

    it('should throw error for invalid encrypted data format', () => {
      expect(() => decryptPassword('invalid-format')).toThrow('Invalid encrypted data format');
    });
  });

  describe('Validation Schema', () => {
    it('should validate correct SMTP settings', () => {
      const validInput = {
        name: 'Test SMTP',
        host: 'smtp.example.com',
        port: 587,
        username: 'user@example.com',
        password: 'secret123',
        encryption: 'tls' as const,
        fromEmail: 'noreply@example.com',
        fromName: 'Test Sender',
      };

      const result = createSMTPSettingsSchema.parse(validInput);
      expect(result.name).toBe('Test SMTP');
      expect(result.encryption).toBe('tls');
    });

    it('should reject invalid port numbers', () => {
      const invalidInput = {
        name: 'Test SMTP',
        host: 'smtp.example.com',
        port: 70000, // Invalid port
        username: 'user@example.com',
        password: 'secret123',
        fromEmail: 'noreply@example.com',
        fromName: 'Test Sender',
      };

      expect(() => createSMTPSettingsSchema.parse(invalidInput)).toThrow();
    });

    it('should reject invalid email addresses', () => {
      const invalidInput = {
        name: 'Test SMTP',
        host: 'smtp.example.com',
        port: 587,
        username: 'user@example.com',
        password: 'secret123',
        fromEmail: 'not-an-email',
        fromName: 'Test Sender',
      };

      expect(() => createSMTPSettingsSchema.parse(invalidInput)).toThrow();
    });

    it('should accept all valid encryption types', () => {
      for (const encryption of SMTP_ENCRYPTION_TYPES) {
        const input = {
          name: 'Test SMTP',
          host: 'smtp.example.com',
          port: 587,
          username: 'user@example.com',
          password: 'secret123',
          encryption,
          fromEmail: 'noreply@example.com',
          fromName: 'Test Sender',
        };

        const result = createSMTPSettingsSchema.parse(input);
        expect(result.encryption).toBe(encryption);
      }
    });
  });

  describe('CRUD Operations', () => {
    const validInput = {
      name: 'Primary SMTP',
      host: 'smtp.example.com',
      port: 587,
      username: 'user@example.com',
      password: 'secret123',
      encryption: 'tls' as const,
      fromEmail: 'noreply@example.com',
      fromName: 'EventOS',
    };

    describe('create', () => {
      it('should create SMTP settings with valid data', async () => {
        const settings = await SMTPService.create(validInput);

        expect(settings.id).toBeDefined();
        expect(settings.name).toBe('Primary SMTP');
        expect(settings.host).toBe('smtp.example.com');
        expect(settings.port).toBe(587);
        expect(settings.username).toBe('user@example.com');
        expect(settings.encryption).toBe('tls');
        expect(settings.fromEmail).toBe('noreply@example.com');
        expect(settings.fromName).toBe('EventOS');
        expect(settings.hasPassword).toBe(true);
        // Password should not be exposed
        expect((settings as unknown as Record<string, unknown>).passwordEncrypted).toBeUndefined();
        expect((settings as unknown as Record<string, unknown>).password).toBeUndefined();
      });

      it('should set isDefault to false by default', async () => {
        const settings = await SMTPService.create(validInput);
        expect(settings.isDefault).toBe(false);
      });

      it('should set isActive to true by default', async () => {
        const settings = await SMTPService.create(validInput);
        expect(settings.isActive).toBe(true);
      });

      it('should allow setting as default on creation', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          isDefault: true,
        });
        expect(settings.isDefault).toBe(true);
      });

      it('should unset previous default when creating new default', async () => {
        const first = await SMTPService.create({
          ...validInput,
          name: 'First SMTP',
          isDefault: true,
        });
        expect(first.isDefault).toBe(true);

        const second = await SMTPService.create({
          ...validInput,
          name: 'Second SMTP',
          isDefault: true,
        });
        expect(second.isDefault).toBe(true);

        // First should no longer be default
        const updatedFirst = await SMTPService.getById(first.id);
        expect(updatedFirst?.isDefault).toBe(false);
      });
    });

    describe('getById', () => {
      it('should return SMTP settings by ID', async () => {
        const created = await SMTPService.create(validInput);
        const retrieved = await SMTPService.getById(created.id);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(created.id);
        expect(retrieved!.name).toBe('Primary SMTP');
      });

      it('should return null for non-existent ID', async () => {
        const result = await SMTPService.getById('non-existent-id');
        expect(result).toBeNull();
      });
    });

    describe('getAll', () => {
      it('should return all SMTP settings', async () => {
        await SMTPService.create({ ...validInput, name: 'SMTP 1' });
        await SMTPService.create({ ...validInput, name: 'SMTP 2' });
        await SMTPService.create({ ...validInput, name: 'SMTP 3' });

        const all = await SMTPService.getAll();

        expect(all).toHaveLength(3);
        expect(all.map(s => s.name)).toContain('SMTP 1');
        expect(all.map(s => s.name)).toContain('SMTP 2');
        expect(all.map(s => s.name)).toContain('SMTP 3');
      });

      it('should return empty array when no settings exist', async () => {
        const all = await SMTPService.getAll();
        expect(all).toHaveLength(0);
      });
    });

    describe('getDefault', () => {
      it('should return the default SMTP settings', async () => {
        await SMTPService.create({ ...validInput, name: 'Non-default' });
        await SMTPService.create({ ...validInput, name: 'Default SMTP', isDefault: true });

        const defaultSettings = await SMTPService.getDefault();

        expect(defaultSettings).not.toBeNull();
        expect(defaultSettings!.name).toBe('Default SMTP');
        expect(defaultSettings!.isDefault).toBe(true);
      });

      it('should return null when no default is set', async () => {
        await SMTPService.create({ ...validInput, isDefault: false });

        const defaultSettings = await SMTPService.getDefault();
        expect(defaultSettings).toBeNull();
      });

      it('should not return inactive default', async () => {
        await SMTPService.create({ 
          ...validInput, 
          isDefault: true, 
          isActive: false 
        });

        const defaultSettings = await SMTPService.getDefault();
        expect(defaultSettings).toBeNull();
      });
    });

    describe('update', () => {
      it('should update SMTP settings', async () => {
        const created = await SMTPService.create(validInput);

        const updated = await SMTPService.update(created.id, {
          name: 'Updated SMTP',
          port: 465,
        });

        expect(updated.name).toBe('Updated SMTP');
        expect(updated.port).toBe(465);
        expect(updated.host).toBe('smtp.example.com'); // Unchanged
      });

      it('should update password when provided', async () => {
        const created = await SMTPService.create(validInput);

        await SMTPService.update(created.id, {
          password: 'new-secret-password',
        });

        // Verify password was updated by getting decrypted password
        const decrypted = await SMTPService.getDecryptedPassword(created.id);
        expect(decrypted).toBe('new-secret-password');
      });

      it('should throw error for non-existent ID', async () => {
        await expect(
          SMTPService.update('non-existent-id', { name: 'Test' })
        ).rejects.toThrow('SMTP settings with ID "non-existent-id" not found');
      });

      it('should unset previous default when updating to default', async () => {
        const first = await SMTPService.create({
          ...validInput,
          name: 'First',
          isDefault: true,
        });
        const second = await SMTPService.create({
          ...validInput,
          name: 'Second',
        });

        await SMTPService.update(second.id, { isDefault: true });

        const updatedFirst = await SMTPService.getById(first.id);
        const updatedSecond = await SMTPService.getById(second.id);

        expect(updatedFirst?.isDefault).toBe(false);
        expect(updatedSecond?.isDefault).toBe(true);
      });
    });

    describe('delete', () => {
      it('should delete SMTP settings', async () => {
        const created = await SMTPService.create(validInput);

        await SMTPService.delete(created.id);

        const retrieved = await SMTPService.getById(created.id);
        expect(retrieved).toBeNull();
      });

      it('should throw error for non-existent ID', async () => {
        await expect(
          SMTPService.delete('non-existent-id')
        ).rejects.toThrow('SMTP settings with ID "non-existent-id" not found');
      });
    });

    describe('setDefault', () => {
      it('should set SMTP settings as default', async () => {
        const settings = await SMTPService.create(validInput);
        expect(settings.isDefault).toBe(false);

        const updated = await SMTPService.setDefault(settings.id);
        expect(updated.isDefault).toBe(true);
      });

      it('should unset previous default', async () => {
        const first = await SMTPService.create({
          ...validInput,
          name: 'First',
          isDefault: true,
        });
        const second = await SMTPService.create({
          ...validInput,
          name: 'Second',
        });

        await SMTPService.setDefault(second.id);

        const updatedFirst = await SMTPService.getById(first.id);
        expect(updatedFirst?.isDefault).toBe(false);
      });

      it('should throw error for non-existent ID', async () => {
        await expect(
          SMTPService.setDefault('non-existent-id')
        ).rejects.toThrow('SMTP settings with ID "non-existent-id" not found');
      });
    });
  });

  describe('Connection Testing', () => {
    it('should return success for valid connection test', async () => {
      const settings = await SMTPService.create({
        name: 'Test SMTP',
        host: 'smtp.example.com',
        port: 587,
        username: 'user@example.com',
        password: 'secret123',
        encryption: 'tls',
        fromEmail: 'noreply@example.com',
        fromName: 'Test',
      });

      const result = await SMTPService.testConnection(settings.id, 'test@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test email sent successfully');
    });

    it('should return error for invalid test email', async () => {
      const settings = await SMTPService.create({
        name: 'Test SMTP',
        host: 'smtp.example.com',
        port: 587,
        username: 'user@example.com',
        password: 'secret123',
        encryption: 'tls',
        fromEmail: 'noreply@example.com',
        fromName: 'Test',
      });

      const result = await SMTPService.testConnection(settings.id, 'not-an-email');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid test email address');
    });

    it('should return error for non-existent SMTP settings', async () => {
      const result = await SMTPService.testConnection('non-existent-id', 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.message).toBe('SMTP configuration not found');
    });

    it('should test connection with config before saving', async () => {
      const result = await SMTPService.testConnectionWithConfig(
        {
          name: 'Test SMTP',
          host: 'smtp.example.com',
          port: 587,
          username: 'user@example.com',
          password: 'secret123',
          encryption: 'tls',
          fromEmail: 'noreply@example.com',
          fromName: 'Test',
        },
        'test@example.com'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Internal Methods', () => {
    it('should get decrypted password', async () => {
      const settings = await SMTPService.create({
        name: 'Test SMTP',
        host: 'smtp.example.com',
        port: 587,
        username: 'user@example.com',
        password: 'my-secret-password',
        encryption: 'tls',
        fromEmail: 'noreply@example.com',
        fromName: 'Test',
      });

      const decrypted = await SMTPService.getDecryptedPassword(settings.id);
      expect(decrypted).toBe('my-secret-password');
    });

    it('should get full settings with decrypted password', async () => {
      const settings = await SMTPService.create({
        name: 'Test SMTP',
        host: 'smtp.example.com',
        port: 587,
        username: 'user@example.com',
        password: 'my-secret-password',
        encryption: 'tls',
        fromEmail: 'noreply@example.com',
        fromName: 'Test',
      });

      const full = await SMTPService.getFullSettings(settings.id);
      
      expect(full.password).toBe('my-secret-password');
      expect(full.name).toBe('Test SMTP');
      expect(full.host).toBe('smtp.example.com');
    });
  });

  describe('Rate Limiting', () => {
    const validInput = {
      name: 'Rate Limited SMTP',
      host: 'smtp.example.com',
      port: 587,
      username: 'user@example.com',
      password: 'secret123',
      encryption: 'tls' as const,
      fromEmail: 'noreply@example.com',
      fromName: 'EventOS',
    };

    beforeEach(() => {
      // Reset all rate limit counters before each test
      SMTPService.resetAllRateLimitCounters();
    });

    describe('getRateLimitConfig', () => {
      it('should return rate limit config with null limits when not set', async () => {
        const settings = await SMTPService.create(validInput);
        
        const config = await SMTPService.getRateLimitConfig(settings.id);
        
        expect(config.hourlyLimit).toBeNull();
        expect(config.dailyLimit).toBeNull();
        expect(config.batchSize).toBe(DEFAULT_RATE_LIMIT_CONFIG.batchSize);
        expect(config.batchDelayMs).toBe(DEFAULT_RATE_LIMIT_CONFIG.batchDelayMs);
      });

      it('should return configured rate limits', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        const config = await SMTPService.getRateLimitConfig(settings.id);
        
        expect(config.hourlyLimit).toBe(100);
        expect(config.dailyLimit).toBe(1000);
      });

      it('should throw error for non-existent ID', async () => {
        await expect(
          SMTPService.getRateLimitConfig('non-existent-id')
        ).rejects.toThrow('SMTP settings with ID "non-existent-id" not found');
      });
    });

    describe('getRateLimitStatus', () => {
      it('should return initial status with zero counts', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        const status = await SMTPService.getRateLimitStatus(settings.id);
        
        expect(status.hourlySent).toBe(0);
        expect(status.dailySent).toBe(0);
        expect(status.hourlyLimit).toBe(100);
        expect(status.dailyLimit).toBe(1000);
        expect(status.isLimited).toBe(false);
        expect(status.hourlyRemaining).toBe(100);
        expect(status.dailyRemaining).toBe(1000);
      });

      it('should return null remaining when no limits set', async () => {
        const settings = await SMTPService.create(validInput);
        
        const status = await SMTPService.getRateLimitStatus(settings.id);
        
        expect(status.hourlyRemaining).toBeNull();
        expect(status.dailyRemaining).toBeNull();
        expect(status.isLimited).toBe(false);
      });

      it('should reflect incremented counts', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        await SMTPService.incrementSendCount(settings.id, 50);
        
        const status = await SMTPService.getRateLimitStatus(settings.id);
        
        expect(status.hourlySent).toBe(50);
        expect(status.dailySent).toBe(50);
        expect(status.hourlyRemaining).toBe(50);
        expect(status.dailyRemaining).toBe(950);
        expect(status.isLimited).toBe(false);
      });

      it('should show limited when hourly limit reached', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 10,
          dailyLimit: 1000,
        });
        
        await SMTPService.incrementSendCount(settings.id, 10);
        
        const status = await SMTPService.getRateLimitStatus(settings.id);
        
        expect(status.isLimited).toBe(true);
        expect(status.hourlyRemaining).toBe(0);
      });

      it('should show limited when daily limit reached', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 1000,
          dailyLimit: 10,
        });
        
        await SMTPService.incrementSendCount(settings.id, 10);
        
        const status = await SMTPService.getRateLimitStatus(settings.id);
        
        expect(status.isLimited).toBe(true);
        expect(status.dailyRemaining).toBe(0);
      });
    });

    describe('checkRateLimit', () => {
      it('should allow sending when no limits set', async () => {
        const settings = await SMTPService.create(validInput);
        
        const allowed = await SMTPService.checkRateLimit(settings.id, 1000);
        
        expect(allowed).toBe(true);
      });

      it('should allow sending when under limits', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        const allowed = await SMTPService.checkRateLimit(settings.id, 50);
        
        expect(allowed).toBe(true);
      });

      it('should deny sending when would exceed hourly limit', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        await SMTPService.incrementSendCount(settings.id, 90);
        
        const allowed = await SMTPService.checkRateLimit(settings.id, 20);
        
        expect(allowed).toBe(false);
      });

      it('should deny sending when would exceed daily limit', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 1000,
          dailyLimit: 100,
        });
        
        await SMTPService.incrementSendCount(settings.id, 90);
        
        const allowed = await SMTPService.checkRateLimit(settings.id, 20);
        
        expect(allowed).toBe(false);
      });

      it('should allow sending exactly up to the limit', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        await SMTPService.incrementSendCount(settings.id, 90);
        
        const allowed = await SMTPService.checkRateLimit(settings.id, 10);
        
        expect(allowed).toBe(true);
      });

      it('should default to checking for 1 email', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 10,
        });
        
        await SMTPService.incrementSendCount(settings.id, 9);
        
        const allowed = await SMTPService.checkRateLimit(settings.id);
        
        expect(allowed).toBe(true);
      });
    });

    describe('incrementSendCount', () => {
      it('should increment counts correctly', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        await SMTPService.incrementSendCount(settings.id, 10);
        await SMTPService.incrementSendCount(settings.id, 5);
        await SMTPService.incrementSendCount(settings.id, 3);
        
        const status = await SMTPService.getRateLimitStatus(settings.id);
        
        expect(status.hourlySent).toBe(18);
        expect(status.dailySent).toBe(18);
      });

      it('should default to incrementing by 1', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
        });
        
        await SMTPService.incrementSendCount(settings.id);
        await SMTPService.incrementSendCount(settings.id);
        
        const status = await SMTPService.getRateLimitStatus(settings.id);
        
        expect(status.hourlySent).toBe(2);
      });
    });

    describe('resetRateLimitCounters', () => {
      it('should reset counters for specific SMTP provider', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
        });
        
        await SMTPService.incrementSendCount(settings.id, 50);
        
        let status = await SMTPService.getRateLimitStatus(settings.id);
        expect(status.hourlySent).toBe(50);
        
        SMTPService.resetRateLimitCounters(settings.id);
        
        status = await SMTPService.getRateLimitStatus(settings.id);
        expect(status.hourlySent).toBe(0);
      });
    });

    describe('getAvailableCapacity', () => {
      it('should return null when no limits set', async () => {
        const settings = await SMTPService.create(validInput);
        
        const capacity = await SMTPService.getAvailableCapacity(settings.id);
        
        expect(capacity).toBeNull();
      });

      it('should return hourly remaining when only hourly limit set', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
        });
        
        await SMTPService.incrementSendCount(settings.id, 30);
        
        const capacity = await SMTPService.getAvailableCapacity(settings.id);
        
        expect(capacity).toBe(70);
      });

      it('should return daily remaining when only daily limit set', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          dailyLimit: 1000,
        });
        
        await SMTPService.incrementSendCount(settings.id, 300);
        
        const capacity = await SMTPService.getAvailableCapacity(settings.id);
        
        expect(capacity).toBe(700);
      });

      it('should return minimum of hourly and daily remaining', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        await SMTPService.incrementSendCount(settings.id, 80);
        
        const capacity = await SMTPService.getAvailableCapacity(settings.id);
        
        // Hourly remaining: 20, Daily remaining: 920
        expect(capacity).toBe(20);
      });

      it('should return 0 when limit reached', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
        });
        
        await SMTPService.incrementSendCount(settings.id, 100);
        
        const capacity = await SMTPService.getAvailableCapacity(settings.id);
        
        expect(capacity).toBe(0);
      });
    });

    describe('updateRateLimits', () => {
      it('should update hourly limit', async () => {
        const settings = await SMTPService.create(validInput);
        
        const updated = await SMTPService.updateRateLimits(settings.id, {
          hourlyLimit: 500,
        });
        
        expect(updated.hourlyLimit).toBe(500);
        expect(updated.dailyLimit).toBeNull();
      });

      it('should update daily limit', async () => {
        const settings = await SMTPService.create(validInput);
        
        const updated = await SMTPService.updateRateLimits(settings.id, {
          dailyLimit: 5000,
        });
        
        expect(updated.dailyLimit).toBe(5000);
      });

      it('should update both limits', async () => {
        const settings = await SMTPService.create(validInput);
        
        const updated = await SMTPService.updateRateLimits(settings.id, {
          hourlyLimit: 200,
          dailyLimit: 2000,
        });
        
        expect(updated.hourlyLimit).toBe(200);
        expect(updated.dailyLimit).toBe(2000);
      });

      it('should allow setting limits to null', async () => {
        const settings = await SMTPService.create({
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        });
        
        const updated = await SMTPService.updateRateLimits(settings.id, {
          hourlyLimit: null,
          dailyLimit: null,
        });
        
        expect(updated.hourlyLimit).toBeNull();
        expect(updated.dailyLimit).toBeNull();
      });
    });

    describe('Rate Limit Validation in Schema', () => {
      it('should accept positive rate limits', () => {
        const input = {
          ...validInput,
          hourlyLimit: 100,
          dailyLimit: 1000,
        };

        const result = createSMTPSettingsSchema.parse(input);
        expect(result.hourlyLimit).toBe(100);
        expect(result.dailyLimit).toBe(1000);
      });

      it('should accept null rate limits', () => {
        const input = {
          ...validInput,
          hourlyLimit: null,
          dailyLimit: null,
        };

        const result = createSMTPSettingsSchema.parse(input);
        expect(result.hourlyLimit).toBeNull();
        expect(result.dailyLimit).toBeNull();
      });

      it('should reject negative rate limits', () => {
        const input = {
          ...validInput,
          hourlyLimit: -1,
        };

        expect(() => createSMTPSettingsSchema.parse(input)).toThrow();
      });

      it('should reject zero rate limits', () => {
        const input = {
          ...validInput,
          dailyLimit: 0,
        };

        expect(() => createSMTPSettingsSchema.parse(input)).toThrow();
      });
    });
  });
});
