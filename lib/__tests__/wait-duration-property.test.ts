import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { convertToWaitDuration } from '@/lib/jobs/workers/automation-execution';

/**
 * @fileoverview Property-based tests for wait duration conversion
 *
 * Feature: automation-trigger-dev-integration, Property 5: Wait Duration Conversion
 *
 * For any wait_delay node configuration with duration and unit (minutes, hours, or days),
 * the `wait.for()` call SHALL receive the correctly converted duration object.
 *
 * **Validates: Requirements 3.1, 3.2**
 */

// Arbitrary for positive duration values
const durationArb = fc.integer({ min: 1, max: 10000 });

// Arbitrary for valid time units
const unitArb = fc.constantFrom('minutes', 'hours', 'days');

/**
 * Feature: automation-trigger-dev-integration, Property 5: Wait Duration Conversion
 * **Validates: Requirements 3.1, 3.2**
 */
describe('Property 5: Wait Duration Conversion', () => {
  test.prop([durationArb], { numRuns: 20 })(
    'minutes are converted to { minutes: number }',
    (duration) => {
      const result = convertToWaitDuration(duration, 'minutes');

      // Result should have exactly one key: 'minutes'
      expect(Object.keys(result)).toEqual(['minutes']);
      expect('minutes' in result).toBe(true);
      expect((result as { minutes: number }).minutes).toBe(duration);
    }
  );

  test.prop([durationArb], { numRuns: 20 })(
    'hours are converted to { hours: number }',
    (duration) => {
      const result = convertToWaitDuration(duration, 'hours');

      // Result should have exactly one key: 'hours'
      expect(Object.keys(result)).toEqual(['hours']);
      expect('hours' in result).toBe(true);
      expect((result as { hours: number }).hours).toBe(duration);
    }
  );

  test.prop([durationArb], { numRuns: 20 })(
    'days are converted to { days: number }',
    (duration) => {
      const result = convertToWaitDuration(duration, 'days');

      // Result should have exactly one key: 'days'
      expect(Object.keys(result)).toEqual(['days']);
      expect('days' in result).toBe(true);
      expect((result as { days: number }).days).toBe(duration);
    }
  );

  test.prop([durationArb, unitArb], { numRuns: 20 })(
    'duration value is preserved unchanged for any valid unit',
    (duration, unit) => {
      const result = convertToWaitDuration(duration, unit);

      // The duration value should be preserved exactly
      const resultValue = Object.values(result)[0];
      expect(resultValue).toBe(duration);
    }
  );

  test.prop([durationArb, unitArb], { numRuns: 20 })(
    'result object has exactly one key matching the unit',
    (duration, unit) => {
      const result = convertToWaitDuration(duration, unit);

      // Result should have exactly one key
      const keys = Object.keys(result);
      expect(keys).toHaveLength(1);

      // The key should match the unit
      expect(keys[0]).toBe(unit);
    }
  );

  test.prop([durationArb, unitArb], { numRuns: 20 })(
    'conversion is idempotent - same input always produces same output',
    (duration, unit) => {
      const result1 = convertToWaitDuration(duration, unit);
      const result2 = convertToWaitDuration(duration, unit);

      expect(result1).toEqual(result2);
    }
  );

  // Test edge cases with specific duration values
  test.prop([fc.constantFrom(1, 60, 1440, 10080)], { numRuns: 20 })(
    'common duration values are correctly converted for minutes',
    (duration) => {
      const result = convertToWaitDuration(duration, 'minutes');
      expect(result).toEqual({ minutes: duration });
    }
  );

  test.prop([fc.constantFrom(1, 24, 48, 168)], { numRuns: 20 })(
    'common duration values are correctly converted for hours',
    (duration) => {
      const result = convertToWaitDuration(duration, 'hours');
      expect(result).toEqual({ hours: duration });
    }
  );

  test.prop([fc.constantFrom(1, 7, 14, 30, 365)], { numRuns: 20 })(
    'common duration values are correctly converted for days',
    (duration) => {
      const result = convertToWaitDuration(duration, 'days');
      expect(result).toEqual({ days: duration });
    }
  );
});
