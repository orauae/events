import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { isValidCronExpression } from '@/lib/utils/cron-validator';

/**
 * @fileoverview Property-based tests for cron expression validation
 *
 * Feature: automation-trigger-dev-integration, Property 8: Cron Expression Validation
 *
 * For any string input as a cron expression, the validation function SHALL return
 * true for valid cron expressions and false for invalid ones, matching standard
 * cron syntax rules.
 *
 * **Validates: Requirements 4.4**
 */

// Field constraints for cron expressions (5-field format)
const FIELD_CONSTRAINTS = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
};

// Valid month abbreviations
const MONTH_ABBREVS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Valid day abbreviations
const DAY_ABBREVS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Arbitrary for valid minute field (0-59)
const validMinuteArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 0, max: 59 }).map(String),
  fc.tuple(
    fc.integer({ min: 0, max: 58 }),
    fc.integer({ min: 1, max: 59 })
  ).filter(([start, end]) => start < end).map(([start, end]) => `${start}-${end}`),
  fc.integer({ min: 1, max: 30 }).map(step => `*/${step}`)
);

// Arbitrary for valid hour field (0-23)
const validHourArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 0, max: 23 }).map(String),
  fc.tuple(
    fc.integer({ min: 0, max: 22 }),
    fc.integer({ min: 1, max: 23 })
  ).filter(([start, end]) => start < end).map(([start, end]) => `${start}-${end}`),
  fc.integer({ min: 1, max: 12 }).map(step => `*/${step}`)
);

// Arbitrary for valid day of month field (1-31)
const validDayOfMonthArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 1, max: 31 }).map(String),
  fc.tuple(
    fc.integer({ min: 1, max: 30 }),
    fc.integer({ min: 2, max: 31 })
  ).filter(([start, end]) => start < end).map(([start, end]) => `${start}-${end}`),
  fc.integer({ min: 1, max: 15 }).map(step => `*/${step}`)
);

// Arbitrary for valid month field (1-12 or abbreviations)
const validMonthArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 1, max: 12 }).map(String),
  fc.constantFrom(...MONTH_ABBREVS),
  fc.tuple(
    fc.integer({ min: 1, max: 11 }),
    fc.integer({ min: 2, max: 12 })
  ).filter(([start, end]) => start < end).map(([start, end]) => `${start}-${end}`),
  fc.integer({ min: 1, max: 6 }).map(step => `*/${step}`)
);

// Arbitrary for valid day of week field (0-6 or abbreviations)
const validDayOfWeekArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 0, max: 6 }).map(String),
  fc.constantFrom(...DAY_ABBREVS),
  fc.tuple(
    fc.integer({ min: 0, max: 5 }),
    fc.integer({ min: 1, max: 6 })
  ).filter(([start, end]) => start < end).map(([start, end]) => `${start}-${end}`),
  fc.integer({ min: 1, max: 3 }).map(step => `*/${step}`)
);

// Arbitrary for valid cron expressions (5 fields)
const validCronArb = fc.tuple(
  validMinuteArb,
  validHourArb,
  validDayOfMonthArb,
  validMonthArb,
  validDayOfWeekArb
).map(fields => fields.join(' '));

// Arbitrary for invalid cron expressions
const invalidCronArb = fc.oneof(
  // Empty string
  fc.constant(''),
  // Wrong number of fields (less than 5)
  fc.tuple(
    fc.integer({ min: 1, max: 4 }),
    fc.array(fc.constantFrom('*', '0', '1'), { minLength: 1, maxLength: 4 })
  ).map(([_, fields]) => fields.join(' ')),
  // Wrong number of fields (more than 5)
  fc.array(fc.constantFrom('*', '0', '1'), { minLength: 6, maxLength: 8 }).map(fields => fields.join(' ')),
  // Out of range minute (60+)
  fc.integer({ min: 60, max: 100 }).map(n => `${n} * * * *`),
  // Out of range hour (24+)
  fc.integer({ min: 24, max: 100 }).map(n => `* ${n} * * *`),
  // Out of range day of month (0 or 32+)
  fc.oneof(
    fc.constant('* * 0 * *'),
    fc.integer({ min: 32, max: 100 }).map(n => `* * ${n} * *`)
  ),
  // Out of range month (0 or 13+)
  fc.oneof(
    fc.constant('* * * 0 *'),
    fc.integer({ min: 13, max: 100 }).map(n => `* * * ${n} *`)
  ),
  // Out of range day of week (7+)
  fc.integer({ min: 7, max: 100 }).map(n => `* * * * ${n}`),
  // Invalid characters
  fc.constantFrom(
    '@ * * * *',
    '* # * * *',
    '* * $ * *',
    '* * * % *',
    '* * * * &'
  ),
  // Invalid abbreviations
  fc.constantFrom(
    '* * * INVALID *',
    '* * * * INVALID',
    '* * * FOO *',
    '* * * * BAR'
  ),
  // Invalid range (start > end)
  fc.constantFrom(
    '59-0 * * * *',
    '* 23-0 * * *',
    '* * 31-1 * *',
    '* * * 12-1 *',
    '* * * * 6-0'
  )
);

/**
 * Feature: automation-trigger-dev-integration, Property 8: Cron Expression Validation
 * **Validates: Requirements 4.4**
 */
