/**
 * Local schedule reminder copy.
 *
 * Edit titles/bodies here. `{ride}` is replaced with the Ride name.
 * One variant is picked at random when a reminder is scheduled.
 */

export type NotificationCopyVariant = {
  title: string;
  body: string;
};

/** Main alert at the Ride's notification time. */
export const MAIN_REMINDER_COPY: readonly NotificationCopyVariant[] = [
  {
    title: '{ride} is live',
    body: 'One photo. Prove you left the house today (or didn’t — we won’t judge).',
  },
  {
    title: 'Say cheese for {ride}',
    body: 'Your people want a sign of life. A blurry one counts.',
  },
  {
    title: '{ride} is calling',
    body: 'Point camera at something. Press button. Congratulations, you’re done.',
  },
];

/** Same-day follow-up if they have not posted yet. */
export const LATE_REMINDER_COPY: readonly NotificationCopyVariant[] = [
  {
    title: 'Still time for {ride}',
    body: 'The day’s not over and neither are your excuses. One photo, come on.',
  },
  {
    title: 'Last call for {ride}',
    body: 'The streak is hanging on by a thread and staring at you.',
  },
  {
    title: '{ride} misses you',
    body: 'Everyone posted but you. Awkward. Fix it before midnight.',
  },
];

function applyRideName(
  variant: NotificationCopyVariant,
  rideName: string,
): NotificationCopyVariant {
  return {
    title: variant.title.replaceAll('{ride}', rideName),
    body: variant.body.replaceAll('{ride}', rideName),
  };
}

function pickCopy(
  variants: readonly NotificationCopyVariant[],
): NotificationCopyVariant {
  return variants[Math.floor(Math.random() * variants.length)]!;
}

export function mainReminderCopy(rideName: string): NotificationCopyVariant {
  return applyRideName(pickCopy(MAIN_REMINDER_COPY), rideName);
}

export function lateReminderCopy(rideName: string): NotificationCopyVariant {
  return applyRideName(pickCopy(LATE_REMINDER_COPY), rideName);
}
