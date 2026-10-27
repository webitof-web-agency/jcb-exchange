export type ContactPipelineStage = {
  code: string;
  name: string;
  color: string;
  isTerminal: boolean;
};

export type ContactStageLead = {
  status: string;
  mergedIntoId?: string | null;
  pipelineStage: ContactPipelineStage | null;
};

/**
 * Contacts can have multiple leads. Show the active lead's persisted pipeline
 * stage first, then the newest available stage for a closed lead. A contact
 * without a lead (or with a stale stage relation) deliberately has no stage.
 */
export const selectContactPipelineStage = (
  leads: readonly ContactStageLead[],
  terminalStatuses: readonly string[],
): ContactPipelineStage | null => {
  const visible = leads.filter((lead) => !lead.mergedIntoId && lead.pipelineStage);
  const active = visible.find((lead) => !terminalStatuses.includes(lead.status));
  return active?.pipelineStage ?? visible[0]?.pipelineStage ?? null;
};
