import { create } from 'zustand';

type ToastVariant = 'success' | 'error' | 'info';

type ToastState = {
  showToast: (toast: { title: string; description?: string; variant: ToastVariant }) => void;
};

// The shared listing form also renders inline success/error messages in the portal.
export const useToastStore = create<ToastState>(() => ({
  showToast: () => undefined,
}));
