/**
 * @fileoverview Cron expression validation and description utilities
 *
 * This module provides functions for validating cron expressions and generating
 * human-readable descriptions of cron schedules.
 *
 * Supports standard 5-field cron format: minute hour day-of-month month day-of-week
 *
 * @module lib/utils/cron-validator
 *
 * **Validates: Requirements 4.4, 8.5**
 */

/**
 * Day of week names for parsing and description generation
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBREVS: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

/**
 * Month names for parsing and description generation
 */
const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_ABBREVS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Field constraints for cron expressions
 */
const FIELD_CONSTRAINTS = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
};

/**
 * Parses a field value, handling both numbers and abbreviations
 */
function parseFieldValue(value: string, allowedAbbrevs?: Record<string, number>): number | null {
  if (allowedAbbrevs) {
    const upper = value.toUpperCase();
    if (upper in allowedAbbrevs) {
      return allowedAbbrevs[upper];
    }
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) return null;
  return num;
}

/**
 * Validates a single cron field value
 */
function isValidCronField(
  value: string,
  min: number,
  max: number,
  allowedAbbrevs?: Record<string, number>
): boolean {
  if (value === '*') return true;

  if (value.includes('/')) {
    const [base, step] = value.split('/');
    if (step === undefined || step === '') return false;
    const stepNum = parseInt(step, 10);
    if (isNaN(stepNum) || stepNum < 1) return false;
    if (base === '*') return true;
    return isValidCronField(base, min, max, allowedAbbrevs);
  }

  if (value.includes('-')) {
    const [start, end] = value.split('-');
    if (start === undefined || end === undefined) return false;
    const startNum = parseFieldValue(start, allowedAbbrevs);
    const endNum = parseFieldValue(end, allowedAbbrevs);
    if (startNum === null || endNum === null) return false;
    if (startNum < min || startNum > max) return false;
    if (endNum < min || endNum > max) return false;
    if (startNum > endNum) return false;
    return true;
  }

  if (value.includes(',')) {
    const parts = value.split(',');
    return parts.every(part => isValidCronField(part.trim(), min, max, allowedAbbrevs));
  }

  const num = parseFieldValue(value, allowedAbbrevs);
  if (num === null) return false;
  return num >= min && num <= max;
}

/**
 * Validates a cron expression
 *
 * @param cron - The cron expression to validate
 * @returns true if valid, false otherwise
 *
 * **Validates: Requirement 4.4**
 */
export function isValidCronExpression(cron: string): boolean {
  if (!cron || typeof cron !== 'string') return false;

  const trimmed = cron.trim();
  if (trimmed === '') return false;

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  if (!isValidCronField(minute, FIELD_CONSTRAINTS.minute.min, FIELD_CONSTRAINTS.minute.max)) return false;
  if (!isValidCronField(hour, FIELD_CONSTRAINTS.hour.min, FIELD_CONSTRAINTS.hour.max)) return false;
  if (!isValidCronField(dayOfMonth, FIELD_CONSTRAINTS.dayOfMonth.min, FIELD_CONSTRAINTS.dayOfMonth.max)) return false;
  if (!isValidCronField(month, FIELD_CONSTRAINTS.month.min, FIELD_CONSTRAINTS.month.max, MONTH_ABBREVS)) return false;
  if (!isValidCronField(dayOfWeek, FIELD_CONSTRAINTS.dayOfWeek.min, FIELD_CONSTRAINTS.dayOfWeek.max, DAY_ABBREVS)) return false;

  return true;
}

/**
 * Formats a time value as a human-readable string
 */
function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

/**
 * Parses a cron field and returns its numeric values
 */
