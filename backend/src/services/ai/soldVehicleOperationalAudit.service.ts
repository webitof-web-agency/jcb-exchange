export type SoldVehicleAuditActor = { id: string; name: string | null; email: string | null; role: string | null };

type AuditStatusRow = {
  id?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  changedById?: string | null;
  createdAt?: string | Date | null;
};

type LockHistoryRow = {
  id?: string | null;
  action?: string | null;
  actorId?: string | null;
  reason?: string | null;
  createdAt?: string | Date | null;
};

type AuditPaymentRow = {
  id?: string | null;
  side?: string | null;
  amount?: number | null;
  paymentDate?: string | null;
  method?: string | null;
  reference?: string | null;
  drawnOn?: string | null;
  receiptStatus?: string | null;
  issuedById?: string | null;
  cancelledById?: string | null;
  createdById?: string | null;
  listingPaymentId?: string | null;
};

type AuditRefundRow = {
  id?: string | null;
  status?: string | null;
  amount?: number | null;
  forfeitAmount?: number | null;
  reason?: string | null;
  requestedById?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  rejectedById?: string | null;
  rejectedAt?: string | null;
  paidById?: string | null;
  paidAt?: string | null;
  method?: string | null;
  reference?: string | null;
  drawnOn?: string | null;
  note?: string | null;
};

type CommunicationRow = {
  id?: string | null;
  eventCode?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  recipientType?: string | null;
  recipientPhone?: string | null;
  status?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  outbox?: { attempts?: number | null; status?: string | null; processedAt?: string | null; lastError?: string | null } | null;
};

type ListingPaymentRow = {
  id: string;
  status: string | null;
  amount: number;
  method: string | null;
  transactionRef: string | null;
  submittedAt: string | null;
};

export type SoldVehicleOperationalAuditInput = {
  actors: SoldVehicleAuditActor[];
  statusHistory: AuditStatusRow[];
  lockHistory: LockHistoryRow[];
  currentLock: { isLocked: boolean; lockedAt: string | null; lockedById: string | null };
  payments: AuditPaymentRow[];
  refunds: AuditRefundRow[];
  dealNotes: { remarks: string | null; transferDetails: string | null; rtoNoteSheet?: string | null; financeNotes?: string | null; saleNotes?: string | null };
  communicationLogs: { whatsapp: CommunicationRow[]; sms: CommunicationRow[] };
  listingPayments: ListingPaymentRow[];
};

const actorFor = (actors: Map<string, SoldVehicleAuditActor>, id: string | null | undefined) => id ? actors.get(id) ?? null : null;
const iso = (value: string | Date | null | undefined) => value instanceof Date ? value.toISOString() : value ?? null;

const communicationSummary = (logs: CommunicationRow[]) => {
  const statuses = logs.map((log) => String(log.status || '').toUpperCase());
  return {
    total: logs.length,
    queued: statuses.filter((status) => status === 'QUEUED').length,
    sent: statuses.filter((status) => ['SENT', 'DELIVERED', 'READ'].includes(status)).length,
    delivered: statuses.filter((status) => ['DELIVERED', 'READ'].includes(status)).length,
    read: statuses.filter((status) => status === 'READ').length,
    failed: statuses.filter((status) => status === 'FAILED').length,
    skipped: statuses.filter((status) => status === 'SKIPPED').length,
  };
};

const safeCommunication = (log: CommunicationRow) => ({
  id: log.id ?? null,
  eventCode: log.eventCode ?? null,
  relatedEntityType: log.relatedEntityType ?? null,
  relatedEntityId: log.relatedEntityId ?? null,
  recipientType: log.recipientType ?? null,
  recipientPhone: log.recipientPhone ?? null,
  status: log.status ?? null,
  errorCode: log.errorCode ?? null,
  errorMessage: log.errorMessage ?? null,
  createdAt: log.createdAt ?? null,
  sentAt: log.sentAt ?? null,
  deliveredAt: log.deliveredAt ?? null,
  readAt: log.readAt ?? null,
  outbox: log.outbox ? { attempts: log.outbox.attempts ?? 0, status: log.outbox.status ?? null, processedAt: log.outbox.processedAt ?? null, lastError: log.outbox.lastError ?? null } : null,
});

