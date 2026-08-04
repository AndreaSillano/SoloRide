import { describe, expect, it } from 'vitest';

import {
  getNextScheduledDate,
  getScheduledDateForPost,
  getScheduledDates,
  getWeekRange,
  isRideActive,
  matchesSchedule,
  type RideWindow,
} from './schedule';

const weekly: RideWindow = {
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  weekdays: [1, 3, 5],
  scheduleKind: 'weekly',
};

describe('Ride scheduling', () => {
  it('returns matching weekdays inside the Ride date range', () => {
    expect(
      getScheduledDates(weekly, new Date(2026, 6, 27, 12), new Date(2026, 7, 10, 12)),
    ).toEqual(['2026-07-27', '2026-07-29', '2026-07-31']);
  });

  it('finds the next scheduled date', () => {
    expect(getNextScheduledDate(weekly, new Date(2026, 6, 28, 12))).toBe('2026-07-29');
  });

  it('associates a post only with a scheduled active day', () => {
    expect(getScheduledDateForPost(weekly, new Date(2026, 6, 29, 12))).toBe('2026-07-29');
    expect(getScheduledDateForPost(weekly, new Date(2026, 6, 30, 12))).toBeNull();
  });

  it('treats both Ride boundary dates as active', () => {
    expect(isRideActive('2026-07-01', '2026-07-31', false, new Date(2026, 6, 1))).toBe(
      true,
    );
    expect(isRideActive('2026-07-01', '2026-07-31', false, new Date(2026, 6, 31))).toBe(
      true,
    );
  });

  it('returns the Sunday-Saturday week for a given date', () => {
    // Wednesday Jul 29, 2026 sits in the week of Sun Jul 26 – Sat Aug 1.
    expect(getWeekRange(new Date(2026, 6, 29, 12))).toEqual({
      start: '2026-07-26',
      end: '2026-08-01',
    });
    expect(getWeekRange(new Date(2026, 6, 26, 8))).toEqual({
      start: '2026-07-26',
      end: '2026-08-01',
    });
  });

  it('matches every other week from the start-date week', () => {
    // startDate Wed Jul 1 2026 → Sunday week Jun 28. Jul 3 is Fri in that week (on).
    // Jul 10 is Fri in the next week (off). Jul 17 is on again.
    const biweekly: RideWindow = {
      startDate: '2026-07-01',
      endDate: '2026-08-31',
      weekdays: [5],
      scheduleKind: 'biweekly',
    };
    expect(matchesSchedule(biweekly, new Date(2026, 6, 3, 12))).toBe(true);
    expect(matchesSchedule(biweekly, new Date(2026, 6, 10, 12))).toBe(false);
    expect(matchesSchedule(biweekly, new Date(2026, 6, 17, 12))).toBe(true);
    expect(getScheduledDates(biweekly, new Date(2026, 6, 1, 12), new Date(2026, 6, 31, 12))).toEqual(
      ['2026-07-03', '2026-07-17', '2026-07-31'],
    );
  });

  it('matches a specific day of the month (clamped for short months)', () => {
    const monthlyDate: RideWindow = {
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      weekdays: [],
      scheduleKind: 'monthly_date',
      monthDay: 31,
    };
    expect(matchesSchedule(monthlyDate, new Date(2026, 0, 31, 12))).toBe(true);
    // February 2026 has 28 days → clamps to 28.
    expect(matchesSchedule(monthlyDate, new Date(2026, 1, 28, 12))).toBe(true);
    expect(matchesSchedule(monthlyDate, new Date(2026, 1, 27, 12))).toBe(false);
    expect(matchesSchedule(monthlyDate, new Date(2026, 2, 31, 12))).toBe(true);
  });

  it('matches nth / last weekday of the month', () => {
    const firstFriday: RideWindow = {
      startDate: '2026-07-01',
      endDate: '2026-08-31',
      weekdays: [5],
      scheduleKind: 'monthly_weekday',
      weekdayOrdinal: 1,
    };
    // Jul 2026: Fri 3, 10, 17, 24, 31
    expect(matchesSchedule(firstFriday, new Date(2026, 6, 3, 12))).toBe(true);
    expect(matchesSchedule(firstFriday, new Date(2026, 6, 10, 12))).toBe(false);

    const lastFriday: RideWindow = {
      ...firstFriday,
      weekdayOrdinal: -1,
    };
    expect(matchesSchedule(lastFriday, new Date(2026, 6, 31, 12))).toBe(true);
    expect(matchesSchedule(lastFriday, new Date(2026, 6, 24, 12))).toBe(false);
  });
});
