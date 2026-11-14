export type CallActivityInput = {
  type?: unknown;
  title?: unknown;
  content?: unknown;
  createdAt?: unknown;
};

type CallOutcome = 'ANSWERED' | 'MISSED' | 'CALLBACK' | 'UNKNOWN';
type CallTopic = 'PRICE' | 'FINANCE' | 'RTO' | 'LISTING' | 'SUPPORT' | 'OTHER';

export type CallIntelligence = {
  totalCalls: number;
  outcomeCounts: Record<CallOutcome, number>;
  followUpRequired: boolean;
  topicCounts: Record<CallTopic, number>;
  recent: Array<{ outcome: CallOutcome; topic: CallTopic; occurredAt: string }>;
  maskedFields: string[];
};

const OUTCOMES: CallOutcome[] = ['ANSWERED', 'MISSED', 'CALLBACK', 'UNKNOWN'];
const TOPICS: CallTopic[] = ['PRICE', 'FINANCE', 'RTO', 'LISTING', 'SUPPORT', 'OTHER'];

const emptyCounts = <T extends string>(values: readonly T[]): Record<T, number> => (
  values.reduce<Record<T, number>>((result, value) => {
    result[value] = 0;
    return result;
  }, {} as Record<T, number>)
);

const text = (value: unknown) => typeof value === 'string' ? value.toLocaleLowerCase('en-IN') : '';

const outcomeFor = (title: string, content: string): CallOutcome => {
  const value = `${title} ${content}`;
  if (/\b(?:missed|no answer|not connected|unreachable)\b/iu.test(value)) return 'MISSED';
  if (/\b(?:answered|connected|spoke|discussed|talked)\b/iu.test(value)) return 'ANSWERED';
  if (/\b(?:call back|callback|call later|follow[- ]?up)\b/iu.test(value)) return 'CALLBACK';
  return 'UNKNOWN';
};

const topicFor = (content: string): CallTopic => {
  if (/\b(?:price|cost|budget|quote|discount)\b/iu.test(content)) return 'PRICE';
  if (/\b(?:finance|loan|emi|payment|gst|invoice)\b/iu.test(content)) return 'FINANCE';
  if (/\b(?:rto|rc|transfer|insurance|fitness|puc)\b/iu.test(content)) return 'RTO';
  if (/\b(?:listing|machine|vehicle|jcb|inventory|stock)\b/iu.test(content)) return 'LISTING';
  if (/\b(?:support|help|issue|problem|complaint)\b/iu.test(content)) return 'SUPPORT';
  return 'OTHER';
};

export const buildCallIntelligence = (activities: readonly CallActivityInput[]): CallIntelligence => {
  const outcomeCounts = emptyCounts(OUTCOMES);
  const topicCounts = emptyCounts(TOPICS);
  const recent: CallIntelligence['recent'] = [];
  let followUpRequired = false;

  const calls = activities.filter((activity) => text(activity.type).toUpperCase() === 'CALL');
  for (const activity of calls) {
    const title = text(activity.title);
    const content = text(activity.content);
    const outcome = outcomeFor(title, content);
    const topic = topicFor(content);
    outcomeCounts[outcome] += 1;
    topicCounts[topic] += 1;
    if (outcome === 'CALLBACK' || /\b(?:callback|call back|follow[- ]?up|interested|quote requested)\b/iu.test(`${title} ${content}`)) {
      followUpRequired = true;
    }
    const timestamp = typeof activity.createdAt === 'string' || activity.createdAt instanceof Date
      ? new Date(activity.createdAt)
      : null;
    if (timestamp && Number.isFinite(timestamp.getTime())) {
      recent.push({ outcome, topic, occurredAt: timestamp.toISOString() });
    }
  }

  recent.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return {
    totalCalls: calls.length,
    outcomeCounts,
    followUpRequired,
    topicCounts,
    recent: recent.slice(0, 10),
    maskedFields: ['content', 'leadId', 'actorId', 'phone', 'email'],
  };
};
