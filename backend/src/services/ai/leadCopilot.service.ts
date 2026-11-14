export type LeadCopilotInput = {
  status: string;
  score: number | null;
  temperature: string | null;
  priority: string | null;
  leadType: string | null;
  listingTitle: string | null;
  listingPrice: number | null;
  requirementCity: string | null;
  requirementState: string | null;
  createdAt: Date | string;
  lastContactedAt: Date | string | null;
  nextFollowUpAt: Date | string | null;
  slaDueAt: Date | string | null;
  slaBreached: boolean;
};

export type LeadFollowUpState = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NONE' | 'CLOSED';
export type LeadNextBestAction = 'CALL_AND_FOLLOW_UP' | 'SEND_WHATSAPP' | 'DISCOVERY' | 'SHARE_ALTERNATIVE' | 'NO_ACTION';

export type LeadCopilotResult = {
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  followUpState: LeadFollowUpState;
  nextBestAction: LeadNextBestAction;
  reasons: string[];
  draftMessage: string;
  signals: {
    score: number | null;
    temperature: string | null;
    priority: string | null;
    status: string;
    ageDays: number;
    daysSinceLastContact: number | null;
    slaBreached: boolean;
  };
};

const asDate = (value: Date | string | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const clean = (value: string | null | undefined) => (value || '').trim().replace(/\s+/gu, ' ');
const daysBetween = (from: Date | null, to: Date) => from ? Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000)) : null;

export const buildLeadCopilot = (input: LeadCopilotInput, now = new Date()): LeadCopilotResult => {
  const status = clean(input.status).toUpperCase();
  const temperature = clean(input.temperature).toUpperCase() || null;
  const priority = clean(input.priority).toUpperCase() || null;
  const leadType = clean(input.leadType).toUpperCase() || 'BUY';
  const listingTitle = clean(input.listingTitle);
  const city = clean(input.requirementCity);
  const state = clean(input.requirementState);
  const createdAt = asDate(input.createdAt);
  const lastContactedAt = asDate(input.lastContactedAt);
  const nextFollowUpAt = asDate(input.nextFollowUpAt);
  const ageDays = daysBetween(createdAt, now) ?? 0;
  const daysSinceLastContact = daysBetween(lastContactedAt, now);
  const closed = ['WON', 'LOST', 'CLOSED'].includes(status);
  const followUpState: LeadFollowUpState = closed
    ? 'CLOSED'
    : !nextFollowUpAt
      ? 'NONE'
      : nextFollowUpAt.getTime() < now.getTime()
        ? 'OVERDUE'
        : nextFollowUpAt.toDateString() === now.toDateString()
          ? 'TODAY'
          : 'UPCOMING';

  const reasons: string[] = [];
  if (followUpState === 'OVERDUE') reasons.push('The scheduled follow-up is overdue.');
  if (followUpState === 'TODAY') reasons.push('A follow-up is due today.');
  if (input.slaBreached) reasons.push('The response SLA is breached and needs supervisor attention.');
  if (temperature === 'HOT' || (input.score ?? 0) >= 75) reasons.push('The lead has a high buying signal.');
  if (priority === 'HIGH') reasons.push('The lead priority is high.');
  if (daysSinceLastContact !== null && daysSinceLastContact >= 3) reasons.push('The lead has not been contacted recently.');
  if (!listingTitle && !city && !state) reasons.push('The requirement is not qualified enough for a specific recommendation.');
  if (!reasons.length && ageDays > 7) reasons.push('The lead is active but has limited recent activity.');
  if (!reasons.length) reasons.push('Continue the configured CRM follow-up sequence.');

  const urgency: LeadCopilotResult['urgency'] = closed
    ? 'LOW'
    : input.slaBreached || followUpState === 'OVERDUE' || temperature === 'HOT' || priority === 'HIGH' || (input.score ?? 0) >= 75
      ? 'HIGH'
      : followUpState === 'TODAY' || input.score === null || (input.score ?? 0) >= 40
        ? 'MEDIUM'
        : 'LOW';

  const nextBestAction: LeadNextBestAction = closed
    ? 'NO_ACTION'
    : followUpState === 'OVERDUE' || input.slaBreached
      ? 'CALL_AND_FOLLOW_UP'
      : !listingTitle && !city && !state
        ? 'DISCOVERY'
        : followUpState === 'TODAY'
          ? 'SEND_WHATSAPP'
          : leadType === 'BUY' && !listingTitle
            ? 'SHARE_ALTERNATIVE'
            : 'SEND_WHATSAPP';

  const subject = listingTitle || 'your machine requirement';
  const location = [city, state].filter(Boolean).join(', ');
  const draftMessage = actionMessage(nextBestAction, subject, location);

  return {
    urgency,
    followUpState,
    nextBestAction,
    reasons,
    draftMessage,
    signals: {
      score: typeof input.score === 'number' && Number.isFinite(input.score) ? Math.round(input.score) : null,
      temperature,
      priority,
      status,
      ageDays,
      daysSinceLastContact,
      slaBreached: input.slaBreached,
    },
  };
};

const actionMessage = (action: LeadNextBestAction, subject: string, location: string) => {
  switch (action) {
    case 'CALL_AND_FOLLOW_UP': return `Please call the customer and follow up on ${subject}${location ? ` for ${location}` : ''}. Confirm availability, budget, and the next decision step.`;
    case 'DISCOVERY': return 'Please contact the customer to confirm machine type, budget, location, timeline, and finance requirement before sharing options.';
    case 'SHARE_ALTERNATIVE': return `Please share suitable alternatives for ${subject}${location ? ` near ${location}` : ''} and ask which specification matters most.`;
    case 'NO_ACTION': return 'No customer action is recommended because this lead is closed. Keep the CRM record for reporting only.';
    default: return `Please send a concise follow-up about ${subject}${location ? ` for ${location}` : ''} and ask for the next step.`;
  }
};
