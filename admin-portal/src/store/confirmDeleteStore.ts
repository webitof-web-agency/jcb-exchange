import { create } from 'zustand';

// One delete confirmation for the whole portal, used instead of window.confirm. A page calls
// `await confirmDelete({...})`; ConfirmDeleteHost (mounted once in the root layout) shows it.

export type ConfirmDeleteOptions = {
  title: string;
  /** The record, e.g. a job title or "SMS log for LEAD_CREATED". */
  itemName?: string;
  /** What else goes with it; each line is shown and must be ticked. */
  alsoDeleted?: string[];
  /** Anything worth knowing that is not deleted (kept, voided, blocked when …). */
  note?: string;
  confirmLabel?: string;
};

type PendingConfirm = ConfirmDeleteOptions & { requestId: number; resolve: (confirmed: boolean) => void };

let nextRequestId = 0;

type ConfirmDeleteState = {
  pending: PendingConfirm | null;
  open: (options: ConfirmDeleteOptions) => Promise<boolean>;
  settle: (confirmed: boolean) => void;
};

export const useConfirmDeleteStore = create<ConfirmDeleteState>((set, get) => ({
  pending: null,
  open: (options) => new Promise<boolean>((resolve) => {
    // A confirmation already open is answered "no" so its caller never hangs.
    get().pending?.resolve(false);
    nextRequestId += 1;
    set({ pending: { ...options, requestId: nextRequestId, resolve } });
  }),
  settle: (confirmed) => {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(confirmed);
  },
}));

/** Resolves true only when the person ticked everything and pressed Delete. */
export const confirmDelete = (options: ConfirmDeleteOptions) => useConfirmDeleteStore.getState().open(options);
