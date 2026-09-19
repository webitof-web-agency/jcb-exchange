export type Period = {
  from: Date;
  to: Date;
};

export const getPreviousPeriod = (from: Date, to: Date): Period => {
  const duration = to.getTime() - from.getTime() + 1;
  const previousTo = new Date(from.getTime() - 1);

  return {
    from: new Date(previousTo.getTime() - duration + 1),
    to: previousTo,
  };
};

export const calculatePercentageChange = (current: number, previous: number): number | null => {
  if (previous === 0) {
    return null;
  }

  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
};

export const calculateConversionRate = (won: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }

  return Number(((won / total) * 100).toFixed(1));
};

export const calculateDemandScore = ({
  views,
  leads,
  wonLeads,
}: {
  views: number;
  leads: number;
  wonLeads: number;
}): number => views + leads * 5 + wonLeads * 10;

export const calculateDemandPerStock = (demandScore: number, inventory: number): number | null => {
  if (inventory <= 0) {
    return null;
  }

  return Number((demandScore / inventory).toFixed(1));
};
