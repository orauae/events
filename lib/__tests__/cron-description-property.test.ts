import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { getCronDescription, isValidCronExpression } from '@/lib/utils/cron-validator';

/**
 * @fileoverview Property-based tests for cron description generation
 *
 * Feature: automation-trigger-dev-integration, Property 18: Cron Description Generation
 *
 * For any valid cron expression, the UI helper function SHALL generate a human-readable
 * description of the schedule (e.g., "Every day at 9:00 AM").
 *
 * **Validates: Requirements 8.5**
 */

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

/**
 * Feature: automation-trigger-dev-integration, Property 18: Cron Description Generation
 * **Validates: Requirements 8.5**
 */
describe('Property 18: Cron Description Generation', () => {
  test.prop([validCronArb], { numRuns: 50 })(
    'valid cron expressions produce non-empty descriptions',
    (cronExpression) => {
      const description = getCronDescription(cronExpression);
      
      // Description should be a non-empty string
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
      
      // Description should NOT be the error message for valid expressions
      expect(description).not.toBe('Invalid cron expression');
    }
  );

  test.prop([validCronArb], { numRuns: 50 })(
    'valid cron expressions produce human-readable descriptions',
    (cronExpression) => {
      const description = getCronDescription(cronExpression);
      
      // Description should contain recognizable time/schedule words
      const scheduleWords = [
        'Every', 'at', 'day', 'minute', 'hour', 'On', 'AM', 'PM',
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
        'weekday', 'month', 'through', 'from', 'to', 'in'
      ];
      
      const containsScheduleWord = scheduleWords.some(word => 
        description.toLowerCase().includes(word.toLowerCase())
      );
      
      // Either contains schedule words or contains time format (digits with colon)
      const containsTimeFormat = /\d{1,2}:\d{2}/.test(description);
      
      expect(containsScheduleWord || containsTimeFormat).toBe(true);
    }
  );

  // Test that invalid expressions return error message
  describe('invalid expressions', () => {
    test.prop([fc.constant('')], { numRuns: 1 })(
      'empty string returns error message',
      (cronExpression) => {
        const description = getCronDescription(cronExpression);
        expect(description).toBe('Invalid cron expression');
      }
    );

    test.prop([fc.constant('invalid')], { numRuns: 1 })(
      'invalid string returns error message',
      (cronExpression) => {
        const description = getCronDescription(cronExpression);
        expect(description).toBe('Invalid cron expression');
      }
    );

    test.prop([fc.constant('* * *')], { numRuns: 1 })(
      'wrong number of fields returns error message',
      (cronExpression) => {
        const description = getCronDescription(cronExpression);
        expect(description).toBe('Invalid cron expression');
      }
    );
  });

  // Test common patterns produce expected descriptions
  describe('common patterns produce meaningful descriptions', () => {
    const commonPatterns: Array<{ cron: string; expectedWords: string[] }> = [
      { cron: '* * * * *', expectedWords: ['every', 'minute'] },
      { cron: '0 * * * *', expectedWords: ['hour'] },
      { cron: '0 0 * * *', expectedWords: ['day', '12:00'] },
      { cron: '0 9 * * *', expectedWords: ['day', '9:00'] },
      { cron: '0 0 * * 0', expectedWords: ['sunday'] },
      { cron: '0 0 * * MON', expectedWords: ['monday'] },
      { cron: '0 0 1 * *', expectedWords: ['day 1', 'month'] },
      { cron: '*/15 * * * *', expectedWords: ['15', 'minute'] },
      { cron: '0 */2 * * *', expectedWords: ['2', 'hour'] },
      { cron: '0 9 * * 1-5', expectedWords: ['weekday'] },
    ];

    commonPatterns.forEach(({ cron, expectedWords }) => {
      test.prop([fc.constant(cron)], { numRuns: 1 })(
        `"${cron}" contains expected words: ${expectedWords.join(', ')}`,
        (cronExpression) => {
          const description = getCronDescription(cronExpression);
          const lowerDescription = description.toLowerCase();
          
          const containsExpectedWord = expectedWords.some(word => 
            lowerDescription.includes(word.toLowerCase())
          );
          
          expect(containsExpectedWord).toBe(true);
        }
      );
    });
  });

  // Test time formatting
  describe('time formatting', () => {
    test.prop(
      [fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 })],
      { numRuns: 20 }
    )(
      'specific times are formatted with AM/PM',
      (hour, minute) => {
        const cronExpression = `${minute} ${hour} * * *`;
        const description = getCronDescription(cronExpression);
        
        // Should contain AM or PM for specific times
        expect(description.includes('AM') || description.includes('PM')).toBe(true);
      }
    );
  });

  // Test day of week descriptions
  describe('day of week descriptions', () => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    test.prop([fc.integer({ min: 0, max: 6 })], { numRuns: 7 })(
      'specific day of week includes day name',
      (dayOfWeek) => {
        const cronExpression = `0 9 * * ${dayOfWeek}`;
        const description = getCronDescription(cronExpression);
        
        expect(description.includes(dayNames[dayOfWeek])).toBe(true);
      }
    );
  });

  // Test month descriptions
  describe('month descriptions', () => {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    test.prop([fc.integer({ min: 1, max: 12 })], { numRuns: 12 })(
      'specific month includes month name',
      (month) => {
        const cronExpression = `0 9 1 ${month} *`;
        const description = getCronDescription(cronExpression);
        
        expect(description.includes(monthNames[month - 1])).toBe(true);
      }
    );
  });

  // Test step value descriptions
  describe('step value descriptions', () => {
    test.prop([fc.integer({ min: 2, max: 30 })], { numRuns: 10 })(
      'minute step values include the step number',
      (step) => {
        const cronExpression = `*/${step} * * * *`;
        const description = getCronDescription(cronExpression);
        
        expect(description.includes(String(step))).toBe(true);
      }
    );

    test.prop([fc.integer({ min: 2, max: 12 })], { numRuns: 10 })(
      'hour step values include the step number',
      (step) => {
        const cronExpression = `0 */${step} * * *`;
        const description = getCronDescription(cronExpression);
        
        expect(description.includes(String(step))).toBe(true);
      }
    );
  });
});
