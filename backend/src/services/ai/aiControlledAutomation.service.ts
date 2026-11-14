import { createHash, randomUUID } from 'node:crypto';
import prisma from '../../lib/prisma';
import { redactSensitiveData } from './aiRedaction';

export const CONTROLLED_ACTION_TYPES = [
  'PARTNER_KYC_DECISION',
  'ACCOUNT_STATUS_CHANGE',
  'PAYMENT_REVIEW',
  'PAYMENT_REFUND',
  'WHATSAPP_SEND',
  'LEAD_ASSIGNMENT',
  'LISTING_STATUS_CHANGE',
  'PASSWORD_RESET',
  'FINANCIAL_ACTION',
] as const;

export type ControlledActionType = typeof CONTROLLED_ACTION_TYPES[number];
export type ControlledActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'EXECUTING' | 'EXECUTION_FAILED' | 'EXECUTED';
export type ControlledActionDecision = 'APPROVE' | 'REJECT' | 'EXECUTE';

export type ControlledActionDefinition = {
  type: ControlledActionType;
  label: string;
  targetType: string;
  requiredPermissions: string[];
  requiresHumanApproval: true;
  executorConfigured: boolean;
};

const DEFINITIONS: Record<ControlledActionType, ControlledActionDefinition> = {
  PARTNER_KYC_DECISION: {
    type: 'PARTNER_KYC_DECISION',
    label: 'Partner approve / reject / request changes',
    targetType: 'PARTNER',
    requiredPermissions: ['kyc.manage'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
  ACCOUNT_STATUS_CHANGE: {
    type: 'ACCOUNT_STATUS_CHANGE',
    label: 'Account activate / deactivate',
    targetType: 'USER',
    requiredPermissions: ['users.update', 'partners.change_status'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
  PAYMENT_REVIEW: {
    type: 'PAYMENT_REVIEW',
    label: 'Payment approve / reject',
    targetType: 'LISTING_PAYMENT_SUBMISSION',
    requiredPermissions: ['listings.verify_payment', 'listings.approve'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
  PAYMENT_REFUND: {
    type: 'PAYMENT_REFUND',
    label: 'Payment refund',
    targetType: 'SELL_ACCOUNT_REFUND',
    requiredPermissions: ['accounts.sell.refund.approve'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
  WHATSAPP_SEND: {
    type: 'WHATSAPP_SEND',
    label: 'WhatsApp send',
    targetType: 'CRM_LEAD',
    requiredPermissions: ['enquiries.manage', 'crm.leads.manage'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
  LEAD_ASSIGNMENT: {
    type: 'LEAD_ASSIGNMENT',
    label: 'Lead assignment',
    targetType: 'CRM_LEAD',
    requiredPermissions: ['crm.leads.assign', 'enquiries.manage'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
  LISTING_STATUS_CHANGE: {
    type: 'LISTING_STATUS_CHANGE',
    label: 'Listing publish / unpublish',
    targetType: 'LISTING',
    requiredPermissions: ['listings.approve'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
  PASSWORD_RESET: {
    type: 'PASSWORD_RESET',
    label: 'Password reset',
    targetType: 'USER',
    requiredPermissions: ['users.update'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
  FINANCIAL_ACTION: {
    type: 'FINANCIAL_ACTION',
    label: 'Financial action',
    targetType: 'FINANCIAL_RECORD',
    requiredPermissions: ['finance.manage'],
    requiresHumanApproval: true,
    executorConfigured: false,
  },
};

const configuredExecutorTypes = new Set<ControlledActionType>();

const SECRET_KEY_PATTERN = /password|passcode|secret|token|api.?key|private.?key|bank|account.?number|ifsc|otp|card|cvv/iu;
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u;
const MAX_PAYLOAD_LENGTH = 10_000;
const MAX_REASON_LENGTH = 2_000;

export class ControlledAutomationError extends Error {
  constructor(message: string, public readonly code = 'CONTROLLED_AUTOMATION_ERROR', public readonly statusCode = 400) {
    super(message);
    this.name = 'ControlledAutomationError';
  }
}

export const getControlledActionDefinition = (actionType: string): ControlledActionDefinition => {
  const definition = DEFINITIONS[actionType as ControlledActionType];
  if (!definition) throw new ControlledAutomationError('The requested action is not allowlisted.', 'CONTROLLED_ACTION_NOT_ALLOWLISTED', 400);
  return { ...definition, executorConfigured: configuredExecutorTypes.has(definition.type) };
};

export const listControlledActionDefinitions = () => CONTROLLED_ACTION_TYPES.map((type) => getControlledActionDefinition(type));

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeValue = (value: unknown, keyPath: string): unknown => {
  if (SECRET_KEY_PATTERN.test(keyPath)) {
    throw new ControlledAutomationError('Sensitive values cannot be included in an AI action proposal.', 'CONTROLLED_ACTION_SENSITIVE_PAYLOAD', 400);
  }
  if (typeof value === 'string') return redactSensitiveData(value.trim()).slice(0, MAX_REASON_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item, index) => normalizeValue(item, `${keyPath}.${index}`));
  if (isPlainObject(value)) {
    return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
      if (key.length > 80) throw new ControlledAutomationError('Action payload contains an invalid field name.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
      result[key] = normalizeValue(value[key], `${keyPath}.${key}`);
      return result;
    }, {});
  }
  throw new ControlledAutomationError('Action payload contains an unsupported value.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
};

const requireText = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) throw new ControlledAutomationError(`Action payload requires ${key}.`, 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
  return value.trim();
};

const validateActionPayload = (actionType: ControlledActionType, payload: Record<string, unknown>) => {
  const allowedKeys: Record<ControlledActionType, string[]> = {
    PARTNER_KYC_DECISION: ['status', 'reason'],
    ACCOUNT_STATUS_CHANGE: ['status', 'reason'],
    PAYMENT_REVIEW: ['status', 'reason'],
    PAYMENT_REFUND: ['reason'],
    WHATSAPP_SEND: ['templateId', 'reason'],
    LEAD_ASSIGNMENT: ['ownerId', 'reason'],
    LISTING_STATUS_CHANGE: ['status', 'reason'],
    PASSWORD_RESET: [],
    FINANCIAL_ACTION: ['operation', 'reason'],
  };
  const unknownKeys = Object.keys(payload).filter((key) => !allowedKeys[actionType].includes(key));
  if (unknownKeys.length) throw new ControlledAutomationError(`Unsupported action field: ${unknownKeys[0]}.`, 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);

  const status = typeof payload.status === 'string' ? payload.status.toUpperCase() : '';
  if (actionType === 'PARTNER_KYC_DECISION' && !['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(status)) {
    throw new ControlledAutomationError('Partner KYC decision must be APPROVED, REJECTED, or CHANGES_REQUESTED.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
  }
  if (actionType === 'ACCOUNT_STATUS_CHANGE' && !['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
    throw new ControlledAutomationError('Account status is invalid.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
  }
  if (actionType === 'PAYMENT_REVIEW' && !['APPROVED', 'REJECTED'].includes(status)) {
    throw new ControlledAutomationError('Payment review status is invalid.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
  }
  if (actionType === 'LISTING_STATUS_CHANGE' && !['PUBLISHED', 'CHANGES_REQUESTED', 'UNLISTED'].includes(status)) {
    throw new ControlledAutomationError('Listing status is invalid.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
  }
  if (actionType === 'WHATSAPP_SEND') requireText(payload, 'templateId');
  if (actionType === 'LEAD_ASSIGNMENT') {
    const ownerId = requireText(payload, 'ownerId');
    if (!IDENTIFIER_PATTERN.test(ownerId)) throw new ControlledAutomationError('Lead owner ID is invalid.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
  }
  if (actionType === 'FINANCIAL_ACTION') requireText(payload, 'operation');
  if (['PARTNER_KYC_DECISION', 'ACCOUNT_STATUS_CHANGE', 'PAYMENT_REVIEW', 'LISTING_STATUS_CHANGE'].includes(actionType) && payload.reason !== undefined) {
    if (typeof payload.reason !== 'string' || payload.reason.trim().length > MAX_REASON_LENGTH) {
      throw new ControlledAutomationError('Action reason is invalid.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
    }
  }
};

export const normalizeControlledActionPayload = (actionType: string, payload: unknown) => {
  const definition = getControlledActionDefinition(actionType);
  if (!isPlainObject(payload)) throw new ControlledAutomationError('Action payload must be an object.', 'CONTROLLED_ACTION_PAYLOAD_INVALID', 400);
  const normalized = normalizeValue(payload, definition.type) as Record<string, unknown>;
  validateActionPayload(definition.type, normalized);
  const text = JSON.stringify(normalized);
  if (text.length > MAX_PAYLOAD_LENGTH) throw new ControlledAutomationError('Action payload is too large.', 'CONTROLLED_ACTION_PAYLOAD_TOO_LARGE', 400);
  return { value: normalized, text, hash: createHash('sha256').update(text, 'utf8').digest('hex') };
};

export const controlledActionTransition = (status: string, decision: ControlledActionDecision): ControlledActionStatus => {
  const current = status.toUpperCase() as ControlledActionStatus;
  if (decision === 'APPROVE' || decision === 'REJECT') {
    if (current !== 'PENDING') throw new ControlledAutomationError('Only a pending proposal can be reviewed.', 'CONTROLLED_ACTION_NOT_PENDING', 409);
    return decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  }
  if (decision === 'EXECUTE') {
    if (current === 'EXECUTED') throw new ControlledAutomationError('This action has already been executed.', 'CONTROLLED_ACTION_ALREADY_EXECUTED', 409);
    if (current !== 'APPROVED' && current !== 'EXECUTION_FAILED') throw new ControlledAutomationError('Only an approved proposal can be executed.', 'CONTROLLED_ACTION_NOT_APPROVED', 409);
    return 'EXECUTING';
  }
  throw new ControlledAutomationError('Unsupported action transition.', 'CONTROLLED_ACTION_TRANSITION_INVALID', 400);
};

const safeReason = (reason: unknown) => (typeof reason === 'string' ? redactSensitiveData(reason.trim()).slice(0, MAX_REASON_LENGTH) : '');
const safeTargetRef = (targetRef: string) => {
  const normalized = targetRef.trim();
  if (!normalized || normalized.length > 160 || !IDENTIFIER_PATTERN.test(normalized)) {
    throw new ControlledAutomationError('Action target reference is invalid.', 'CONTROLLED_ACTION_TARGET_INVALID', 400);
  }
  return normalized;
};
const auditAction = (actorUserId: string, proposalId: string, action: string, afterJson: Record<string, unknown>) => prisma.auditLog.create({
  data: {
    actorUserId,
    entityType: 'AI_ACTION_PROPOSAL',
    entityId: proposalId,
    action,
    afterJson: afterJson as any,
  },
});

export type ControlledProposalView = {
  id: string;
  actionType: string;
  actionLabel: string;
  targetType: string;
  targetRef: string;
  payload: Record<string, unknown>;
  status: string;
  expiresAt: string;
  createdAt: string;
  requestedBy: { id: string; name: string | null; role: string };
  approvals: Array<{ id: string; approverUserId: string; decision: string; reason: string | null; createdAt: string }>;
  execution: { configured: boolean; executedAt: string | null; errorCode: string | null };
};

const toProposalView = (proposal: any): ControlledProposalView => {
  const definition = getControlledActionDefinition(String(proposal.actionType));
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(proposal.payloadRedacted || '{}'));
    if (isPlainObject(parsed)) payload = parsed;
  } catch {
    payload = {};
  }
  return {
    id: proposal.id,
    actionType: proposal.actionType,
    actionLabel: definition.label,
    targetType: proposal.targetType,
    targetRef: proposal.targetRef,
    payload,
    status: proposal.status,
    expiresAt: new Date(proposal.expiresAt).toISOString(),
    createdAt: new Date(proposal.createdAt).toISOString(),
    requestedBy: {
      id: proposal.requestedBy?.id || proposal.requestedById,
      name: proposal.requestedBy?.name || null,
      role: proposal.requestedBy?.role || 'UNKNOWN',
    },
    approvals: (proposal.approvals || []).map((approval: any) => ({
      id: approval.id,
      approverUserId: approval.approverUserId,
      decision: approval.decision,
      reason: approval.reasonRedacted || null,
      createdAt: new Date(approval.createdAt).toISOString(),
    })),
    execution: {
      configured: definition.executorConfigured,
      executedAt: proposal.executedAt ? new Date(proposal.executedAt).toISOString() : null,
      errorCode: proposal.executionErrorCode || null,
    },
  };
};

export const createControlledActionProposal = async (input: {
  actorUserId: string;
  runId?: string;
  actionType: string;
  targetType: string;
  targetRef: string;
  payload: unknown;
  expiresAt?: Date;
  idempotencyKey?: string;
}) => {
  const definition = getControlledActionDefinition(input.actionType);
  if (input.targetType !== definition.targetType) throw new ControlledAutomationError('Action target type does not match the allowlisted action.', 'CONTROLLED_ACTION_TARGET_TYPE_INVALID', 400);
  const targetRef = safeTargetRef(input.targetRef);
  const payload = normalizeControlledActionPayload(definition.type, input.payload);
  const now = new Date();
  const expiresAt = input.expiresAt || new Date(now.getTime() + 30 * 60 * 1000);
  if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    throw new ControlledAutomationError('Proposal expiry must be between now and 24 hours.', 'CONTROLLED_ACTION_EXPIRY_INVALID', 400);
  }
  const idempotencyKey = input.idempotencyKey?.trim();
  if (idempotencyKey && (idempotencyKey.length > 180 || !IDENTIFIER_PATTERN.test(idempotencyKey))) {
    throw new ControlledAutomationError('Idempotency key is invalid.', 'CONTROLLED_ACTION_IDEMPOTENCY_INVALID', 400);
  }

  const existing = idempotencyKey
    ? await (prisma as any).aiActionProposal.findUnique({ where: { idempotencyKey }, include: { requestedBy: true, approvals: true } })
    : null;
  if (existing) {
    if (existing.requestedById !== input.actorUserId) {
      throw new ControlledAutomationError('This idempotency key belongs to another operator.', 'CONTROLLED_ACTION_IDEMPOTENCY_CONFLICT', 409);
    }
    return toProposalView(existing);
  }

  if (input.runId) {
    const run = await prisma.aiRun.findFirst({ where: { id: input.runId, actorUserId: input.actorUserId }, select: { id: true } });
    if (!run) throw new ControlledAutomationError('AI run provenance is invalid.', 'CONTROLLED_ACTION_RUN_INVALID', 400);
  }

  const runId = input.runId || (await prisma.aiRun.create({
    data: {
      requestId: `controlled-action:${randomUUID()}`,
      actorUserId: input.actorUserId,
      feature: 'controlled_action_suggestion',
      provider: 'internal',
      modelAlias: 'human-reviewed',
      status: 'SUCCEEDED',
      promptHash: payload.hash,
      responseHash: payload.hash,
      inputChars: payload.text.length,
      outputChars: payload.text.length,
      completedAt: now,
    },
    select: { id: true },
  })).id;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const txAny = tx as any;
      const proposal = await txAny.aiActionProposal.create({
        data: {
          runId,
          requestedById: input.actorUserId,
          actionType: definition.type,
          targetType: definition.targetType,
          targetRef,
          payloadHash: payload.hash,
          payloadRedacted: payload.text,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          expiresAt,
        },
        include: { requestedBy: { select: { id: true, name: true, role: true } }, approvals: true },
      });
      await txAny.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          entityType: 'AI_ACTION_PROPOSAL',
          entityId: proposal.id,
          action: 'AI_ACTION_PROPOSED',
          afterJson: { actionType: definition.type, targetType: definition.targetType, targetRef, status: 'PENDING' },
        },
      });
      return proposal;
    });
    return toProposalView(created);
  } catch (error: any) {
    if (error?.code === 'P2002' && idempotencyKey) {
      const duplicate = await (prisma as any).aiActionProposal.findUnique({ where: { idempotencyKey }, include: { requestedBy: true, approvals: true } });
      if (duplicate) return toProposalView(duplicate);
    }
    throw error;
  }
};

export const listControlledActionProposals = async (input: { status?: string; take?: number }): Promise<ControlledProposalView[]> => {
  const status = input.status?.trim().toUpperCase();
  if (status && !['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'EXECUTING', 'EXECUTION_FAILED', 'EXECUTED'].includes(status)) {
    throw new ControlledAutomationError('Proposal status is invalid.', 'CONTROLLED_ACTION_STATUS_INVALID', 400);
  }
  const proposals = await (prisma as any).aiActionProposal.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(input.take || 50, 1), 100),
    include: {
      requestedBy: { select: { id: true, name: true, role: true } },
      approvals: { orderBy: { createdAt: 'desc' } },
    },
  });
  return proposals.map(toProposalView);
};

export const getControlledActionProposal = async (proposalId: string) => {
  const proposal = await (prisma as any).aiActionProposal.findUnique({
    where: { id: proposalId },
    include: {
      requestedBy: { select: { id: true, name: true, role: true } },
      approvals: { orderBy: { createdAt: 'desc' } },
    },
  });
  return proposal ? toProposalView(proposal) : null;
};

export const reviewControlledActionProposal = async (input: {
  proposalId: string;
  reviewerUserId: string;
  reviewerRole: string;
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}) => {
  const proposal = await (prisma as any).aiActionProposal.findUnique({ where: { id: input.proposalId }, include: { requestedBy: true, approvals: true } });
  if (!proposal) throw new ControlledAutomationError('Action proposal not found.', 'CONTROLLED_ACTION_NOT_FOUND', 404);
  const definition = getControlledActionDefinition(proposal.actionType);
  if (proposal.requestedById === input.reviewerUserId && input.reviewerRole !== 'SUPER_ADMIN') {
    throw new ControlledAutomationError('A different employee must review this high-risk action.', 'CONTROLLED_ACTION_MAKER_CHECKER_REQUIRED', 409);
  }
  if (new Date(proposal.expiresAt).getTime() <= Date.now() && proposal.status === 'PENDING') {
    await (prisma as any).aiActionProposal.updateMany({ where: { id: proposal.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    await auditAction(input.reviewerUserId, proposal.id, 'AI_ACTION_EXPIRED', { actionType: definition.type, targetRef: proposal.targetRef, status: 'EXPIRED' });
    throw new ControlledAutomationError('This action proposal has expired.', 'CONTROLLED_ACTION_EXPIRED', 409);
  }
  const nextStatus = controlledActionTransition(proposal.status, input.decision);
  const reason = safeReason(input.reason);
  if (input.decision === 'REJECT' && reason.length < 3) throw new ControlledAutomationError('A rejection reason is required.', 'CONTROLLED_ACTION_REASON_REQUIRED', 400);

  const updated = await prisma.$transaction(async (tx) => {
    const txAny = tx as any;
    const changed = await txAny.aiActionProposal.updateMany({
      where: { id: proposal.id, status: 'PENDING' },
      data: input.decision === 'APPROVE'
        ? { status: nextStatus, approvedAt: new Date(), approvedById: input.reviewerUserId, executionErrorCode: null }
        : { status: nextStatus, rejectedAt: new Date(), rejectedById: input.reviewerUserId },
    });
    if (changed.count !== 1) throw new ControlledAutomationError('This proposal was already reviewed by another operator.', 'CONTROLLED_ACTION_ALREADY_REVIEWED', 409);
    await txAny.aiApproval.create({
      data: {
        proposalId: proposal.id,
        approverUserId: input.reviewerUserId,
        decision: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        ...(reason ? { reasonRedacted: reason } : {}),
      },
    });
    await txAny.auditLog.create({
      data: {
        actorUserId: input.reviewerUserId,
        entityType: 'AI_ACTION_PROPOSAL',
        entityId: proposal.id,
        action: input.decision === 'APPROVE' ? 'AI_ACTION_APPROVED' : 'AI_ACTION_REJECTED',
        afterJson: { actionType: definition.type, targetRef: proposal.targetRef, status: nextStatus, reason: reason || null },
      },
    });
    return txAny.aiActionProposal.findUnique({ where: { id: proposal.id }, include: { requestedBy: { select: { id: true, name: true, role: true } }, approvals: { orderBy: { createdAt: 'desc' } } } });
  });
  return toProposalView(updated);
};

type ControlledActionExecutor = (proposal: ControlledProposalView, actorUserId: string) => Promise<{ executionRef?: string }>;
const executors = new Map<ControlledActionType, ControlledActionExecutor>();

/** Domain adapters are registered only when they call the existing service layer. */
export const registerControlledActionExecutor = (actionType: ControlledActionType, executor: ControlledActionExecutor) => {
  executors.set(actionType, executor);
  configuredExecutorTypes.add(actionType);
};

export const executeApprovedControlledAction = async (input: { proposalId: string; executorUserId: string }) => {
  const proposal = await (prisma as any).aiActionProposal.findUnique({ where: { id: input.proposalId }, include: { requestedBy: { select: { id: true, name: true, role: true } }, approvals: { orderBy: { createdAt: 'desc' } } } });
  if (!proposal) throw new ControlledAutomationError('Action proposal not found.', 'CONTROLLED_ACTION_NOT_FOUND', 404);
  if (new Date(proposal.expiresAt).getTime() <= Date.now() && proposal.status === 'APPROVED') {
    await (prisma as any).aiActionProposal.updateMany({ where: { id: proposal.id, status: 'APPROVED' }, data: { status: 'EXPIRED' } });
    throw new ControlledAutomationError('This approved action proposal has expired.', 'CONTROLLED_ACTION_EXPIRED', 409);
  }
  const definition = getControlledActionDefinition(proposal.actionType);
  const nextStatus = controlledActionTransition(proposal.status, 'EXECUTE');
  const executor = executors.get(definition.type);
  if (!executor) {
    await (prisma as any).aiActionProposal.update({ where: { id: proposal.id }, data: { executionErrorCode: 'EXECUTOR_NOT_CONFIGURED' } });
    await auditAction(input.executorUserId, proposal.id, 'AI_ACTION_EXECUTION_BLOCKED', { actionType: definition.type, targetRef: proposal.targetRef, status: proposal.status, reason: 'DOMAIN_EXECUTOR_NOT_CONFIGURED' });
    throw new ControlledAutomationError('This action is approved, but its domain service adapter is not configured yet. No business data was changed.', 'CONTROLLED_ACTION_EXECUTOR_NOT_CONFIGURED', 409);
  }
  const claimed = await (prisma as any).aiActionProposal.updateMany({ where: { id: proposal.id, status: proposal.status }, data: { status: nextStatus } });
  if (claimed.count !== 1) throw new ControlledAutomationError('This action is already being processed.', 'CONTROLLED_ACTION_EXECUTION_CONFLICT', 409);
  try {
    const result = await executor(toProposalView({ ...proposal, status: 'EXECUTING' }), input.executorUserId);
    const updated = await (prisma as any).aiActionProposal.update({ where: { id: proposal.id }, data: { status: 'EXECUTED', executedAt: new Date(), executionErrorCode: null }, include: { requestedBy: { select: { id: true, name: true, role: true } }, approvals: { orderBy: { createdAt: 'desc' } } } });
    await auditAction(input.executorUserId, proposal.id, 'AI_ACTION_EXECUTED', { actionType: definition.type, targetRef: proposal.targetRef, status: 'EXECUTED', executionRef: result.executionRef || null });
    return toProposalView(updated);
  } catch (error) {
    await (prisma as any).aiActionProposal.update({ where: { id: proposal.id }, data: { status: 'EXECUTION_FAILED', executionErrorCode: 'DOMAIN_EXECUTOR_FAILED' } });
    await auditAction(input.executorUserId, proposal.id, 'AI_ACTION_EXECUTION_FAILED', { actionType: definition.type, targetRef: proposal.targetRef, status: 'EXECUTION_FAILED' });
    if (error instanceof ControlledAutomationError) throw error;
    throw new ControlledAutomationError('The approved action could not be completed. Review the proposal and domain record before retrying.', 'CONTROLLED_ACTION_EXECUTION_FAILED', 409);
  }
};
