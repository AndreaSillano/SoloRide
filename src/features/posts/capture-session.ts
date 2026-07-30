/** Cross-route signal so Retake can clear the in-tab draft before a native pop. */

let pendingRetake = false;
const listeners = new Set<() => void>();

export function requestCaptureRetake() {
  pendingRetake = true;
  listeners.forEach((listener) => listener());
}

export function consumeCaptureRetake() {
  if (!pendingRetake) return false;
  pendingRetake = false;
  return true;
}

export function subscribeCaptureRetake(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
