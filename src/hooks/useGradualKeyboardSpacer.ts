import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

/**
 * Tracks keyboard height as a Reanimated shared value, frame by frame.
 * See docs/keyboard-avoidance.md Pattern 2.
 */
export function useGradualKeyboardSpacer(
  bottomInset: number,
  onKeyboardSettled: () => void,
): { height: SharedValue<number> } {
  const height = useSharedValue(0);

  useKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        height.value = event.height > 0 ? Math.max(event.height - bottomInset, 0) : 0;
      },
      onMove: (event) => {
        'worklet';
        height.value = event.height > 0 ? Math.max(event.height - bottomInset, 0) : 0;
      },
      onEnd: (event) => {
        'worklet';
        height.value = event.height > 0 ? Math.max(event.height - bottomInset, 0) : 0;
        runOnJS(onKeyboardSettled)();
      },
    },
    [bottomInset, onKeyboardSettled],
  );

  return { height };
}
