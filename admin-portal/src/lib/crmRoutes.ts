// CRM page routes. Old links used /crm?tab=<key>; they now redirect to one page per menu item.

const TAB_PATHS: Record<string, string> = {
  dashboard: '',
  leads: '/leads',
  pipeline: '/pipeline',
  followups: '/follow-ups',
  contacts: '/contacts',
  reports: '/reports',
  campaigns: '/campaigns',
  import: '/import',
};

type SearchParams = Record<string, string | string[] | undefined>;

/** Where an old `/crm?tab=…` link should go now, or null when there is no tab. */
export const legacyCrmTabTarget = (prefix: string, params: SearchParams) => {
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  if (!tab) return null;
  if (tab === 'settings') return `${prefix}/settings?tab=crm`;
  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'tab' || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) rest.append(key, item);
  }
  const query = rest.toString();
  return `${prefix}/crm${TAB_PATHS[tab] ?? ''}${query ? `?${query}` : ''}`;
};
