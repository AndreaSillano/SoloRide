export const DEFAULT_HORIZON_WEEKS = 8;
export const MAX_SOLO_RIDE_NOTIFICATIONS = 56;
export const DEFAULT_REMINDER_DELAY_MINUTES = 4 * 60;

export type SoloRideNotificationKind = 'main' | 'reminder';

export type SoloRideNotificationData = {
  kind: SoloRideNotificationKind;
  rideId: string;
  scheduledDate: string;
  userId: string;
};

export type NotificationRide = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  weekdays: readonly number[];
  notificationTime: string;
  /** Defaults to strict for Rides created before schedule modes existed. */
  strictSchedule?: boolean;
  archived?: boolean;
};

export type PostedRideDate = {
  rideId: string;
  scheduledDate: string;
};

export type SoloRideNotificationPlan = {
  key: string;
  data: SoloRideNotificationData;
  triggerAt: Date;
  title: string;
  body: string;
};

export type ExistingManagedNotification = {
  identifier: string;
  data: SoloRideNotificationData;
  triggerAt: number | null;
};

export type ReconciliationPlan = {
  cancelIdentifiers: string[];
  schedule: SoloRideNotificationPlan[];
  keepIdentifiers: string[];
};

function pickCopy(variants: readonly { title: string; body: string }[]) {
  return variants[Math.floor(Math.random() * variants.length)]!;
}

function mainReminderCopy(rideName: string) {
  return pickCopy([
    {
      title: `${rideName} is live`,
      body: 'One photo. One moment. Share today’s Ride with your people.',
    },
    {
      title: `Time for ${rideName}`,
      body: 'Drop today’s photo — one real moment is enough.',
    },
    {
      title: `${rideName} is calling`,
      body: 'Your Ride is waiting. Capture something and post it.',
    },
  ]);
}

function lateReminderCopy(rideName: string) {
  return pickCopy([
    {
      title: `Still time for ${rideName}`,
      body: 'The day isn’t over — capture something real and post it.',
    },
    {
      title: `Last call for ${rideName}`,
      body: 'You’ve still got time. One photo keeps the streak alive.',
    },
    {
      title: `${rideName} isn’t done`,
      body: 'Don’t leave today empty — post before the day slips away.',
    },
  ]);
}

export type PlanNotificationsInput = {
  userId: string;
  rides: readonly NotificationRide[];
  postedRideDates?: readonly PostedRideDate[];
  now?: Date;
  horizonWeeks?: number;
  maxScheduled?: number;
  reminderDelayMinutes?: number;
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

function parseLocalDate(date: string): Date | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function parseTime(time: string): { hour: number; minute: number } | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekStartForDate(date: Date): string {
  const localDate = startOfLocalDay(date);
  return formatLocalDate(addLocalDays(localDate, -localDate.getDay()));
}

function atLocalTime(date: Date, hour: number, minute: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
}

export function notificationKey(data: SoloRideNotificationData): string {
  return `${data.kind}:${data.userId}:${data.rideId}:${data.scheduledDate}`;
}

export function isSoloRideNotificationData(
  value: unknown,
): value is SoloRideNotificationData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).length === 4 &&
    (data.kind === 'main' || data.kind === 'reminder') &&
    typeof data.rideId === 'string' &&
    typeof data.scheduledDate === 'string' &&
    parseLocalDate(data.scheduledDate) !== null &&
    typeof data.userId === 'string'
  );
}

