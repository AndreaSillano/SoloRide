import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProposeToRideSheet, type ProposeOffer } from '@/components/propose-to-ride-sheet';
import { Body, ScrollScreen, StatePanel } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

type Offer = ProposeOffer & {
  id: string;
  promoted?: boolean;
};

const FOR_YOU: Offer[] = [
  {
    id: '1',
    venue: 'Barcelona',
    offer: '3 nights in Barcelona',
    detail: 'Hotel + city center stays',
    area: 'Spain',
    when: 'From €189 / person',
    promoted: true,
    image: require('../../../assets/inbox/barcelona.png'),
  },
  {
    id: '2',
    venue: 'Lisbon',
    offer: '4 nights in Lisbon',
    detail: 'Flights + boutique hotel',
    area: 'Portugal',
    when: 'From €229 / person',
    promoted: true,
    image: require('../../../assets/inbox/lisbon.png'),
  },
  {
    id: '5',
    venue: 'Paris',
    offer: '2 nights in Paris',
    detail: 'Central hotel + museum pass',
    area: 'France',
    when: 'From €249 / person',
    promoted: true,
    image: require('../../../assets/inbox/paris.png'),
  },
  {
    id: '6',
    venue: 'Amalfi',
    offer: '5 nights on the Amalfi Coast',
    detail: 'Sea-view stay + breakfast',
    area: 'Italy',
    when: 'From €319 / person',
    image: require('../../../assets/inbox/amalfi.png'),
  },
  {
    id: '7',
    venue: 'Venice',
    offer: '3 nights in Venice',
    detail: 'Canal-side boutique hotel',
    area: 'Italy',
    when: 'From €275 / person',
    image: require('../../../assets/inbox/venice.png'),
  },
];

export default function InboxScreen() {
  const [filter, setFilter] = useState<'for-you' | 'near-you'>('for-you');
  const [proposeOffer, setProposeOffer] = useState<Offer | null>(null);

  const openPropose = (offer: Offer) => {
    haptics.light();
    setProposeOffer(offer);
  };

  return (
    <>
      <ScrollScreen contentStyle={styles.screen}>
        <View style={styles.filters}>
          {(
            [
              { id: 'for-you', label: 'For you' },
              { id: 'near-you', label: 'Near you' },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  haptics.selection();
                  setFilter(tab.id);
                }}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {filter === 'for-you' ? (
          <View style={styles.section}>
            {FOR_YOU.map((offer) => (
              <FeaturedOfferCard key={offer.id} offer={offer} onPropose={openPropose} />
            ))}
            <Body muted>Vendor offers are preview-only for now.</Body>
          </View>
        ) : (
          <StatePanel
            message="When nearby spots have offers for your Rides, they’ll show up here."
            title="Nothing near you yet"
          />
        )}
      </ScrollScreen>

      <ProposeToRideSheet
        offer={proposeOffer}
        onClose={() => setProposeOffer(null)}
        visible={proposeOffer != null}
      />
    </>
  );
}

function FeaturedOfferCard({
  offer,
  onPropose,
}: {
  offer: Offer;
  onPropose: (offer: Offer) => void;
}) {
  return (
    <View
      accessibilityLabel={offer.offer}
      style={styles.featuredWrap}
    >
      <View style={styles.featuredCard}>
        <View style={styles.hero}>
          <Image resizeMode="cover" source={offer.image} style={styles.heroImage} />
          <LinearGradient
            colors={['transparent', 'rgba(28, 16, 14, 0.72)']}
            style={styles.heroGradient}
          />
          {offer.promoted ? (
            <View style={styles.promotedBadge}>
              <Text style={styles.promotedText}>PROMOTED</Text>
            </View>
          ) : null}
          <View style={styles.heroCopy}>
            <Text style={styles.heroVenue}>{offer.offer}</Text>
            <Text style={styles.heroOffer}>{offer.detail}</Text>
            <Text style={styles.heroMeta}>
              {offer.when} · {offer.area}
            </Text>
          </View>
        </View>

        <View style={styles.featuredFooter}>
          <Pressable
            accessibilityLabel={`Propose ${offer.offer} to Ride`}
            accessibilityRole="button"
            onPress={() => onPropose(offer)}
            style={({ pressed }) => [
              styles.proposeButton,
              pressed && styles.proposePressed,
            ]}
          >
            <Ionicons color={colors.white} name="paper-plane" size={16} />
            <Text style={styles.proposeText}>Propose to Ride</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Open offer for ${offer.offer}`}
            accessibilityRole="button"
            onPress={() => {}}
            style={({ pressed }) => [
              styles.openOfferButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={colors.primary} name="ticket-outline" size={15} />
            <Text style={styles.openOfferText}>Open offer</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.white,
  },
  section: {
    gap: spacing.md,
  },
  featuredWrap: {
    borderRadius: radius.lg,
    ...shadows.card,
  },
  featuredCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  hero: {
    backgroundColor: colors.surfaceMuted,
    height: 220,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  heroImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  heroGradient: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  promotedBadge: {
    backgroundColor: 'rgba(28, 16, 14, 0.45)',
    borderRadius: radius.pill,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    position: 'absolute',
    top: spacing.sm,
  },
  promotedText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroCopy: {
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  heroVenue: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroOffer: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  featuredFooter: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  proposeButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    ...shadows.glow,
  },
  proposePressed: {
    backgroundColor: colors.primaryPressed,
  },
  proposeText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  openOfferButton: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  openOfferText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: { opacity: 0.75 },
});
