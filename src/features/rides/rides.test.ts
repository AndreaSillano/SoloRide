import { describe, expect, it } from 'vitest';

import { groupUserRides } from './grouping';
import { rideFormSchema } from './schema';
import type { UserRide } from './types';

function makeRide(overrides: Partial<UserRide>): UserRide {
  return {
    id: 'ride-id',
    name: 'Morning Ride',
    description: null,
    code: 'ABCD1234',
    creator_id: 'user-id',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    notification_time: '09:00:00',
    strict_schedule: true,
    schedule_kind: 'weekly',
    month_day: null,
    weekday_ordinal: null,
    challenges_enabled: true,
    is_archived: false,
    archived_at: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    current_user_role: 'creator',
    ...overrides,
  };
}

describe('Ride form validation', () => {
  it('normalizes valid form text', () => {
    const result = rideFormSchema.parse({
      name: '  Morning Ride  ',
      description: '  Be ready  ',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      neverEnds: false,
      notificationTime: '09:30',
      scheduleKind: 'weekly',
      weekdays: [1, 3, 5],
      monthDay: 1,
      weekdayOrdinal: 1,
    });

    expect(result.name).toBe('Morning Ride');
    expect(result.description).toBe('Be ready');
    expect(result.strictSchedule).toBe(true);
    expect(result.scheduleKind).toBe('weekly');
  });

  it('allows open-ended rides without an end date', () => {
    const result = rideFormSchema.parse({
      name: 'Forever Ride',
      description: '',
      startDate: '2026-07-01',
      endDate: '',
      neverEnds: true,
      notificationTime: '09:00',
      scheduleKind: 'weekly',
      weekdays: [1],
      monthDay: 1,
      weekdayOrdinal: 1,
    });

    expect(result.neverEnds).toBe(true);
  });

  it('accepts monthly date and monthly weekday schedules', () => {
    expect(
      rideFormSchema.parse({
        name: 'Month day',
        description: '',
        startDate: '2026-07-01',
        endDate: '2026-12-31',
        neverEnds: false,
        notificationTime: '09:00',
        scheduleKind: 'monthly_date',
        weekdays: [],
        monthDay: 15,
        weekdayOrdinal: 1,
      }).scheduleKind,
    ).toBe('monthly_date');

    expect(
      rideFormSchema.parse({
        name: 'First Friday',
        description: '',
        startDate: '2026-07-01',
        endDate: '2026-12-31',
        neverEnds: false,
        notificationTime: '09:00',
        scheduleKind: 'monthly_weekday',
        weekdays: [5],
        monthDay: 1,
        weekdayOrdinal: 1,
      }).weekdayOrdinal,
    ).toBe(1);
  });

  it('rejects impossible dates, reversed ranges, and duplicate weekdays', () => {
    expect(
      rideFormSchema.safeParse({
        name: 'Ride',
        description: '',
        startDate: '2026-02-30',
        endDate: '2026-02-01',
        neverEnds: false,
        notificationTime: '25:00',
        scheduleKind: 'weekly',
        weekdays: [1, 1],
        monthDay: 1,
        weekdayOrdinal: 1,
      }).success,
    ).toBe(false);
  });
});

describe('Ride grouping', () => {
  it('groups active, upcoming, expired, and manually archived Rides', () => {
    const groups = groupUserRides(
      [
        makeRide({ id: 'active', name: 'Active' }),
        makeRide({
          id: 'upcoming',
          name: 'Upcoming',
          start_date: '2026-08-01',
          end_date: '2026-08-31',
        }),
        makeRide({
          id: 'expired',
          name: 'Expired',
          start_date: '2026-06-01',
          end_date: '2026-06-30',
        }),
        makeRide({
          id: 'archived',
          name: 'Archived',
          is_archived: true,
          archived_at: '2026-07-20T00:00:00Z',
        }),
      ],
      new Date(2026, 6, 28, 12),
    );

    expect(groups.active.map((ride) => ride.id)).toEqual(['active']);
    expect(groups.upcoming.map((ride) => ride.id)).toEqual(['upcoming']);
    expect(groups.archived.map((ride) => ride.id)).toEqual(['archived', 'expired']);
  });
});