export function getRideDatesInRange(
  ride: Pick<NotificationRide, 'startDate' | 'endDate' | 'weekdays'>,
  from: Date,
  through: Date,
): string[] {
  const rideStart = parseLocalDate(ride.startDate);
  if (!rideStart) return [];
  const rideEnd = ride.endDate ? parseLocalDate(ride.endDate) : null;
  if (rideEnd && rideStart.getTime() > rideEnd.getTime()) return [];

  const weekdays = new Set(ride.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  let cursor = startOfLocalDay(from);
  const throughDay = startOfLocalDay(through);
  const last =
    rideEnd && rideEnd.getTime() < throughDay.getTime() ? rideEnd : throughDay;
  if (cursor.getTime() < rideStart.getTime()) cursor = rideStart;

  const dates: string[] = [];
  while (cursor.getTime() <= last.getTime()) {
    if (weekdays.has(cursor.getDay())) dates.push(formatLocalDate(cursor));
    cursor = addLocalDays(cursor, 1);
  }
  return dates;
}

export function planSoloRideNotifications({
  userId,
  rides,
  postedRideDates = [],
  now = new Date(),
  horizonWeeks = DEFAULT_HORIZON_WEEKS,
  maxScheduled = MAX_SOLO_RIDE_NOTIFICATIONS,
  reminderDelayMinutes = DEFAULT_REMINDER_DELAY_MINUTES,
}: PlanNotificationsInput): SoloRideNotificationPlan[] {
  if (!userId) return [];

  const safeWeeks = Math.max(0, Math.min(Math.floor(horizonWeeks), 52));
  const safeCap = Math.max(
    0,
    Math.min(Math.floor(maxScheduled), MAX_SOLO_RIDE_NOTIFICATIONS),
  );
  const safeReminderDelay = Math.max(1, Math.floor(reminderDelayMinutes));
  const today = startOfLocalDay(now);
  const through = addLocalDays(today, Math.max(0, safeWeeks * 7 - 1));
  const todayString = formatLocalDate(today);
  const posted = new Set(
    postedRideDates.map(({ rideId, scheduledDate }) => `${rideId}:${scheduledDate}`),
  );
  const satisfiedFlexibleWeeks = new Set(
    postedRideDates.flatMap(({ rideId, scheduledDate }) => {
      const date = parseLocalDate(scheduledDate);
      return date ? [`${rideId}:${weekStartForDate(date)}`] : [];
    }),
  );
  const plans: SoloRideNotificationPlan[] = [];

  for (const ride of rides) {
    if (ride.archived) continue;
    const time = parseTime(ride.notificationTime);
    if (!time) continue;

    for (const scheduledDate of getRideDatesInRange(ride, today, through)) {
      const localDate = parseLocalDate(scheduledDate);
      if (!localDate) continue;
      const flexibleWeekSatisfied =
        ride.strictSchedule === false &&
        satisfiedFlexibleWeeks.has(`${ride.id}:${weekStartForDate(localDate)}`);
      if (flexibleWeekSatisfied) continue;

      const triggerAt = atLocalTime(localDate, time.hour, time.minute);
      if (triggerAt.getTime() > now.getTime()) {
        const data: SoloRideNotificationData = {
          kind: 'main',
          rideId: ride.id,
          scheduledDate,
          userId,
        };
        const mainCopy = mainReminderCopy(ride.name);
        plans.push({
          key: notificationKey(data),
          data,
          triggerAt,
          title: mainCopy.title,
          body: mainCopy.body,
        });
      }

      if (
        scheduledDate === todayString &&
        !posted.has(`${ride.id}:${scheduledDate}`)
      ) {
        const reminderAt = new Date(triggerAt.getTime() + safeReminderDelay * 60_000);
        if (
          reminderAt.getTime() > now.getTime() &&
          formatLocalDate(reminderAt) === scheduledDate
        ) {
          const data: SoloRideNotificationData = {
            kind: 'reminder',
            rideId: ride.id,
            scheduledDate,
            userId,
          };
          const lateCopy = lateReminderCopy(ride.name);
          plans.push({
            key: notificationKey(data),
            data,
            triggerAt: reminderAt,
            title: lateCopy.title,
            body: lateCopy.body,
          });
        }
      }
    }
  }

  return plans
    .sort(
      (left, right) =>
        left.triggerAt.getTime() - right.triggerAt.getTime() ||
        left.key.localeCompare(right.key),
    )
    .slice(0, safeCap);
}

export function planNotificationReconciliation(
  desired: readonly SoloRideNotificationPlan[],
  existing: readonly ExistingManagedNotification[],
): ReconciliationPlan {
  const desiredByKey = new Map(desired.map((plan) => [plan.key, plan]));
  const keptKeys = new Set<string>();
  const cancelIdentifiers: string[] = [];
  const keepIdentifiers: string[] = [];

  for (const notification of existing) {
    const key = notificationKey(notification.data);
    const wanted = desiredByKey.get(key);
    const triggerMatches =
      notification.triggerAt !== null &&
      Math.abs(notification.triggerAt - (wanted?.triggerAt.getTime() ?? 0)) < 1_000;

    if (!wanted || !triggerMatches || keptKeys.has(key)) {
      cancelIdentifiers.push(notification.identifier);
      continue;
    }

    keptKeys.add(key);
    keepIdentifiers.push(notification.identifier);
  }

  return {
    cancelIdentifiers,
    keepIdentifiers,
    schedule: desired.filter((plan) => !keptKeys.has(plan.key)),
  };
}
