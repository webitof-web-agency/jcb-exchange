import { createHash, createHmac } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { resolveJwtSecret } from '../../utils/jwtSecret';

/** Conservative per-request budgets. Provider adapters must receive the cap. */
export const AI_MAX_INPUT_TOKENS = 4_096;
export const AI_MAX_OUTPUT_TOKENS = 800;

const SYSTEM_INSTRUCTION_PATTERNS = [
  /\b(?:ignore|disregard|override|bypass|forget)\b[\s\S]{0,120}\b(?:previous|above|system|developer|instruction|rule|prompt)\b/i,
  /\b(?:system|developer)\s+(?:message|prompt|instruction)\b/i,
  /<\s*(?:system|developer|assistant)\b/i,
  /\brole\s*[:=]\s*(?:system|developer|assistant)\b/i,
  /\b(?:reveal|show|print|expose)\b[\s\S]{0,80}\b(?:system prompt|developer prompt|hidden instruction)\b/i,
  /\bfrom now on\s+(?:you are|act as|follow)\b/i,
];

export const containsUserProvidedSystemInstruction = (value: string): boolean =>
  SYSTEM_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(value));

export const estimateAiTokens = (value: string): number => {
  const bytes = Buffer.byteLength(value, 'utf8');
  return Math.max(0, Math.ceil(bytes / 4));
};

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/** HMAC protects audit correlation from database-only confirmation attacks. */
export const auditHmacHex = (value: string, secret?: string): string => {
  const resolvedSecret = secret?.trim() || process.env.AI_AUDIT_HMAC_SECRET?.trim() || resolveJwtSecret();
  return createHmac('sha256', resolvedSecret).update(value, 'utf8').digest('hex');
};

const AI_ALLOWED_HTML_TAGS = [
  'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'h1', 'h2', 'h3', 'blockquote',
];

/** Defense-in-depth for provider output before it is persisted or returned. */
export const sanitizeAiHtml = (value: string): string => sanitizeHtml(value, {
  allowedTags: AI_ALLOWED_HTML_TAGS,
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  parseStyleAttributes: false,
});
