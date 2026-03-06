/**
 * @fileoverview A/B Test Types
 * 
 * Type definitions for A/B testing functionality in email campaigns.
 * Supports testing subject lines, sender names, email content, and send times.
 * 
 * @module lib/types/ab-test
 * 
 * Requirements: 14 (A/B Testing for Campaigns)
 */

import type { EmailBuilderState } from './email-builder';

/**
 * Types of elements that can be A/B tested
 */
export type ABTestType = 'subject' | 'sender' | 'content' | 'sendTime';

/**
 * Metrics used to determine the winning variant
 */
export type ABTestWinnerMetric = 'openRate' | 'clickRate' | 'conversionRate';

/**
 * A/B test variant for subject line testing
 */
export interface SubjectVariant {
  id: string;
  name: string;
  subject: string;
}

/**
 * A/B test variant for sender name testing
 */
export interface SenderVariant {
  id: string;
  name: string;
  senderName: string;
  senderEmail: string;
}

/**
 * A/B test variant for content testing
 */
export interface ContentVariant {
  id: string;
  name: string;
  designJson: EmailBuilderState | null;
}

/**
 * A/B test variant for send time testing
 */
export interface SendTimeVariant {
  id: string;
  name: string;
  sendTime: Date;
}

/**
 * Union type for all variant types
 */
export type ABTestVariant = SubjectVariant | SenderVariant | ContentVariant | SendTimeVariant;

/**
 * A/B test configuration
 * 
 * Requirements: 14.1 - Support 2-4 variants
 * Requirements: 14.2 - Allow testing subject, sender, content, or send time
 * Requirements: 14.3 - Configure test audience percentage (10-50%)
 * Requirements: 14.4 - Auto-select winner based on metric
 */
export interface ABTestConfig {
  /** Whether A/B testing is enabled for this campaign */
  enabled: boolean;
  
  /** Type of element being tested */
  testType: ABTestType;
  
  /** Test variants (2-4 variants) */
  variants: ABTestVariant[];
  
  /** Percentage of recipients for the test (10-50%) */
  testAudiencePercentage: number;
  
  /** Metric used to determine the winner */
  winnerMetric: ABTestWinnerMetric;
  
  /** Duration of the test period in hours before selecting winner */
  testDurationHours: number;
  
  /** Whether to automatically send winner to remaining recipients */
  autoSendWinner: boolean;
}

/**
 * A/B test results for a variant
 */
export interface ABTestVariantResult {
  variantId: string;
  variantName: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  conversionCount: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
}

/**
 * Complete A/B test results
 */
export interface ABTestResults {
  testType: ABTestType;
  winnerMetric: ABTestWinnerMetric;
  testStartedAt: Date;
  testEndedAt: Date | null;
  winningVariantId: string | null;
  variantResults: ABTestVariantResult[];
}

/**
 * Default A/B test configuration
 */
export const DEFAULT_AB_TEST_CONFIG: ABTestConfig = {
  enabled: false,
  testType: 'subject',
  variants: [],
  testAudiencePercentage: 20,
  winnerMetric: 'openRate',
  testDurationHours: 4,
  autoSendWinner: true,
};

/**
 * Minimum and maximum values for A/B test configuration
 */
export const AB_TEST_LIMITS = {
  minVariants: 2,
  maxVariants: 4,
  minAudiencePercentage: 10,
  maxAudiencePercentage: 50,
  minTestDurationHours: 1,
  maxTestDurationHours: 72,
} as const;

/**
 * Labels for A/B test types
 */
export const AB_TEST_TYPE_LABELS: Record<ABTestType, { label: string; description: string }> = {
  subject: {
    label: 'Subject Line',
    description: 'Test different email subject lines to see which gets more opens',
  },
  sender: {
    label: 'Sender Name',
    description: 'Test different sender names and emails to improve recognition',
  },
  content: {
    label: 'Email Content',
    description: 'Test different email designs and content to improve engagement',
  },
  sendTime: {
    label: 'Send Time',
    description: 'Test different send times to find the optimal delivery window',
  },
};

