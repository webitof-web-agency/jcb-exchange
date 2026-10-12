export const SUPPORTED_STATE_PORTALS = ['DL', 'TS', 'KA', 'GJ'] as const;

export type RcChallanRequest = {
  rc_number: string;
  chassis_number: string;
  engine_number: string;
  state_only?: boolean;
  state_portal?: string[];
};

const normalizeIdentifier = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';

const normalizeStatePortals = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean))];
};

const hasControlCharacters = (value: string) => /[\u0000-\u001F\u007F]/.test(value);

export const normalizeRcChallanRequest = (input: Record<string, unknown>): RcChallanRequest => {
  const stateOnly = input.state_only === true;
  const statePortals = normalizeStatePortals(input.state_portal);
  const result: RcChallanRequest = {
    rc_number: normalizeIdentifier(input.rc_number ?? input.rcNumber),
    chassis_number: normalizeIdentifier(input.chassis_number ?? input.chassisNumber),
    engine_number: normalizeIdentifier(input.engine_number ?? input.engineNumber),
  };

  if (stateOnly) result.state_only = true;
  if (statePortals.length) result.state_portal = statePortals;
  return result;
};

const validateIdentifier = (label: string, value: string, maxLength: number) => {
  if (!value) return `${label} is required.`;
  if (value.length > maxLength || hasControlCharacters(value)) return `${label} is invalid.`;
  return null;
};

export const validateRcChallanRequest = (input: Record<string, unknown>) => {
  const normalized = normalizeRcChallanRequest(input);
  const rcError = validateIdentifier('Registration number', normalized.rc_number, 30);
  if (rcError) return rcError;
  const chassisError = validateIdentifier('Chassis number', normalized.chassis_number, 100);
  if (chassisError) return chassisError;
  const engineError = validateIdentifier('Engine number', normalized.engine_number, 100);
  if (engineError) return engineError;

  const statePortals = normalized.state_portal || [];
  const unsupported = statePortals.filter((portal) => !(SUPPORTED_STATE_PORTALS as readonly string[]).includes(portal));
  if (unsupported.length || (normalized.state_only === true && !statePortals.length)) {
    return 'Select one or more supported state portals: DL, TS, KA, GJ.';
  }

  return null;
};
