/** Countdown label matching the challenge UI (e.g. "3d left", "12h left"). */
export function formatChallengeRemaining(endsAt: string, now = Date.now()): string {
  const remainingMs = new Date(endsAt).getTime() - now;
  if (remainingMs <= 0) return 'Ended';
  if (remainingMs < 60 * 60 * 1000) return '<1h left';
  const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h left`;
  const days = Math.ceil(hours / 24);
  return `${days}d left`;
}

/** True when a challenge window has ended (timer or early close). */
export function isChallengeEnded(endsAt: string | null | undefined, now = Date.now()): boolean {
  if (!endsAt) return false;
  const ms = Date.parse(endsAt);
  return Number.isFinite(ms) && ms <= now;
}

/** Compact hashtag from a challenge title ("Sunset Vibes" → "#SunsetVibes"). */
export function challengeHashtag(title: string): string {
  const compact = title.replace(/[^a-zA-Z0-9]+/g, '');
  return compact ? `#${compact}` : '#Challenge';
}

/** Display date as dd/mm/yyyy. */
export function formatChallengeCalendarDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Mirrors `ride_estimated_monthly_posts` / `ride_monthly_challenge_quota`
 * (≈15% of estimated monthly cadence posts, min 1).
 */
export function rideMonthlyChallengeQuota(input: {
  scheduleKind: string;
  weekdayCount: number;
}): number {
  const weekdays = Math.max(1, input.weekdayCount);
  let estimated: number;
  if (input.scheduleKind === 'monthly_date' || input.scheduleKind === 'monthly_weekday') {
    estimated = 1;
  } else if (input.scheduleKind === 'biweekly') {
    estimated = weekdays * (30 / 14);
  } else {
    estimated = weekdays * (30 / 7);
  }
  return Math.max(1, Math.floor(estimated * 0.15));
}

/**
 * Best-effort next auto-challenge date. Auto opens are probabilistic (daily cron);
 * this spaces remaining monthly quota evenly across the rest of the month.
 */
export function estimateNextAutoChallengeDate(input: {
  challengesEnabled: boolean;
  isArchived: boolean;
  rideEndDate: string | null;
  scheduleKind: string;
  weekdayCount: number;
  /** Challenge start timestamps (ISO) that fall in the current local month. */
  startsThisMonth: string[];
  /** Active challenge end time, if one is open. */
  activeEndsAt: string | null;
  now?: Date;
}): Date | null {
  const now = input.now ?? new Date();
  if (!input.challengesEnabled || input.isArchived) return null;

  const today = startOfLocalDay(now);
  if (input.rideEndDate) {
    const end = startOfLocalDay(new Date(`${input.rideEndDate}T12:00:00`));
    if (end.getTime() < today.getTime()) return null;
  }

  const quota = rideMonthlyChallengeQuota({
    scheduleKind: input.scheduleKind,
    weekdayCount: input.weekdayCount,
  });
  const openedThisMonth = input.startsThisMonth.length;
  let remainingQuota = quota - openedThisMonth;

  let anchor = today;
  if (input.activeEndsAt) {
    const ends = startOfLocalDay(new Date(input.activeEndsAt));
    if (ends.getTime() >= today.getTime()) {
      anchor = addLocalDays(ends, 1);
    }
  }

  const clampToRideEnd = (date: Date) => {
    if (!input.rideEndDate) return date;
    const end = startOfLocalDay(new Date(`${input.rideEndDate}T12:00:00`));
    return date.getTime() > end.getTime() ? null : date;
  };

  // Quota used up this month → first day of next month (if ride still open).
  if (remainingQuota <= 0) {
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return clampToRideEnd(nextMonth);
  }

  // If the active challenge spills into next month, reset quota for that month.
  if (
    anchor.getMonth() !== today.getMonth() ||
    anchor.getFullYear() !== today.getFullYear()
  ) {
    remainingQuota = quota;
  }

  const monthEndDay = daysInMonth(anchor.getFullYear(), anchor.getMonth());
  const remainingDays = monthEndDay - anchor.getDate() + 1;
  const gap = Math.max(1, Math.ceil(remainingDays / remainingQuota));
  const estimated = addLocalDays(anchor, gap - 1);
  return clampToRideEnd(estimated);
}
