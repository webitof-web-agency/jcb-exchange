import type { ComplianceResult } from './rtoCompliance';

export const RTO_TRANSFER_TASK_STATUSES = [
  'PENDING',
  'DOCUMENT_EXPIRED',
  'RENEWAL_IN_PROGRESS',
  'TRANSFER_INITIATED',
  'ISSUE_REPORTED',
  'TRANSFERRED',
  'NOT_REQUIRED',
] as const;

export type RtoTransferTaskStatusValue = (typeof RTO_TRANSFER_TASK_STATUSES)[number];

export type RtoTransferTaskDefinition = {
  taskKey: string;
  label: string;
  isOptional: boolean;
  sortOrder: number;
};

// Ownership-transfer checklist created for every Sold Vehicle handed over to RTO.
export const RTO_TRANSFER_TASK_DEFINITIONS: RtoTransferTaskDefinition[] = [
  { taskKey: 'RC', label: 'RC Transfer', isOptional: false, sortOrder: 1 },
  { taskKey: 'INSURANCE', label: 'Insurance Transfer', isOptional: false, sortOrder: 2 },
  { taskKey: 'NOC', label: 'NOC / Hypothecation Clearance', isOptional: false, sortOrder: 3 },
  { taskKey: 'PUC', label: 'PUC Certificate', isOptional: false, sortOrder: 4 },
  { taskKey: 'HSRP', label: 'HSRP Plate', isOptional: true, sortOrder: 5 },
  { taskKey: 'TAX', label: 'Road Tax', isOptional: false, sortOrder: 6 },
  { taskKey: 'FITNESS', label: 'Fitness Certificate', isOptional: true, sortOrder: 7 },
];

export const RTO_TRANSFER_DONE_STATUSES: readonly RtoTransferTaskStatusValue[] = ['TRANSFERRED', 'NOT_REQUIRED'];

export const MIN_REMARK_LENGTH = 3;
export const MAX_REMARK_LENGTH = 2000;

export const normalizeRemark = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, MAX_REMARK_LENGTH) : '');

export const assertRemark = (value: unknown, context = 'this status change') => {
  const remark = normalizeRemark(value);
  if (remark.length < MIN_REMARK_LENGTH) {
    throw new Error(`A remark is required for ${context}.`);
  }
  return remark;
};

export type RtoTaskDocument = {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedById: string | null;
};

export const MAX_TASK_DOCUMENTS = 5;
const TASK_DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
// Only files returned by POST /api/documents/upload/secure (private Drive copies) can be attached.
const SECURE_DRIVE_URL = /^\/api\/documents\/secure\/drive-[A-Za-z0-9%_-]+$/;

/** Stored task documents, skipping anything malformed. */
export const readTaskDocuments = (value: unknown): RtoTaskDocument[] =>
  (Array.isArray(value) ? value : []).filter((entry): entry is RtoTaskDocument =>
    Boolean(entry) && typeof entry === 'object'
    && typeof (entry as RtoTaskDocument).id === 'string'
    && typeof (entry as RtoTaskDocument).fileUrl === 'string');

/** Validates the upload response the portal sends back and turns it into a stored entry. */
export const buildTaskDocument = (
  input: { fileUrl?: unknown; originalName?: unknown; fileName?: unknown; mimeType?: unknown; size?: unknown },
  meta: { id: string; uploadedById?: string | null; now?: Date },
): RtoTaskDocument => {
  const fileUrl = typeof input.fileUrl === 'string' ? input.fileUrl.trim() : '';
  if (!SECURE_DRIVE_URL.test(fileUrl)) throw new Error('Upload the file first, then attach it to the task.');
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : '';
  if (!TASK_DOCUMENT_MIME_TYPES.has(mimeType)) throw new Error('Only PDF, JPG, PNG or WEBP files can be attached.');
  const rawName = [input.originalName, input.fileName].find((name) => typeof name === 'string' && name.trim());
  const fileName = String(rawName || 'document').trim().replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 160);
  const size = Number(input.size);
  return {
    id: meta.id,
    fileUrl,
    fileName,
    mimeType,
    size: Number.isFinite(size) && size > 0 ? Math.round(size) : 0,
    uploadedAt: (meta.now || new Date()).toISOString(),
    uploadedById: meta.uploadedById || null,
  };
};

export const isTransferTaskDone = (status: string) => RTO_TRANSFER_DONE_STATUSES.includes(status as RtoTransferTaskStatusValue);

export const isValidTransferTaskStatus = (status: unknown): status is RtoTransferTaskStatusValue =>
  RTO_TRANSFER_TASK_STATUSES.includes(String(status) as RtoTransferTaskStatusValue);

export const summarizeTransferTasks = (tasks: Array<{ status: string; label?: string; isOptional?: boolean }>) => {
  const done = tasks.filter((task) => isTransferTaskDone(task.status)).length;
  return {
    done,
    total: tasks.length,
    allDone: tasks.length > 0 && done === tasks.length,
    issues: tasks.filter((task) => task.status === 'ISSUE_REPORTED').length,
    pendingLabels: tasks.filter((task) => !isTransferTaskDone(task.status)).map((task) => task.label || ''),
  };
};

/**
 * RTO work status that follows from the checklist. A reported issue surfaces as
 * "failed / errors" so it is visible on the list, and clears once the issue is resolved.
 */
export const deriveRtoStatusFromTasks = (tasks: Array<{ status: string }>) => {
  if (!tasks.length) return null;
  const summary = summarizeTransferTasks(tasks);
  if (summary.allDone) return 'RTO_WORK_COMPLETED';
  if (summary.issues > 0) return 'RTO_WORK_FAILED';
  if (tasks.some((task) => task.status !== 'PENDING')) return 'RTO_WORK_IN_PROGRESS';
  return 'RTO_WORK_STARTED';
};

/** Initial task state, flagging documents that the compliance check found expired. */
export const buildInitialTransferTasks = (compliance?: Pick<ComplianceResult, 'checks' | 'expiredDocuments'> | null) =>
  RTO_TRANSFER_TASK_DEFINITIONS.map((definition) => {
    const expired = compliance?.expiredDocuments.includes(definition.taskKey);
    const check = compliance?.checks.find((item) => item.key === (definition.taskKey === 'NOC' ? 'HYPOTHECATION' : definition.taskKey));
    const status: RtoTransferTaskStatusValue = expired ? 'DOCUMENT_EXPIRED' : 'PENDING';
    const remark = expired && check
      ? `${check.message}${check.action ? ` ${check.action}` : ''}`
      : definition.taskKey === 'NOC' && check?.level === 'BLOCK'
        ? `${check.message}${check.action ? ` ${check.action}` : ''}`
        : 'Task created when RTO work started.';
    return { ...definition, status, remark };
  });
