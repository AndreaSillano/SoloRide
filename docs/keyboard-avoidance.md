# Keyboard Avoidance — Implementation Reference

Two patterns are used across the app. Pick the one that fits your screen.

---

## Pattern 1: `KeyboardAvoidingView` (simple forms)

**Used in:** `app/onboarding.js`, `app/questionnaire.js`

Best for screens with a `ScrollView` and a sticky footer (buttons, nav). The OS shifts the whole layout up when the keyboard appears.

### Code

```jsx
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyScreen() {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {/* form fields */}
        </ScrollView>

        {/* sticky footer — pushed up by the keyboard */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleNext}>
            <Text>Next</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
```

### How it works

| Detail | Explanation |
|--------|-------------|
| `behavior="padding"` (iOS) | Adds bottom padding equal to the keyboard height, pushing all content up. |
| `behavior={undefined}` (Android) | Android handles it natively via `windowSoftInputMode`; no extra behavior needed. |
| `keyboardShouldPersistTaps="handled"` | Lets taps on interactive elements inside the scroll area work without first dismissing the keyboard. |

---

## Pattern 2: Animated spacer via `react-native-keyboard-controller` (chat / message list)

**Used in:** `app/chat.js`

Best for chat-like UIs where the message list must scroll in **frame-perfect sync** with the keyboard sliding up or down. Uses Reanimated shared values updated on the UI thread, so there is zero JS-thread lag.

### Dependencies

```
react-native-keyboard-controller
react-native-reanimated
react-native-worklets
react-native-safe-area-context
```

---

### Step 1 — Custom hook

```js
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useSharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

/**
 * Tracks keyboard height as a Reanimated shared value, frame by frame.
 *
 * @param {number} bottomInset   - Safe area bottom inset (from useSafeAreaInsets).
 *                                 Subtracted so the spacer stops at the real keyboard edge.
 * @param {function} onKeyboardSettled - JS callback fired when the keyboard animation ends.
 */
function useGradualKeyboardSpacer(bottomInset, onKeyboardSettled) {
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
        runOnJS(onKeyboardSettled)(); // bridge back to JS for side effects
      },
    },
    [bottomInset, onKeyboardSettled]
  );

  return { height };
}
```

**Callback breakdown:**

| Callback | When it fires | What it does |
|----------|--------------|--------------|
| `onStart` | Keyboard animation begins | Snaps `height` to target immediately |
| `onMove`  | Every frame of the animation | Keeps `height` in sync with keyboard position |
| `onEnd`   | Animation finishes | Finalises `height`; calls JS side effect via `runOnJS` |

All three run as **worklets** on the UI thread — no JS bridge round-trip per frame.

---

### Step 2 — Wire it up in the component

```js
import { Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();

  // scrollToBottom is whatever function scrolls your list to the end
  const { height: keyboardSpacerHeight } = useGradualKeyboardSpacer(
    insets.bottom,
    scrollToBottom
  );

  // Animated style driven by the shared value
  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: keyboardSpacerHeight.value,
  }));

  // Safety net: reset height to 0 when keyboard fully hides
  useEffect(() => {
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardSpacerHeight.value = 0;
      scrollToBottom(false);
    });
    return () => hideSub.remove();
  }, [keyboardSpacerHeight, scrollToBottom]);

  // ...
}
```

---

### Step 3 — Place the spacer in JSX

The spacer sits **below** your message list (or scroll content). It grows and shrinks with the keyboard, pushing messages up without any layout wrapper tricks.

```jsx
<View style={{ flex: 1 }}>
  <FlatList
    data={messages}
    renderItem={renderMessage}
    // ... other props
  />

  {/* Input bar */}
  <View style={styles.inputBar}>
    <TextInput ... />
    <TouchableOpacity onPress={sendMessage} />
  </View>

  {/* Keyboard spacer — grows to keyboard height, pushes everything above it up */}
  <Reanimated.View style={keyboardSpacerStyle} />
</View>
```

---

## Which pattern to use?

| Screen type | Pattern |
|-------------|---------|
| Simple form / onboarding with a sticky footer | Pattern 1 — `KeyboardAvoidingView` |
| Chat / message list requiring frame-perfect sync | Pattern 2 — animated spacer |
