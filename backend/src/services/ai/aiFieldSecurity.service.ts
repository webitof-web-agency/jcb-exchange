import type { AiToolContext } from './aiReadOnlyTools.service';

/** Explicit permissions for future operator-facing sensitive-field views. */
export const AI_SENSITIVE_FIELD_PERMISSIONS = ['ai.sensitive.read', 'identity.sensitive.read'] as const;

type AiFieldSecurityContext = Pick<AiToolContext, 'role' | 'permissions'>;
type SensitiveFieldKind = 'documentUrl' | 'secret' | 'mobile' | 'email' | 'pii' | null;

type AiSecurityAuditPayloadInput = {
  action: string;
  actorUserId: string;
  role?: string;
  toolName?: string;
  maskedFields?: readonly string[];
  /** Accepted only so callers can prove that raw values are never copied into the payload. */
  rawValue?: unknown;
};

const DOCUMENT_URL_FIELD_PATTERN = /(?:^|_)(?:url|uri|download|signed|attachment|file)(?:$|_)/iu;
const SECRET_FIELD_PATTERN = /(?:^|_)(?:token|secret|password|passcode|api[_-]?key|private[_-]?key|authorization|signature|credential|cookie|hash)(?:$|_)/iu;
const MOBILE_FIELD_PATTERN = /(?:^|_)(?:phone|mobile|contact)(?:$|_)/iu;
const EMAIL_FIELD_PATTERN = /(?:^|_)email(?:$|_)/iu;
const PII_FIELD_PATTERN = /(?:^|_)(?:owner|buyer|seller|purchaser|customer|holder|applicant)(?:_|$)|(?:^|_)(?:pan|aadhaar|gstin|license(?:number)?|rc(?:number)?|registration(?:number)?|chassis(?:number)?|engine(?:number)?|account(?:number)?|ifsc|upi|dob|dateofbirth|nameondocument)(?:$|_)/iu;
const SAFE_BOOLEANISH_FIELD_PATTERN = /(?:configured|present|count|status|enabled|ready|total|success|failed|pending|available|source|date|at|id|uploaded|sent)$/iu;

const normalizedFieldName = (field: string) => field.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();

const isInternalIdentifierField = (normalized: string): boolean => normalized === 'id'
  || normalized === 'uuid'
  || normalized === 'object_id'
  || normalized === 'objectid'
  || normalized === 'database_id'
  || normalized.endsWith('_id')
  || normalized.endsWith('_ids');

const kindForField = (field: string): SensitiveFieldKind => {
  const normalized = normalizedFieldName(field);
  if (DOCUMENT_URL_FIELD_PATTERN.test(normalized)) return 'documentUrl';
  if (SECRET_FIELD_PATTERN.test(normalized)) return 'secret';
  if (MOBILE_FIELD_PATTERN.test(normalized)) return 'mobile';
  if (EMAIL_FIELD_PATTERN.test(normalized)) return 'email';
  if (PII_FIELD_PATTERN.test(normalized) && !SAFE_BOOLEANISH_FIELD_PATTERN.test(normalized)) return 'pii';
  return null;
};

export const canReadAiSensitiveField = (context: AiFieldSecurityContext, field: string): boolean => {
  if (!kindForField(field)) return true;
  return context.role === 'SUPER_ADMIN'
    || context.permissions.includes('ALL_ACCESS')
    || AI_SENSITIVE_FIELD_PERMISSIONS.some((permission) => context.permissions.includes(permission));
};

const maskValueForKind = (value: unknown, kind: Exclude<SensitiveFieldKind, null>): unknown => {
  if (kind === 'documentUrl') return '[REDACTED_DOCUMENT_URL]';
  if (kind === 'secret') return '[REDACTED_SECRET]';
  if (kind === 'mobile') return '[REDACTED_MOBILE]';
  if (kind === 'email') return '[REDACTED_EMAIL]';
  if (kind === 'pii') return '[REDACTED_PII]';
  return value;
};

const pathFor = (path: string, key: string) => path ? `${path}.${key}` : key;

export type SanitizedAiToolData = {
  data: unknown;
  maskedFields: string[];
};

/**
 * Produces the provider-safe representation of a tool result. This intentionally
 * masks even for ADMIN/SUPER_ADMIN: permission can govern an internal UI later,
 * but no raw PII, credential, or document locator may cross the provider boundary.
 */
export const sanitizeAiToolData = (value: unknown, _context: AiFieldSecurityContext): SanitizedAiToolData => {
  const maskedFields = new Set<string>();

  const visit = (current: unknown, path: string): unknown => {
    if (current === null || current === undefined) return current;
    if (current instanceof Date) return current.toISOString();
    if (typeof current === 'string') return current;
    if (typeof current !== 'object') return current;
    if (Array.isArray(current)) return current.map((item, index) => visit(item, path ? `${path}.${index}` : String(index)));

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      const childPath = pathFor(path, key);
      const normalized = normalizedFieldName(key);
      if (isInternalIdentifierField(normalized)) {
        maskedFields.add(childPath);
        continue;
      }
      const safeMetadata = SAFE_BOOLEANISH_FIELD_PATTERN.test(normalized)
        && (typeof child !== 'object' || child === null);
      const kind = safeMetadata ? null : kindForField(key);
      if (kind) {
        output[key] = maskValueForKind(child, kind);
        maskedFields.add(childPath);
        continue;
      }
      output[key] = visit(child, childPath);
    }
    return output;
  };

  return { data: visit(value, ''), maskedFields: [...maskedFields] };
};

/**
 * Audit metadata is deliberately allow-listed. Raw values are accepted only to
 * make accidental inclusion impossible to miss in tests; they are never copied.
 */
export const buildAiSecurityAuditPayload = (input: AiSecurityAuditPayloadInput): Record<string, unknown> => ({
  action: input.action.slice(0, 80),
  ...(input.role ? { actorRole: input.role.slice(0, 40) } : {}),
  ...(input.toolName ? { toolName: input.toolName.slice(0, 100) } : {}),
  ...(input.maskedFields?.length ? {
    maskedFields: [...new Set(input.maskedFields)].slice(0, 100).map((field) => field.slice(0, 160)),
  } : {}),
});
