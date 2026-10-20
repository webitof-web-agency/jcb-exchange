/**
 * Ownership-transfer readiness check for an RTO record.
 *
 * Works from the validity fields already captured on the RTO record (prefilled from the
 * listing) and, when available, from an RC verification result. Every finding carries a
 * plain-language reason and the action needed, so staff know why a transfer would fail.
 */

export type ComplianceLevel = 'OK' | 'WARN' | 'BLOCK';
export type ComplianceSource = 'RECORD' | 'LISTING_VERIFICATION' | 'RC_API';

export type ComplianceCheck = {
  key: string;
  label: string;
  level: ComplianceLevel;
  message: string;
  action?: string | undefined;
  date?: string | null | undefined;
};

export type ComplianceRecordInput = {
  hirePurchaseStatus?: string | null;
  financerName?: string | null;
  taxStatus?: string | null;
  taxValidUntil?: Date | string | null;
  fitnessStatus?: string | null;
  fitnessValidUntil?: Date | string | null;
  insuranceStatus?: string | null;
  insuranceValidUntil?: Date | string | null;
  pucStatus?: string | null;
  pucValidUntil?: Date | string | null;
  hsrpStatus?: string | null;
};

export type ComplianceRcInput = Record<string, unknown>;

export type ComplianceContext = {
  sellerState?: string | null | undefined;
  purchaserState?: string | null | undefined;
  now?: Date | undefined;
  source?: ComplianceSource | undefined;
};

export type ComplianceSuggestion = Partial<{
  taxStatus: string;
  taxValidUntil: string;
  insuranceStatus: string;
  insuranceValidUntil: string;
  fitnessStatus: string;
  fitnessValidUntil: string;
  pucStatus: string;
  pucValidUntil: string;
  hirePurchaseStatus: string;
  financerName: string;
}>;

export type ComplianceResult = {
  checkedAt: string;
  source: ComplianceSource;
  canTransfer: boolean;
  blockers: ComplianceCheck[];
  warnings: ComplianceCheck[];
  checks: ComplianceCheck[];
  suggested: ComplianceSuggestion;
  expiredDocuments: string[];
};

const EXPIRY_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

const displayDay = (value: Date | null) => {
  if (!value) return '';
  const day = isoDay(value) || '';
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
};

const startOfDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const daysUntil = (date: Date, now: Date) => Math.floor((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);

const isNegativeFlag = (value: unknown) => {
  const normalized = text(value).toLowerCase();
  return !normalized || ['na', 'n/a', 'no', 'none', 'nil', 'false', '0', 'not blacklisted', '-'].includes(normalized);
};

type ValidityRule = {
  key: string;
  label: string;
  // Documents that must be valid on the day of transfer. Optional ones only warn.
  blocking: boolean;
  expiredAction: string;
};

const validityRules: Record<'TAX' | 'INSURANCE' | 'PUC' | 'FITNESS', ValidityRule> = {
  TAX: {
    key: 'TAX',
    label: 'Road Tax',
    blocking: true,
    expiredAction: 'Get pending road tax paid by the 1st owner and collect the tax receipt before filing transfer.',
  },
  INSURANCE: {
    key: 'INSURANCE',
    label: 'Insurance',
    blocking: true,
    expiredAction: 'Renew the policy in the 1st owner\'s name (or a fresh policy) — RTO rejects Form 29/30 without valid insurance.',
  },
  PUC: {
    key: 'PUC',
    label: 'PUC',
    blocking: true,
    expiredAction: 'Get a fresh PUC certificate before the vehicle is presented for transfer.',
  },
  FITNESS: {
    key: 'FITNESS',
    label: 'Fitness',
    blocking: false,
    expiredAction: 'Renew the fitness certificate if this is a transport/commercial vehicle; otherwise mark it Not Required.',
  },
};

const evaluateValidity = (
  rule: ValidityRule,
  status: string,
  validUntil: Date | null,
  now: Date,
): ComplianceCheck => {
  const normalized = status.toUpperCase();
  if (normalized === 'LIFETIME') {
    return { key: rule.key, label: rule.label, level: 'OK', message: `${rule.label} is lifetime / one-time paid.` };
  }
  if (normalized === 'NOT_APPLICABLE') {
    return { key: rule.key, label: rule.label, level: 'OK', message: `${rule.label} is not applicable for this vehicle.` };
  }
  if (normalized === 'EXPIRED' || (validUntil && daysUntil(validUntil, now) < 0)) {
    const since = validUntil ? ` on ${displayDay(validUntil)}` : '';
    return {
      key: rule.key,
      label: rule.label,
      level: rule.blocking ? 'BLOCK' : 'WARN',
      message: `${rule.label} expired${since}. ${rule.blocking ? 'Ownership transfer will be rejected until it is renewed.' : 'Renewal may be required by the RTO.'}`,
      action: rule.expiredAction,
      date: isoDay(validUntil),
    };
  }
  if (!validUntil) {
    return {
      key: rule.key,
      label: rule.label,
      level: 'WARN',
      message: `${rule.label} validity date is not recorded. Verify the original document before filing transfer.`,
      action: `Enter the ${rule.label.toLowerCase()} valid-until date or fetch it from the RC API.`,
    };
  }
  const remainingDays = daysUntil(validUntil, now);
  if (remainingDays <= EXPIRY_WARNING_DAYS) {
    return {
      key: rule.key,
      label: rule.label,
      level: 'WARN',
      message: `${rule.label} expires on ${displayDay(validUntil)} (${remainingDays} day${remainingDays === 1 ? '' : 's'} left). It may lapse before the transfer is approved.`,
      action: `Renew ${rule.label.toLowerCase()} early or complete the transfer before ${displayDay(validUntil)}.`,
      date: isoDay(validUntil),
    };
  }
  return { key: rule.key, label: rule.label, level: 'OK', message: `${rule.label} valid until ${displayDay(validUntil)}.`, date: isoDay(validUntil) };
};

const latestDate = (...values: unknown[]) => values.map(toDate).filter((value): value is Date => Boolean(value))
  .sort((left, right) => right.getTime() - left.getTime())[0] || null;

export const evaluateRtoTransferCompliance = (
  record: ComplianceRecordInput,
  rc: ComplianceRcInput | null = null,
  context: ComplianceContext = {},
): ComplianceResult => {
  const now = context.now || new Date();
  const checks: ComplianceCheck[] = [];
  const suggested: ComplianceSuggestion = {};

  // RC API dates are authoritative when present; otherwise use what is saved on the record.
  const rcTax = rc ? latestDate(rc.taxUpto, rc.taxPaidUpto) : null;
  const rcInsurance = rc ? toDate(rc.insuranceUpto) : null;
  const rcFitness = rc ? toDate(rc.fitUpTo) : null;
  const rcPuc = rc ? toDate(rc.puccUpto) : null;

  const validityInputs: Array<[keyof typeof validityRules, string, Date | null, Date | null, keyof ComplianceSuggestion, keyof ComplianceSuggestion]> = [
    ['TAX', text(record.taxStatus), toDate(record.taxValidUntil), rcTax, 'taxStatus', 'taxValidUntil'],
    ['INSURANCE', text(record.insuranceStatus), toDate(record.insuranceValidUntil), rcInsurance, 'insuranceStatus', 'insuranceValidUntil'],
    ['PUC', text(record.pucStatus), toDate(record.pucValidUntil), rcPuc, 'pucStatus', 'pucValidUntil'],
    ['FITNESS', text(record.fitnessStatus), toDate(record.fitnessValidUntil), rcFitness, 'fitnessStatus', 'fitnessValidUntil'],
  ];

  for (const [ruleKey, recordStatus, recordDate, rcDate, statusKey, dateKey] of validityInputs) {
    if (rcDate) {
      const rcStatus = daysUntil(rcDate, now) < 0 ? 'EXPIRED' : 'VALID';
      checks.push(evaluateValidity(validityRules[ruleKey], rcStatus, rcDate, now));
      suggested[statusKey] = rcStatus;
      const rcDay = isoDay(rcDate);
      if (rcStatus === 'VALID' && rcDay) suggested[dateKey] = rcDay;
    } else {
      checks.push(evaluateValidity(validityRules[ruleKey], recordStatus, recordStatus.toUpperCase() === 'VALID' ? recordDate : null, now));
    }
  }

  const rcFinancer = rc ? text(rc.financer) : '';
  const rcFinanced = rc?.financed === true || Boolean(rcFinancer);
  const hirePurchase = text(record.hirePurchaseStatus).toUpperCase();
  const financerName = rcFinancer || text(record.financerName);
  if (rcFinanced || hirePurchase === 'ACTIVE') {
    checks.push({
      key: 'HYPOTHECATION',
      label: 'Hypothecation / Loan',
      level: 'BLOCK',
      message: `Vehicle is hypothecated${financerName ? ` to ${financerName}` : ''}. RTO will not transfer ownership while the loan endorsement is on the RC.`,
      action: 'Collect the bank NOC + Form 35 from the 1st owner and get hypothecation terminated before transfer.',
    });
    if (rc) {
      suggested.hirePurchaseStatus = 'ACTIVE';
      if (rcFinancer) suggested.financerName = rcFinancer;
    }
  } else if (hirePurchase === 'PENDING' && !rc) {
    checks.push({
      key: 'HYPOTHECATION',
      label: 'Hypothecation / Loan',
      level: 'WARN',
      message: 'Hypothecation status is not confirmed yet.',
      action: 'Confirm from the RC (or RC API) whether a loan is endorsed on the vehicle.',
    });
  } else {
    checks.push({ key: 'HYPOTHECATION', label: 'Hypothecation / Loan', level: 'OK', message: 'No active hypothecation recorded.' });
    if (rc && hirePurchase !== 'TERMINATED') suggested.hirePurchaseStatus = 'NOT_APPLICABLE';
  }

  if (rc) {
    const rcStatus = text(rc.rcStatus);
    if (rcStatus && rcStatus.toUpperCase() !== 'ACTIVE') {
      checks.push({
        key: 'RC_STATUS',
        label: 'RC Status',
        level: 'BLOCK',
        message: `RC status is "${rcStatus}". Only an ACTIVE registration can be transferred.`,
        action: 'Resolve the RC status (suspension / cancellation) with the registering RTO first.',
      });
    } else if (rcStatus) {
      checks.push({ key: 'RC_STATUS', label: 'RC Status', level: 'OK', message: 'RC is ACTIVE.' });
    }

    if (!isNegativeFlag(rc.blacklistStatus)) {
      checks.push({
        key: 'BLACKLIST',
        label: 'Blacklist',
        level: 'BLOCK',
        message: `Vehicle is blacklisted (${text(rc.blacklistStatus)}). Transfer is blocked by the RTO.`,
        action: 'Get the blacklist cleared (pending tax, court or police case) before proceeding.',
      });
    }

    const registrationUpto = toDate(rc.registrationUpto);
    if (registrationUpto && daysUntil(registrationUpto, now) < 0) {
      checks.push({
        key: 'RC_VALIDITY',
        label: 'Registration Validity',
        level: 'BLOCK',
        message: `Registration validity ended on ${displayDay(registrationUpto)}.`,
        action: 'Get the registration renewed by the 1st owner before transfer.',
        date: isoDay(registrationUpto),
      });
    }

    if (!isNegativeFlag(rc.nonUseStatus)) {
      checks.push({
        key: 'NON_USE',
        label: 'Non-use declaration',
        level: 'WARN',
        message: `RC shows a non-use declaration (${text(rc.nonUseStatus)}).`,
        action: 'Revoke the non-use declaration and settle tax for that period.',
      });
    }

    const challans = Array.isArray(rc.challanDetails) ? rc.challanDetails.length : 0;
    if (challans > 0) {
      checks.push({
        key: 'CHALLAN',
        label: 'Pending Challans',
        level: 'WARN',
        message: `${challans} challan record(s) found on this vehicle. Many RTOs hold transfer until they are cleared.`,
        action: 'Get the 1st owner to clear pending challans and keep the receipts.',
      });
    }
  }

  const sellerState = text(context.sellerState).toLowerCase();
  const purchaserState = text(context.purchaserState).toLowerCase();
  if (sellerState && purchaserState && sellerState !== purchaserState) {
    checks.push({
      key: 'INTER_STATE',
      label: 'Inter-state transfer',
      level: 'WARN',
      message: `Vehicle moves from ${context.sellerState} to ${context.purchaserState}.`,
      action: 'Obtain the RTO NOC (Form 28) from the original RTO and plan re-registration in the new state.',
    });
  }

  if (text(record.hsrpStatus).toUpperCase() === 'NO') {
    checks.push({
      key: 'HSRP',
      label: 'HSRP',
      level: 'WARN',
      message: 'High Security Registration Plate is not fitted.',
      action: 'Book HSRP fitment — several states require it before transfer.',
    });
  }

  const blockers = checks.filter((check) => check.level === 'BLOCK');
  const warnings = checks.filter((check) => check.level === 'WARN');
  const expiredDocuments = checks
    .filter((check) => ['TAX', 'INSURANCE', 'PUC', 'FITNESS'].includes(check.key) && check.message.includes('expired'))
    .map((check) => check.key);

  return {
    checkedAt: now.toISOString(),
    source: context.source || (rc ? 'RC_API' : 'RECORD'),
    canTransfer: blockers.length === 0,
    blockers,
    warnings,
    checks,
    suggested,
    expiredDocuments,
  };
};
