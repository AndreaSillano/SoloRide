import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInput as TextInputType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { colors, radius, spacing } from '@/theme';

const PALETTE = [
  '#FFFFFF',
  '#F3F5F8',
  '#12151A',
  '#000000',
  '#2F6BFF',
  '#60A5FA',
  '#1A1F2B',
  '#34D399',
  '#F97316',
  '#A855F7',
  '#EF4444',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
] as const;
const MIN_FONT = 18;
const MAX_FONT = 56;
const DEFAULT_FONT = 32;
const MIN_STROKE = 3;
const MAX_STROKE = 14;
const DEFAULT_STROKE = 5;
const TAB_BAR_CLEARANCE = 56;

type Tool = 'text' | 'pen';
type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };

type PhotoTextEditorProps = {
  imageUri: string;
  onCancel: () => void;
  onSkip: () => void;
  onDone: (uri: string) => void;
};

function pointsToPath(points: Point[]) {
  if (!points.length) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');
}

function isLightInk(color: string) {
  return (
    color === '#FFFFFF' ||
    color === '#F3F5F8' ||
    color === '#60A5FA' ||
    color === '#34D399' ||
    color === '#F59E0B' ||
    color === '#F97316' ||
    color === '#06B6D4'
  );
}

export function PhotoTextEditor({ imageUri, onCancel, onSkip, onDone }: PhotoTextEditorProps) {
  const insets = useSafeAreaInsets();
  const canvas = useRef<View>(null);
  const inputRef = useRef<TextInputType>(null);
  const [tool, setTool] = useState<Tool>('text');
  const [hasText, setHasText] = useState(false);
  const [overlayText, setOverlayText] = useState('');
  const [inkColor, setInkColor] = useState<(typeof PALETTE)[number]>(PALETTE[0]);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE);
  const [focused, setFocused] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dragOrigin = useRef({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const didDrag = useRef(false);
  const inkColorRef = useRef(inkColor);
  const strokeWidthRef = useRef(strokeWidth);
  const liveStrokeRef = useRef<Stroke | null>(null);
  const didPlaceText = useRef(false);

  offsetRef.current = offset;
  inkColorRef.current = inkColor;
  strokeWidthRef.current = strokeWidth;
  liveStrokeRef.current = liveStroke;

  const penGesture = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const next: Stroke = {
            color: inkColorRef.current,
            width: strokeWidthRef.current,
            points: [{ x: locationX, y: locationY }],
          };
          liveStrokeRef.current = next;
          setLiveStroke(next);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const current = liveStrokeRef.current;
          if (!current) return;
          const next = {
            ...current,
            points: [...current.points, { x: locationX, y: locationY }],
          };
          liveStrokeRef.current = next;
          setLiveStroke(next);
        },
        onPanResponderRelease: () => {
          const current = liveStrokeRef.current;
          if (current && current.points.length > 1) {
            setStrokes((existing) => [...existing, current]);
          }
          liveStrokeRef.current = null;
          setLiveStroke(null);
        },
        onPanResponderTerminate: () => {
          liveStrokeRef.current = null;
          setLiveStroke(null);
        },
      }),
    [],
  );

  const textDragGesture = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          didDrag.current = false;
          dragOrigin.current = offsetRef.current;
        },
        onPanResponderMove: (_event, gestureState) => {
          if (Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3) {
            didDrag.current = true;
          }
          setOffset({
            x: dragOrigin.current.x + gestureState.dx,
            y: dragOrigin.current.y + gestureState.dy,
          });
        },
        onPanResponderRelease: () => {
          if (!didDrag.current) {
            setFocused(true);
          }
        },
      }),
    [],
  );

  useEffect(() => {
    if (!hasText || tool !== 'text') return;
    const handle = setTimeout(() => {
      setFocused(true);
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(handle);
  }, [hasText, tool]);

  useEffect(() => {
    if (!focused) return;
    const handle = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(handle);
  }, [focused]);

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
    if (!didPlaceText.current) {
      didPlaceText.current = true;
      setOffset({ x: 0, y: Math.round(height * 0.35) });
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setFocused(false);
  };

  const selectTextTool = () => {
    setTool('text');
    if (!hasText) {
      setHasText(true);
      setOverlayText('');
    } else {
      setFocused(true);
    }
  };

  const selectPenTool = () => {
    dismissKeyboard();
    setTool('pen');
  };

  const bumpSize = (delta: number) => {
    if (tool === 'pen') {
      setStrokeWidth((current) => Math.min(MAX_STROKE, Math.max(MIN_STROKE, current + delta)));
      return;
    }
    setFontSize((current) => Math.min(MAX_FONT, Math.max(MIN_FONT, current + delta)));
  };

  const clearActive = () => {
    if (tool === 'pen') {
      setStrokes([]);
      setLiveStroke(null);
      return;
    }
    dismissKeyboard();
    setHasText(false);
    setOverlayText('');
  };

  const confirm = async () => {
    dismissKeyboard();

    const trimmed = overlayText.trim();
    const hasDrawing = strokes.length > 0;
    const hasOverlay = hasText && Boolean(trimmed);

    if (!hasOverlay && !hasDrawing) {
      onSkip();
      return;
    }
    if (!canvas.current || canvasSize.width <= 0) return;

    setBusy(true);
    setCapturing(true);
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const uri = await captureRef(canvas, {
        format: 'jpg',
        quality: 0.92,
        result: 'tmpfile',
        width: Math.round(canvasSize.width),
        height: Math.round(canvasSize.height),
      });
      onDone(uri);
    } catch {
      setError('The edits could not be saved. Try again.');
      setCapturing(false);
    } finally {
      setBusy(false);
    }
  };

  const lightInk = isLightInk(inkColor);
  const allStrokes = liveStroke ? [...strokes, liveStroke] : strokes;
  const topPad = Math.max(insets.top, spacing.sm);
  const bottomPad = Math.max(insets.bottom, spacing.sm) + TAB_BAR_CLEARANCE;
  const textStyle = {
    color: inkColor,
    fontSize,
    lineHeight: Math.round(fontSize * 1.2),
    textShadowColor: lightInk ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.35)',
  } as const;
  const showDismissOverlay = tool === 'text' && focused && !capturing;

  return (
    <View style={styles.root}>
      <View
        {...(tool === 'pen' ? penGesture.panHandlers : {})}
        collapsable={false}
        onLayout={onCanvasLayout}
        ref={canvas}
        style={styles.canvas}
      >
        <Image resizeMode="cover" source={{ uri: imageUri }} style={StyleSheet.absoluteFill} />
        <Svg height="100%" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
          {allStrokes.map((stroke, index) => (
            <Path
              key={`stroke-${index}`}
              d={pointsToPath(stroke.points)}
              fill="none"
              stroke={stroke.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={stroke.width}
            />
          ))}
        </Svg>
        {hasText ? (
          <View
            {...(tool === 'text' && !focused && !capturing ? textDragGesture.panHandlers : {})}
            pointerEvents={tool === 'text' && !focused ? 'auto' : 'none'}
            style={[
              styles.textLayer,
              { transform: [{ translateX: offset.x }, { translateY: offset.y }] },
            ]}
          >
            {focused && !capturing ? (
              <TextInput
                autoCapitalize="sentences"
                maxLength={120}
                multiline
                onBlur={() => setFocused(false)}
                onChangeText={setOverlayText}
                placeholder="Text"
                placeholderTextColor={
                  lightInk ? 'rgba(255,255,255,0.45)' : 'rgba(28,41,34,0.35)'
                }
                ref={inputRef}
                selectionColor={colors.accent}
                style={[styles.onImageInput, textStyle]}
                value={overlayText}
              />
            ) : (
              <Text style={[styles.onImageInput, textStyle]}>
                {overlayText.trim() || (capturing ? '' : 'Text')}
              </Text>
            )}
          </View>
        ) : null}
      </View>

      {showDismissOverlay ? (
        <Pressable
          accessibilityLabel="Dismiss keyboard"
          onPress={dismissKeyboard}
          style={styles.dismissOverlay}
        />
      ) : null}

      <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: topPad }]}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text style={styles.chipText}>Retake</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void confirm()}
          style={({ pressed }) => [styles.chip, styles.chipStrong, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.chipText}>Confirm</Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.toolDock, { top: topPad + 52 }]}>
        <Pressable
          accessibilityLabel="Text tool"
          accessibilityRole="button"
          onPress={selectTextTool}
          style={({ pressed }) => [
            styles.toolButton,
            tool === 'text' && styles.toolButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.toolAa}>Aa</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Pen tool"
          accessibilityRole="button"
          onPress={selectPenTool}
          style={({ pressed }) => [
            styles.toolButton,
            tool === 'pen' && styles.toolButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons color={colors.white} name="pencil" size={18} />
        </Pressable>
        <Pressable
          accessibilityLabel="Smaller"
          accessibilityRole="button"
          onPress={() => bumpSize(tool === 'pen' ? -2 : -4)}
          style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
        >
          <Text style={[styles.toolGlyph, styles.toolGlyphSmall]}>A</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Larger"
          accessibilityRole="button"
          onPress={() => bumpSize(tool === 'pen' ? 2 : 4)}
          style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
        >
          <Text style={[styles.toolGlyph, styles.toolGlyphLarge]}>A</Text>
        </Pressable>
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.bottomChrome, { paddingBottom: bottomPad }]}
      >
        <View style={styles.paletteBar}>
          <View style={[styles.colorPreview, { backgroundColor: inkColor }]}>
            <View
              style={[
                styles.colorPreviewRing,
                {
                  borderColor: lightInk ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.85)',
                },
              ]}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.colorScrollContent}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.colorScroll}
          >
            {PALETTE.map((color) => {
              const selected = inkColor === color;
              const light = isLightInk(color);
              return (
                <Pressable
                  key={color}
                  accessibilityLabel={`Color ${color}`}
                  accessibilityRole="button"
                  onPress={() => setInkColor(color)}
                  style={({ pressed }) => [
                    styles.colorSwatch,
                    { backgroundColor: color },
                    selected && styles.colorSwatchSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  {selected ? (
                    <Ionicons
                      color={light ? '#12151A' : '#FFFFFF'}
                      name="checkmark"
                      size={16}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityLabel={tool === 'pen' ? 'Clear drawing' : 'Remove text'}
            accessibilityRole="button"
            onPress={clearActive}
            style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.white} name="trash-outline" size={18} />
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', flex: 1 },
  canvas: { ...StyleSheet.absoluteFillObject },
  dismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  chip: {
    backgroundColor: 'rgba(15,22,18,0.45)',
    borderRadius: radius.pill,
    minWidth: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipStrong: { alignItems: 'center' },
  chipText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  toolDock: {
    gap: spacing.sm,
    position: 'absolute',
    right: spacing.md,
    zIndex: 3,
  },
  toolButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,22,18,0.5)',
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  toolButtonActive: {
    backgroundColor: colors.primary,
  },
  toolAa: { color: colors.white, fontSize: 15, fontWeight: '800' },
  toolGlyph: { color: colors.white, fontWeight: '800' },
  toolGlyphSmall: { fontSize: 13 },
  toolGlyphLarge: { fontSize: 20 },
  textLayer: {
    alignSelf: 'center',
    left: spacing.md,
    maxWidth: '82%',
    position: 'absolute',
    right: spacing.md,
  },
  onImageInput: {
    fontWeight: '800',
    letterSpacing: -0.3,
    padding: 0,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  bottomChrome: {
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: 0,
    zIndex: 3,
  },
  paletteBar: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(15,22,18,0.55)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: '100%',
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  colorPreview: {
    borderRadius: radius.pill,
    height: 36,
    overflow: 'hidden',
    width: 36,
  },
  colorPreviewRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  colorScroll: { flexGrow: 0, maxWidth: 260 },
  colorScrollContent: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  colorSwatch: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  colorSwatchSelected: {
    borderColor: colors.white,
    borderWidth: 2,
    transform: [{ scale: 1.06 }],
  },
  error: {
    color: colors.accentSoft,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  pressed: { opacity: 0.8 },
});
