import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ComponentProps,
} from 'react-native';

import { ScrollScreen } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Category = {
  id: string;
  label: string;
  icon: IconName;
};

type OccasionCard = {
  id: string;
  title: string;
  subtitle: string;
  imageUri: string;
};

type ProductCard = {
  id: string;
  title: string;
  price: string;
  imageUri: string;
};

const CATEGORIES: Category[] = [
  { id: 'all', label: 'All', icon: 'gift-outline' },
  { id: 'apparel', label: 'Apparel', icon: 'shirt-outline' },
  { id: 'accessories', label: 'Accessories', icon: 'glasses-outline' },
  { id: 'prints', label: 'Prints', icon: 'image-outline' },
  { id: 'occasions', label: 'Occasions', icon: 'calendar-outline' },
];

const OCCASIONS: OccasionCard[] = [
  {
    id: 'birthday-caps',
    title: 'Birthday Caps',
    subtitle: 'Celebrate the ride',
    imageUri:
      'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=700&q=80',
  },
  {
    id: 'trip-tshirts',
    title: 'Trip T-Shirts',
    subtitle: 'Wear the memories',
    imageUri:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=700&q=80',
  },
  {
    id: 'custom-mugs',
    title: 'Custom Mugs',
    subtitle: 'Morning ritual',
    imageUri:
      'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=700&q=80',
  },
];

const POPULAR: ProductCard[] = [
  {
    id: 'ride-hoodie',
    title: 'Ride Hoodie',
    price: '€49',
    imageUri:
      'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=700&q=80',
  },
  {
    id: 'phone-case',
    title: 'Phone Case',
    price: '€24',
    imageUri:
      'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=700&q=80',
  },
  {
    id: 'tote-bag',
    title: 'Tote Bag',
    price: '€28',
    imageUri:
      'https://images.unsplash.com/photo-1590874103328-eac38a674cb2?w=700&q=80',
  },
];

const NEW_ARRIVALS: ProductCard[] = [
  {
    id: 'photo-glass',
    title: 'Photo Glass',
    price: '€36',
    imageUri:
      'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=700&q=80',
  },
  {
    id: 'memory-sweatshirt',
    title: 'Memory Sweatshirt',
    price: '€54',
    imageUri:
      'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=700&q=80',
  },
  {
    id: 'ride-cap',
    title: 'Ride Cap',
    price: '€26',
    imageUri:
      'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=700&q=80',
  },
];

function MessagesButton() {
  return (
    <Pressable
      accessibilityLabel="Shop messages"
      accessibilityRole="button"
      onPress={() => {
        haptics.light();
        router.push('/shop/messages');
      }}
      style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
    >
      <Ionicons color={colors.text} name="chatbubbles-outline" size={22} />
      <View style={styles.cartBadge}>
        <Text style={styles.cartBadgeText}>3</Text>
      </View>
    </Pressable>
  );
}

function CartButton() {
  return (
    <Pressable
      accessibilityLabel="Cart, 2 items"
      accessibilityRole="button"
      onPress={() => haptics.light()}
      style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
    >
      <Ionicons color={colors.text} name="cart-outline" size={22} />
      <View style={styles.cartBadge}>
        <Text style={styles.cartBadgeText}>2</Text>
      </View>
    </Pressable>
  );
}

function ShopHeaderActions() {
  return (
    <View style={styles.headerActions}>
      <MessagesButton />
      <CartButton />
    </View>
  );
}

