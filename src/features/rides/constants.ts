import type { ScheduleKind } from './types';

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

export const SCHEDULE_KIND_OPTIONS: ReadonlyArray<{
  value: ScheduleKind;
  label: string;
}> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly_date', label: 'Monthly' },
];

export const WEEKDAY_ORDINAL_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
}> = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' },
  { value: 4, label: '4th' },
  { value: -1, label: 'Last' },
];

export const RIDE_FORM_DEFAULTS: Readonly<RideFormValues> = {
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  neverEnds: false,
  notificationTime: '09:00',
  scheduleKind: 'weekly',
  weekdays: [],
  monthDay: 1,
  weekdayOrdinal: 1,
  strictSchedule: true,
  challengesEnabled: true,
};

/** Max people in a single Ride (including the creator). */
export const MAX_RIDE_MEMBERS = 16;

/** Max non-archived, non-expired Rides a user can belong to at once. */
export const MAX_LIVE_RIDES_PER_USER = 4;

function weekdayList(weekdays: number[]) {
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_SHORT_LABELS[day as Weekday] ?? '?')
    .join(', ');
}

/** Rhythm only — Weekly / Every 2 weeks / Monthly (not the days). */
export function formatScheduleRhythm(input: {
  scheduleKind: ScheduleKind;
}): string {
  const { scheduleKind } = input;
  if (scheduleKind === 'biweekly') return 'Every 2 weeks';
  if (scheduleKind === 'monthly_date' || scheduleKind === 'monthly_weekday') {
    return 'Monthly';
  }
  return 'Weekly';
}

export function formatScheduleMode(strictSchedule: boolean): string {
  return strictSchedule ? 'Strict' : 'Flexible';
}

/** Day selection only — weekdays, month day, or nth weekday. */
export function formatScheduleDays(input: {
  scheduleKind: ScheduleKind;
  weekdays: number[];
  monthDay: number | null;
  weekdayOrdinal: number | null;
}): string {
  const { scheduleKind, weekdays, monthDay, weekdayOrdinal } = input;

  if (scheduleKind === 'monthly_date') {
    return `Day ${monthDay ?? 1}`;
  }
  if (scheduleKind === 'monthly_weekday') {
    const ordinal =
      WEEKDAY_ORDINAL_OPTIONS.find((option) => option.value === weekdayOrdinal)?.label ??
      '1st';
    const weekday =
      weekdays[0] != null ? WEEKDAY_SHORT_LABELS[weekdays[0] as Weekday] : 'day';
    return `${ordinal} ${weekday}`;
  }

  return weekdayList(weekdays) || '—';
}

export function formatScheduleSummary(input: {
  scheduleKind: ScheduleKind;
  weekdays: number[];
  monthDay: number | null;
  weekdayOrdinal: number | null;
  strictSchedule: boolean;
}): string {
  const rhythm = formatScheduleRhythm(input);
  const days = formatScheduleDays(input);
  const parts = [rhythm];
  if ((input.scheduleKind ?? 'weekly') === 'weekly') {
    parts.push(formatScheduleMode(input.strictSchedule));
  }
  if (days && days !== '—') parts.push(days);
  return parts.join(' · ');
}
