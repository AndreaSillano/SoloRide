import {
  addDays,
  format,
  isAfter,
  isBefore,
  isSameDay,
  endOfWeek,
  parseISO,
  startOfWeek,
  startOfDay,
} from 'date-fns';

export const DATE_FORMAT = 'yyyy-MM-dd';

export type RideWindow = {
  startDate: string;
  endDate: string;
  weekdays: number[];
};

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
  endDate: string,
  archived: boolean,
  now = new Date(),
) {
  if (archived) return false;
  const today = startOfDay(now);
  return !isBefore(today, parseISO(startDate)) && !isAfter(today, parseISO(endDate));
}

export function isRideUpcoming(startDate: string, archived: boolean, now = new Date()) {
  return !archived && isBefore(startOfDay(now), parseISO(startDate));
}

export function getScheduledDates(
  ride: RideWindow,
  from: Date,
  through: Date,
  limit = Number.POSITIVE_INFINITY,
) {
  const result: string[] = [];
  const rideStart = parseISO(ride.startDate);
  const rideEnd = parseISO(ride.endDate);
  let cursor = startOfDay(from);
  const finalDate = isBefore(through, rideEnd) ? startOfDay(through) : rideEnd;

  if (isBefore(cursor, rideStart)) cursor = rideStart;

  while (!isAfter(cursor, finalDate) && result.length < limit) {
    if (ride.weekdays.includes(cursor.getDay())) {
      result.push(format(cursor, DATE_FORMAT));
    }
    cursor = addDays(cursor, 1);
  }

  return result;
}

export function getNextScheduledDate(ride: RideWindow, now = new Date()) {
  return getScheduledDates(ride, now, parseISO(ride.endDate), 1)[0] ?? null;
}

export function getScheduledDateForPost(ride: RideWindow, now = new Date()) {
  const today = startOfDay(now);
  const inRange =
    !isBefore(today, parseISO(ride.startDate)) && !isAfter(today, parseISO(ride.endDate));

  if (!inRange || !ride.weekdays.includes(today.getDay())) return null;
  return format(today, DATE_FORMAT);
}

export function isToday(date: string, now = new Date()) {
  return isSameDay(parseISO(date), now);
}
