# SoloRide

SoloRide is a private, temporary photo journal for small groups. It is built
with Expo SDK 54, React Native, Expo Router, TanStack Query, and Supabase.

## Requirements

- Node.js 20.19 or newer
- An Expo development environment
- A Supabase project
- Supabase CLI authentication for migration deployment

## Local setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and add the project URL and
   **publishable/anon** key:

   ```sh
   cp .env.example .env.local
   ```

   Never put a Supabase secret or service-role key in an Expo environment
   variable. Expo public variables are included in the application bundle.

3. In Supabase Authentication settings, enable email/password sign-in and
   disable email confirmation. SoloRide derives an internal, non-user-facing
   address from each normalized username.

4. Deploy the database:

   ```sh
   npx supabase login
   npx supabase link --project-ref hktwxkkxanuvyigmxlzz
   npx supabase db push
   ```

5. Start the app:

   ```sh
   npm start
   ```

Camera, gallery, location, and local-notification behavior must be verified on
physical iOS and Android devices. Notification behavior is limited in Expo Go;
use a development build for release-like testing.

## Security model

- Password hashing, verification, access tokens, and refresh tokens are owned
  by Supabase Auth. Passwords are never stored by the app.
- Supabase sessions are encrypted in AsyncStorage with an AES key kept in Expo
  SecureStore, following Supabase's Expo pattern.
- All application tables use Row Level Security.
- Ride data, posts, comments, and private Storage objects are available only to
  current Ride members.
- Creators alone can change or archive their Rides; authors alone can mutate
  their own posts and comments.
- The private `ride-posts` bucket uses
  `{rideId}/{userId}/{postId}.jpg` paths.

If a service-role key has ever been committed or shared, rotate it immediately
in Supabase Dashboard. Secret keys bypass Row Level Security.

## Username authentication and recovery

Usernames are normalized to lowercase and must be unique. The app maps them to
an internal `@soloride.internal` address for Supabase Auth; that address is
never shown to users.

The MVP has no self-service password recovery. A user must contact the
administrator, who can reset the account from Supabase Dashboard:

1. Find the Auth user whose internal email begins with the normalized username.
2. Set a temporary password using the protected Auth administration controls.
3. Give the temporary password to the user through a trusted channel.

Never expose a secret/service-role key to the mobile app to automate this.

## Notifications

SoloRide uses two notification paths:

1. **Local schedule reminders** — bounded one-off notifications over a rolling
   eight-week horizon for photo days and same-day follow-ups.
2. **Push alerts** — when another member posts a photo in a Ride you belong to,
   or comments on one of your photos. Devices register an Expo push token in
   `push_tokens`; database triggers send via the Expo Push API.

On launch and foreground, the app refreshes Ride schedules, reconciles local
reminders, and re-registers the push token when permission is granted.

For push tokens, set `EXPO_PUBLIC_EAS_PROJECT_ID` to your EAS project UUID (also
available under `extra.eas.projectId` after `eas init`). Push must be verified
on a physical device with a development build; Expo Go is limited.

Notification times for schedule reminders use each member device's local
timezone. Tapping a social push opens that Ride in the Rides tab.

## Analytics

Product usage (sessions, retention, ride/post/comment events) is logged in
**Amplitude**. Rodeo/group content KPIs (size, survival, posts/comments per
user) are computed in **Supabase** via `supabase/analytics_kpis.sql`.

See [ANALYTICS.md](./ANALYTICS.md) for the full event and KPI definitions.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

The schema and policies are in `supabase/migrations/`.
