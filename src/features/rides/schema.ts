import { z } from 'zod';

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

export const rideFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Ride name is required.')
      .max(100, 'Ride name must be 100 characters or less.'),
    description: z
      .string()
      .trim()
      .max(2000, 'Description must be 2,000 characters or less.'),
    startDate: dateSchema,
    endDate: dateSchema,
    notificationTime: z
      .string()
      .trim()
      .regex(TIME_PATTERN, 'Enter a valid notification time.'),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Choose at least one weekday.')
      .refine((days) => new Set(days).size === days.length, 'Each weekday can only be selected once.'),
    strictSchedule: z.boolean().default(true),
  })
  .superRefine((values, context) => {
    if (
      isCalendarDate(values.startDate) &&
      isCalendarDate(values.endDate) &&
      values.endDate < values.startDate
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'End date cannot be before start date.',
      });
    }
  });
