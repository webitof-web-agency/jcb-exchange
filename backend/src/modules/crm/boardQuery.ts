const DEFAULT_TERMINAL_STATUSES = ['WON', 'LOST'];

export const normalizeBoardQuery = (query: Record<string, string>) => {
  const { page: _page, pageSize: _pageSize, ...filters } = query;
  return filters;
};

export const boardShowsClosedStages = (query: Record<string, string>, terminalStatuses = DEFAULT_TERMINAL_STATUSES) => {
  const terminal = new Set(terminalStatuses);
  const view = String(query.view || '').toLowerCase();
  if (['all', 'closed', 'won', 'lost'].includes(view)) return true;

  return String(query.status || '')
    .split(',')
    .map((status) => status.trim().toUpperCase())
    .some((status) => terminal.has(status));
};
