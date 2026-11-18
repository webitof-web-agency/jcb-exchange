export type SoldVehicleSourcePayment = { id: string; amount: number | string; receiptStatus: string | null };
export type SoldVehicleSourceRefund = { id: string; amount: number | string; status: string | null };

export type SoldVehicleSourceSnapshot = {
  id: string;
  recordNumber: string;
  listingId: string | null;
  rtoRecordId: string | null;
  purchaseAmount: number | string | null;
  sellAmount: number | string | null;
  expenses: number | string | null;
  balanceAmount: number | string | null;
  netProfit: number | string | null;
  netProfitAfterGst: number | string | null;
  payments: SoldVehicleSourcePayment[];
  refunds: SoldVehicleSourceRefund[];
};

type SoldVehicleDetailSnapshot = {
  deal?: Record<string, unknown> | null;
  payments?: { items?: Array<Record<string, unknown>> } | null;
  refunds?: { items?: Array<Record<string, unknown>> } | null;
  relationships?: { listingId?: unknown; rtoRecordId?: unknown } | null;
};

const numeric = (value: unknown) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

const same = (left: unknown, right: unknown) => {
  const leftNumber = numeric(left);
  const rightNumber = numeric(right);
  if (leftNumber !== null && rightNumber !== null) return Math.abs(leftNumber - rightNumber) < 0.01;
  return left === right;
};

const valueAt = (row: Record<string, unknown> | undefined, key: string) => row?.[key] ?? null;

export const compareSoldVehicleSource = ({ source, detail }: { source: SoldVehicleSourceSnapshot; detail: SoldVehicleDetailSnapshot }) => {
  const mismatches: string[] = [];
  const checked: Array<[string, unknown, unknown]> = [
    ['recordNumber', source.recordNumber, valueAt(detail.deal ?? undefined, 'recordNumber')],
    ['listingId', source.listingId, valueAt(detail.relationships as Record<string, unknown> | undefined, 'listingId')],
    ['rtoRecordId', source.rtoRecordId, valueAt(detail.relationships as Record<string, unknown> | undefined, 'rtoRecordId')],
    ['purchaseAmount', source.purchaseAmount, valueAt(detail.deal ?? undefined, 'purchaseAmount')],
    ['sellAmount', source.sellAmount, valueAt(detail.deal ?? undefined, 'sellAmount')],
    ['expenses', source.expenses, valueAt(detail.deal ?? undefined, 'expenses')],
    ['balanceAmount', source.balanceAmount, valueAt(detail.deal ?? undefined, 'balanceAmount')],
    ['netProfit', source.netProfit, valueAt(detail.deal ?? undefined, 'netProfit')],
    ['netProfitAfterGst', source.netProfitAfterGst, valueAt(detail.deal ?? undefined, 'netProfitAfterGst')],
  ];
  checked.forEach(([field, expected, actual]) => { if (!same(expected, actual)) mismatches.push(`${field}: source=${String(expected)} projection=${String(actual)}`); });

  const detailPayments = detail.payments?.items ?? [];
  if (source.payments.length !== detailPayments.length) mismatches.push(`payments.count: source=${source.payments.length} projection=${detailPayments.length}`);
  source.payments.forEach((payment) => {
    const actual = detailPayments.find((row) => row.id === payment.id);
    if (!actual) mismatches.push(`payments.${payment.id}: missing from projection`);
    else {
      if (!same(payment.amount, actual.amount)) mismatches.push(`payments.${payment.id}.amount`);
      if (!same(payment.receiptStatus, actual.receiptStatus)) mismatches.push(`payments.${payment.id}.receiptStatus`);
    }
  });

  const detailRefunds = detail.refunds?.items ?? [];
  if (source.refunds.length !== detailRefunds.length) mismatches.push(`refunds.count: source=${source.refunds.length} projection=${detailRefunds.length}`);
  source.refunds.forEach((refund) => {
    const actual = detailRefunds.find((row) => row.id === refund.id);
    if (!actual) mismatches.push(`refunds.${refund.id}: missing from projection`);
    else if (!same(refund.amount, actual.amount) || !same(refund.status, actual.status)) mismatches.push(`refunds.${refund.id}: amount/status mismatch`);
  });

  return {
    status: mismatches.length ? 'FAIL' as const : 'PASS' as const,
    checkedFieldCount: checked.length + 3 + 2,
    mismatchCount: mismatches.length,
    mismatches,
  };
};

export type Phase10GateStatus = 'PASS' | 'FAIL' | 'EXTERNAL' | 'NOT_RUN';
export type Phase10GateResult = { id: string; status: Phase10GateStatus; evidence: string };

export const PHASE10_REQUIRED_GATES = [
  'page_questions', 'database_comparison', 'financial_comparison', 'pdf_delivery',
  'communication_delivery', 'language', 'wrong_id_missing_data', 'permissions',
  'follow_up_context', 'connected_modules', 'failure_timeout', 'coverage_report',
] as const;

export const buildPhase10Report = (results: Phase10GateResult[]) => {
  const byId = new Map(results.map((result) => [result.id, result]));
  const unresolvedCriticalGates = PHASE10_REQUIRED_GATES.filter((id) => byId.get(id)?.status !== 'PASS');
  return {
    status: unresolvedCriticalGates.length ? 'INCOMPLETE' as const : 'COMPLETE' as const,
    requiredGateCount: PHASE10_REQUIRED_GATES.length,
    passedGateCount: PHASE10_REQUIRED_GATES.filter((id) => byId.get(id)?.status === 'PASS').length,
    unresolvedCriticalGates: [...unresolvedCriticalGates],
    results: PHASE10_REQUIRED_GATES.map((id) => byId.get(id) ?? { id, status: 'NOT_RUN' as const, evidence: 'No validation result recorded.' }),
  };
};
