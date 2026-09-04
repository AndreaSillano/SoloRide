export type ToastVariant = 'info' | 'error';

export type ToastPayload = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type Listener = (toast: ToastPayload | null) => void;

let nextId = 1;
let current: ToastPayload | null = null;
const listeners = new Set<Listener>();

function emit(toast: ToastPayload | null) {
  current = toast;
  for (const listener of listeners) {
    listener(toast);
  }
}

function show(variant: ToastVariant, message: string) {
  const trimmed = message.trim();
  if (!trimmed) return;
  emit({ id: nextId++, message: trimmed, variant });
}

export const toast = {
  info(message: string) {
    show('info', message);
  },
  error(message: string) {
    show('error', message);
  },
  dismiss() {
    if (current === null) return;
    emit(null);
  },
  getCurrent() {
    return current;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    listener(current);
    return () => {
      listeners.delete(listener);
    };
  },
};
