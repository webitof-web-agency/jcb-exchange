export const PIPELINE_STAGE_COLORS = [
  'blue',
  'slate',
  'purple',
  'indigo',
  'amber',
  'orange',
  'zinc',
  'emerald',
  'rose',
  'cyan',
  'teal',
  'pink',
  'lime',
  'green',
  'violet',
  'red',
  'gray',
] as const;

export type PipelineStageColor = (typeof PIPELINE_STAGE_COLORS)[number];

export type PipelineStageDefinition = {
  code: string;
  name: string;
  order: number;
  color: PipelineStageColor;
  isTerminal: boolean;
  isSystem: boolean;
};

export type PipelineStageStatusLike = Pick<PipelineStageDefinition, 'code' | 'isTerminal'>;

/** The original CRM board stages, persisted as rows during the migration. */
export const DEFAULT_PIPELINE_STAGES: readonly PipelineStageDefinition[] = [
  { code: 'NEW', name: 'New', order: 10, color: 'blue', isTerminal: false, isSystem: true },
  { code: 'CONTACTED', name: 'Contacted', order: 20, color: 'slate', isTerminal: false, isSystem: true },
  { code: 'QUALIFIED', name: 'Qualified', order: 30, color: 'purple', isTerminal: false, isSystem: true },
  { code: 'INTERESTED', name: 'Interested', order: 40, color: 'indigo', isTerminal: false, isSystem: true },
  { code: 'INSPECTION_SCHEDULED', name: 'Inspection Scheduled', order: 50, color: 'amber', isTerminal: false, isSystem: true },
  { code: 'NEGOTIATION', name: 'Negotiation', order: 60, color: 'orange', isTerminal: false, isSystem: true },
  { code: 'ON_HOLD', name: 'On Hold', order: 70, color: 'zinc', isTerminal: false, isSystem: true },
  { code: 'WON', name: 'Won', order: 80, color: 'emerald', isTerminal: true, isSystem: true },
  { code: 'LOST', name: 'Lost', order: 90, color: 'rose', isTerminal: true, isSystem: true },
];

export const buildPipelineStageCode = (name: string) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);

const isColor = (value: unknown): value is PipelineStageColor =>
  typeof value === 'string' && (PIPELINE_STAGE_COLORS as readonly string[]).includes(value);

export const normalizePipelineStageInput = (input: Record<string, unknown>): Omit<PipelineStageDefinition, 'isSystem'> => {
  const name = String(input.name ?? '').trim().slice(0, 80);
  if (!name) throw new Error('Stage name is required.');

  const requestedCode = String(input.code ?? '').trim().toUpperCase();
  const code = (requestedCode || buildPipelineStageCode(name)).slice(0, 50);
  if (!/^[A-Z][A-Z0-9_]*$/.test(code)) throw new Error('Stage code must contain only letters, numbers, and underscores.');

  const orderValue = Number(input.order);
  const order = Number.isFinite(orderValue) ? Math.min(10000, Math.max(1, Math.round(orderValue))) : 1;
  const color = isColor(input.color) ? input.color : 'blue';

  return { name, code, order, color, isTerminal: input.isTerminal === true };
};

export const getPipelineStageStatusSets = (stages: readonly PipelineStageStatusLike[]) => ({
  open: stages.filter((stage) => !stage.isTerminal).map((stage) => stage.code),
  terminal: stages.filter((stage) => stage.isTerminal).map((stage) => stage.code),
});

export const canDeletePipelineStage = (usageCount: number, isTerminal = false, openStageCount = 2) =>
  usageCount === 0 && (isTerminal || openStageCount > 1);
