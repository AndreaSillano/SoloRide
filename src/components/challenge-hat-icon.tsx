import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import type { ComponentProps } from 'react';

type Props = {
  color: string;
  size: number;
  style?: ComponentProps<typeof FontAwesome5>['style'];
};

/** Challenge brand mark — cowboy hat (replaces trophy). */
export function ChallengeHatIcon({ color, size, style }: Props) {
  return <FontAwesome5 color={color} name="hat-cowboy" size={size} solid style={style} />;
}
