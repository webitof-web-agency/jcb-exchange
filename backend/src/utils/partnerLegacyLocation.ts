export type LegacyStateLocation = {
  id: number;
  name: string;
  stateCode?: string | null;
  countryId: number;
};

export type LegacyCityLocation = {
  id: number;
  name: string;
  stateId: number;
  countryId: number;
};

export type LegacyPartnerLocationInput = {
  countryId?: number | null;
  stateId?: number | null;
  cityId?: number | null;
  userState?: string | null;
  userCity?: string | null;
  district?: string | null;
};

export type LegacyPartnerLocationCatalog = {
  countryId: number;
  states: LegacyStateLocation[];
  cities: LegacyCityLocation[];
};

export type LegacyPartnerLocationResult =
  | {
      status: 'RESOLVED';
      countryId: number;
      stateId: number;
      cityId: number;
      stateCode: string | null;
      stateName: string;
      cityName: string;
    }
  | {
      status:
        | 'COUNTRY_NOT_SUPPORTED'
        | 'MISSING_STATE'
        | 'STATE_NOT_FOUND'
        | 'STATE_ID_NOT_FOUND'
        | 'AMBIGUOUS_STATE'
        | 'MISSING_CITY'
        | 'CITY_NOT_FOUND'
        | 'CITY_ID_NOT_FOUND'
        | 'AMBIGUOUS_CITY'
        | 'CITY_STATE_MISMATCH';
    };

const normalize = (value?: string | null) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();

const positiveId = (value?: number | null) => Number.isSafeInteger(value) && Number(value) > 0;

export const resolveLegacyPartnerLocation = (
  input: LegacyPartnerLocationInput,
  catalog: LegacyPartnerLocationCatalog,
): LegacyPartnerLocationResult => {
  if (positiveId(input.countryId) && input.countryId !== catalog.countryId) {
    return { status: 'COUNTRY_NOT_SUPPORTED' };
  }

  const states = catalog.states.filter((state) => state.countryId === catalog.countryId);
  const stateCandidates = positiveId(input.stateId)
    ? states.filter((state) => state.id === input.stateId)
    : states.filter((state) => normalize(state.name) === normalize(input.userState));

  if (!stateCandidates.length) {
    return { status: positiveId(input.stateId) ? 'STATE_ID_NOT_FOUND' : normalize(input.userState) ? 'STATE_NOT_FOUND' : 'MISSING_STATE' };
  }
  if (stateCandidates.length > 1) return { status: 'AMBIGUOUS_STATE' };

  const state = stateCandidates[0];
  if (!state) return { status: 'STATE_NOT_FOUND' };

  const legacyCityName = normalize(input.userCity) || normalize(input.district);
  const cityCandidates = positiveId(input.cityId)
    ? catalog.cities.filter((city) => city.id === input.cityId)
    : catalog.cities.filter((city) => city.stateId === state.id && normalize(city.name) === legacyCityName);

  if (!cityCandidates.length) {
    return {
      status: positiveId(input.cityId)
        ? 'CITY_ID_NOT_FOUND'
        : legacyCityName
          ? 'CITY_NOT_FOUND'
          : 'MISSING_CITY',
    };
  }
  if (cityCandidates.length > 1) return { status: 'AMBIGUOUS_CITY' };

  const city = cityCandidates[0];
  if (!city || city.stateId !== state.id || city.countryId !== catalog.countryId) {
    return { status: 'CITY_STATE_MISMATCH' };
  }

  return {
    status: 'RESOLVED',
    countryId: catalog.countryId,
    stateId: state.id,
    cityId: city.id,
    stateCode: state.stateCode || null,
    stateName: state.name,
    cityName: city.name,
  };
};