/** Pure projection for the operational/audit part of one exact Sold Vehicle record. */
export const buildSoldVehicleOperationalAudit = (input: SoldVehicleOperationalAuditInput) => {
  const actors = new Map(input.actors.map((actor) => [actor.id, actor]));
  const warnings: string[] = [];
  const allActorIds = new Set<string>();
  input.statusHistory.forEach((row) => row.changedById && allActorIds.add(row.changedById));
  input.lockHistory.forEach((row) => row.actorId && allActorIds.add(row.actorId));
  input.payments.forEach((row) => [row.issuedById, row.cancelledById, row.createdById].forEach((id) => id && allActorIds.add(id)));
  input.refunds.forEach((row) => [row.requestedById, row.approvedById, row.rejectedById, row.paidById].forEach((id) => id && allActorIds.add(id)));
  for (const id of allActorIds) if (!actors.has(id)) warnings.push(`Audit actor ${id} is unavailable in the connected user records.`);

  const statusHistory = input.statusHistory.map((row) => ({
    id: row.id ?? null,
    oldStatus: row.oldStatus ?? null,
    newStatus: row.newStatus ?? null,
    reason: row.reason ?? null,
    changedById: row.changedById ?? null,
    changedBy: actorFor(actors, row.changedById),
    changedAt: iso(row.createdAt),
  }));
  const lockRows = input.lockHistory.length > 0
    ? input.lockHistory.map((row) => ({ row, historySource: 'LOCK_HISTORY' as const }))
    : input.currentLock.isLocked
      ? [{ row: { id: null, action: 'LOCK', actorId: input.currentLock.lockedById, reason: null, createdAt: input.currentLock.lockedAt }, historySource: 'CURRENT_RECORD_SNAPSHOT' as const }]
      : [];
  const lockHistory = lockRows.map(({ row, historySource }) => ({
    id: row.id ?? null,
    action: row.action ?? null,
    actorId: row.actorId ?? null,
    actor: actorFor(actors, row.actorId),
    reason: row.reason ?? null,
    changedAt: iso(row.createdAt),
    historySource,
  }));
  const refundApprovals = input.refunds.map((refund) => ({
    refundId: refund.id ?? null,
    status: refund.status ?? null,
    amount: refund.amount ?? 0,
    reason: refund.reason ?? null,
    requestedById: refund.requestedById ?? null,
    requestedBy: actorFor(actors, refund.requestedById),
    approvedById: refund.approvedById ?? null,
    approvedBy: actorFor(actors, refund.approvedById),
    approvedAt: refund.approvedAt ?? null,
    rejectedById: refund.rejectedById ?? null,
    rejectedBy: actorFor(actors, refund.rejectedById),
    rejectedAt: refund.rejectedAt ?? null,
    paidById: refund.paidById ?? null,
    paidBy: actorFor(actors, refund.paidById),
    paidAt: refund.paidAt ?? null,
  }));
  const bankDetails = {
    payments: input.payments.map((payment) => ({
      paymentId: payment.id ?? null,
      side: payment.side ?? null,
      amount: payment.amount ?? 0,
      paymentDate: payment.paymentDate ?? null,
      method: payment.method ?? null,
      reference: payment.reference ?? null,
      drawnOn: payment.drawnOn ?? null,
      receiptStatus: payment.receiptStatus ?? null,
      issuedBy: actorFor(actors, payment.issuedById),
      cancelledBy: actorFor(actors, payment.cancelledById),
    })),
    refunds: input.refunds.map((refund) => ({
      refundId: refund.id ?? null,
      amount: refund.amount ?? 0,
      method: refund.method ?? null,
      reference: refund.reference ?? null,
      drawnOn: refund.drawnOn ?? null,
      status: refund.status ?? null,
    })),
  };
  const allCommunications = [...input.communicationLogs.whatsapp, ...input.communicationLogs.sms];
  const receiptPaymentIds = new Set(input.payments.map((payment) => payment.listingPaymentId).filter(Boolean));
  // The exact read model passes listingPaymentId as a private bridge field on payment rows.
  const linkedReceiptRows = input.payments.filter((payment) => Boolean(payment.listingPaymentId));
  const linkedByListingId = new Map(linkedReceiptRows.map((payment) => [
    payment.listingPaymentId as string,
    payment,
  ]));
  const links = input.listingPayments.map((listingPayment) => {
    const receipt = linkedByListingId.get(listingPayment.id);
    return { listingPaymentId: listingPayment.id, receiptPaymentId: receipt?.id ?? null, matched: Boolean(receipt), listingPayment, receiptStatus: receipt?.receiptStatus ?? null };
  });
  const unmatchedListingPaymentIds = links.filter((link) => !link.matched).map((link) => link.listingPaymentId);
  const unmatchedReceiptPaymentIds = linkedReceiptRows
    .filter((payment) => !input.listingPayments.some((listingPayment) => listingPayment.id === payment.listingPaymentId))
    .map((payment) => payment.id).filter((id): id is string => Boolean(id));
  if (unmatchedListingPaymentIds.length) warnings.push(`${unmatchedListingPaymentIds.length} unmatched online advance/listing payment(s) have no linked Sold Vehicle receipt.`);
  if (unmatchedReceiptPaymentIds.length) warnings.push(`${unmatchedReceiptPaymentIds.length} unmatched Sold Vehicle receipt(s) have no matching online listing payment.`);

  return {
    statusHistory,
    lockHistory,
    currentLock: {
      isLocked: input.currentLock.isLocked,
      lockedAt: input.currentLock.lockedAt,
      lockedById: input.currentLock.lockedById,
      lockedBy: actorFor(actors, input.currentLock.lockedById),
    },
    refundApprovals,
    bankDetails,
    internalNotes: {
      dealRemarks: input.dealNotes.remarks,
      transferDetails: input.dealNotes.transferDetails,
      connectedNotes: { rtoNoteSheet: input.dealNotes.rtoNoteSheet ?? null, financeNotes: input.dealNotes.financeNotes ?? null, saleNotes: input.dealNotes.saleNotes ?? null },
      statusReasons: statusHistory.filter((row) => row.reason).map((row) => ({ status: row.newStatus, reason: row.reason, changedAt: row.changedAt, changedBy: row.changedBy })),
      refundNotes: input.refunds.filter((refund) => refund.note).map((refund) => ({ refundId: refund.id ?? null, note: refund.note, status: refund.status })),
    },
    communications: {
      whatsapp: input.communicationLogs.whatsapp.map(safeCommunication),
      sms: input.communicationLogs.sms.map(safeCommunication),
      summary: communicationSummary(allCommunications),
    },
    onlineAdvancePayments: {
      listingSubmissions: input.listingPayments,
      linkedReceipts: linkedReceiptRows.map((payment) => ({ receiptPaymentId: payment.id ?? null, listingPaymentId: payment.listingPaymentId ?? null })),
      links,
      unmatchedListingPaymentIds,
      unmatchedReceiptPaymentIds,
      linkedReceiptCount: receiptPaymentIds.size,
    },
    warnings,
  };
};

export type SoldVehicleOperationalAudit = ReturnType<typeof buildSoldVehicleOperationalAudit>;
