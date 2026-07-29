import type { RideFormValues } from './types';

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const WEEKDAY_SHORT_LABELS: Readonly<Record<Weekday, string>> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

export const RIDE_FORM_DEFAULTS: Readonly<RideFormValues> = {
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  neverEnds: false,
  notificationTime: '09:00',
  weekdays: [],
  strictSchedule: true,
};

/** Max people in a single Ride (including the creator). */
export const MAX_RIDE_MEMBERS = 16;

/** Max non-archived, non-expired Rides a user can belong to at once. */
export const MAX_LIVE_RIDES_PER_USER = 4;
