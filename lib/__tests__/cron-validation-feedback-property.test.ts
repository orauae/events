import { describe, expect, vi, beforeEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { isValidCronExpression } from '@/lib/utils/cron-validator';
import { AutomationService } from '@/lib/services/automation-service';
import type { AutomationNode, AutomationEdge, Automation } from '@/db/schema';

/**
 * @fileoverview Property-based tests for cron validation feedback
 *
 * Feature: automation-trigger-dev-integration, Property 19: Cron Validation Feedback
 *
 * For any invalid cron expression entered in the UI, the validation SHALL return
 * an error and the automation validation SHALL fail for scheduled triggers with
 * invalid cron expressions.
 *
 * **Validates: Requirements 8.6, 8.7**
 */

// Mock the database
vi.mock('@/db', () => ({
  db: {
    query: {
      automations: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => []),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => []),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
}));

// Mock TriggerRegistrationService
vi.mock('@/lib/services/trigger-registration-service', () => ({
  TriggerRegistrationService: {
    registerScheduledTrigger: vi.fn(),
    unregisterScheduledTrigger: vi.fn(),
    updateScheduledTrigger: vi.fn(),
    registerEventDateTrigger: vi.fn(),
    unregisterEventDateTrigger: vi.fn(),
  },
}));

// Helper to create a mock automation with a scheduled trigger
function createMockAutomation(cronExpression: string | undefined): {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
} & Automation {
  const triggerId = 'trigger-1';
  const actionId = 'action-1';

  return {
    id: 'auto-1',
    eventId: 'event-1',
    name: 'Test Automation',
    description: null,
    status: 'Draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    nodes: [
      {
        id: triggerId,
        automationId: 'auto-1',
        type: 'trigger',
        subType: 'scheduled',
        label: 'Scheduled Trigger',
        positionX: '0',
        positionY: '0',
        config: cronExpression !== undefined ? { cronExpression } : {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: actionId,
        automationId: 'auto-1',
        type: 'action',
        subType: 'send_email',
        label: 'Send Email',
        positionX: '0',
        positionY: '100',
        config: { subject: 'Test Subject', body: 'Test Body' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    edges: [
      {
        id: 'edge-1',
        automationId: 'auto-1',
        sourceNodeId: triggerId,
        targetNodeId: actionId,
        sourceHandle: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };
}

// Valid cron expressions for testing
const validCronExpressions = [
  '* * * * *',
  '0 9 * * *',
  '0 9 * * 1',
  '0 9 1 * *',
  '*/15 * * * *',
  '0 */2 * * *',
  '0 9 * * 1-5',
  '0 0 1,15 * *',
  '0 9 * * MON',
  '0 0 1 JAN *',
];

// Invalid cron expressions for testing
const invalidCronExpressions = [
  '',
  '   ',
  '* * * *',           // Only 4 fields
  '* * * * * *',       // 6 fields
  '60 * * * *',        // Minute out of range
  '* 24 * * *',        // Hour out of range
  '* * 0 * *',         // Day of month out of range (0)
  '* * 32 * *',        // Day of month out of range (32)
  '* * * 0 *',         // Month out of range (0)
  '* * * 13 *',        // Month out of range (13)
  '* * * * 7',         // Day of week out of range (7)
  'invalid',
  '@ * * * *',
  '* # * * *',
  '59-0 * * * *',      // Invalid range
];

/**
 * Feature: automation-trigger-dev-integration, Property 19: Cron Validation Feedback
 * **Validates: Requirements 8.6, 8.7**
 */
describe('Property 19: Cron Validation Feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UI validation (isValidCronExpression)', () => {
    test.prop([fc.constantFrom(...invalidCronExpressions)], { numRuns: 14 })(
      'invalid cron expressions return false from validation function',
      (cronExpression) => {
        // Requirement 8.6: Invalid cron expressions should return error
        const result = isValidCronExpression(cronExpression);
        expect(result).toBe(false);
      }
    );

    test.prop([fc.constantFrom(...validCronExpressions)], { numRuns: 10 })(
      'valid cron expressions return true from validation function',
      (cronExpression) => {
        const result = isValidCronExpression(cronExpression);
        expect(result).toBe(true);
      }
    );
  });

  describe('Automation validation (AutomationService.validate)', () => {
    test.prop([fc.constantFrom(...invalidCronExpressions)], { numRuns: 14 })(
      'automation validation fails for scheduled triggers with invalid cron expressions',
      (cronExpression) => {
        // Requirement 8.7: Automation validation SHALL fail for scheduled triggers with invalid cron
        const automation = createMockAutomation(cronExpression);
        const result = AutomationService.validate(automation);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);

        // Should have an error related to cron expression
        const cronError = result.errors.find(
          e => e.field === 'cronExpression' || e.message.includes('cron')
        );
        expect(cronError).toBeDefined();
      }
    );

    test.prop([fc.constantFrom(...validCronExpressions)], { numRuns: 10 })(
      'automation validation passes for scheduled triggers with valid cron expressions',
      (cronExpression) => {
        const automation = createMockAutomation(cronExpression);
        const result = AutomationService.validate(automation);

        // Should not have cron-related errors
        const cronError = result.errors.find(
          e => e.field === 'cronExpression' || e.message.includes('cron')
        );
        expect(cronError).toBeUndefined();
      }
    );

    test.prop([fc.constant(undefined)], { numRuns: 1 })(
      'automation validation fails when cron expression is missing',
      () => {
        // Requirement 8.7: Missing cron expression should fail validation
        const automation = createMockAutomation(undefined);
        const result = AutomationService.validate(automation);

        expect(result.valid).toBe(false);
        const cronError = result.errors.find(
          e => e.field === 'cronExpression' || e.message.includes('cron')
        );
        expect(cronError).toBeDefined();
      }
    );
  });

  describe('Consistency between UI and automation validation', () => {
    // Arbitrary for random strings that might be cron expressions
    const randomStringArb = fc.oneof(
      fc.string({ minLength: 0, maxLength: 50 }),
      fc.constantFrom(...validCronExpressions),
      fc.constantFrom(...invalidCronExpressions)
    );

    test.prop([randomStringArb], { numRuns: 50 })(
      'UI validation and automation validation are consistent',
      (cronExpression) => {
        // Both validation methods should agree on validity
        const uiValid = isValidCronExpression(cronExpression);
        const automation = createMockAutomation(cronExpression);
        const automationResult = AutomationService.validate(automation);

        // Check for cron-related errors
        const hasCronError = automationResult.errors.some(
          e => e.field === 'cronExpression' || e.message.includes('cron')
        );

        // If UI says valid, automation should not have cron errors
        // If UI says invalid, automation should have cron errors
        if (uiValid) {
          expect(hasCronError).toBe(false);
        } else {
          expect(hasCronError).toBe(true);
        }
      }
    );
  });

  describe('Error message quality', () => {
    test.prop([fc.constantFrom(...invalidCronExpressions)], { numRuns: 14 })(
      'validation errors include meaningful messages',
      (cronExpression) => {
        const automation = createMockAutomation(cronExpression);
        const result = AutomationService.validate(automation);

        // Find cron-related error
        const cronError = result.errors.find(
          e => e.field === 'cronExpression' || e.message.includes('cron')
        );

        if (cronError) {
          // Error message should be non-empty and descriptive
          expect(cronError.message).toBeTruthy();
          expect(cronError.message.length).toBeGreaterThan(10);
        }
      }
    );
  });
});
