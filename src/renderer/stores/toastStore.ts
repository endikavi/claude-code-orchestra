import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    const duration = toast.duration ?? 3000;

    set((state) => {
      const newToasts = [...state.toasts, { ...toast, id }];
      // Max 5 visible
      if (newToasts.length > 5) {
        return { toasts: newToasts.slice(-5) };
      }
      return { toasts: newToasts };
    });

    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

// Convenience function for use outside React components
export function showToast(type: ToastType, message: string, duration?: number) {
  useToastStore.getState().addToast({ type, message, duration });
}