export default function ShopScreen() {
  const [category, setCategory] = useState('all');

  const openProduct = (productId: string) => {
    haptics.light();
    router.push({ pathname: '/shop/[productId]', params: { productId } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Shop',
          headerRight: () => <ShopHeaderActions />,
          headerRightContainerStyle: styles.headerRightContainer,
        }}
      />

      <ScrollScreen contentStyle={styles.screen}>
        <Text style={styles.subtitle}>Turn your moments into something real.</Text>

        <View accessibilityRole="text" style={styles.occasionBanner}>
          <Ionicons color={colors.primary} name="gift-outline" size={18} />
          <Text style={styles.occasionBannerText}>
            In <Text style={styles.occasionBannerEm}>12 days</Text> is{' '}
            <Text style={styles.occasionBannerEm}>Marco</Text>
            ’s birthday from <Text style={styles.occasionBannerEm}>Fratellanza</Text>
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.categories}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {CATEGORIES.map((item) => {
            const active = category === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  haptics.selection();
                  setCategory(item.id);
                }}
                style={({ pressed }) => [
                  styles.category,
                  active && styles.categoryActive,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[styles.categoryIcon, active && styles.categoryIconActive]}
                >
                  <Ionicons
                    color={active ? colors.white : colors.text}
                    name={item.icon}
                    size={22}
                  />
                </View>
                <Text
                  style={[styles.categoryLabel, active && styles.categoryLabelActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          onPress={() => openProduct('ride-tshirt')}
          style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
        >
          <Image
            contentFit="cover"
            source={{
              uri: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1200&q=80',
            }}
            style={styles.heroImage}
          />
          <LinearGradient
            colors={['rgba(28,16,14,0.15)', 'rgba(28,16,14,0.78)']}
            style={styles.heroGradient}
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Make it your Ride</Text>
            <Text style={styles.heroBody}>
              Custom merch for your people, your places, your moments.
            </Text>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>Create now</Text>
              <Ionicons color={colors.text} name="arrow-forward" size={14} />
            </View>
          </View>
        </Pressable>

        <ShopSection
          onSeeAll={() => haptics.light()}
          title="For upcoming occasions"
        >
          <ScrollView
            contentContainerStyle={styles.row}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {OCCASIONS.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => openProduct(item.id)}
                style={({ pressed }) => [styles.occasionCard, pressed && styles.pressed]}
              >
                <Image
                  contentFit="cover"
                  source={{ uri: item.imageUri }}
                  style={styles.occasionImage}
                />
                <View style={styles.occasionBody}>
                  <Text style={styles.occasionTitle}>{item.title}</Text>
                  <Text style={styles.occasionSubtitle}>{item.subtitle}</Text>
                  <View style={styles.occasionArrow}>
                    <Ionicons color={colors.white} name="arrow-forward" size={14} />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </ShopSection>

        <ShopSection onSeeAll={() => haptics.light()} title="Popular">
          <ScrollView
            contentContainerStyle={styles.row}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {POPULAR.map((item) => (
              <ProductTile key={item.id} product={item} onPress={openProduct} />
            ))}
          </ScrollView>
        </ShopSection>

        <ShopSection onSeeAll={() => haptics.light()} title="New arrivals">
          <ScrollView
            contentContainerStyle={styles.row}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {NEW_ARRIVALS.map((item) => (
              <ProductTile key={item.id} product={item} onPress={openProduct} />
            ))}
          </ScrollView>
        </ShopSection>
      </ScrollScreen>
    </>
  );
}

function ShopSection({
  title,
  onSeeAll,
  children,
}: {
  title: string;
  onSeeAll: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onSeeAll}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.seeAll}>See all ›</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function ProductTile({
  product,
  onPress,
}: {
  product: ProductCard;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(product.id)}
      style={({ pressed }) => [styles.productCard, pressed && styles.pressed]}
    >
      <View style={styles.productImageWrap}>
        <Image
          contentFit="cover"
          source={{ uri: product.imageUri }}
          style={styles.productImage}
        />
        <Pressable
          accessibilityLabel={`Favorite ${product.title}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => haptics.light()}
          style={styles.heartButton}
        >
          <Ionicons color={colors.muted} name="heart-outline" size={16} />
        </Pressable>
      </View>
      <Text style={styles.productTitle}>{product.title}</Text>
      <Text style={styles.productPrice}>{product.price}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  headerIconButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    overflow: 'visible',
    width: 40,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    overflow: 'visible',
  },
  headerRightContainer: {
    marginRight: spacing.sm,
    overflow: 'visible',
    paddingRight: spacing.xxs,
  },
  cartBadge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    right: 2,
    top: 2,
  },
  cartBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
  },
  occasionBanner: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  occasionBannerText: {
    color: colors.textSoft,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  occasionBannerEm: {
    color: colors.text,
    fontWeight: '800',
  },
  categories: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  category: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 72,
  },
  categoryActive: {},
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  categoryIconActive: {
    backgroundColor: colors.primary,
  },
  categoryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryLabelActive: {
    color: colors.primary,
  },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 210,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    ...shadows.card,
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
  heroContent: {
    gap: spacing.xs,
    padding: spacing.md,
    zIndex: 1,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    maxWidth: '90%',
  },
  heroCta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroCtaText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  seeAll: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  occasionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    width: 148,
    ...shadows.card,
  },
  occasionImage: {
    backgroundColor: colors.surfaceMuted,
    height: 150,
    width: '100%',
  },
  occasionBody: {
    gap: 2,
    padding: spacing.sm,
    paddingBottom: spacing.md,
  },
  occasionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  occasionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  occasionArrow: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    marginTop: spacing.xs,
    width: 28,
  },
  productCard: {
    width: 148,
  },
  productImageWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  productImage: {
    backgroundColor: colors.surfaceMuted,
    height: 148,
    width: '100%',
  },
  heartButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 28,
  },
  productTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  productPrice: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  pressed: { opacity: 0.72 },
});
