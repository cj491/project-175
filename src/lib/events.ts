/** Minimal pub-sub for transient UI feedback (toasts, XP pops). */

export type ToastKind = "xp" | "success" | "info" | "error";
export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
  amount?: number;
}

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();

export function onToast(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function toast(t: Omit<Toast, "id">) {
  const full = { ...t, id: Math.random().toString(36).slice(2) };
  listeners.forEach((l) => l(full));
}
