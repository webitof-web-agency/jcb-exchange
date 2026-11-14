const MOBILE_PATTERN = /(?<!\d)(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/gi;
const AADHAAR_PATTERN = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
const UPI_PATTERN = /\b[A-Z0-9._-]{2,}@[A-Z][A-Z0-9._-]{1,}\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;
const MONGO_OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/giu;
const ENTITY_ID_LABEL_PATTERN = /\b(?:lead|listing|customer|partner|record|transaction|message|application|candidate|vehicle|invoice|payment|user|category|brand|model|blog|task|document|rto|verification|conversation|request|run|feedback)\s+(?:id|identifier)\s*[:#=-]\s*[a-z0-9][a-z0-9._:/-]{2,}/giu;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/giu;
const SENSITIVE_URL_KEY_VALUE_PATTERN = /["']?(?:document[_-]?(?:url|uri|link)|file[_-]?(?:url|uri|link)|download[_-]?(?:url|uri|link)|public[_-]?verification[_-]?(?:url|uri|link)|signed[_-]?(?:url|uri|link))["]?\s*[:=]\s*["']?([^,\s}"']+)["']?/giu;
const SENSITIVE_KEY_VALUE_PATTERN = /["']?(?:password|passcode|passphrase|secret|token|api[_-]?key|private[_-]?key|bank[\s_-]*(?:account[\s_-]*(?:number|no)?|number)|account[\s_-]?(?:number|no)|ifsc(?:[\s_-]?code)?|transaction[\s_-]?(?:ref(?:erence)?|id)|payment[\s_-]?(?:ref(?:erence)?|id)|receipt[\s_-]?(?:no|number)|utr(?:[\s_-]?number)?|txn(?:[\s_-]?(?:ref(?:erence)?|id))?)["']?\s*[:=]\s*["']?([^,\s}"']+)["']?/giu;

/**
 * Redacts values that must never be sent to an AI provider. This function is
 * intentionally provider-agnostic and is applied to both user input and the
 * provider response before either crosses a trust boundary.
 */
export const redactSensitiveData = (value: string): string => {
  let redacted = value;
  redacted = redacted.replace(SENSITIVE_URL_KEY_VALUE_PATTERN, (_match, _value: string) => '[REDACTED_DOCUMENT_URL]');
  redacted = redacted.replace(URL_PATTERN, '[REDACTED_URL]');
  redacted = redacted.replace(SENSITIVE_KEY_VALUE_PATTERN, (_match, _value: string) => '[REDACTED_SECRET]');
  redacted = redacted.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
  redacted = redacted.replace(UPI_PATTERN, '[REDACTED_UPI]');
  redacted = redacted.replace(PAN_PATTERN, '[REDACTED_PAN]');
  redacted = redacted.replace(AADHAAR_PATTERN, '[REDACTED_AADHAAR]');
  redacted = redacted.replace(MOBILE_PATTERN, '[REDACTED_MOBILE]');
  redacted = redacted.replace(ENTITY_ID_LABEL_PATTERN, '[REDACTED_INTERNAL_ID]');
  redacted = redacted.replace(UUID_PATTERN, '[REDACTED_INTERNAL_ID]');
  redacted = redacted.replace(MONGO_OBJECT_ID_PATTERN, '[REDACTED_INTERNAL_ID]');
  return redacted;
};
