import {
  addDays,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  isSameDay,
  endOfWeek,
  parseISO,
  startOfWeek,
  startOfDay,
} from 'date-fns';

export const DATE_FORMAT = 'yyyy-MM-dd';

export const SCHEDULE_KINDS = [
  'weekly',
  'biweekly',
  'monthly_date',
  'monthly_weekday',
] as const;

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

/** 1–4 = nth weekday of the month; -1 = last. */
export type WeekdayOrdinal = 1 | 2 | 3 | 4 | -1;

export type RideWindow = {
  startDate: string;
  endDate: string | null;
  weekdays: number[];
  /** Defaults to weekly for Rides created before schedule kinds existed. */
  scheduleKind?: ScheduleKind;
  monthDay?: number | null;
  weekdayOrdinal?: number | null;
};

export function isScheduleKind(value: unknown): value is ScheduleKind {
  return (
    typeof value === 'string' &&
    (SCHEDULE_KINDS as readonly string[]).includes(value)
  );
}

/** Returns the Sunday-Saturday window containing `date`, formatted for queries. */
export function getWeekRange(date = new Date()) {
  const options = { weekStartsOn: 0 as const };
  return {
    start: format(startOfWeek(date, options), DATE_FORMAT),
    end: format(endOfWeek(date, options), DATE_FORMAT),
  };
}

export function isRideActive(
  startDate: string,
  endDate: string | null,
  archived: boolean,
  now = new Date(),
) {
  if (archived) return false;
  const today = startOfDay(now);
  if (isBefore(today, parseISO(startDate))) return false;
  if (endDate && isAfter(today, parseISO(endDate))) return false;
  return true;
}

export function isRideUpcoming(startDate: string, archived: boolean, now = new Date()) {
  return !archived && isBefore(startOfDay(now), parseISO(startDate));
}

function sundayOfWeek(date: Date) {
  return startOfWeek(startOfDay(date), { weekStartsOn: 0 });
}

/** Biweekly phase is anchored to the Sunday week that contains `startDate`. */
function isBiweeklyOn(startDate: string, date: Date) {
  const anchorSunday = sundayOfWeek(parseISO(startDate));
  const dateSunday = sundayOfWeek(date);
  const weeks = Math.floor(differenceInCalendarDays(dateSunday, anchorSunday) / 7);
  return weeks >= 0 && weeks % 2 === 0;
}

function matchesMonthDay(date: Date, monthDay: number) {
  const day = Math.min(Math.max(Math.floor(monthDay), 1), 31);
  const daysInMonth = getDaysInMonth(date);
  const target = Math.min(day, daysInMonth);
  return date.getDate() === target;
}

function matchesMonthWeekday(date: Date, weekday: number, ordinal: number) {
  if (date.getDay() !== weekday) return false;
  const occurrence = Math.floor((date.getDate() - 1) / 7) + 1;
  if (ordinal === -1) {
    const nextWeek = addDays(date, 7);
    return nextWeek.getMonth() !== date.getMonth();
  }
  return occurrence === ordinal;
}

/** Kind-specific match only (caller owns ride window bounds). */
export function matchesSchedule(ride: RideWindow, date: Date) {
  const day = startOfDay(date);
  const kind = ride.scheduleKind ?? 'weekly';

  switch (kind) {
    case 'weekly':
      return ride.weekdays.includes(day.getDay());
    case 'biweekly':
      return ride.weekdays.includes(day.getDay()) && isBiweeklyOn(ride.startDate, day);
    case 'monthly_date':
      return matchesMonthDay(day, ride.monthDay ?? 1);
    case 'monthly_weekday': {
      const weekday = ride.weekdays[0];
      if (weekday == null) return false;
      return matchesMonthWeekday(day, weekday, ride.weekdayOrdinal ?? 1);
    }
    default:
      return false;
  }
}

export function getScheduledDates(
  ride: RideWindow,
  from: Date,
  through: Date,
  limit = Number.POSITIVE_INFINITY,
) {
  const result: string[] = [];
  const rideStart = parseISO(ride.startDate);
  const rideEnd = ride.endDate ? parseISO(ride.endDate) : null;
  let cursor = startOfDay(from);
  const finalDate =
    rideEnd && isBefore(rideEnd, startOfDay(through)) ? rideEnd : startOfDay(through);

  if (isBefore(cursor, rideStart)) cursor = rideStart;

  while (!isAfter(cursor, finalDate) && result.length < limit) {
    if (matchesSchedule(ride, cursor)) {
      result.push(format(cursor, DATE_FORMAT));
    }
    cursor = addDays(cursor, 1);
  }

  return result;
}

export function getNextScheduledDate(ride: RideWindow, now = new Date()) {
  const through = ride.endDate ? parseISO(ride.endDate) : addDays(startOfDay(now), 366);
  return getScheduledDates(ride, now, through, 1)[0] ?? null;
}

export function getScheduledDateForPost(ride: RideWindow, now = new Date()) {
  const today = startOfDay(now);
  const started = !isBefore(today, parseISO(ride.startDate));
  const notEnded = !ride.endDate || !isAfter(today, parseISO(ride.endDate));

  if (!started || !notEnded || !matchesSchedule(ride, today)) return null;
  return format(today, DATE_FORMAT);
}

export function isToday(date: string, now = new Date()) {
  return isSameDay(parseISO(date), now);
}

/** Flexible “one post per week” only applies to weekly rhythms. */
export function usesFlexibleWeek(ride: Pick<RideWindow, 'scheduleKind'> & { strictSchedule?: boolean }) {
  return (ride.scheduleKind ?? 'weekly') === 'weekly' && ride.strictSchedule === false;
}
