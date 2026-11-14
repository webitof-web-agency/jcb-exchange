export const AI_MESSAGE_MAX_LENGTH = 4_000;

export type AiRuntimeStatus = {
  enabled: boolean;
  provider: string;
  model: string;
  modelConfigured: boolean;
  keyConfigured: boolean;
  configurationError?: string | null;
};

export type AiRuntimePresentation = {
  label: 'Ready' | 'Needs configuration' | 'Disabled';
  tone: 'success' | 'warning' | 'neutral';
  description: string;
};

export type AiReadOnlyTool = {
  name: string;
  label: string;
  description: string;
  available: boolean;
};

export const normalizeAiMessage = (value: string): string =>
  value.trim().slice(0, AI_MESSAGE_MAX_LENGTH);

const DAY_RANGE_TOOLS = new Set([
  'dashboard.summary',
  'lead.statistics',
  'analytics.summary',
  'listing.statistics',
  'sold.vehicles',
  'inventory.trend',
  'revenue.summary',
  'partner.performance',
  'finance.trend',
  'forecast.operations',
  'whatsapp.activity.summary',
  'whatsapp.status',
  'verification.summary',
  'sms.activity.summary',
  'notifications.summary',
  'rto.documents.summary',
]);

export const getAiToolArguments = (tool: AiReadOnlyTool | null, query: string, days = 30): Record<string, unknown> => {
  if (!tool) return {};
  if (tool.name === 'listing.search') return { query: query.trim().slice(0, 100).trim(), limit: 10 };
  if (tool.name === 'listing.detail') return { query: query.trim().slice(0, 100).trim() };
  if (tool.name === 'vehicle.identity') return { query: query.trim().slice(0, 100).trim() };
  if (tool.name === 'forecast.operations') {
    const normalizedMetric = query.trim().toLowerCase();
    const metric = normalizedMetric.includes('finance')
      ? 'finance'
      : normalizedMetric.includes('inventory')
        ? 'inventory'
        : 'sales';
    return { metric, days: Math.min(90, Math.max(7, Math.round(days))) };
  }
  if (DAY_RANGE_TOOLS.has(tool.name)) return { days: Math.min(90, Math.max(1, Math.round(days))) };
  return {};
};

export const getAiRuntimePresentation = (status: AiRuntimeStatus): AiRuntimePresentation => {
  if (status.enabled) {
    return {
      label: 'Ready',
      tone: 'success',
      description: 'Internal AI assistant is ready for operator requests.',
    };
  }

  if (!status.keyConfigured || !status.modelConfigured || status.configurationError) {
    return {
      label: 'Needs configuration',
      tone: 'warning',
      description: 'AI is not ready. Ask a Superadmin to configure the provider.',
    };
  }

  return {
    label: 'Disabled',
    tone: 'neutral',
    description: 'AI is currently disabled by the platform configuration.',
  };
};
