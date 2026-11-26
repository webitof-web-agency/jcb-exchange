/**
 * Choosing a head office. HR saves one or more head offices on the Organisation page and marks one as the default:
 * forms preselect it, and it applies wherever nothing else was chosen. A head office employee is recorded at the
 * chosen office's state and city. (The server applies the same rules.)
 */

export type HrmHeadOffice = {
  id: string;
  name: string;
  isDefault: boolean;
  stateId: number | null;
  stateName: string | null;
  cityId: number | null;
  cityName: string | null;
};

export const defaultHeadOffice = <T extends Pick<HrmHeadOffice, 'isDefault'>>(offices: readonly T[] | undefined): T | null =>
  offices?.find((office) => office.isDefault) ?? offices?.[0] ?? null;

/** The head office a form means: the chosen one while it is still offered, otherwise the default. */
export const selectedHeadOffice = <T extends Pick<HrmHeadOffice, 'id' | 'isDefault'>>(offices: readonly T[] | undefined, chosenId: string): T | null =>
  offices?.find((office) => office.id === chosenId) ?? defaultHeadOffice(offices);

/**
 * The head office a saved posting is for: the one it names; an older posting that names none takes the one at its
 * place; otherwise the default.
 */
export const headOfficeForPosting = (offices: readonly HrmHeadOffice[], posting: { headOfficeUnitId: string; stateId: string; cityId: string }) =>
  offices.find((office) => office.id === posting.headOfficeUnitId)
  ?? (posting.headOfficeUnitId ? undefined : offices.find((office) => office.cityId !== null && String(office.stateId) === posting.stateId && String(office.cityId) === posting.cityId))
  ?? defaultHeadOffice(offices);

/** "Raipur, Chhattisgarh"; empty when the office has no place yet. */
export const headOfficePlace = (office: Pick<HrmHeadOffice, 'cityName' | 'stateName'> | null | undefined) =>
  [office?.cityName, office?.stateName].filter(Boolean).join(', ');

/** One line of the dropdown (the default one also carries a star). */
export const headOfficeLabel = (office: Pick<HrmHeadOffice, 'name' | 'cityName' | 'stateName'>) =>
  `${office.name} · ${headOfficePlace(office) || 'state and city not set'}`;

/** Why this head office cannot be used yet, or null when it can. */
export const headOfficeProblem = (office: Pick<HrmHeadOffice, 'name' | 'stateId' | 'cityId'> | null) =>
  (office && (!office.stateId || !office.cityId) ? `“${office.name}” has no state and city. Set them on the Organisation page first.` : null);
