export type LeadSavedView = {
  key: string;
  label: string;
  filters: Record<string, string>;
  needs?: 'assign';
};

/** Keep the unfiltered view first so its total is always visible in the tab strip. */
export const LEAD_SAVED_VIEWS: readonly LeadSavedView[] = [
  { key: 'all', label: 'All Records', filters: {} },
  { key: 'open', label: 'Open Leads', filters: { view: 'open' } },
  { key: 'today', label: 'Due Today', filters: { followUp: 'today' } },
  { key: 'overdue', label: 'Overdue Follow-up', filters: { followUp: 'overdue' } },
  { key: 'hot', label: 'Hot Leads', filters: { view: 'open', temperature: 'HOT' } },
  { key: 'none', label: 'No Next Step', filters: { followUp: 'none' } },
  { key: 'unassigned', label: 'Unassigned', filters: { view: 'open', ownerId: 'none' }, needs: 'assign' },
  { key: 'sla', label: 'SLA Breached', filters: { sla: 'breached' } },
  { key: 'won', label: 'Won', filters: { view: 'won' } },
  { key: 'lost', label: 'Lost', filters: { view: 'lost' } },
  { key: 'closed', label: 'Closed Deals', filters: { view: 'closed' } },
];

export const shouldRenderPipelineStage = ({
  embedded,
  showClosed,
  isTerminal,
}: {
  embedded: boolean;
  showClosed: boolean;
  isTerminal: boolean;
}) => embedded || showClosed || !isTerminal;

/** New leads must enter an open stage; terminal stages are completed through the close-deal flow. */
export const getInitialLeadStage = (
  stages: readonly { code: string; isTerminal: boolean }[],
  fallback = 'NEW',
) => stages.find((stage) => !stage.isTerminal)?.code || fallback;

export const getStageStepperOptions = (
  stages: readonly { code: string; name: string; isTerminal?: boolean }[],
  currentStatus: string,
) => stages.length
  ? stages
  : currentStatus
    ? [{ code: currentStatus, name: currentStatus, isTerminal: false }]
    : [];
