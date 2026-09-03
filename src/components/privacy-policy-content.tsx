import { StyleSheet, Text, View } from 'react-native';

import { ScrollScreen } from '@/components/ui';
import { colors, spacing } from '@/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Overview',
    body: 'Rhodeo is a private photo-sharing app for small groups (“Rides”). This policy explains what we collect, how posts work, and how product analytics are used. It is written in plain language on purpose.',
  },
  {
    title: 'Account',
    body: 'We store your username and a hashed password so you can sign in. We do not require an email address. Password recovery is handled through an administrator — never share your password with anyone.',
  },
  {
    title: 'Posts & Rides',
    body: 'Photos, videos, voice notes, captions, optional location labels, and reaction/comment activity are stored so members of that Ride can see them. Content in a Ride is visible to people who join that Ride — not to the public internet. Temporary (24h) posts are removed after they expire. Ride owners can manage membership and settings for their Ride.',
  },
  {
    title: 'Device permissions',
    body: 'Camera, photo library, microphone, location, and notification access are only used for features you turn on (taking media, attaching a place name, Ride alerts). You can change these in system Settings and in the Rhodeo profile screen.',
  },
  {
    title: 'Product analytics',
    body: 'When analytics is enabled for a build, Rhodeo may send anonymous product events (for example app opens, sessions, and high-level actions like creating a post) to Amplitude so we can understand retention and usage. These events are not used to sell ads. Analytics can be disabled for a build by not configuring an analytics key.',
  },
  {
    title: 'Storage & security',
    body: 'App data is stored with our backend provider (Supabase). Access to Ride content is limited by account authentication and Ride membership rules. No system is perfect — protect your username and password, and only invite people you trust into a Ride.',
  },
  {
    title: 'Your choices',
    body: 'You can delete posts you created, leave or archive Rides (subject to Ride rules), turn off notifications, and log out. For account deletion or other privacy requests, contact a Rhodeo administrator.',
  },
  {
    title: 'Changes',
    body: 'We may update this policy as the product changes. The latest version is always available from the login screen and from Profile.',
  },
];

/** Shared privacy policy body used on auth + signed-in routes. */
export function PrivacyPolicyContent() {
  return (
    <ScrollScreen>
      <View style={styles.header}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Effective · September 3, 2026</Text>
        <Text style={styles.updated}>Last updated · September 3, 2026</Text>
      </View>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  updated: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionBody: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
  },
});
