import { GlassIconButton } from './glass';

export function SheetCloseButton({
  accessibilityLabel = 'Close',
  onPress,
}: {
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <GlassIconButton
      accessibilityLabel={accessibilityLabel}
      icon="close"
      iconSize={22}
      onPress={onPress}
      size={40}
    />
  );
}
