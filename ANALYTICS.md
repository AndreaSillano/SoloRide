# Analytics

SoloRide splits product analytics across two systems:

| System | Role |
| --- | --- |
| **Amplitude** | App usage, sessions, retention, and product events from the client |
| **Supabase SQL** | Content / Rodeo (group) KPIs from the database — not sent to Amplitude |

Source of truth:

- Client events: `src/lib/analytics.ts`
- SQL KPIs: `supabase/analytics_kpis.sql` (run in the Supabase SQL editor; not a migration)

Enable Amplitude with `EXPO_PUBLIC_AMPLITUDE_API_KEY` in `.env`. Without it, all Amplitude helpers are no-ops. Amplitude requires a native/dev build (`expo run:ios` / `expo run:android`), not Expo Go.

**Important:** Amplitude “active” means app-open / session-active. Supabase rates below use **content-active** users (posted or commented). The two will not match 1:1.

---

## Amplitude (client)

### Automatic / identity

| What | Details |
| --- | --- |
| Sessions | `trackingSessionEvents: true` — session start/end and related session metrics |
| User identity | On auth: `setUserId(userId)`; optional `username` user property |
| Logout | `reset()` clears the Amplitude user |

Dashboard charts (once data lands):

- Active users → DAU / WAU / MAU
- Stickiness → DAU / MAU
- Sessions → sessions per user, avg session length, time in app
- Retention → D1 / D7 / D30 / D90 / D180

### Custom events

| Event | When | Properties |
| --- | --- | --- |
| `ride_created` | A Rodeo (ride) is created | `ride_id` |
| `ride_join_requested` | A pending join request is created | `ride_id` |
| `ride_joined` | Owner accepts a join request (membership granted) | `ride_id`, `joined_user_id` |
| `post_created` | Permanent (non-24h) post(s) published | `ride_count`, `post_count` |
| `post_24h_created` | Temporary 24h post(s) published | `ride_count`, `post_count` |
| `video_post` | Published post includes video (in addition to the post event above) | `ride_count`, `post_count`, `is_temporary` |
| `post_with_audio` | Permanent post includes audio | `ride_count`, `post_count` |
| `post_with_audio_24` | 24h post includes audio | `ride_count`, `post_count` |
| `comment_created` | A comment is created | `post_id`, `comment_id` |
| `challenge_unlocked` | User posts to a ride challenge (permanent media unlock) | `ride_id`, `ride_challenge_id`, `post_id` |
| `challenge_opened` | Challenge opened from the client (manual open) | `ride_id`, `ride_challenge_id`, `challenge_id`, `source` |

A single publish can fire more than one of these (e.g. 24h video → `post_24h_created` + `video_post`; challenge post → post event(s) + `challenge_unlocked`).

Auto-opened challenges run server-side and are **not** sent as `challenge_opened` from the app.

These are **not** duplicated as Amplitude metrics for group size, survival, or msgs/photos per user — those live in Supabase SQL.

---

## Supabase SQL (`supabase/analytics_kpis.sql`)

Queries run against live tables (`rides`, `ride_members`, `posts`, `comments`). They do not write analytics rows; they compute KPIs on demand.

### Shared definitions

| Term | Definition |
| --- | --- |
| **last_activity** | `greatest(latest post created_at, latest comment created_at on a post in the ride)`, falling back to `rides.created_at` when the ride has no posts/comments |
| **Group survival after X days** | `last_activity >= created_at + X days` (still active at least X days after creation) |
| **Engagement-active user** | User who posted or commented in the chosen window (default last 30 days) |

### Queries

#### 1. Average group size

Members per Rodeo (`ride_members` count per `rides` row).

Outputs: `ride_count`, `avg_group_size`, `median_group_size`, `min_group_size`, `max_group_size`

#### 2. Average group duration

Creation → last activity (days).

Outputs: `ride_count`, `avg_duration_days`, `median_duration_days`

#### 3. Group survival (7 / 30 / 90 days)

Share of rides still active after each horizon. Only rides old enough to have reached that horizon are included in each percentage.

Outputs: `survival_7d_pct`, `survival_30d_pct`, `survival_90d_pct`

#### 4. Messages (comments) per engagement-active user / per group

Window: last 30 days (change the interval in SQL as needed).

Outputs: `comments_in_window`, `engagement_active_users`, `groups_with_comments`, `avg_comments_per_active_user`, `avg_comments_per_group_with_comments`, `avg_comments_per_all_groups`

#### 5. Photos (posts) per engagement-active user / per group

Same 30-day window pattern as comments.

Outputs: `posts_in_window`, `engagement_active_users`, `groups_with_posts`, `avg_posts_per_active_user`, `avg_posts_per_group_with_posts`, `avg_posts_per_all_groups`

---

## What goes where (quick map)

| KPI / signal | Where |
| --- | --- |
| DAU / WAU / MAU, sessions, stickiness, retention | Amplitude |
| Ride created / join requested / joined | Amplitude events |
| Permanent vs 24h post, video, audio (±24h), comment | Amplitude events |
| Challenge unlocked / opened (manual) | Amplitude events |
| Avg / median group size | Supabase SQL |
| Group duration & survival (7/30/90d) | Supabase SQL |
| Comments & posts per active user / per group | Supabase SQL |
