import type { ScheduleKind } from '../../utils/schedule';
import { isScheduleKind, type RideWindow } from '../../utils/schedule';

import type { Ride } from './types';

export function rideToWindow(
  ride: Pick<
    Ride,
    | 'start_date'
    | 'end_date'
    | 'schedule_kind'
    | 'month_day'
    | 'weekday_ordinal'
    | 'strict_schedule'
  >,
  weekdays: number[],
): RideWindow & { strictSchedule: boolean } {
  const kind: ScheduleKind = isScheduleKind(ride.schedule_kind)
    ? ride.schedule_kind
    : 'weekly';
  return {
    startDate: ride.start_date,
    endDate: ride.end_date,
    weekdays,
    scheduleKind: kind,
    monthDay: ride.month_day,
    weekdayOrdinal: ride.weekday_ordinal,
    strictSchedule: ride.strict_schedule,
  };
}
