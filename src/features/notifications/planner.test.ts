import { describe, expect, it } from 'vitest';

import {
  getRideDatesInRange,
  isSoloRideNotificationData,
  MAX_SOLO_RIDE_NOTIFICATIONS,
  planNotificationReconciliation,
  planSoloRideNotifications,
  type NotificationRide,
  type SoloRideNotificationPlan,
} from './planner';

const baseRide: NotificationRide = {
  id: 'ride-1',
  name: 'Morning ride',
  startDate: '2026-07-01',
  endDate: '2026-08-31',
  weekdays: [1, 3, 5],
  notificationTime: '09:00:00',
};

describe('SoloRide notification planning', () => {
  it('returns only matching weekdays within both requested and ride ranges', () => {
    expect(
      getRideDatesInRange(
        baseRide,
        new Date(2026, 6, 27, 12),
        new Date(2026, 7, 2, 12),
      ),
    ).toEqual(['2026-07-27', '2026-07-29', '2026-07-31']);
  });

  it('cancels stale, duplicate, and trigger-time-changed notifications', () => {
    const desired = planSoloRideNotifications({
      userId: 'user-1',
      rides: [baseRide],
      now: new Date(2026, 6, 28, 8),
      horizonWeeks: 1,
    })
      .filter(({ data }) => data.kind === 'main')
      .slice(0, 2);
    const first = desired[0] as SoloRideNotificationPlan;
    const second = desired[1] as SoloRideNotificationPlan;

    const result = planNotificationReconciliation(desired, [
      {
        identifier: 'keep',
        data: first.data,
        triggerAt: first.triggerAt.getTime(),
      },
      {
        identifier: 'duplicate',
        data: first.data,
        triggerAt: first.triggerAt.getTime(),
      },
      {
        identifier: 'changed-time',
        data: second.data,
        triggerAt: second.triggerAt.getTime() + 60_000,
      },
      {
        identifier: 'stale',
        data: { ...second.data, scheduledDate: '2026-07-01' },
        triggerAt: new Date(2026, 6, 1, 9).getTime(),
      },
    ]);

    expect(result.keepIdentifiers).toEqual(['keep']);
    expect(result.cancelIdentifiers).toEqual([
      'duplicate',
      'changed-time',
      'stale',
    ]);
    expect(result.schedule.map(({ key }) => key)).toEqual([second.key]);
  });

  it('enforces the hard global cap across rides', () => {
    const rides = Array.from({ length: 70 }, (_, index) => ({
      ...baseRide,
      id: `ride-${index}`,
      name: `Ride ${index}`,
      startDate: '2026-07-29',
      endDate: '2026-07-29',
      weekdays: [3],
    }));

    const plans = planSoloRideNotifications({
      userId: 'user-1',
      rides,
      now: new Date(2026, 6, 29, 8),
      horizonWeeks: 8,
      maxScheduled: 1_000,
    });

    expect(plans).toHaveLength(MAX_SOLO_RIDE_NOTIFICATIONS);
    expect(new Set(plans.map(({ data }) => data.rideId)).size).toBe(
      MAX_SOLO_RIDE_NOTIFICATIONS,
    );
  });

  it('plans a later same-day reminder only while the ride is unposted', () => {
    const now = new Date(2026, 6, 29, 10);
    const plans = planSoloRideNotifications({
      userId: 'user-1',
      rides: [baseRide],
      now,
      reminderDelayMinutes: 4 * 60,
    });
    const reminder = plans.find(({ data }) => data.kind === 'reminder');

    expect(reminder?.data.scheduledDate).toBe('2026-07-29');
    expect(reminder?.triggerAt).toEqual(new Date(2026, 6, 29, 13));

    const postedPlans = planSoloRideNotifications({
      userId: 'user-1',
      rides: [baseRide],
      postedRideDates: [{ rideId: baseRide.id, scheduledDate: '2026-07-29' }],
      now,
    });
    expect(postedPlans.some(({ data }) => data.kind === 'reminder')).toBe(false);
  });

  it('does not roll a reminder into the following day', () => {
    const plans = planSoloRideNotifications({
      userId: 'user-1',
      rides: [{ ...baseRide, notificationTime: '22:00' }],
      now: new Date(2026, 6, 29, 10),
      reminderDelayMinutes: 4 * 60,
    });

    expect(plans.some(({ data }) => data.kind === 'reminder')).toBe(false);
  });

  it('skips remaining same-week notifications for flexible rides once posted', () => {
    // Mon Jul 27 is already posted; Wed Jul 29 and Fri Jul 31 are later in the
    // same Sun–Sat week and should not get notifications for a flexible Ride.
    const plans = planSoloRideNotifications({
      userId: 'user-1',
      rides: [{ ...baseRide, strictSchedule: false }],
      postedRideDates: [{ rideId: baseRide.id, scheduledDate: '2026-07-27' }],
      now: new Date(2026, 6, 28, 8),
      horizonWeeks: 1,
    });

    expect(
      plans.filter(
        ({ data }) =>
          data.scheduledDate === '2026-07-29' || data.scheduledDate === '2026-07-31',
      ),
    ).toEqual([]);
  });

  it('still schedules same-week notifications for strict rides after a post', () => {
    const plans = planSoloRideNotifications({
      userId: 'user-1',
      rides: [{ ...baseRide, strictSchedule: true }],
      postedRideDates: [{ rideId: baseRide.id, scheduledDate: '2026-07-27' }],
      now: new Date(2026, 6, 28, 8),
      horizonWeeks: 1,
    });

    expect(plans.some(({ data }) => data.scheduledDate === '2026-07-29')).toBe(true);
  });

  it('recognizes only complete SoloRide metadata', () => {
    expect(
      isSoloRideNotificationData({
        kind: 'main',
        rideId: 'ride-1',
        scheduledDate: '2026-07-29',
        userId: 'user-1',
      }),
    ).toBe(true);
    expect(
      isSoloRideNotificationData({
        kind: 'main',
        rideId: 'ride-1',
        scheduledDate: 'not-a-date',
      }),
    ).toBe(false);
  });
});
