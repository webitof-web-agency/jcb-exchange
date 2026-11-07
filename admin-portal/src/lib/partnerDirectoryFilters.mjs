const normalize = (value) => String(value || '').trim().toLocaleLowerCase();

const sameId = (value, expected) => String(value || '') === String(expected || '');

export const matchesPartnerDirectoryLocation = (partner, filters = {}) => {
  const stateId = String(filters.stateId || '');
  const cityId = String(filters.cityId || '');
  const stateName = normalize(filters.stateName);
  const cityName = normalize(filters.cityName);
  const profile = partner?.partnerProfile || {};
  const savedState = profile.state || {};
  const savedCity = profile.city || {};
  const partnerState = normalize(savedState.name || partner?.state);
  const partnerCity = normalize(savedCity.name || partner?.city || profile.district);

  if (stateId && !sameId(profile.stateId, stateId) && (!stateName || partnerState !== stateName)) {
    return false;
  }

  if (cityId && !sameId(profile.cityId, cityId) && (!cityName || partnerCity !== cityName)) {
    return false;
  }

  return true;
};