describe('Property 8: Cron Expression Validation', () => {
  test.prop([validCronArb], { numRuns: 20 })(
    'valid cron expressions return true',
    (cronExpression) => {
      const result = isValidCronExpression(cronExpression);
      expect(result).toBe(true);
    }
  );

  test.prop([invalidCronArb], { numRuns: 20 })(
    'invalid cron expressions return false',
    (cronExpression) => {
      const result = isValidCronExpression(cronExpression);
      expect(result).toBe(false);
    }
  );

  // Edge case tests for specific invalid inputs
  describe('edge cases', () => {
    test.prop([fc.constant('')], { numRuns: 1 })(
      'empty string returns false',
      (cronExpression) => {
        expect(isValidCronExpression(cronExpression)).toBe(false);
      }
    );

    test.prop([fc.constant('   ')], { numRuns: 1 })(
      'whitespace-only string returns false',
      (cronExpression) => {
        expect(isValidCronExpression(cronExpression)).toBe(false);
      }
    );

    test.prop([fc.constant(null as unknown as string)], { numRuns: 1 })(
      'null returns false',
      (cronExpression) => {
        expect(isValidCronExpression(cronExpression)).toBe(false);
      }
    );

    test.prop([fc.constant(undefined as unknown as string)], { numRuns: 1 })(
      'undefined returns false',
      (cronExpression) => {
        expect(isValidCronExpression(cronExpression)).toBe(false);
      }
    );

    test.prop([fc.integer()], { numRuns: 1 })(
      'non-string input returns false',
      (input) => {
        expect(isValidCronExpression(input as unknown as string)).toBe(false);
      }
    );
  });

  // Test common valid cron patterns
  describe('common valid patterns', () => {
    const commonPatterns = [
      '* * * * *',       // Every minute
      '0 * * * *',       // Every hour
      '0 0 * * *',       // Daily at midnight
      '0 9 * * *',       // Daily at 9am
      '0 0 * * 0',       // Weekly on Sunday
      '0 0 1 * *',       // Monthly on the 1st
      '*/15 * * * *',    // Every 15 minutes
      '0 */2 * * *',     // Every 2 hours
      '0 9 * * 1-5',     // Weekdays at 9am
      '0 0 1,15 * *',    // 1st and 15th of month
      '0 9 * * MON',     // Every Monday at 9am
      '0 0 1 JAN *',     // January 1st at midnight
    ];

    test.prop([fc.constantFrom(...commonPatterns)], { numRuns: 12 })(
      'common cron patterns are valid',
      (cronExpression) => {
        expect(isValidCronExpression(cronExpression)).toBe(true);
      }
    );
  });

  // Test step values
  describe('step values', () => {
    test.prop(
      [fc.integer({ min: 1, max: 30 })],
      { numRuns: 20 }
    )(
      'valid step values in minute field are accepted',
      (step) => {
        const cronExpression = `*/${step} * * * *`;
        expect(isValidCronExpression(cronExpression)).toBe(true);
      }
    );

    test.prop(
      [fc.integer({ min: 0, max: 0 })],
      { numRuns: 1 }
    )(
      'step value of 0 is rejected',
      () => {
        const cronExpression = '*/0 * * * *';
        expect(isValidCronExpression(cronExpression)).toBe(false);
      }
    );
  });

  // Test range values
  describe('range values', () => {
    test.prop(
      [
        fc.integer({ min: 0, max: 29 }),
        fc.integer({ min: 30, max: 59 })
      ],
      { numRuns: 20 }
    )(
      'valid ranges in minute field are accepted',
      (start, end) => {
        const cronExpression = `${start}-${end} * * * *`;
        expect(isValidCronExpression(cronExpression)).toBe(true);
      }
    );

    test.prop(
      [
        fc.integer({ min: 30, max: 59 }),
        fc.integer({ min: 0, max: 29 })
      ],
      { numRuns: 20 }
    )(
      'invalid ranges (start > end) are rejected',
      (start, end) => {
        const cronExpression = `${start}-${end} * * * *`;
        expect(isValidCronExpression(cronExpression)).toBe(false);
      }
    );
  });

  // Test list values
  describe('list values', () => {
    test.prop(
      [fc.array(fc.integer({ min: 0, max: 59 }), { minLength: 2, maxLength: 5 })],
      { numRuns: 20 }
    )(
      'valid lists in minute field are accepted',
      (values) => {
        const cronExpression = `${values.join(',')} * * * *`;
        expect(isValidCronExpression(cronExpression)).toBe(true);
      }
    );
  });

  // Test month and day abbreviations
  describe('abbreviations', () => {
    test.prop([fc.constantFrom(...MONTH_ABBREVS)], { numRuns: 12 })(
      'valid month abbreviations are accepted',
      (month) => {
        const cronExpression = `0 0 1 ${month} *`;
        expect(isValidCronExpression(cronExpression)).toBe(true);
      }
    );

    test.prop([fc.constantFrom(...DAY_ABBREVS)], { numRuns: 7 })(
      'valid day abbreviations are accepted',
      (day) => {
        const cronExpression = `0 0 * * ${day}`;
        expect(isValidCronExpression(cronExpression)).toBe(true);
      }
    );

    test.prop(
      [fc.array(fc.constantFrom('A', 'B', 'C', 'X', 'Y', 'Z'), { minLength: 3, maxLength: 3 }).map(arr => arr.join(''))],
      { numRuns: 20 }
    )(
      'invalid abbreviations are rejected',
      (abbrev) => {
        // Skip if it happens to be a valid abbreviation
        if (MONTH_ABBREVS.includes(abbrev) || DAY_ABBREVS.includes(abbrev)) {
          return;
        }
        const cronExpression = `0 0 * ${abbrev} *`;
        expect(isValidCronExpression(cronExpression)).toBe(false);
      }
    );
  });
});
