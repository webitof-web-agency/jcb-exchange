import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { loadAiPermissionScope } from '../middlewares/aiAccess.middleware';
import {
  ControlledAutomationError,
  CONTROLLED_ACTION_TYPES,
  createControlledActionProposal,
  executeApprovedControlledAction,
  getControlledActionProposal,
  getControlledActionDefinition,
  listControlledActionDefinitions,
  listControlledActionProposals,
  reviewControlledActionProposal,
} from '../services/ai/aiControlledAutomation.service';

const actionTypeSchema = z.enum(CONTROLLED_ACTION_TYPES);
const proposalBodySchema = z.object({
  actionType: actionTypeSchema,
  targetType: z.string().trim().min(1).max(80),
  targetRef: z.string().trim().min(1).max(160),
  payload: z.record(z.string(), z.unknown()),
  runId: z.string().trim().min(1).max(160).optional(),
  expiresAt: z.string().datetime().optional(),
  idempotencyKey: z.string().trim().min(1).max(180).optional(),
}).strict();
const reviewBodySchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(2_000).optional(),
}).strict();
const statusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'EXECUTING', 'EXECUTION_FAILED', 'EXECUTED']);

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof ControlledAutomationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

const hasActionPermission = async (req: Request, actionType: string) => {
  if (!req.user) return false;
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') return true;
  if (req.user.role !== 'EMPLOYEE') return false;
  const permissions = await loadAiPermissionScope(req.user.id);
  const definition = getControlledActionDefinition(actionType);
  return permissions.includes('ALL_ACCESS') || definition.requiredPermissions.some((permission) => permissions.includes(permission));
};

const requireActionPermission = async (req: Request, res: Response, actionType: string) => {
  if (await hasActionPermission(req, actionType)) return true;
  res.status(403).json({ success: false, error: 'You do not have permission to review this controlled action.', code: 'CONTROLLED_ACTION_PERMISSION_REQUIRED' });
  return false;
};

export const getControlledActionCatalog = (_req: Request, res: Response) => res.json({
  success: true,
  actions: listControlledActionDefinitions(),
});

export const getControlledActionProposals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status ? statusSchema.parse(String(req.query.status).toUpperCase()) : undefined;
    const proposals = await listControlledActionProposals(status ? { status } : {});
    if (!req.user || req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') return res.json({ success: true, proposals });
    const permissions = await loadAiPermissionScope(req.user.id);
    const visible = proposals.filter((proposal) => {
      const definition = getControlledActionDefinition(proposal.actionType);
      return permissions.includes('ALL_ACCESS') || definition.requiredPermissions.some((permission) => permissions.includes(permission));
    });
    return res.json({ success: true, proposals: visible });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const createControlledActionSuggestion = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = proposalBodySchema.safeParse(req.body);
  if (!parsed.success || !req.user) return res.status(400).json({ success: false, error: 'A valid controlled action suggestion is required.', code: 'CONTROLLED_ACTION_REQUEST_INVALID' });
  if (!(await requireActionPermission(req, res, parsed.data.actionType))) return;
  try {
    const proposal = await createControlledActionProposal({
      actorUserId: req.user.id,
      actionType: parsed.data.actionType,
      targetType: parsed.data.targetType,
      targetRef: parsed.data.targetRef,
      payload: parsed.data.payload,
      ...(parsed.data.runId ? { runId: parsed.data.runId } : {}),
      ...(parsed.data.expiresAt ? { expiresAt: new Date(parsed.data.expiresAt) } : {}),
      ...(parsed.data.idempotencyKey ? { idempotencyKey: parsed.data.idempotencyKey } : {}),
    });
    return res.status(201).json({ success: true, proposal });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const reviewControlledAction = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = reviewBodySchema.safeParse(req.body);
  if (!parsed.success || !req.user) return res.status(400).json({ success: false, error: 'A valid approval decision is required.', code: 'CONTROLLED_ACTION_REVIEW_INVALID' });
  try {
    const proposal = await getControlledActionProposal(String(req.params.id));
    if (!proposal) return res.status(404).json({ success: false, error: 'Action proposal not found.', code: 'CONTROLLED_ACTION_NOT_FOUND' });
    if (!(await requireActionPermission(req, res, proposal.actionType))) return;
    const reviewed = await reviewControlledActionProposal({
      proposalId: proposal.id,
      reviewerUserId: req.user.id,
      reviewerRole: req.user.role,
      decision: parsed.data.decision,
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    });
    return res.json({ success: true, proposal: reviewed });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const executeControlledAction = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required.' });
  try {
    const proposal = await getControlledActionProposal(String(req.params.id));
    if (!proposal) return res.status(404).json({ success: false, error: 'Action proposal not found.', code: 'CONTROLLED_ACTION_NOT_FOUND' });
    if (!(await requireActionPermission(req, res, proposal.actionType))) return;
    const executed = await executeApprovedControlledAction({ proposalId: proposal.id, executorUserId: req.user.id });
    return res.json({ success: true, proposal: executed });
  } catch (error) {
    return sendError(error, res, next);
  }
};