function parseField(
  field: string,
  min: number,
  max: number,
  abbrevs?: Record<string, number>
): { type: 'all' | 'single' | 'range' | 'list' | 'step'; values: number[]; step?: number } {
  if (field === '*') return { type: 'all', values: [] };

  if (field.includes('/')) {
    const [base, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    if (base === '*') {
      const values: number[] = [];
      for (let i = min; i <= max; i += step) values.push(i);
      return { type: 'step', values, step };
    }
    if (base.includes('-')) {
      const [startStr, endStr] = base.split('-');
      const start = parseFieldValue(startStr, abbrevs) ?? min;
      const end = parseFieldValue(endStr, abbrevs) ?? max;
      const values: number[] = [];
      for (let i = start; i <= end; i += step) values.push(i);
      return { type: 'step', values, step };
    }
    return { type: 'step', values: [], step };
  }

  if (field.includes('-')) {
    const [startStr, endStr] = field.split('-');
    const start = parseFieldValue(startStr, abbrevs) ?? min;
    const end = parseFieldValue(endStr, abbrevs) ?? max;
    const values: number[] = [];
    for (let i = start; i <= end; i++) values.push(i);
    return { type: 'range', values };
  }

  if (field.includes(',')) {
    const values = field.split(',').map(v => parseFieldValue(v.trim(), abbrevs) ?? 0);
    return { type: 'list', values };
  }

  const value = parseFieldValue(field, abbrevs) ?? 0;
  return { type: 'single', values: [value] };
}

/**
 * Generates a human-readable description of a cron expression
 *
 * @param cron - The cron expression to describe
 * @returns Human-readable description of the schedule
 *
 * **Validates: Requirement 8.5**
 */
export function getCronDescription(cron: string): string {
  if (!isValidCronExpression(cron)) return 'Invalid cron expression';

  const fields = cron.trim().split(/\s+/);
  const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = fields;

  const minute = parseField(minuteField, 0, 59);
  const hour = parseField(hourField, 0, 23);
  const dayOfMonth = parseField(dayOfMonthField, 1, 31);
  const month = parseField(monthField, 1, 12, MONTH_ABBREVS);
  const dayOfWeek = parseField(dayOfWeekField, 0, 6, DAY_ABBREVS);

  // Handle "every N minutes" pattern
  if (minute.type === 'step' && minute.step && hour.type === 'all' &&
      dayOfMonth.type === 'all' && month.type === 'all' && dayOfWeek.type === 'all') {
    return `Every ${minute.step} minutes`;
  }

  // Handle "every N hours" pattern
  if (minute.type === 'single' && minute.values[0] === 0 && hour.type === 'step' && hour.step &&
      dayOfMonth.type === 'all' && month.type === 'all' && dayOfWeek.type === 'all') {
    return `Every ${hour.step} hours`;
  }

  // Build the description
  const parts: string[] = [];

  // Time part
  let timeStr = '';
  if (minute.type === 'single' && hour.type === 'single') {
    timeStr = formatTime(hour.values[0], minute.values[0]);
  } else if (minute.type === 'single' && hour.type === 'all') {
    timeStr = `at minute ${minute.values[0]} of every hour`;
  } else if (minute.type === 'all' && hour.type === 'single') {
    timeStr = `every minute during hour ${hour.values[0]}`;
  } else if (minute.type === 'all' && hour.type === 'all') {
    timeStr = 'every minute';
  } else {
    const minutePart = minute.type === 'single' ? minute.values[0].toString().padStart(2, '0') : '*';
    const hourPart = hour.type === 'single' ? hour.values[0].toString() : '*';
    timeStr = `at ${hourPart}:${minutePart}`;
  }

  // Day of week part
  if (dayOfWeek.type !== 'all') {
    if (dayOfWeek.type === 'single') {
      parts.push(`Every ${DAY_NAMES[dayOfWeek.values[0]]}`);
    } else if (dayOfWeek.type === 'range') {
      if (dayOfWeek.values.length === 5 && dayOfWeek.values[0] === 1 && dayOfWeek.values[4] === 5) {
        parts.push('Every weekday');
      } else {
        const startDay = DAY_NAMES[dayOfWeek.values[0]];
        const endDay = DAY_NAMES[dayOfWeek.values[dayOfWeek.values.length - 1]];
        parts.push(`${startDay} through ${endDay}`);
      }
    } else if (dayOfWeek.type === 'list') {
      const dayNames = dayOfWeek.values.map(d => DAY_NAMES[d]);
      parts.push(`On ${dayNames.join(', ')}`);
    }
  } else if (dayOfMonth.type !== 'all') {
    if (dayOfMonth.type === 'single') {
      parts.push(`On day ${dayOfMonth.values[0]} of every month`);
    } else if (dayOfMonth.type === 'list') {
      parts.push(`On days ${dayOfMonth.values.join(', ')} of every month`);
    } else if (dayOfMonth.type === 'range') {
      parts.push(`On days ${dayOfMonth.values[0]}-${dayOfMonth.values[dayOfMonth.values.length - 1]} of every month`);
    }
  } else {
    parts.push('Every day');
  }

  // Month part
  if (month.type !== 'all') {
    if (month.type === 'single') {
      parts.push(`in ${MONTH_NAMES[month.values[0]]}`);
    } else if (month.type === 'list') {
      const monthNames = month.values.map(m => MONTH_NAMES[m]);
      parts.push(`in ${monthNames.join(', ')}`);
    } else if (month.type === 'range') {
      parts.push(`from ${MONTH_NAMES[month.values[0]]} to ${MONTH_NAMES[month.values[month.values.length - 1]]}`);
    }
  }

  if (parts.length === 0) return timeStr;

  const mainPart = parts[0];
  const monthPart = parts.length > 1 ? ` ${parts.slice(1).join(' ')}` : '';

  if (timeStr.startsWith('at ') || timeStr.startsWith('every ')) {
    return `${mainPart} ${timeStr}${monthPart}`;
  }

  return `${mainPart} at ${timeStr}${monthPart}`;
}
