import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollScreen } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

const GALLERY = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200&q=80',
  'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=700&q=80',
  'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=700&q=80',
  'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=700&q=80',
];

const PHOTO_PICKS = [
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&q=80',
  'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=400&q=80',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&q=80',
];

const COLORS = ['#FF5C1A', '#1C100E', '#9A9A9A', '#E8D5B7', '#4A6FA5'] as const;
const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;

const PRODUCT_COPY: Record<string, { title: string; price: string }> = {
  'ride-tshirt': {
    title: 'Ride T-Shirt',
    price: '€32',
  },
  'ride-hoodie': {
    title: 'Ride Hoodie',
    price: '€49',
  },
  'phone-case': {
    title: 'Phone Case',
    price: '€24',
  },
  'tote-bag': {
    title: 'Tote Bag',
    price: '€28',
  },
  'birthday-caps': {
    title: 'Birthday Caps',
    price: '€26',
  },
  'trip-tshirts': {
    title: 'Trip T-Shirt',
    price: '€32',
  },
  'custom-mugs': {
    title: 'Custom Mug',
    price: '€22',
  },
  'photo-glass': {
    title: 'Photo Glass',
    price: '€36',
  },
  'memory-sweatshirt': {
    title: 'Memory Sweatshirt',
    price: '€54',
  },
  'ride-cap': {
    title: 'Ride Cap',
    price: '€26',
  },
};

function HeaderActions() {
  return (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityLabel="Cart, 2 items"
        accessibilityRole="button"
        onPress={() => haptics.light()}
        style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
      >
        <Ionicons color={colors.text} name="cart-outline" size={22} />
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>2</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel="More options"
        accessibilityRole="button"
        onPress={() => haptics.light()}
        style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
      >
        <Ionicons color={colors.text} name="ellipsis-horizontal" size={22} />
      </Pressable>
    </View>
  );
}

export default function ShopProductScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const insets = useSafeAreaInsets();
  const product = PRODUCT_COPY[productId ?? ''] ?? PRODUCT_COPY['ride-tshirt'];

  const [galleryIndex, setGalleryIndex] = useState(0);
  const [customText, setCustomText] = useState('Same People Different Places');
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>('M');

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => <HeaderActions />,
          headerRightContainerStyle: styles.headerRightContainer,
        }}
      />

      <View style={styles.root}>
        <ScrollScreen contentStyle={styles.screen}>
          <View style={styles.gallery}>
            <Image
              contentFit="cover"
              source={{ uri: GALLERY[galleryIndex] }}
              style={styles.mainImage}
            />
            <ScrollView
              contentContainerStyle={styles.thumbs}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {GALLERY.map((uri, index) => {
                const active = galleryIndex === index;
                return (
                  <Pressable
                    key={uri}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      haptics.selection();
                      setGalleryIndex(index);
                    }}
                    style={[styles.thumb, active && styles.thumbActive]}
                  >
                    <Image contentFit="cover" source={{ uri }} style={styles.thumbImage} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.productHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{product.title}</Text>
              <Text style={styles.price}>{product.price}</Text>
            </View>
            <View style={styles.ratingRow}>
              {Array.from({ length: 5 }).map((_, index) => (
                <Ionicons
                  key={index}
                  color={colors.primary}
                  name="star"
                  size={14}
                />
              ))}
              <Text style={styles.ratingText}>4.8 (124 reviews)</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Ride</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => haptics.light()}
              style={({ pressed }) => [styles.ridePicker, pressed && styles.pressed]}
            >
              <Image
                contentFit="cover"
                source={{
                  uri: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=200&q=80',
                }}
                style={styles.rideAvatar}
              />
              <Text style={styles.rideName}>Fratellanza</Text>
              <Ionicons color={colors.muted} name="chevron-down" size={18} />
            </Pressable>
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Add text (optional)</Text>
              <Text style={styles.counter}>{customText.length}/40</Text>
            </View>
            <TextInput
              maxLength={40}
              onChangeText={setCustomText}
              placeholder="Your Ride line"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={customText}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Add photos (optional)</Text>
            <ScrollView
              contentContainerStyle={styles.photoRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {PHOTO_PICKS.map((uri) => (
                <Image
                  key={uri}
                  contentFit="cover"
                  source={{ uri }}
                  style={styles.photoThumb}
                />
              ))}
              <Pressable
                accessibilityLabel="Add photos"
                accessibilityRole="button"
                onPress={() => haptics.light()}
                style={({ pressed }) => [styles.addPhoto, pressed && styles.pressed]}
              >
                <Ionicons color={colors.muted} name="add" size={28} />
              </Pressable>
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Color</Text>
            <View style={styles.swatchRow}>
              {COLORS.map((color, index) => {
                const active = selectedColor === index;
                return (
                  <Pressable
                    key={color}
                    accessibilityLabel={`Color ${index + 1}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      haptics.selection();
                      setSelectedColor(index);
                    }}
                    style={[styles.swatchRing, active && styles.swatchRingActive]}
                  >
                    <View style={[styles.swatch, { backgroundColor: color }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Size</Text>
            <View style={styles.sizeRow}>
              {SIZES.map((size) => {
                const active = selectedSize === size;
                return (
                  <Pressable
                    key={size}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      haptics.selection();
                      setSelectedSize(size);
                    }}
                    style={[styles.sizeChip, active && styles.sizeChipActive]}
                  >
                    <Text style={[styles.sizeText, active && styles.sizeTextActive]}>
                      {size}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollScreen>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => haptics.medium()}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>Add to cart • {product.price}</Text>
          </Pressable>
          <Text style={styles.footerNote}>Printed on demand • Ships in 5–7 days</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    gap: spacing.lg,
    paddingBottom: 120,
    paddingTop: spacing.xs,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    overflow: 'visible',
  },
  headerRightContainer: {
    marginRight: spacing.sm,
    overflow: 'visible',
    paddingRight: spacing.xxs,
  },
  headerIcon: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    overflow: 'visible',
    width: 40,
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
  gallery: {
    gap: spacing.sm,
  },
  mainImage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 320,
    width: '100%',
  },
  thumbs: {
    gap: spacing.xs,
  },
  thumb: {
    borderColor: 'transparent',
    borderRadius: radius.sm,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbActive: {
    borderColor: colors.primary,
  },
  thumbImage: {
    backgroundColor: colors.surfaceMuted,
    height: 64,
    width: 64,
  },
  productHeader: {
    gap: spacing.xs,
  },
  titleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  price: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  ratingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    marginTop: spacing.xxs,
  },
  ratingText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  counter: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  ridePicker: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rideAvatar: {
    borderRadius: radius.pill,
    height: 36,
    width: 36,
  },
  rideName: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  photoRow: {
    gap: spacing.xs,
  },
  photoThumb: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 72,
    width: 72,
  },
  addPhoto: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  swatchRing: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  swatchRingActive: {
    borderColor: colors.primary,
  },
  swatch: {
    borderRadius: radius.pill,
    height: 28,
    width: 28,
  },
  sizeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  sizeChip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minWidth: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  sizeChipActive: {
    backgroundColor: colors.primary,
  },
  sizeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sizeTextActive: {
    color: colors.white,
  },
  footer: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    ...shadows.floating,
  },
  cta: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingVertical: spacing.md,
    ...shadows.glow,
  },
  ctaText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  footerNote: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  pressed: { opacity: 0.72 },
});
