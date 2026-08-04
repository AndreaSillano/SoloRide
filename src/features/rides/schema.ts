import { z } from 'zod';

import { SCHEDULE_KINDS } from '../../utils/schedule';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const dateSchema = z
  .string()
  .refine(isCalendarDate, 'Enter a valid date in YYYY-MM-DD format.');

export const rideCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8}$/, 'Enter a valid 8-character Ride code.');

const weekdayArraySchema = z
  .array(z.number().int().min(0).max(6))
  .refine((days) => new Set(days).size === days.length, 'Each weekday can only be selected once.');

export const rideFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Ride name is required.')
      .max(20, 'Ride name must be 20 characters or less.'),
    description: z
      .string()
      .trim()
      .max(30, 'Description must be 30 characters or less.'),
    startDate: dateSchema,
    endDate: z.string(),
    neverEnds: z.boolean().default(false),
    notificationTime: z
      .string()
      .trim()
      .regex(TIME_PATTERN, 'Enter a valid notification time.'),
    scheduleKind: z.enum(SCHEDULE_KINDS).default('weekly'),
    weekdays: weekdayArraySchema.default([]),
    monthDay: z.number().int().min(1).max(31).default(1),
    weekdayOrdinal: z
      .number()
      .int()
      .refine((value) => value === -1 || (value >= 1 && value <= 4), {
        message: 'Choose first, second, third, fourth, or last.',
      })
      .default(1),
    strictSchedule: z.boolean().default(true),
  })
  .superRefine((values, context) => {
    if (!values.neverEnds) {
      if (!isCalendarDate(values.endDate)) {
        context.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'Enter a valid end date, or turn on Never ends.',
        });
      } else if (isCalendarDate(values.startDate) && values.endDate < values.startDate) {
        context.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'End date cannot be before start date.',
        });
      }
    }

    if (values.scheduleKind === 'weekly' || values.scheduleKind === 'biweekly') {
      if (values.weekdays.length < 1) {
        context.addIssue({
          code: 'custom',
          path: ['weekdays'],
          message: 'Choose at least one weekday.',
        });
      }
      return;
    }

    if (values.scheduleKind === 'monthly_weekday' && values.weekdays.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['weekdays'],
        message: 'Choose one weekday.',
      });
    }
  });