/**
 * Labels for winner metrics
 */
export const WINNER_METRIC_LABELS: Record<ABTestWinnerMetric, { label: string; description: string }> = {
  openRate: {
    label: 'Open Rate',
    description: 'Select winner based on highest email open rate',
  },
  clickRate: {
    label: 'Click Rate',
    description: 'Select winner based on highest link click rate',
  },
  conversionRate: {
    label: 'Conversion Rate',
    description: 'Select winner based on highest RSVP conversion rate',
  },
};

/**
 * Create a new subject variant
 */
export function createSubjectVariant(id: string, name: string, subject: string = ''): SubjectVariant {
  return { id, name, subject };
}

/**
 * Create a new sender variant
 */
export function createSenderVariant(
  id: string,
  name: string,
  senderName: string = '',
  senderEmail: string = ''
): SenderVariant {
  return { id, name, senderName, senderEmail };
}

/**
 * Create a new content variant
 */
export function createContentVariant(
  id: string,
  name: string,
  designJson: EmailBuilderState | null = null
): ContentVariant {
  return { id, name, designJson };
}

/**
 * Create a new send time variant
 */
export function createSendTimeVariant(id: string, name: string, sendTime: Date = new Date()): SendTimeVariant {
  return { id, name, sendTime };
}

/**
 * Validate A/B test configuration
 */
export function validateABTestConfig(config: ABTestConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.enabled) {
    return { isValid: true, errors: [] };
  }

  // Validate variant count
  if (config.variants.length < AB_TEST_LIMITS.minVariants) {
    errors.push(`At least ${AB_TEST_LIMITS.minVariants} variants are required for A/B testing`);
  }
  if (config.variants.length > AB_TEST_LIMITS.maxVariants) {
    errors.push(`Maximum ${AB_TEST_LIMITS.maxVariants} variants are allowed for A/B testing`);
  }

  // Validate audience percentage
  if (config.testAudiencePercentage < AB_TEST_LIMITS.minAudiencePercentage) {
    errors.push(`Test audience must be at least ${AB_TEST_LIMITS.minAudiencePercentage}%`);
  }
  if (config.testAudiencePercentage > AB_TEST_LIMITS.maxAudiencePercentage) {
    errors.push(`Test audience cannot exceed ${AB_TEST_LIMITS.maxAudiencePercentage}%`);
  }

  // Validate test duration
  if (config.testDurationHours < AB_TEST_LIMITS.minTestDurationHours) {
    errors.push(`Test duration must be at least ${AB_TEST_LIMITS.minTestDurationHours} hour`);
  }
  if (config.testDurationHours > AB_TEST_LIMITS.maxTestDurationHours) {
    errors.push(`Test duration cannot exceed ${AB_TEST_LIMITS.maxTestDurationHours} hours`);
  }

  // Validate variants based on test type
  for (const variant of config.variants) {
    switch (config.testType) {
      case 'subject':
        if (!(variant as SubjectVariant).subject?.trim()) {
          errors.push(`Variant "${variant.name}" is missing a subject line`);
        }
        break;
      case 'sender':
        if (!(variant as SenderVariant).senderName?.trim()) {
          errors.push(`Variant "${variant.name}" is missing a sender name`);
        }
        if (!(variant as SenderVariant).senderEmail?.trim()) {
          errors.push(`Variant "${variant.name}" is missing a sender email`);
        }
        break;
      case 'content':
        // Content variants can have null designJson (will use default)
        break;
      case 'sendTime':
        if (!(variant as SendTimeVariant).sendTime) {
          errors.push(`Variant "${variant.name}" is missing a send time`);
        }
        break;
    }
  }

  return { isValid: errors.length === 0, errors };
}
