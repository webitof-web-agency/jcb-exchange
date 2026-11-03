// Shared shape of a "what happens if I delete this?" answer. The admin portal shows it before any
// permanent delete, with a checkbox per item, and the delete endpoints recompute it inside their
// transaction so the answer shown and the rules applied are the same.
//
//   DELETED   goes with the record and cannot be kept; the person must tick it before deleting
//   OPTIONAL  the person's choice: ticked it is removed too, left unticked it is kept
//   UNLINKED  kept, but no longer linked (an assignee or reviewer becomes empty, a link is cleared)
//   BLOCKS    money, legal or audit history that is never deleted; the record cannot be deleted while it exists

export type DeletionGroupAction = 'DELETED' | 'OPTIONAL' | 'UNLINKED' | 'BLOCKS';

export type DeletionGroup = {
  key: string;
  label: string;
  count: number;
  action: DeletionGroupAction;
  note?: string;
  /** OPTIONAL only: ticked when the dialog opens. */
  defaultSelected?: boolean;
};

export type DeletionAlternative = {
  /** User status (INACTIVE, SUSPENDED, BLOCKED, CLOSED) or listing status (PAUSED, REJECTED). */
  status: string;
  label: string;
  description: string;
};

export type DeletionImpact = {
  entityType: 'CUSTOMER' | 'STAFF' | 'PARTNER' | 'LISTING' | 'SOLD_VEHICLE' | 'RTO_RECORD';
  entityId: string;
  name: string;
  subtitle: string;
  currentStatus: string;
  groups: DeletionGroup[];
  blockers: string[];
  /** DELETED group keys that have rows; each must be ticked for the delete to go ahead. */
  requiredSelections: string[];
  canDelete: boolean;
  /** Whether the viewer may permanently delete (the record may still be blocked). */
  viewerCanDelete: boolean;
  viewerDeleteNote: string | null;
  alternatives: DeletionAlternative[];
  confirmationWord: string;
};

export const DELETE_CONFIRMATION_WORD = 'DELETE';

export class DeletionBlockedError extends Error {
  readonly statusCode = 409;
  readonly code = 'DELETE_BLOCKED';

  constructor(message: string, readonly impact: DeletionImpact | null = null) {
    super(message);
    this.name = 'DeletionBlockedError';
  }
}

export const group = (
  key: string,
  label: string,
  count: number,
  action: DeletionGroupAction,
  note?: string,
  options: { defaultSelected?: boolean } = {},
): DeletionGroup => ({
  key,
  label,
  count,
  action,
  ...(note ? { note } : {}),
  ...(action === 'OPTIONAL' && options.defaultSelected ? { defaultSelected: true } : {}),
});

/** Drops empty groups and works out what stops the delete. */
export const finishImpact = (
  base: Omit<DeletionImpact, 'groups' | 'blockers' | 'requiredSelections' | 'canDelete' | 'confirmationWord'>,
  groups: DeletionGroup[],
): DeletionImpact => {
  const visible = groups.filter((item) => item.count > 0);
  const blockers = visible.filter((item) => item.action === 'BLOCKS').map((item) => `${item.label} (${item.count})`);
  return {
    ...base,
    groups: visible,
    blockers,
    requiredSelections: visible.filter((item) => item.action === 'DELETED').map((item) => item.key),
    canDelete: blockers.length === 0,
    confirmationWord: DELETE_CONFIRMATION_WORD,
  };
};

/**
 * Checks a delete request against a freshly computed impact. Throws when the record is blocked,
 * when a DELETED group with rows was not ticked, or when the confirmation or reason is missing.
 * The returned `include` says which OPTIONAL groups the person chose to remove.
 */
export const assertDeleteRequest = (
  impact: DeletionImpact,
  request: { include?: unknown; confirmation?: unknown; reason?: unknown },
  options: { requireReason: boolean },
) => {
  if (!impact.canDelete) {
    throw new DeletionBlockedError(
      `This cannot be permanently deleted because it still has: ${impact.blockers.join(', ')}. ${impact.alternatives.length ? 'Use one of the other options instead.' : ''}`.trim(),
      impact,
    );
  }
  const include = new Set(Array.isArray(request.include) ? request.include.map(String) : []);
  const missing = impact.groups.filter((item) => item.action === 'DELETED' && !include.has(item.key));
  if (missing.length) {
    throw new DeletionBlockedError(
      `Tick ${missing.map((item) => `"${item.label}"`).join(' and ')} to confirm they are deleted too, or choose another option instead.`,
      impact,
    );
  }
  if (String(request.confirmation || '').trim().toUpperCase() !== DELETE_CONFIRMATION_WORD) {
    throw new DeletionBlockedError('Tick the box to confirm the permanent delete.', impact);
  }
  const reason = String(request.reason || '').trim();
  if (options.requireReason && reason.length < 5) {
    throw new DeletionBlockedError('Enter the reason for this delete (at least 5 characters).', impact);
  }
  return { include, reason };
};
