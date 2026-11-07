type PartnerCodeInput = {
  stateCode?: string | null;
  stateName?: string | null;
  cityName?: string | null;
  dealerName?: string | null;
};

type PartnerCodeRepository = {
  findUnique: (args: { where: { partnerCode: string } }) => Promise<unknown>;
};

const slug = (value: unknown, fallback: string) => {
  const normalized = typeof value === 'string'
    ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : '';
  const result = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return result || fallback;
};

export const buildPartnerCode = ({ stateCode, stateName, cityName, dealerName }: PartnerCodeInput) => {
  const state = slug(stateCode || stateName, 'state');
  const city = slug(cityName, 'city');
  const firstDealerToken = typeof dealerName === 'string' ? dealerName.trim().split(/\s+/)[0] : '';
  const dealer = slug(firstDealerToken, 'dealer');
  return `${state}-${city}-${dealer}`;
};

export const findAvailablePartnerCode = async (
  input: PartnerCodeInput,
  repository: PartnerCodeRepository,
) => {
  const base = buildPartnerCode(input);
  let candidate = base;
  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const existing = await repository.findUnique({ where: { partnerCode: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
  }
  throw new Error('Could not allocate a unique partner code.');
};
