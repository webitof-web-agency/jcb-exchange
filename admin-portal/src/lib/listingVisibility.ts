import api from '@/lib/api';

// Unlist / suspend / block for listings. The rules mirror backend/src/services/listingModeration.service.ts,
// which checks every action again, so these only decide which menu items to show.

export type ListingVisibilityAction = 'UNLIST' | 'RELIST' | 'SUSPEND' | 'RESTORE' | 'BLOCK' | 'UNBLOCK' | 'REQUEST_REVIEW';

export const HIDDEN_LISTING_STATUSES = ['UNLISTED', 'SUSPENDED', 'BLOCKED'] as const;

export const isHiddenListingStatus = (status: unknown) =>
  (HIDDEN_LISTING_STATUSES as readonly string[]).includes(String(status || '').toUpperCase());

const LIVE = ['PUBLISHED', 'PAUSED', 'RESERVED'];

const RULES: Record<ListingVisibilityAction, { from: string[]; by: 'ADMIN' | 'OWNER' | 'ADMIN_OR_OWNER' }> = {
  UNLIST: { from: LIVE, by: 'ADMIN_OR_OWNER' },
  RELIST: { from: ['UNLISTED'], by: 'ADMIN_OR_OWNER' },
  SUSPEND: { from: ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', ...LIVE, 'UNLISTED', 'REJECTED'], by: 'ADMIN' },
  RESTORE: { from: ['SUSPENDED'], by: 'ADMIN' },
  BLOCK: { from: ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', ...LIVE, 'UNLISTED', 'SUSPENDED', 'REJECTED'], by: 'ADMIN' },
  UNBLOCK: { from: ['BLOCKED'], by: 'ADMIN' },
  REQUEST_REVIEW: { from: ['SUSPENDED'], by: 'OWNER' },
};

export const availableListingActions = (status: unknown, viewer: { isAdmin: boolean; isOwner: boolean }) =>
  (Object.keys(RULES) as ListingVisibilityAction[]).filter((action) => {
    const rule = RULES[action];
    if (!rule.from.includes(String(status || '').toUpperCase())) return false;
    if (rule.by === 'ADMIN') return viewer.isAdmin;
    if (rule.by === 'OWNER') return viewer.isOwner && !viewer.isAdmin;
    return viewer.isAdmin || viewer.isOwner;
  });

export const LISTING_ACTION_META: Record<ListingVisibilityAction, {
  label: string;
  title: string;
  description: string;
  reasonRequired: boolean;
  tone: 'default' | 'warning' | 'danger' | 'success';
}> = {
  UNLIST: {
    label: 'Unlist',
    title: 'Unlist this listing?',
    description: 'It is hidden from the website and takes no new enquiries or payments. Everything is kept and it can be relisted any time.',
    reasonRequired: false,
    tone: 'warning',
  },
  RELIST: {
    label: 'Relist',
    title: 'Relist this listing?',
    description: 'It goes live on the website again.',
    reasonRequired: false,
    tone: 'success',
  },
  SUSPEND: {
    label: 'Suspend',
    title: 'Suspend this listing?',
    description: 'It is hidden from the website until the seller fixes it and sends it for review. The seller sees the reason and cannot relist it themselves.',
    reasonRequired: true,
    tone: 'warning',
  },
  RESTORE: {
    label: 'Restore',
    title: 'Lift the suspension?',
    description: 'The listing goes live on the website again.',
    reasonRequired: false,
    tone: 'success',
  },
  BLOCK: {
    label: 'Block',
    title: 'Block this listing?',
    description: 'For fraud, stolen or fake vehicles. It is hidden for good, the seller cannot edit, relist or delete it, and its vehicle and chassis numbers cannot be listed again while it is blocked.',
    reasonRequired: true,
    tone: 'danger',
  },
  UNBLOCK: {
    label: 'Unblock',
    title: 'Unblock this listing?',
    description: 'The block is lifted. The listing stays hidden (Unlisted) until it is relisted, and its vehicle can be listed again.',
    reasonRequired: false,
    tone: 'default',
  },
  REQUEST_REVIEW: {
    label: 'Send for review',
    title: 'Send this listing for review?',
    description: 'After fixing what the admin asked for, send it back. It goes live once an admin approves it.',
    reasonRequired: false,
    tone: 'success',
  },
};

export const LISTING_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  UNLISTED: { label: 'Unlisted', className: 'border-slate-300 bg-slate-100 text-slate-700' },
  SUSPENDED: { label: 'Suspended', className: 'border-amber-300 bg-amber-50 text-amber-800' },
  BLOCKED: { label: 'Blocked', className: 'border-red-300 bg-red-50 text-red-700' },
};

export const moderateListing = async (listingId: string, action: ListingVisibilityAction, reason: string, notify = true) => {
  const response = await api.patch<{ listing: { id: string; status: string; moderationReason: string | null; moderatedAt: string | null } }>(
    `/listings/${listingId}/moderation`,
    { action, reason, notify },
  );
  return response.data.listing;
};
