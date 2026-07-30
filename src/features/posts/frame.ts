import { spacing } from '@/theme';

/** Native tab bar sits above the home indicator. */
export const POST_CAPTURE_TAB_BAR_CLEARANCE = 56;
/** Flip / retake control row height used when reserving frame space. */
export const POST_CAPTURE_TOP_CONTROL = 36;
/** Shutter button diameter used when reserving frame space. */
export const POST_CAPTURE_SHUTTER_SIZE = 80;

/** Padding that places the full-width 3∶4 post frame between camera chrome. */
export function getPostCaptureFramePadding(insets: { top: number; bottom: number }) {
  return {
    top: insets.top + spacing.sm + POST_CAPTURE_TOP_CONTROL + spacing.lg,
    bottom:
      Math.max(insets.bottom, spacing.md) +
      POST_CAPTURE_TAB_BAR_CLEARANCE +
      spacing.md +
      POST_CAPTURE_SHUTTER_SIZE +
      spacing.md -
      spacing.lg,
    /** Match feed posts: edge-to-edge width, no side inset. */
    horizontal: 0,
  };
}
