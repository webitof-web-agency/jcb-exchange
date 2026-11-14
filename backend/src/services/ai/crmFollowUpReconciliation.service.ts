export type CrmFollowUpReconciliationRow = {
  status: string;
  dueAt: string | Date | null;
  completedAt: string | Date | null;
  missedAt: string | Date | null;
  updatedAt: string | Date | null;
};

const toTime = (value: string | Date | null): number | null => {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

export const reconcileCrmFollowUps = (rows: readonly CrmFollowUpReconciliationRow[]) => {
  const conflicts = rows.filter((row) => (
    (row.status === 'DONE' && row.missedAt !== null)
    || (row.status === 'MISSED' && row.completedAt !== null)
  ));
  const doneLateCount = rows.filter((row) => {
    if (row.status !== 'DONE') return false;
    const dueAt = toTime(row.dueAt);
    const completedAt = toTime(row.completedAt);
    return dueAt !== null && completedAt !== null && completedAt > dueAt;
  }).length;
  return {
    conflictCount: conflicts.length,
    conflicts: conflicts.slice(0, 50),
    doneLateCount,
    rule: 'DONE aur MISSED ko ek saath active status nahi maana jata; contradictory records alag reconciliation queue me dikhte hain. DONE record due date ke baad complete hua ho to DONE_LATE maana jata hai, MISSED nahi.',
  };
};
