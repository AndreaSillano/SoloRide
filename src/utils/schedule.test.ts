import { describe, expect, it } from 'vitest';

import {
  getNextScheduledDate,
  getScheduledDateForPost,
  getScheduledDates,
  getWeekRange,
  isRideActive,
} from './schedule';

const ride = {
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  weekdays: [1, 3, 5],
};

describe('Ride scheduling', () => {
  it('returns matching weekdays inside the Ride date range', () => {
    expect(
      getScheduledDates(ride, new Date(2026, 6, 27, 12), new Date(2026, 7, 10, 12)),
    ).toEqual(['2026-07-27', '2026-07-29', '2026-07-31']);
  });

  it('finds the next scheduled date', () => {
    expect(getNextScheduledDate(ride, new Date(2026, 6, 28, 12))).toBe('2026-07-29');
  });

  it('associates a post only with a scheduled active day', () => {
    expect(getScheduledDateForPost(ride, new Date(2026, 6, 29, 12))).toBe('2026-07-29');
    expect(getScheduledDateForPost(ride, new Date(2026, 6, 30, 12))).toBeNull();
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
});
