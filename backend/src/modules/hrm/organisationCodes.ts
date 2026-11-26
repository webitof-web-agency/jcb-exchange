/** Pure helpers for naming organisation units; kept apart from the database code so they are easy to test. */

export type OrganisationKind = 'HEAD_OFFICE' | 'STATE' | 'DEPARTMENT' | 'OTHER';

export const UNIT_CODE_PREFIX = { HEAD_OFFICE: 'HO', STATE: 'ST', DEPARTMENT: 'DEPT' } as const;

/** "Sales & Marketing" -> SALES-AND-MARKETING (letters, digits and single dashes only). */
export const slugForCode = (value: string, max = 24) =>
  value
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '') || 'UNIT';

/** First free code such as DEPT-SALES, DEPT-SALES-2, DEPT-SALES-3. Codes are compared in upper case. */
export const buildUnitCode = (prefix: string, base: string, taken: ReadonlySet<string>) => {
  const slug = slugForCode(base);
  let code = `${prefix}-${slug}`;
  let counter = 2;
  while (taken.has(code)) {
    code = `${prefix}-${slug}-${counter}`;
    counter += 1;
  }
  return code;
};

/** Collapses spaces and drops repeats (case-insensitive), keeping the first spelling. */
export const normaliseNames = (names: readonly string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.replace(/\s+/g, ' ').trim();
    const key = name.toLowerCase();
    if (name.length >= 2 && !seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result;
};

export const kindOfUnit = (unit: { type: string; stateId: number | null }): OrganisationKind => {
  if (unit.type === 'HEAD_OFFICE') return 'HEAD_OFFICE';
  if (unit.type === 'DEPARTMENT') return 'DEPARTMENT';
  if (unit.type === 'REGION' && unit.stateId) return 'STATE';
  return 'OTHER';
};

/** Default name of a state office when the administrator leaves the name empty. */
export const defaultStateOfficeName = (stateName: string) => `${stateName} State Office`;

/**
 * A unit name as it is stored: control characters, zero-width spaces and bidi overrides (used for spoofing) are
 * removed and spaces collapsed. Zero-width joiners stay: Devanagari and other Indic scripts need them.
 */
export const cleanUnitName = (value: string) => value
  .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Why a (cleaned) office / department name cannot be used; null when it is fine. */
export const unitNameProblem = (name: string): string | null => {
  if (name.length < 2) return 'Enter the name (at least 2 characters).';
  if (name.length > 160) return 'The name can have at most 160 characters.';
  if (/[<>]/.test(name)) return 'The name cannot contain < or >.';
  if (!/[\p{L}\p{N}]/u.test(name)) return 'The name needs at least one letter or number.';
  return null;
};

