const MOBILE_PATTERN = /(?<!\d)(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/gi;
const AADHAAR_PATTERN = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
const UPI_PATTERN = /\b[A-Z0-9._-]{2,}@[A-Z][A-Z0-9._-]{1,}\b/gi;
const SENSITIVE_KEY_VALUE_PATTERN = /["']?(?:password|passcode|passphrase|secret|token|api[_-]?key|private[_-]?key|bank[\s_-]*(?:account[\s_-]*(?:number|no)?|number)|account[\s_-]?(?:number|no)|ifsc(?:[\s_-]?code)?|transaction[\s_-]?(?:ref(?:erence)?|id)|payment[\s_-]?(?:ref(?:erence)?|id)|receipt[\s_-]?(?:no|number)|utr(?:[\s_-]?number)?|txn(?:[\s_-]?(?:ref(?:erence)?|id))?)["']?\s*[:=]\s*["']?([^,\s}"']+)["']?/giu;

/**
 * Redacts values that must never be sent to an AI provider. This function is
 * intentionally provider-agnostic and is applied to both user input and the
 * provider response before either crosses a trust boundary.
 */
export const redactSensitiveData = (value: string): string => {
  let redacted = value;
  redacted = redacted.replace(SENSITIVE_KEY_VALUE_PATTERN, (_match, _value: string) => '[REDACTED_SECRET]');
  redacted = redacted.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
  redacted = redacted.replace(UPI_PATTERN, '[REDACTED_UPI]');
  redacted = redacted.replace(PAN_PATTERN, '[REDACTED_PAN]');
  redacted = redacted.replace(AADHAAR_PATTERN, '[REDACTED_AADHAAR]');
  redacted = redacted.replace(MOBILE_PATTERN, '[REDACTED_MOBILE]');
  return redacted;
};
