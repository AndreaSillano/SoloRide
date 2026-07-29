import { isRideActive, isRideUpcoming } from '../../utils/schedule';

import type { RideGroups, UserRide } from './types';

function byStartDate(a: UserRide, b: UserRide) {
  return a.start_date.localeCompare(b.start_date);
}

function byEndDate(a: UserRide, b: UserRide) {
  if (a.end_date === null && b.end_date === null) return 0;
  if (a.end_date === null) return 1;
  if (b.end_date === null) return -1;
  return a.end_date.localeCompare(b.end_date);
}

function byMostRecentlyArchived(a: UserRide, b: UserRide) {
  const aDate = a.archived_at ?? a.end_date ?? a.start_date;
  const bDate = b.archived_at ?? b.end_date ?? b.start_date;
  return bDate.localeCompare(aDate);
}

export function groupUserRides(rides: readonly UserRide[], now = new Date()): RideGroups {
  const groups: RideGroups = {
    active: [],
    upcoming: [],
    archived: [],
  };

  for (const ride of rides) {
    if (isRideActive(ride.start_date, ride.end_date, ride.is_archived, now)) {
      groups.active.push(ride);
    } else if (isRideUpcoming(ride.start_date, ride.is_archived, now)) {
      groups.upcoming.push(ride);
    } else {
      groups.archived.push(ride);
    }
  }

  groups.active.sort(byEndDate);
  groups.upcoming.sort(byStartDate);
  groups.archived.sort(byMostRecentlyArchived);
  return groups;
}
