import { AI_READ_ONLY_TOOL_NAMES, type AiReadOnlyToolName } from './aiReadOnlyTools.service';
import { findSupportedQuestionMatches } from './aiQuestionCatalog.service';
import { financePageKeyFor, type FinancePageContext } from './financeAiPage.service';
import { analyticsPageKeyFor } from './analyticsAiPage.service';
import { recruitmentPageKeyFor } from './recruitmentAiPage.service';
import { administrationPageKeyFor } from './administrationAiPage.service';

export type AiAutoToolRequest = {
  name: AiReadOnlyToolName;
  arguments: Record<string, unknown>;
};

export type AiIntentContextMessage = {
  role: 'USER' | 'ASSISTANT';
  content: string;
  toolName?: string | null;
  toolArguments?: Record<string, unknown> | null | undefined;
};

export type AiIntentResolution =
  | { kind: 'tool'; request: AiAutoToolRequest }
  | { kind: 'clarification'; message: string }
  | { kind: 'none' };

// Keep Devanagari patterns escaped in source so the router remains encoding-safe across
// Windows development shells and production builds.
const DEVANAGARI_CODEPOINT_ALIASES: Array<[RegExp, string]> = [
  [/\u0921\u0948\u0936\u092c\u094b\u0930\u094d\u0921/gu, 'dashboard'],
  [/\u0932\u0902\u092c\u093f\u0924/gu, 'pending'],
  [/\u0915\u0947\u0935\u093e\u0908\u0938\u0940/gu, 'kyc'],
  [/\u0939\u0949\u091f/gu, 'hot'],
  [/\u0932\u0940\u0921\u094d\u0938|\u0932\u0940\u0921/gu, 'lead'],
  [/\u0917\u094d\u0930\u093e\u0939\u0915/gu, 'customer'],
  [/\u092a\u0942\u091b\u0924\u093e\u091b/gu, 'enquiry'],
  [/\u0906\u0902\u0915\u0921\u093c\u0947/gu, 'statistics'],
  [/\u0915\u0941\u0932/gu, 'total'],
  [/\u0932\u093f\u0938\u094d\u091f\u093f\u0902\u0917/gu, 'listing'],
  [/\u0938\u0942\u091a\u0940/gu, 'listing'],
  [/\u0935\u093e\u0939\u0928/gu, 'vehicle'],
  [/\u092c\u093f\u0915\u0947|\u092c\u093f\u0915\u0940|\u092c\u093f\u0915\u0947\u0902/gu, 'sold'],
  [/\u0907\u0928\u094d\u0935\u0947\u0902\u091f\u0930\u0940/gu, 'inventory'],
  [/\u092a\u093e\u0930\u094d\u091f\u0928\u0930/gu, 'partner'],
  [/\u092a\u094d\u0930\u0926\u0930\u094d\u0936\u0928/gu, 'performance'],
  [/\u0935\u093f\u0924\u094d\u0924\u0940\u092f/gu, 'finance'],
  [/\u0930\u0941\u091d\u093e\u0928/gu, 'trend'],
  [/\u091f\u094d\u0930\u0947\u0902\u0921/gu, 'trend'],
  [/\u092a\u0942\u0930\u094d\u0935\u093e\u0928\u0941\u092e\u093e\u0928/gu, 'forecast'],
  [/\u0905\u0917\u0932\u0947|\u0905\u0917\u0932\u0940|\u0905\u0917\u0932\u093e/gu, 'agle'],
  [/\u0906\u0930\u091f\u0940\u0913/gu, 'rto'],
  [/\u0905\u0928\u0941\u092a\u093e\u0932\u0928/gu, 'compliance'],
  [/\u0915\u093e\u0930\u094d\u092f\u094b\u0902|\u0915\u093e\u0930\u094d\u092f/gu, 'task'],
  [/\u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c\u093c|\u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c/gu, 'documents'],
  [/\u092b\u0949\u0932\u094b\u0905\u092a|\u092b\u0949\u0932\u094b\u0905\u092a\u094d\u0938/gu, 'followups'],
  [/\u092d\u0930\u094d\u0924\u0940/gu, 'recruitment'],
  [/\u0938\u093e\u0930\u093e\u0902\u0936/gu, 'summary'],
  [/\u0935\u094d\u0939\u093e\u091f\u094d\u0938\u0910\u092a|\u0935\u094d\u0939\u093e\u091f\u094d\u0938\u090f\u092a/gu, 'whatsapp'],
  [/\u0938\u0902\u0926\u0947\u0936/gu, 'messages'],
  [/\u0921\u093f\u0932\u0940\u0935\u0930\u0940/gu, 'delivery'],
  [/\u0917\u0924\u093f\u0935\u093f\u0927\u093f/gu, 'activity'],
  [/\u091f\u0947\u092e\u094d\u092a\u0932\u0947\u091f/gu, 'templates'],
  [/\u0907\u0902\u091f\u0940\u0917\u094d\u0930\u0947\u0936\u0928/gu, 'integration'],
  [/\u0938\u0902\u091a\u093e\u0930|\u0938\u0942\u091a\u0928\u093e\u090f\u0902|\u0938\u0942\u091a\u0928\u093e/gu, 'notifications'],
  [/\u0905\u0928\u092a\u0922\u093c\u0940/gu, 'unread'],
  [/\u0915\u093e|\u0915\u0940|\u0915\u0947/gu, 'ka'],
  [/\u092e\u0947\u0902/gu, 'me'],
  [/\u0907\u0938/gu, 'is'],
  [/\u092e\u0939\u0940\u0928\u0947/gu, 'mahine'],
  [/\u0935\u093e\u0932\u0940|\u0935\u093e\u0932\u0947|\u0935\u093e\u0932\u093e/gu, 'wali'],
  [/\u0916\u094b\u091c\u094b|\u0916\u094b\u091c\u0947\u0902/gu, 'search'],
  [/\u0915\u0930\u094b/gu, 'karo'],
  [/\u0915\u093f\u0924\u0928\u0947|\u0915\u093f\u0924\u0928\u0940|\u0915\u093f\u0924\u0928\u093e/gu, 'kitni'],
  [/\u092a\u093f\u091b\u0932\u0947|\u092a\u093f\u091b\u0932\u0940|\u092a\u093f\u091b\u0932\u093e/gu, 'pichle'],
  [/\u0926\u093f\u0928/gu, 'din'],
  [/\u092c\u0924\u093e\u0913|\u092c\u0924\u093e/gu, 'batao'],
  [/\u0926\u093f\u0916\u093e\u0913/gu, 'show'],
  [/\u0915\u094c\u0928|\u0915\u094c\u0928-\u0915\u094c\u0928/gu, 'kaun'],
  [/\u0915\u094d\u092f\u093e/gu, 'what'],
  [/\u0935\u093f\u0935\u0930\u0923/gu, 'details'],
  [/\u0930\u091c\u093f\u0938\u094d\u091f\u094d\u0930\u0947\u0936\u0928|\u092a\u0902\u091c\u0940\u0915\u0930\u0923/gu, 'registration'],
  [/\u0928\u0902\u092c\u0930/gu, 'number'],
  [/\u092e\u093e\u0932\u093f\u0915/gu, 'malik'],
  [/\u0907\u0938\u0915\u093e|\u0907\u0938\u0915\u0947|\u0909\u0938\u0915\u093e|\u0909\u0938\u0915\u0947/gu, 'iska'],
  [/\u0938\u094d\u0925\u093f\u0924\u093f/gu, 'status'],
  [/\u0938\u0924\u094d\u092f\u093e\u092a\u0928/gu, 'verification'],
  [/\u0914\u0930/gu, 'aur'],
  [/\u092d\u093e\u0917\u0940\u0926\u093e\u0930/gu, 'partner'],
  [/\u092d\u0941\u0917\u0924\u093e\u0928/gu, 'payment'],
  [/\u0938\u0942\u091a\u0928\u093e\u090f\u0902|\u0938\u0942\u091a\u0928\u093e/gu, 'notifications'],
];

const SPELLING_ALIASES: Array<[RegExp, string]> = [
  [/\bsoftwar\b/gu, 'software'],
  [/\bdashbord\b/gu, 'dashboard'],
  [/\bsummry\b/gu, 'summary'],
  [/\bhott\b/gu, 'hot'],
  [/\bleeds?\b/gu, 'leads'],
  [/\bleed\b/gu, 'lead'],
  [/\bstatstics?\b/gu, 'statistics'],
  [/\binventry\b/gu, 'inventory'],
  [/\btrand\b/gu, 'trend'],
  [/\btrnd\b/gu, 'trend'],
  [/\breveue\b/gu, 'revenue'],
  [/\bpartnrs?\b/gu, 'partners'],
  [/\bperformnce\b/gu, 'performance'],
  [/\bfinace\b/gu, 'finance'],
  [/\bsttaus\b/gu, 'status'],
  [/\bdocumnts?\b/gu, 'documents'],
  [/\binsurence\b/gu, 'insurance'],
  [/\bexpences?\b/gu, 'expenses'],
  [/\bpaym(?:e|a)nt(?:s)?\b/gu, 'payment'],
  [/\bblokers?\b/gu, 'blockers'],
  [/\bchasssis\b/gu, 'chassis'],
  [/\bengne\b/gu, 'engine'],
  [/\binvoic\b/gu, 'invoice'],
  [/\bforcast\b/gu, 'forecast'],
  [/\bpendng\b/gu, 'pending'],
  [/\b(?:tsk|taks)\b/gu, 'task'],
  [/\bcustmers?\b/gu, 'customer'],
  [/\benqur(?:y|ies)\b/gu, 'enquiry'],
  [/\bfolowups?\b/gu, 'followups'],
  [/\brecr\s+uitment\b/gu, 'recruitment'],
  [/\bserach\b/gu, 'search'],
  [/\bdelivry\b/gu, 'delivery'],
  [/\btemplat\b/gu, 'template'],
  [/\bnotificatons?\b/gu, 'notifications'],
  [/\bsurepas\b/gu, 'surepass'],
  [/\blistngs?\b/gu, 'listing'],
  [/\blistins?\b/gu, 'listing'],
  [/\blistings?\b/gu, 'listing'],
  [/\bvechiles?\b/gu, 'vehicle'],
  [/\bvehicals?\b/gu, 'vehicle'],
  [/\bregist(?:er|ration)\b/gu, 'registration'],
  [/\binvo?ice\b/gu, 'invoice'],
  [/\bpartnr\b/gu, 'partner'],
  [/\bnotificaton\b/gu, 'notification'],
  [/\bdetial(s)?\b/gu, 'details'],
  [/\bpappers?\b/gu, 'papers'],
  [/\bkon\b/gu, 'kaun'],
  [/\bleds?\b/gu, 'leads'],
  [/\bwhatasapp\b/gu, 'whatsapp'],
  [/\bverfication(s)?\b/gu, 'verification'],
  [/\bverificaton(s)?\b/gu, 'verification'],
  [/\bverfiy\b/gu, 'verify'],
  [/\bdossir\b/gu, 'dossier'],
];

const normalizeMessage = (message: string) => {
  let normalized = message
    .toLocaleLowerCase('en-IN')
    .replace(/[\u201c\u201d\u2018\u2019]/gu, '"');
  for (const [pattern, replacement] of DEVANAGARI_CODEPOINT_ALIASES) normalized = normalized.replace(pattern, replacement);
  for (const [pattern, replacement] of SPELLING_ALIASES) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
};

export const isAiGreeting = (message: string): boolean => {
  const normalized = normalizeMessage(message);
  return /^(?:hi|hello|hey|namaste|नमस्ते|good\s+(?:morning|afternoon|evening))(?:\s+(?:there|ji|sir|maam|mam|friend))?$/u.test(normalized);
};

export const greetingResponseFor = (_message: string): string =>
  'Namaste! Main JCB Exchange ke Dashboard, CRM, Listings, RTO, Finance aur Recruitment ka read-only data bata sakta hoon. Aap kya dekhna chahte hain?';

const hasAny = (message: string, patterns: readonly RegExp[]) => patterns.some((pattern) => pattern.test(message));

const selectedSoldVehicleArguments = (recordId: string) => {
  const normalized = recordId.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(normalized)) {
    return { dealId: normalized };
  }
  const recordNumber = normalized.match(/^(sa-\d{4}-\d+)/iu)?.[1];
  return recordNumber ? { recordNumber: recordNumber.toUpperCase() } : null;
};

const MUTATION_PATTERNS = [
  /\b(create|add|delete|remove|update|edit|approve|reject|assign|send|purchase|buy)\b/u,
  /\b(banao|bnao|hatao|bhejo|badlo|becho|kharido)\b/u,
];
const SELL_MUTATION_PATTERN = /\bsell\b/u;

const RANGE_PATTERNS = [
  /\b(?:last|past|previous|pichle|pichla|pichli|pichhle)\s+(\d{1,3})\s*(?:days?|din)\b/u,
  /\b(\d{1,3})\s*(?:days?|din)\b/u,
];

const FORECAST_SIGNALS = [
  /\b(forecast|predict(?:ion)?|project(?:ion)?|estimate|expected|future)\b/u,
  /\b(?:next|coming|agle|agale)\s+(?:\d{1,3}\s+)?(?:days?|din|weeks?|haft(?:e|on)|months?|mahine?)\b/u,
];

const rangeArguments = (message: string): Record<string, unknown> => {
  for (const pattern of RANGE_PATTERNS) {
    const match = pattern.exec(message);
    const days = match ? Number(match[1]) : NaN;
    if (Number.isInteger(days) && days >= 1 && days <= 90) return { days };
  }
  if (/\btoday\b|\baaj\b/u.test(message)) return { days: 1 };
  if (/\b(?:this|current)\s+month\b|\bis\s+(?:month|mahine)\b/u.test(message)) return { days: 30 };
  return {};
};

const forecastHorizonArguments = (message: string): Record<string, unknown> => {
  const match = /\b(?:next|coming|agle|agale)\s+(\d{1,3})\s*(days?|din|weeks?|haft(?:e|on)|months?|mahine?)\b/u.exec(message);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2] ?? '';
    const multiplier = /weeks?|haft/u.test(unit) ? 7 : /months?|mahine?/u.test(unit) ? 30 : 1;
    return { horizon: Math.min(30, Math.max(1, amount * multiplier)) };
  }
  if (/\b(?:next|coming|agle|agale)\s+month\b|\bis\s+(?:month|mahine)\b/u.test(message)) return { horizon: 30 };
  return {};
};

const forecastMetricFor = (message: string): 'sales' | 'inventory' | 'finance' | 'leads' | 'kyc' | 'partners' | 'collections' => {
  if (hasAny(message, [
    /\b(lead|leads|crm|enquir(?:y|ies)|follow\s*ups?|conversion)\b/u,
  ])) return 'leads';
  if (hasAny(message, [
    /\b(kyc|pan|gst|aadhaar|aadhar|verification|surepass|document\s+verification)\b/u,
  ])) return 'kyc';
  if (hasAny(message, [
    /\b(partner|partners|dealer|dealers|vendor)\b/u,
  ])) return 'partners';
  if (hasAny(message, [
    /\b(collection|collections|payment|payments|receivable|invoice|invoices|receipt)\b/u,
  ])) return 'collections';
  if (hasAny(message, [
    /\b(finance|financial|cash\s*flow|income|expense|expenses|revenue|profit|paise|paisa)\b/u,
  ])) return 'finance';
  if (hasAny(message, [
    /\b(sales?|sold|sell|selling|bik(?:e|i|na)?)\b/u,
  ])) return 'sales';
  if (hasAny(message, [
    /\b(inventory|listing|listings|stock|vehicles?|gaadi|gadi)\b/u,
  ])) return 'inventory';
  return 'sales';
};

const forecastRequest = (message: string): AiAutoToolRequest | null => {
  if (!hasAny(message, FORECAST_SIGNALS)) return null;
  const historyArguments = rangeArguments(message);
  const horizonArguments = forecastHorizonArguments(message);
  const isForwardOnlyRange = typeof horizonArguments.horizon === 'number'
    && typeof historyArguments.days === 'number'
    && historyArguments.days === horizonArguments.horizon
    && /\b(?:next|coming|agle|agale)\s+\d{1,3}\s*(?:days?|din|weeks?|haft(?:e|on)|months?|mahine?)\b/u.test(message);
  if (isForwardOnlyRange) delete historyArguments.days;
  return {
    name: 'forecast.operations',
    arguments: {
      metric: forecastMetricFor(message),
      ...historyArguments,
      ...horizonArguments,
    },
  };
};

const soldVehicleAnalyticsMetricFor = (message: string): 'overview' | 'profit_loss' | 'payments' | 'refunds' | 'rto_delay' | 'documents' | 'collection_risk' | 'low_margin' | 'model_performance' | 'monthly_comparison' | 'forecast' | 'suggestions' => {
  if (/\b(?:forecast|predict|prediction|future|cash\s*flow)\b/u.test(message)) return 'forecast';
  if (/\b(?:model[-\s]?wise|model\s+performance|brand\s+performance)\b/u.test(message)) return 'model_performance';
  if (/\b(?:month(?:ly)?\s+comparison|month\s+on\s+month|mom|compare\s+months?)\b/u.test(message)) return 'monthly_comparison';
  if (/\b(?:low[-\s]?margin|loss\s+deal|losses?|profitability)\b/u.test(message)) return /\blow[-\s]?margin\b/u.test(message) ? 'low_margin' : 'profit_loss';
  if (/\b(?:collection\s+risk|payment\s+risk|overdue|outstanding\s+risk|recover)\b/u.test(message)) return 'collection_risk';
  if (/\b(?:rto|transfer)\b/u.test(message) && /\b(?:delay|delayed|late|pending|backlog|days?)\b/u.test(message)) return 'rto_delay';
  if (/\b(?:document|documents|deed|kyc|file|files)\b/u.test(message) && /\b(?:status|missing|pending|ready|readiness|details?|data)\b/u.test(message)) return 'documents';
  if (/\b(?:refund|refunded|forfeit)\b/u.test(message)) return 'refunds';
  if (/\b(?:payment|payments|receipt|receipts|seller\s+payout|payout|outstanding|balance|collection)\b/u.test(message)) return 'payments';
  if (/\b(?:profit|loss|margin|gst|expense|expenses|revenue|sale|purchase)\b/u.test(message)) return 'profit_loss';
  if (/\b(?:suggestion|suggestions|recommendation|recommend|next\s+action|what\s+should)\b/u.test(message)) return 'suggestions';
  return 'overview';
};

const soldVehicleAnalyticsRequest = (message: string, normalizedMessage = message): AiAutoToolRequest | null => {
  if (!/\b(?:sold\s+vehicles?|sold\s+vehicle|sell\s+accounts?|sale\s+accounts?|deal)\b/u.test(message)) return null;
  const metric = soldVehicleAnalyticsMetricFor(normalizedMessage);
  const hasExplicitAnalyticsSignal = /\b(?:analytics?|cash\s*flow|collection\s+risk|compare\s+months?|document(?:s)?\s+(?:status|missing|pending|ready)|forecast|future|low[-\s]?margin|model[-\s]?wise|monthly\s+comparison|outstanding|overdue|payment\s+risk|payout|predict|profit(?:ability)?|refund|rto\s+(?:delay|pending|status)|seller\s+payout|suggest(?:ion|ions)?|what\s+should)\b/u.test(normalizedMessage);
  if (metric === 'overview' || !hasExplicitAnalyticsSignal) return null;
  const identifier = extractSoldVehicleDetailRequest(message);
  const historyArguments = rangeArguments(normalizedMessage);
  const horizonArguments = forecastHorizonArguments(normalizedMessage);
  const isForwardOnlyRange = typeof horizonArguments.horizon === 'number'
    && typeof historyArguments.days === 'number'
    && historyArguments.days === horizonArguments.horizon
    && /\b(?:next|coming|agle|agale)\s+\d{1,3}\s*(?:days?|din|weeks?|haft(?:e|on)|months?|mahine?)\b/u.test(normalizedMessage);
  if (isForwardOnlyRange) delete historyArguments.days;
  return {
    name: 'sold.vehicle.analytics',
    arguments: {
      ...(identifier ?? {}),
      metric,
      ...historyArguments,
      ...(metric === 'forecast' ? horizonArguments : {}),
    },
  };
};

const listingSignals = /\b(listings?|inventory|vehicles?|gaadi|gadi)\b/u;
const leadSignals = /\b(crm|leads?|enquir(?:y|ies))\b/u;
const enquirySignals = /\b(enquir(?:y|ies)|inquir(?:y|ies)|requests?)\b/u;
const customerSignals = /\b(customers?|visitors?|buyers?)\b/u;
const taskSignals = /\b(tasks?|work\s+items?|pending\s+work|kaam)\b/u;
const listingSearchSignals = /\b(search|find|locate)\b/u;
const listingDetailSignals = /\b(details?|information|info|specifications?)\b/u;
const leadDetailSignals = /\b(details?|information|info|status|specific)\b/u;
const vehicleIdentitySignals = [
  /\b(vehicle|gaadi|gadi)\s+(identity|verification|owner|registration|rc|chassis|engine)\b/u,
  /\b(vehicle|gaadi|gadi)\s+(status|details?|information|info)\b/u,
  /\bverification\s+(?:status|details?|info)\b/u,
  /\b(registration|rc|chassis|engine)\s+(?:number|no|status|details?|info)?\b/u,
  /\b(owner|malik)\s+(?:of|for|ka|ki|ke)\b/u,
];
const rtoDocumentSignals = [
  /\b(rto|rc|document|documents|transfer|insurance|fitness|puc|hsrp|tax)\b/u,
];
const verificationSummarySignals = [
  /\b(pan|gst|gstin|aadhaar|aadhar|driving\s+license|driver'?s\s+license|dl)\b/u,
  /\bverification\s+(?:history|summary|records?|stats?|statistics)\b/u,
];
const surepassSignals = /\bsurepass\b/u;
const whatsappStatusSignals = /\b(template|templates|integration|configuration|configured|connection|ready|settings?)\b/u;
const notificationSummarySignals = /\b(unread|read|notification|notifications|alerts?|count|total|status|summary|stats?|statistics)\b/u;
const listingReadIntent = [
  /\bhow\s+many\b/u,
  /\b(count|total|number|stats?|statistics|status|available|active|published)\b/u,
  /\b(kitne|kitni|ginti|batao|btao|list\s+kiye)\b/u,
];
const listingListIntent = [
  /\b(which|what|show|list|all|kaun|kaun\s+kaun|dikhao)\b/u,
  /\b(available|active|published)\b/u,
];
const listingStatusForSummary = (message: string): string | null => {
  if (/\b(available|active|published)\b/u.test(message)) return 'PUBLISHED';
  if (/\bsold\b/u.test(message)) return 'SOLD';
  if (/\bdraft\b/u.test(message)) return 'DRAFT';
  if (/\bpaused\b/u.test(message)) return 'PAUSED';
  if (/\breserved\b/u.test(message)) return 'RESERVED';
  return null;
};
const leadSummaryIntent = [
  /\bhow\s+many\b/u,
  /\b(count|total|number|summary|stats?|statistics|funnel|trend|list|show|which|what)\b/u,
  /\b(kitne|kitni|ginti|sankhya|batao|btao|kaun|kaun\s+kaun)\b/u,
];
const partnerListIntent = [
  /\b(which|what|show|list|all|kaun|kaun\s+kaun|dikhao)\b/u,
  /\b(partner|partners|dealer|dealers)\b.*\b(list|kaun|which|show|all)\b/u,
];

const rangeTool = (name: AiReadOnlyToolName, message: string): AiAutoToolRequest => ({
  name,
  arguments: rangeArguments(message),
});

const extractListingDetailQuery = (message: string): string | null => {
  const patterns = [
    /\b(?:details?|information|info|specifications?)\s+(?:of|for|on|ka|ki|ke)\s+(.+?)(?:\s+(?:listing|vehicle))?(?:\s+(?:batao|btao|show|dikhao))?$/u,
    /\b(?:show|give|tell)\s+(?:me\s+)?(?:the\s+)?(?:listing|vehicle)\s+(?:details?|info)\s+(?:of|for|on|ka|ki|ke)?\s*(.+?)(?:\s+(?:batao|btao|show|dikhao))?$/u,
    /\b(.+?)\s+(?:listing|vehicle)\s+(?:ka|ki|ke)?\s*(?:details?|info|information)\s+(?:batao|btao|show|dikhao)?$/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    const query = match?.[1]?.trim().replace(/^(?:listing|vehicle)\s+/u, '');
    if (query && !/^(?:the|a|an)$/u.test(query)) return query.slice(0, 100);
  }
  return null;
};

const extractListingSearchQuery = (message: string): string | null => {
  const patterns = [
    /\b(?:search|find|locate)\s+(?:listings?|inventory|vehicles?|gaadi|gadi)\s+(?:for|with|named|called)\s+(.+)$/u,
    /\b(?:search|find|locate)\s+(?:for\s+)?(.+?)\s+(?:listings?|inventory|vehicles?|gaadi|gadi)$/u,
    /\bshow\s+(?:me\s+)?(.+?)\s+(?:listings?|inventory|vehicles?|gaadi|gadi)$/u,
    /^(.+?)\s+(?:wali\s+)?(?:listings?|inventory|vehicles?)\s+search(?:\s+karo)?$/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    const query = match?.[1]?.trim();
    if (query && !/^(?:the|all|some|available|active|published|all\s+(?:vehicle|vehicles?|listing|listings?|inventory))$/u.test(query)) {
      return query.slice(0, 100);
    }
  }
  return null;
};

const extractLeadDetailQuery = (message: string): string | null => {
  const patterns = [
    /\b(?:show|give|tell)\s+(?:me\s+)?(?:the\s+)?lead\s+(?:details?|info|information)\s+(?:of|for|on)?\s*(.+)$/u,
    /\b(?:details?|info|information|status)\s+(?:of|for|on)\s+(?:lead\s+)?(.+)$/u,
    /\b(.+?)\s+lead\s+(?:ka|ki|ke)?\s*(?:details?|info|information|status)\b.*$/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    const query = match?.[1]?.trim();
    if (query && !/^(?:the|a|an|lead)$/u.test(query)) return query.slice(0, 100);
  }
  return null;
};

const extractLeadCopilotQuery = (message: string): string | null => {
  const query = extractLeadDetailQuery(message);
  if (!query) return null;
  const cleaned = query
    .replace(/\s+(?:next\s+action|follow[ -]?up\s+draft|what\s+should\s+i\s+do|recommend(?:ation)?s?|copilot)\b.*$/u, '')
    .trim();
  return cleaned ? cleaned.slice(0, 100) : null;
};

const extractEnquiryDetailQuery = (message: string): string | null => {
  const directMatch = /\b(?:enquir(?:y|ies)|inquir(?:y|ies))\s+(.+?)\s+(?:details?|info|information|status)\b.*$/u.exec(message);
  if (directMatch?.[1]?.trim()) return directMatch[1].trim().slice(0, 100);
  const normalizedLeadMessage = message.replace(/\b(?:enquir(?:y|ies)|inquir(?:y|ies)|requests?)\b/gu, 'lead');
  return extractLeadDetailQuery(normalizedLeadMessage);
};

const extractCustomerDetailQuery = (message: string): string | null => {
  const patterns = [
    /\b(?:customer|visitor|buyer)\s+(?:details?|info|information|status)\s+(?:of|for|on|ka|ki|ke)?\s*(.+?)(?:\s+(?:batao|btao|show|dikhao))?$/u,
    /\b(?:customer|visitor|buyer)\s+(.+?)\s+(?:ka|ki|ke)\s+(?:details?|info|information|status)\b.*$/u,
    /\b(?:details?|info|information|status)\s+(?:of|for|on)\s+(?:customer|visitor|buyer)\s+(.+)$/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    const query = match?.[1]?.trim();
    if (query && !/^(?:the|a|an)$/u.test(query)) return query.slice(0, 100);
  }
  return null;
};

const extractContactDetailQuery = (message: string): string | null => {
  const patterns = [
    /\b(?:contact|contacts?)\s+(.+?)\s+(?:ka|ki|ke)\s+(?:details?|info|information|status|vivaran|jankari|jaankari)\b.*$/u,
    /\b(?:details?|info|information|status|vivaran|jankari|jaankari)\s+(?:of|for|on)\s+(?:contact|contacts?)\s+(.+)$/u,
    /\b(?:contact|contacts?)\s+(?:details?|info|information|status|vivaran|jankari|jaankari)\s+(?:of|for|on|ka|ki|ke)?\s*(.+?)(?:\s+(?:batao|btao|show|dikhao))?$/u,
  ];
  for (const pattern of patterns) {
    const query = pattern.exec(message)?.[1]?.trim();
    if (query && !/^(?:the|a|an)$/u.test(query)) return query.slice(0, 100);
  }
  return null;
};

const extractDocumentSearchQuery = (message: string): string | null => {
  if (/^\s*verification\s+templates?\s+(?:(?:download|open|view|show|give|send|do|de|karo|kar|please|pls)\s*)+$/iu.test(message)) return 'verification template';
  const withoutAction = message
    .replace(/\s+(?:do|de|dikhao|dikhaiye|nikalo|nikaal|download|open|view|bhejo|send|please|pls|karke|karo|kar)(?:\s+(?:do|de|dikhao|dikhaiye|nikalo|nikaal|download|open|view|bhejo|send|please|pls|karke|karo|kar)){0,3}\s*$/iu, '')
    .trim();
  const startsWithDocument = /^(?:resume|cv|invoice|bill|aadhaar|aadhar|pan|gst|rto|insurance|fitness|puc|hsrp|offer(?:\s+letter)?|vehicle\s+docs?|verification\s+templates?|document|pdf|file)\b/iu.test(withoutAction);
  const patterns = startsWithDocument
    ? [/\b(?:resume|cv|invoice|bill|aadhaar|aadhar|pan|gst|rto|insurance|fitness|puc|hsrp|offer(?:\s+letter)?|vehicle\s+docs?|verification\s+templates?|document|pdf|file)\s+(?:of|for|ka|ki|ke)?\s*(.+)$/iu]
    : [/\b(.+?)\s+(?:ka|ki|ke)\s+(?:resume|cv|invoice|bill|aadhaar|aadhar|pan|gst|rto|insurance|fitness|puc|hsrp|offer(?:\s+letter)?|vehicle\s+docs?|verification\s+templates?|document|pdf|file)\b.*$/iu];
  for (const pattern of patterns) {
    const query = pattern.exec(withoutAction)?.[1]
      ?.replace(/\s+(?:ka|ki|ke)\s+(?:pdf|document|file)\s*$/iu, '')
      ?.trim();
    if (query && !/^(?:the|a|an|mujhe|please|pls)$/iu.test(query)) return query.slice(0, 100);
  }
  const cleaned = message
    .replace(/\b(?:mujhe|please|pls|show|give|do|de|dikhao|dikhaiye|nikalo|nikaal|download|open|view|bhejo|send|ka|ki|ke|of|for|the|a|an)\b/giu, ' ')
    .replace(/\b(?:resume|cv|invoice|bill|aadhaar|aadhar|pan|gst|rto|insurance|fitness|puc|hsrp|offer|letter|vehicle|docs?|verification|templates?|document|pdf|file)\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (cleaned) return cleaned.slice(0, 100);
  return /\bverification\s+templates?\b/iu.test(message) ? 'verification template' : null;
};

const documentKindFor = (message: string): 'all' | 'kyc' | 'resume' | 'invoice' | 'rto' | 'offer' | 'vehicle' | 'verification' => {
  if (/\b(?:resume|cv)\b/iu.test(message)) return 'resume';
  if (/\b(?:invoice|bill)\b/iu.test(message)) return 'invoice';
  if (/\b(?:offer(?:\s+letter)?)\b/iu.test(message)) return 'offer';
  if (/\b(?:rto|insurance|fitness|puc|hsrp)\b/iu.test(message)) return 'rto';
  if (/\bvehicle\s+docs?\b/iu.test(message)) return 'vehicle';
  if (/\bverification\s+templates?\b/iu.test(message)) return 'verification';
  if (/\b(?:aadhaar|aadhar|pan|gst|kyc)\b/iu.test(message)) return 'kyc';
  return 'all';
};

const extractVehicleIdentityQuery = (message: string): string | null => {
  const patterns = [
    /\b(?:status|details?|information|info|verification)\s+(?:of|for|on)\s+(.+)$/u,
    /\b(?:owner|malik)\s+(?:of|for|ka|ki|ke)\s+(.+)$/u,
    /\b(?:registration|rc|chassis|engine)\s+(?:number|no)?\s*(?:of|for)?\s*(.+)$/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    const query = match?.[1]?.trim().replace(/^(?:vehicle|gaadi|gadi)\s+/u, '').trim();
    if (query && !/^(?:the|a|an|this|that|ki\s+|ka\s+|ke\s+|photo|photos|image|images|pic|pics|meter|reading|dashboard|dikhao|batao|btao)$/iu.test(query)) {
      return query.slice(0, 100);
    }
  }
  return null;
};

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;

const extractUuid = (message: string): string | null => message.match(UUID_PATTERN)?.[0] || null;

const extractSoldVehicleDetailRequest = (message: string): Record<string, string> | null => {
  const dealId = extractUuid(message);
  if (dealId && /\b(?:deal|record|sell\s+account|sale\s+account)\b/iu.test(message)) return { dealId };
  const labelled = /\b(?:deal|record|sell\s+account|sale\s+account)\s*(?:id|no\.?|number|record)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})\b/iu.exec(message);
  if (labelled?.[1] && /[0-9./_-]/u.test(labelled[1]) && !/^(?:id|no|number|details?|detail|data|status|ka|ke|ki|batao|btao|dikhao|show)$/iu.test(labelled[1])) {
    return { recordNumber: labelled[1].toUpperCase() };
  }
  const record = /\b(?:SA[-_/][A-Z0-9][A-Z0-9./_-]{2,}|SA\d[A-Z0-9./_-]{2,}|JCBX[/_-]SV[-_/]?[A-Z0-9][A-Z0-9./_-]{2,})\b/iu.exec(message);
  if (/\b(?:invoice|bill)\b/iu.test(message)) return null;
  return record?.[0] ? { recordNumber: record[0].toUpperCase() } : null;
};

const extractRegistrationNumber = (message: string): string | null => {
  const candidates = message.toUpperCase().match(/\b[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4}\b/g) || [];
  const candidate = candidates.find((value) => /[A-Z]/u.test(value) && /\d/u.test(value));
  return candidate ? candidate.replace(/[\s-]/gu, '') : null;
};

const extractInvoiceNumber = (message: string): string | null => {
  const match = /\b(?:invoice|bill)\s*(?:no\.?|number|id)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/iu.exec(message);
  if (!match?.[1]) return null;
  const candidate = match[1].trim();
  if (/^(?:batao|btao|show|tell|details?|info|information)$/iu.test(candidate)) return null;
  const hasExplicitLabel = /\b(?:invoice|bill)\s*(?:no\.?|number|id)\b/iu.test(message);
  return hasExplicitLabel || /[0-9./_-]/u.test(candidate) ? candidate : null;
};

const extractChassisNumber = (message: string): string | null => {
  const match = /\bchassis\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/iu.exec(message);
  if (!match?.[1]) return null;
  const candidate = match[1].trim();
  return /^(?:ka|ke|ki|batao|btao|show|details?|detail|number|no)$/iu.test(candidate) ? null : candidate;
};

const extractTasksSubject = (message: string): string | null => {
  const normalized = message.trim();
  const m = /^([A-Za-z0-9\s]{3,40})\s+(?:ke|ki|ka)\s+(?:compliance|transfer|rto\s+transfer|rto|tasks?|milestones?)/iu.exec(normalized);
  if (m?.[1]) {
    const candidate = m[1].trim();
    if (!/^(?:tasks?|rto|compliance|vehicle|gaadi|gadi|desk|hamare|hamari|platform|yahan|total|saare|sare|all)$/iu.test(candidate)) {
      return candidate;
    }
  }
  return null;
};

const extractSoldParty = (message: string): string | null => {
  const normalized = message.trim();
  if (/\b(?:how\s+many|kitne|kitni|kitna|count|total|summary|trend|statistics|stats)\b/iu.test(message) && !/\b(?:ko|se)\s+(?:bechi|beche|biki|bika|bik|sold|sale)\b/iu.test(message)) {
    return null;
  }
  const pattern1 = /^(.+?)\s+(?:ko|se|wali|wala)?\s*(?:bechi|beche|biki|bika|bik|sold|sale)\s+(?:gayi|gaye|gaya|hui|hue|vehicle|machine|gaadi|gadi|deal)/iu;
  const m1 = pattern1.exec(normalized);
  if (m1?.[1]) {
    const party = m1[1]!.trim().replace(/^(?:hume|humko|mujhe|please|plz)\s+/iu, '');
    if (party.length >= 2 && !/^(?:vehicle|gaadi|gadi|machine|deal|how\s+many|how|what|which|who|whom|kitne|kitni|kitna|kaun|kisko|kise)$/iu.test(party)) return party;
  }
  const pattern2 = /(?:bechi|beche|biki|bika|bik|sold|sale)\s+(?:gayi|gaye|gaya|hui|hue|vehicle|machine|gaadi|gadi|deal)(?:\s+(?:to|ko|for))?\s+([A-Za-z0-9\s]{2,40})/iu;
  const m2 = pattern2.exec(normalized);
  if (m2?.[1]) {
    const party = m2[1]!.trim();
    if (party.length >= 2 && !/^(?:vehicle|gaadi|gadi|machine|deal|how\s+many|how|what|which|who|whom|kitne|kitni|kitna|kaun|kisko|kise)$/iu.test(party)) return party;
  }
  return null;
};

const VEHICLE_BRAND_MODEL_PATTERN = /\b(?:jcb|caterpillar|cat|hitachi|komatsu|tata|hyundai|sany|kobelco|escorts|kubota|volvo|bobcat|mahindra|backhoe|loader|excavator|compactor|crane|tipper|dumper|tractor|3dx|424b|424|ex200|pc200|210)\b/iu;

const extractVehicleSubject = (message: string): string | null => {
  const normalized = message.trim();
  const pattern = /^(.+?)(?:\s+(?:wali|wala|wale|waali))?(?:\s+(?:gaadi|gadi|machine|vehicle|equipment))?\s+(?:ki|ke|ka|ko|me|mein|se)\s+(?:(?:vehicle|gaadi|gadi)\s+)?(?:meter|reading|photo|photos|image|images|pic|pics|dashboard|status|owner|malik|rto|validity|details?|jankari|pura|poora|sab|bina|invoice|bill|receipt|margin|profit|saare|sare|all|kagaz|kaagaz|paper|papers|document|documents|docs?|dossier|checklist|zip|pdf|deed|aadhaar|pan|gst|kyc|kaun|kya)/iu;
  const match = pattern.exec(normalized);
  if (!match?.[1]) return null;
  const subject = match[1]!.trim().replace(/^(?:hume|humko|mujhe|please|plz)\s+/iu, '');
  if (/^(?:vehicle|gaadi|gadi|machine|equipment|total|all|sab|kisi|partners?|dealers?|leads?|users?|show|more)$/iu.test(subject)) return null;
  const isVehicle = VEHICLE_BRAND_MODEL_PATTERN.test(subject) || /\b(?:wali|wala|wale|waali)\s+(?:gaadi|gadi|machine|vehicle|equipment)\b/iu.test(normalized);
  return isVehicle && subject.length >= 2 ? subject : null;
};

const extractSoldVehicleSearchRequest = (message: string, pageContext: FinancePageContext): Record<string, unknown> | null => {
  const soldContext = pageContext.moduleKey === 'sold-vehicles'
    || /\b(?:sold\s+vehicles?|sold\s+deals?|sell\s+accounts?|sale\s+accounts?|deal)\b/iu.test(message)
    || /\b(?:bech[aie]\s+(?:gayi|gaye|gaya)|bik[ie]\s+(?:gayi|gaye|gaya|hui|hue)|bikri)\b/iu.test(message);
  if (!soldContext) return null;
  const registration = extractRegistrationNumber(message);
  if (registration) return { vehicleNumber: registration };
  const chassisNumber = extractChassisNumber(message);
  if (chassisNumber) return { chassisNumber: chassisNumber.toUpperCase() };
  const invoiceNumber = extractInvoiceNumber(message);
  if (invoiceNumber) return { invoiceNumber: invoiceNumber.toUpperCase() };
  const listingId = extractUuid(message);
  if (listingId && /\blisting\b/iu.test(message)) return { listingId };
  const party = extractSoldParty(message);
  if (party) return { query: party };
  return null;
};

const extractRtoWorkDossierRequest = (message: string, pageContext: FinancePageContext): Record<string, unknown> | null => {
  const rtoContext = pageContext.moduleKey === 'rto-work'
    || /\brto\b/iu.test(message);
  if (!rtoContext) return null;
  const registration = extractRegistrationNumber(message);
  if (registration) return { vehicleNumber: registration };
  const chassisNumber = extractChassisNumber(message);
  if (chassisNumber) return { chassisNumber: chassisNumber.toUpperCase() };
  const invoiceNumber = extractInvoiceNumber(message);
  if (invoiceNumber) return { invoiceNumber: invoiceNumber.toUpperCase() };
  const recordNumber = extractSoldVehicleDetailRequest(message)?.recordNumber;
  if (recordNumber) return { recordNumber };
  return null;
};

const extractPartnerIdentifier = (message: string): { partnerId?: string; partnerCode?: string } | null => {
  const match = /\b(?:partner|dealer)\s*(?:code|id|identifier)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,})/iu.exec(message);
  if (!match?.[1]) return null;
  const value = match[1].trim();
  return UUID_PATTERN.test(value) ? { partnerId: value } : { partnerCode: value };
};

const extractPartnerSubject = (message: string): string | null => {
  const directId = extractPartnerIdentifier(message);
  if (directId?.partnerCode) return directId.partnerCode;
  if (directId?.partnerId) return directId.partnerId;

  const codeMatch = /\b((?:JCB-)?PAR-[A-Z0-9_-]+)\b/iu.exec(message);
  if (codeMatch?.[1]) return codeMatch[1].trim();

  const uuidMatch = extractUuid(message);
  if (uuidMatch) return uuidMatch;
  const suffixMatch = message.match(/\b([0-9a-f]{8}-[0-9a-f]{4})\b/i);
  if (suffixMatch?.[1]) return suffixMatch[1].trim();

  // Devanagari pattern: "<Name> का/की/के सत्यापन/विवरण/केवाईसी"
  const mHindi = /([A-Za-z0-9\s]{2,40}?)\s*(?:का|की|के|को)?\s*(?:सत्यापन|विवरण|केवाईसी)/u.exec(message);
  if (mHindi?.[1]) {
    const candidate = mHindi[1].trim().replace(/\b(?:show|tell|batao|dikhao)\b/giu, '').trim();
    if (candidate.length >= 2 && !/\b(?:partner|dealer|queue|pending|all|pan|gst|aadhaar|aadhar)\b/iu.test(candidate) && !/आधार|पैन|जीएसटी/u.test(candidate)) {
      return candidate;
    }
  }

  // Check on normalized message so typos like verfication, dossir are already corrected
  const norm = normalizeMessage(message);
  const mEng = /([A-Za-z0-9\s]{2,40}?)\s+(?:ka|ki|ke|ko)?\s*(?:kyc|verification|verifications|verify|dossier|documents?|docs?|gst|pan|aadhaar|changes\s+requested|sudhar|review|status)\b/iu.exec(norm);
  if (mEng?.[1]) {
    const candidate = mEng[1].trim().replace(/\b(?:show|tell|check|verify|give|find|kripya|please|batao|btao|dikhao|karo)\b/giu, '').trim();
    if (candidate.length >= 2 && !/\b(?:rc|rto|vehicle|vehicles|gaadi|machine|listing|listings|inventory|deal|deals|invoice|payment|crm|lead|leads|task|tasks|compliance|partner|dealer|showroom|broker|queue|all|pending|kitne|total|full|today|summary|software|pan|gst|aadhaar|aadhar)\b/iu.test(candidate) && !/आधार|पैन|जीएसटी/u.test(candidate)) {
      const rawMatch = new RegExp(`\\b${candidate}\\b`, 'iu').exec(message);
      return rawMatch ? rawMatch[0] : candidate;
    }
  }

  // "(?:for|of) <Name>"
  const mFor = /\b(?:for|of|partner|dealer)\s+([A-Za-z0-9\s]{2,40})/iu.exec(norm);
  if (mFor?.[1]) {
    const candidate = mFor[1].trim().replace(/\b(?:the|a|an)\b/giu, '').trim();
    if (candidate.length >= 2 && !/\b(?:rc|rto|vehicle|vehicles|gaadi|machine|listing|listings|inventory|deal|deals|invoice|payment|crm|lead|leads|task|tasks|compliance|queue|all|pending|kitne|total|full|today|verification|dossier|summary|software|pan|gst|aadhaar|aadhar)\b/iu.test(candidate) && !/आधार|पैन|जीएसटी/u.test(candidate)) {
      const rawMatch = new RegExp(`\\b${candidate}\\b`, 'iu').exec(message);
      return rawMatch ? rawMatch[0] : candidate;
    }
  }

  return null;
};

const isPartnerVerificationIntent = (normalized: string, message: string): boolean => {
  const hasRegNo = Boolean(extractRegistrationNumber(message));
  if (hasRegNo) return false;

  if (hasAny(normalized, [
    /\b(?:vehicle\s+docs?|vehicle\s+documents?|gaadi\s+ke\s+papers?|gaadi\s+ke\s+kagaz)\b/u,
    /\b(?:rto|challan|chassis|engine|rc)\b/u,
    /\bcopilot\b/u,
    /\breview\s+(?:pending\s+)?kyc\s+for\s+partner\s+code\b/u,
  ]) || (/\bpending\s+kyc\b/u.test(normalized) && hasAny(normalized, [/\bchecklist\b/u, /\bmissing\b/u, /\bmismatch\b/u, /\bexpired\b/u, /\brecommendation\b/u, /\breview\b/u]))) {
    return false;
  }

  // Pure Identity checks without partner context belong to verification.summary / identity hub
  const hasPartnerSubject = Boolean(extractPartnerSubject(message));
  const hasPartnerMention = /\b(?:partner|dealer|showroom|broker|onboarding)\b/u.test(normalized);
  if (!hasPartnerSubject && !hasPartnerMention && (hasAny(normalized, [/\b(?:pan|aadhaar|aadhar|driving\s+license|dl)\b/u]) || /आधार|पैन|जीएसटी/u.test(message))) {
    return false;
  }

  return hasAny(normalized, [
    /\b(?:partner\s+verifications?|verifications?\s+queue|kyc\s+queue|partner\s+queue)\b/u,
    /\b(?:partner\s+kyc|partner\s+dossier|partner\s+onboarding\s+kyc)\b/u,
    /\b(?:changes\s+requested|sudhar\s+chahiye|reviewer\s+comments?)\b/u,
    /\b(?:sabse\s+purana\s+pending|aaj\s+kitne\s+(?:submission|cases?)|showroom\s+verification|broker\s+verification)\b/u,
    /पार्टनर\s+सत्यापन/u,
    /सत्यापन\s+कतार/u,
    /केवाईसी\s+कतार/u,
  ]) || (
    hasAny(normalized, [/\bverifications?\b/u, /\bverfy\b/u, /\bverifiy\b/u, /सत्यापन/u])
    && hasAny(normalized, [/\b(queue|pending|desk|list|show|batao|btao|dikhao|kitne|cases?|partner|dealer)\b/u, /कतार|लंबित/u])
    && !hasAny(normalized, [/\brc\b/u, /\bchallan\b/u, /\bvehicle\b/u, /\btransport\b/u, /\bidentity\s+hub\b/u, /\bsurepass\b/u])
  ) || (
    Boolean(extractPartnerSubject(message))
    && hasAny(normalized, [/\b(?:kyc|verification|verifications|verfy|verifiy|documents?|docs?|gst|pan|aadhaar|dossier|review)\b/u])
  );
};

const hasMutationIntent = (message: string) => {
  const withoutDeedsOrModules = message
    .replace(/\b(?:purchase|sale)\s+deed\b/giu, '')
    .replace(/\bsell\s+accounts?\b/giu, '');
  return hasAny(withoutDeedsOrModules, MUTATION_PATTERNS)
    || SELL_MUTATION_PATTERN.test(withoutDeedsOrModules);
};

const rangeToolNames = new Set<AiReadOnlyToolName>([
  'dashboard.summary',
  'crm.dashboard.summary',
  'lead.statistics',
  'analytics.summary',
  'listing.statistics',
  'sold.vehicles',
  'sold.vehicle.analytics',
  'inventory.trend',
  'revenue.summary',
  'partner.performance',
  'finance.trend',
  'finance.workspace.summary',
  'invoice.summary',
  'payment.summary',
  'margin.summary',
  'wallet.summary',
  'api.billing.summary',
  'sell.accounts.summary',
  'refund.summary',
  'accounting.summary',
  'journal.summary',
  'categories.summary',
  'brands.summary',
  'models.summary',
  'locations.summary',
  'blogs.summary',
  'translations.summary',
  'settings.summary',
  'users.summary',
  'roles.summary',
  'subscriptions.summary',
  'forecast.operations',
  'rto.documents.summary',
  'rto.copilot',
  'kyc.copilot',
  'crm.lead.copilot',
  'crm.campaigns.summary',
  'finance.copilot',
  'partner.copilot',
  'market.intelligence',
  'fraud.signals',
  'recruitment.copilot',
  'whatsapp.activity.summary',
  'whatsapp.status',
  'whatsapp.campaigns.summary',
  'communication.delivery.summary',
  'verification.summary',
  'partner.verification.queue',
  'sms.activity.summary',
  'notifications.summary',
]);

const isReadOnlyToolName = (value: string | null | undefined): value is AiReadOnlyToolName =>
  typeof value === 'string' && AI_READ_ONLY_TOOL_NAMES.includes(value as AiReadOnlyToolName);

const catalogFallbackRequest = (message: string): AiAutoToolRequest | null => {
  const match = findSupportedQuestionMatches(message)[0];
  if (!match?.toolName) return null;

  if (match.toolName === 'listing.detail') {
    const query = extractListingDetailQuery(message);
    return query ? { name: match.toolName, arguments: { query } } : null;
  }
  if (match.toolName === 'crm.lead.detail') {
    const query = extractLeadDetailQuery(message);
    return query ? { name: match.toolName, arguments: { query } } : null;
  }
  if (match.toolName === 'crm.contact.detail') {
    const query = extractContactDetailQuery(message);
    return query ? { name: match.toolName, arguments: { query } } : null;
  }
  if (match.toolName === 'crm.contacts.summary') {
    const query = extractContactDetailQuery(message);
    return query ? { name: match.toolName, arguments: { query, limit: 20 } } : { name: match.toolName, arguments: {} };
  }
  if (match.toolName === 'ai.documents.search') {
    const query = extractDocumentSearchQuery(message);
    return query ? { name: match.toolName, arguments: { query, kind: documentKindFor(message), limit: 10 } } : null;
  }
  if (match.toolName === 'vehicle.identity') {
    const listingId = extractUuid(message);
    const query = extractVehicleIdentityQuery(message) || extractRegistrationNumber(message);
    if (listingId) return { name: match.toolName, arguments: { listingId } };
    return query ? { name: match.toolName, arguments: { query } } : null;
  }
  if (match.toolName === 'listing.search') {
    const query = extractListingSearchQuery(message);
    return query ? { name: match.toolName, arguments: { query, limit: 10 } } : null;
  }
  if (match.toolName === 'listing.summary') {
    const status = listingStatusForSummary(message);
    return { name: match.toolName, arguments: status ? { status } : {} };
  }
  if (rangeToolNames.has(match.toolName)) return rangeTool(match.toolName, message);
  return { name: match.toolName, arguments: {} };
};

const previousRequestFor = (context: readonly AiIntentContextMessage[]) => {
  const previousUser = [...context].reverse().find((message) => message.role === 'USER');
  return previousUser ? routeAiMessage(previousUser.content) : null;
};

const previousToolFor = (context: readonly AiIntentContextMessage[], previousRequest: AiAutoToolRequest | null) => {
  const previousAssistant = [...context].reverse().find((message) => message.role === 'ASSISTANT' && isReadOnlyToolName(message.toolName));
  return previousAssistant?.toolName && isReadOnlyToolName(previousAssistant.toolName)
    ? previousAssistant.toolName
    : previousRequest?.name || null;
};

const previousArgumentsFor = (
  context: readonly AiIntentContextMessage[],
  previousRequest: AiAutoToolRequest | null,
): Record<string, unknown> => {
  const previousAssistant = [...context].reverse().find((message) => (
    message.role === 'ASSISTANT' && isReadOnlyToolName(message.toolName)
  ));
  return previousAssistant?.toolArguments && typeof previousAssistant.toolArguments === 'object'
    ? { ...previousAssistant.toolArguments }
    : previousRequest?.arguments || {};
};

const followUpRequestFor = (
  message: string,
  context: readonly AiIntentContextMessage[],
): AiAutoToolRequest | null => {
  if (!context.length) return null;
  const normalized = normalizeMessage(message);
  const previousRequest = previousRequestFor(context);
  const previousTool = previousToolFor(context, previousRequest);
  if (!previousTool) return null;
  const previousArguments = previousArgumentsFor(context, previousRequest);
  const continuation = hasAny(normalized, [
    /^\s*(and|also|aur|or|plus)\b/u,
    /\b(iska|iske|uska|uske|this|that|same|more|again|bhi|it|its|ye|yeh|woh|vo|module|modul|owner|malik|status|details?|number|engine|chassis|rc|photo|photos|image|images|video|meter|dashboard|invoice|bill|receipt|challan|margin|profit|tax|fitness|insurance|zip|pdf|dossier|checklist|pending|missing|na|aadhaar|aadhar|pan|gst|deed|kyc|papers?|kagaz|documents?|docs?)\b/u,
  ]) || Boolean(rangeArguments(normalized).days);
  if (!continuation) return null;

  if (previousTool === 'listing.detail' || previousTool === 'vehicle.identity') {
    const inheritedQuery = typeof previousArguments.query === 'string' ? previousArguments.query : undefined;
    const inheritedListingId = typeof previousArguments.listingId === 'string' ? previousArguments.listingId : undefined;
    if (previousTool === 'listing.detail' && /\b(invoice|bill|receipt|challan|photo|photos|image|images|video|meter|dashboard|margin|profit|tax|fitness|insurance|rc|rto)\b/u.test(normalized)) {
      return {
        name: 'listing.detail',
        arguments: inheritedListingId ? { listingId: inheritedListingId } : inheritedQuery ? { query: inheritedQuery } : {},
      };
    }
    if (previousTool === 'listing.detail' && continuation) {
      return {
        name: 'listing.detail',
        arguments: inheritedListingId ? { listingId: inheritedListingId } : inheritedQuery ? { query: inheritedQuery } : {},
      };
    }
    if (previousTool === 'vehicle.identity' && continuation) {
      return {
        name: 'vehicle.identity',
        arguments: inheritedListingId ? { listingId: inheritedListingId } : inheritedQuery ? { query: inheritedQuery } : {},
      };
    }
  }

  if ((previousTool === 'sold.vehicle.detail'
    || previousTool === 'sell.accounts.summary'
    || previousTool === 'sold.vehicles'
    || previousTool === 'sold.vehicle.search'
    || previousTool === 'vehicle.documents.detail'
    || previousTool === 'vehicle.documents.summary') && continuation) {
    return { name: previousTool, arguments: { ...previousArguments } };
  }

  // Preserve the previously selected entity for short detail follow-ups. The
  // original request carries the bounded ID/query, so the follow-up never
  // widens the lookup to an unscoped CRM/customer/enquiry search.
  if (previousTool === 'crm.lead.detail'
    || previousTool === 'enquiry.detail'
    || previousTool === 'customer.detail'
    || previousTool === 'crm.contact.detail'
    || previousTool === 'ai.documents.search') {
    return { name: previousTool, arguments: { ...previousArguments } };
  }

  // A legacy listing.statistics response contains only counts. If the user
  // asks for one of its status buckets, switch to listing.summary so rows are
  // fetched instead of repeating the aggregate-only tool.
  if ((previousTool === 'listing.statistics' || previousTool === 'listing.summary') && continuation) {
    const status = listingStatusForSummary(normalized);
    if (status) return { name: 'listing.summary', arguments: { status } };
    if (previousTool === 'listing.summary' && typeof previousArguments.status === 'string') {
      return { name: 'listing.summary', arguments: { status: previousArguments.status } };
    }
  }

  if (rangeToolNames.has(previousTool)) {
    return { name: previousTool, arguments: { ...previousArguments, ...rangeArguments(normalized) } };
  }

  if (previousTool === 'partner.performance' && continuation) {
    return { name: previousTool, arguments: { ...previousArguments, ...rangeArguments(normalized) } };
  }

  return null;
};

/**
 * Maps safe, read-only operational language to the existing allow-listed tools.
 * It intentionally returns null for unknown or mutation requests: those messages
 * must continue through the normal AI response without receiving database data.
 */
export const routeAiMessage = (message: string, pageContext: FinancePageContext = {}): AiAutoToolRequest | null => {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;

  const financePageKey = financePageKeyFor(message, pageContext);
  const explicitFinanceMutation = hasAny(normalized, [
    /\b(create|add|delete|remove|update|edit|approve|reject|assign|send|buy)\b/u,
    /\b(banao|bnao|hatao|bhejo|badlo|becho|kharido)\b/u,
  ]);
  const isDeedOrDocRead = /\b(?:deed|kagaz|kaagaz|papers?|documents?|docs?|zip|pdf)\b/u.test(normalized)
    && !explicitFinanceMutation;
  if (hasAny(normalized, MUTATION_PATTERNS) && !isDeedOrDocRead && (!financePageKey || explicitFinanceMutation)) return null;

  const soldVehicleAnalytics = soldVehicleAnalyticsRequest(message, normalized);
  if (soldVehicleAnalytics && !hasAny(normalized, MUTATION_PATTERNS) && !hasMutationIntent(normalized)) {
    return soldVehicleAnalytics;
  }

  const forecast = forecastRequest(normalized);
  if (forecast) return forecast;

  // A selected Sold Vehicle record is the authoritative scope for party-field
  // follow-ups (seller, purchaser, owner, phone, address, etc.). Resolve it
  // before the generic finance page router, which otherwise returns the
  // intentionally limited sell.accounts.summary projection.
  if (pageContext.moduleKey === 'sold-vehicles' && pageContext.recordId && !explicitFinanceMutation) {
    const selectedSoldVehicle = selectedSoldVehicleArguments(pageContext.recordId);
    const selectedRecordRead = hasAny(normalized, [
      /\b(?:seller|sellor|purchaser|buyer|owner|party|phone|mobile|address|city|state|naam|name|number|contact)\b/u,
    ]);
    if (selectedRecordRead && selectedSoldVehicle) return { name: 'sold.vehicle.detail', arguments: selectedSoldVehicle };
  }

  const financePageReadQuestion = hasAny(normalized, [
    /\b(show|tell|give|find|which|what|check|verify|how\s+many|complete|full|summary|status|details?|detail|data|report|reports|statement|statements?|analysis|analytics|count|total|batao|btao|dikhao|kitne|kitni|loss|profit|profitability|margin|sheet|cash\s+book|petty\s+cash|contra\s+and\s+adjustment\s+vouchers?|vault|closing|audit|queries|checklist|review|tally|export|exports|upload|history|download)\b/u,
  ]);
  const legacyAccountingSummary = /\baccounting\s+chart\s+of\s+accounts\s+summary\b/u.test(normalized);
  if (financePageKey && financePageReadQuestion && !explicitFinanceMutation && !legacyAccountingSummary) {
    return { name: 'finance.hub.page', arguments: { pageKey: financePageKey, ...rangeArguments(normalized) } };
  }
  const isComplianceOrDocsRequest = hasAny(normalized, [
    /\b(?:compliance\s+(?:tasks?|tsks?)|transfer\s+(?:tasks?|tsks?)|milestones?|tasks?\s+desk)\b/u,
    /\b(?:deed|kagaz|kaagaz|papers?|documents?|docs?|all\s+docs|zip|pdf\s+dossier)\b/u,
  ]);
  const exactSoldVehicle = extractSoldVehicleDetailRequest(message);
  if (exactSoldVehicle && !isComplianceOrDocsRequest && !hasAny(normalized, MUTATION_PATTERNS) && !hasMutationIntent(normalized)) {
    return { name: 'sold.vehicle.detail', arguments: exactSoldVehicle };
  }
  const soldVehicleSearch = extractSoldVehicleSearchRequest(message, pageContext);
  if (soldVehicleSearch && !hasAny(normalized, MUTATION_PATTERNS) && !hasMutationIntent(normalized)) {
    return { name: 'sold.vehicle.search', arguments: soldVehicleSearch };
  }
  if (pageContext.moduleKey === 'sold-vehicles' && pageContext.recordId && financePageReadQuestion && !explicitFinanceMutation) {
    const selectedSoldVehicle = selectedSoldVehicleArguments(pageContext.recordId);
    if (selectedSoldVehicle) return { name: 'sold.vehicle.detail', arguments: selectedSoldVehicle };
  }
  if (pageContext.moduleKey === 'sold-vehicles' && financePageReadQuestion && !explicitFinanceMutation) {
    return { name: 'sell.accounts.summary', arguments: { ...rangeArguments(normalized), allRecords: true } };
  }
  if (pageContext.moduleKey === 'vehicle-docs' && pageContext.recordId && !explicitFinanceMutation) {
    return { name: 'vehicle.documents.detail', arguments: { query: pageContext.recordId } };
  }
  if (pageContext.moduleKey === 'vehicle-docs' && !explicitFinanceMutation) {
    const requestedNumber = extractRegistrationNumber(message) || extractVehicleSubject(message);
    if (requestedNumber) {
      return { name: 'vehicle.documents.detail', arguments: { query: requestedNumber } };
    }
    return { name: 'vehicle.documents.summary', arguments: {} };
  }
  if (pageContext.moduleKey === 'tasks' && !explicitFinanceMutation) {
    const requestedTarget = extractRegistrationNumber(message) || extractVehicleSubject(message) || extractSoldParty(message) || pageContext.recordId;
    if (requestedTarget) {
      return { name: 'tasks.compliance.detail', arguments: { query: requestedTarget } };
    }
    return { name: 'tasks.compliance.overview', arguments: {} };
  }
  if (pageContext.moduleKey === 'verification-detail' && !explicitFinanceMutation) {
    const target = extractPartnerSubject(message) || pageContext.recordId;
    if (target) {
      return { name: 'partner.verification.dossier', arguments: { query: target, partnerId: pageContext.recordId } };
    }
    return { name: 'partner.verification.dossier', arguments: { partnerId: pageContext.recordId } };
  }
  if (pageContext.moduleKey === 'verifications' && !explicitFinanceMutation) {
    const requestedTarget = extractPartnerSubject(message);
    if (requestedTarget && !/\b(?:queue|list|all|pending)\b/iu.test(requestedTarget)) {
      return { name: 'partner.verification.dossier', arguments: { query: requestedTarget } };
    }
    return { name: 'partner.verification.queue', arguments: {} };
  }
  if (hasAny(normalized, MUTATION_PATTERNS) && !isDeedOrDocRead) return null;
  if (hasMutationIntent(normalized)) return null;

  const administrationPageKey = administrationPageKeyFor(message, pageContext);
  const administrationExplicitPageRequest = pageContext.groupKey === 'administration'
    || hasAny(normalized, [
      /\b(?:full|complete|pura|poora|raw)[\s\S]{0,30}\b(?:data|detail|details|report|summary)\b/u,
      /\b(?:readiness|failure|failed)\b/u,
      /\bdelivery\s+report\b/u,
    ]);
  if (administrationPageKey && administrationExplicitPageRequest) {
    return { name: 'administration.page', arguments: { pageKey: administrationPageKey, ...rangeArguments(normalized) } };
  }

  const recruitmentPageKey = recruitmentPageKeyFor(message, pageContext);
  if (recruitmentPageKey && (recruitmentPageKey !== 'dashboard' || pageContext.moduleKey === 'dashboard')) {
    return {
      name: 'recruitment.page',
      arguments: {
        pageKey: recruitmentPageKey,
        ...(pageContext.recordId ? { recordId: pageContext.recordId } : {}),
      },
    };
  }

  const analyticsPageKey = analyticsPageKeyFor(message, pageContext);
  const explicitAnalyticsPageRequest = /^analytics\s+(?:report|reports?)\s+(?:dikhao|show|do|batao)$/u.test(normalized);
  const analyticsExportRequest = /\b(?:download|export|csv)\b/u.test(normalized) && /\banalytics?\b/u.test(normalized);
  if (analyticsPageKey && (explicitAnalyticsPageRequest || analyticsExportRequest || pageContext.moduleKey === 'analytics-overview' || pageContext.moduleKey === 'analytics-listing-detail')) {
    return { name: 'analytics.page', arguments: { pageKey: analyticsPageKey, ...(analyticsExportRequest ? { export: true } : {}) } };
  }
  const sellAccountReadQuery = /\b(?:sell\s+accounts?|sale\s+accounts?|commercial\s+accounts?)\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|list|details?|count|total|report|batao|btao|dikhao)\b/u]);
  if (hasAny(normalized, MUTATION_PATTERNS) && !sellAccountReadQuery && !isDeedOrDocRead) return null;

  if (hasAny(normalized, [
    /\b(?:overall|complete|full|whole|entire|all|poora|pura|poore|sampurn)\b/u,
  ]) && hasAny(normalized, [
    /\b(?:software|system|operations?|pending\s+work|departments?|modules?|finance)\b/u,
  ]) && hasAny(normalized, [
    /\b(?:report|summary|status|pending|work|data|batao|btao|dikhao)\b/u,
  ])) {
    return { name: 'operations.unified.report', arguments: rangeArguments(normalized) };
  }

  const partnerKycReviewIntent = /\b(?:kyc[\s\S]{0,80}partner|partner[\s\S]{0,80}kyc)\b/u.test(normalized)
    && hasAny(normalized, [
      /\b(pending|awaiting|backlog|review|checklist|missing|expired|mismatch|copilot|recommendation)\b/u,
    ]);
  if (!partnerKycReviewIntent && hasAny(normalized, [
    /\b(?:sop|policy|policies|faq|approved|process|procedure|checklist|guideline|terms|support)\b/u,
    /\bhow\s+(?:do|can)\s+i\b/u,
  ]) && hasAny(normalized, [
    /\b(?:kyc|rto|listing|payment|finance|partner|seller|buyer|account|support|verification|document|vehicle)\b/u,
    /\b(?:approved|sop|policy|faq|guideline|procedure)\b/u,
  ])) {
    return { name: 'knowledge.search', arguments: { query: normalized.slice(0, 120) } };
  }

  if (/\bpartner\s+agreements?\b|\bagreement\s+(?:catalog(?:ue)?|list)\b/u.test(normalized)
    && hasAny(normalized, [
      /\b(summary|status|list|show|details?|detail|history|content|terms?|count|total|batao|btao|dikhao)\b/u,
    ])) {
    return {
      name: 'partner.agreements.summary',
      arguments: /\b(content|full\s+terms?|agreement\s+text)\b/u.test(normalized) ? { includeContent: true } : {},
    };
  }

  if (/\bidentity\s+hub\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|history|records?|activity|list|recent|count|total|pichla|dikhao|batao|btao)\b/u])) {
    return /\b(history|records?|activity|recent|pichla)\b/u.test(normalized)
      ? { name: 'verification.history', arguments: { group: 'identity' } }
      : { name: 'verification.summary', arguments: {} };
  }

  if (/\bvehicle\s*(?:&|and)?\s*transport\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|history|records?|activity|list|recent|count|total|pichla|dikhao|batao|btao)\b/u])) {
    return /\b(history|records?|activity|recent|pichla)\b/u.test(normalized)
      ? { name: 'verification.history', arguments: { group: 'vehicle' } }
      : { name: 'rto.documents.summary', arguments: {} };
  }

  if (/\bcrm\s+(?:dashboard|home|overview)\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|report|data|batao|btao|dikhao|complete|full)\b/u])) {
    return { name: 'crm.dashboard.summary', arguments: rangeArguments(normalized) };
  }
  if (/\bcrm\s+(?:campaign|campaigns|segment|segments)\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|stat|report|list|data|batao|btao|dikhao)\b/u])) {
    return rangeTool('crm.campaigns.summary', normalized);
  }
  if (/\bcrm\s+import(?:\s+history)?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|report|list|history|histroy|record|data|batao|btao|dikhao)\b/u])) {
    return { name: 'crm.import.summary', arguments: {} };
  }

  // Let resolveAiMessage handle pronoun-based invoice follow-ups against the
  // previous listing detail instead of turning "iska invoice" into an aggregate.
  if (/\b(?:iska|iske|uska|uske|this|that)\s+(?:invoice|bill)\b/u.test(normalized)) return null;

  // Entity-first routing prevents a generic word such as "status" or "details"
  // from selecting the wrong aggregate tool when the user supplied an identifier.
  const listingId = extractUuid(message);
  const invoiceNumber = extractInvoiceNumber(message);
  const partnerIdentifier = extractPartnerIdentifier(message);
  const registrationNumber = extractRegistrationNumber(message);
  const chassisNumber = extractChassisNumber(message);
  const vehicleSubject = extractVehicleSubject(message);
  const entityLookupIntent = hasAny(normalized, [
    /\b(details?|information|info|status|show|tell|give|what|which|number|owner|malik|verification|batao|btao|dikhao)\b/u,
  ]);
  const vehicleRichQuery = registrationNumber || chassisNumber;
  if (listingId && /\blisting\b/iu.test(message)) {
    return { name: 'listing.detail', arguments: { listingId } };
  }
  const isVehicleMediaOrDocumentOrCommercialIntent = hasAny(normalized, [
    /\b(photo|photos|image|images|pic|pics|picture|pictures|video|videos|dashboard|meter|reading)\b/u,
    /\b(invoice|bill|receipt|receipts|challan|delivery\s+challan|bill\s+of\s+supply)\b/u,
    /\b(margin|profit|deal|pricing|expense|expenses|kharcha|kharch|kharid|bikri|net\s+profit)\b/u,
    /\b(listing|spec|specs|specification|specifications|full\s+details?|puri\s+jankari|sab\s+kuch)\b/u,
  ]);

  if (hasAny(normalized, [/\brto\b/u, /आरटीओ/u])
    && hasAny(normalized, [/\b(pending|backlog|लंबित|pendng)\b/u])
    && hasAny(normalized, [/\b(task|tasks|कार्य|tsk)\b/u])
    && !extractRegistrationNumber(message)) {
    return { name: 'rto.pending.tasks', arguments: {} };
  }

  const isTasksComplianceIntent = (
    hasAny(normalized, [
      /\b(?:transfer\s+(?:tasks?|tsks?)|compliance\s+(?:tasks?|tsks?)|complianc\s+(?:tasks?|tsks?)|complance\s+(?:tasks?|tsks?)|tasks?\s+desk|tsks?\s+desk|rto\s+transfer\s+(?:tasks?|tsks?)|milestones?)\b/u,
      /\b(?:fitness\s+certificate|road\s+tax|hsrp\s+plate|noc\s+clearance|hypothecation\s+clearance|rc\s+transfer\s+task|puc\s+certificate)\b/u,
      /\b(?:dsa\s+(?:is\s+)?working|dsa\s+remark|task\s+remark|compliance\s+remark)\b/u,
      /अनुपालन\s+कार्यों/u,
      /कार्यों\s+का\s+विवरण/u,
      /\b(?:tasks?|tsks?)\s+(?:ka|ki|ke)?\s*विवरण/u,
      /\bcomplianc(?:e)?\b/u,
    ])
    || (
      Boolean(extractRegistrationNumber(message))
      && !hasAny(normalized, [/\brto\b/u, /आरटीओ/u])
      && hasAny(normalized, [/\b(?:tasks?|tsks?)\b/u, /कार्य|कार्यों/u])
    )
  );
  if (isTasksComplianceIntent && !hasAny(normalized, MUTATION_PATTERNS) && !hasMutationIntent(normalized)) {
    const target = extractRegistrationNumber(message) || extractVehicleSubject(message) || extractTasksSubject(message) || extractSoldParty(message) || extractSoldVehicleDetailRequest(message)?.recordNumber;
    if (target) {
      return { name: 'tasks.compliance.detail', arguments: { query: target } };
    }
    return { name: 'tasks.compliance.overview', arguments: {} };
  }

  if (isPartnerVerificationIntent(normalized, message) && !hasAny(normalized, MUTATION_PATTERNS) && !hasMutationIntent(normalized)) {
    const isQueueExplicit = hasAny(normalized, [
      /\b(?:queue|katar|line|desk|all|pending\s+cases?|pending\s+list|kitne|kitni)\b/u,
      /कतार|लंबित\s+मामले|कितने/u,
    ]) || /\b(?:sabse\s+purana\s+pending|aaj\s+kitne\s+submission|showroom\s+verification\s+pending|broker\s+verification\s+pending)\b/u.test(normalized);

    const hasDirectCode = Boolean(extractPartnerIdentifier(message) || /\b(?:JCB-)?PAR-[A-Z0-9_-]+\b/iu.test(message));

    if (isQueueExplicit && !hasDirectCode) {
      return { name: 'partner.verification.queue', arguments: {} };
    }

    const target = extractPartnerSubject(message);
    if (target && !/\b(?:queue|list|all|pending\s+cases?|kitne|overview|dikhao|batao)\b/iu.test(target)) {
      return { name: 'partner.verification.dossier', arguments: { query: target } };
    }
    return { name: 'partner.verification.queue', arguments: {} };
  }

  const rtoWorkDossier = extractRtoWorkDossierRequest(message, pageContext);
  const rtoDossierIntent = hasAny(normalized, [
    /\b(?:status|details?|information|info|history|task|tasks|compliance|owner|seller|buyer|purchaser|expense|expenses|fee|fees|payment|record|case|dossier|agent|office|blocker|blockers)\b/iu,
  ]) && !hasAny(normalized, [
    /\b(?:download|upload|pdf|file|files)\b/iu,
  ]);
  if (rtoWorkDossier && rtoDossierIntent) {
    return { name: 'rto.work.detail', arguments: rtoWorkDossier };
  }
  if (vehicleRichQuery && isVehicleMediaOrDocumentOrCommercialIntent) {
    return { name: 'listing.detail', arguments: { query: vehicleRichQuery } };
  }
  if (chassisNumber && entityLookupIntent) {
    return { name: 'listing.detail', arguments: { query: chassisNumber } };
  }
  const vehicleDocumentSignals = hasAny(normalized, [
    /\b(?:paper|papers|document|documents|docs?|kagaz|kaagaz|dossier|checklist)\b/u,
    /\b(?:zip|zip\s+file|all\s+docs?\s+zip|details\s+pdf|vehicle\s+details?\s+pdf|dossier\s+pdf)\b/u,
    /\b(?:deed|sale\s+deed|purchase\s+deed)\b/u,
    /\b(?:seller|buyer)\s*(?:ka|ki|ke)?\s*(?:aadhaar|aadhar|pan|gst|kyc|deed)\b/u,
    /\b(?:aadhaar|aadhar|pan|gst|kyc)\b/u,
    /\b(?:missing|pending|na)\s*(?:doc(?:ument)?s?|papers?|files?)?\b/u,
  ]) && (
      hasAny(normalized, [
        /\b(?:pending|status|details?|information|info|what|which|batao|btao|dikhao|do|de|download|link|list|kaun|kya|missing|na|available|uploaded|hai|hain)\b/u,
      ])
      || /\b(?:zip|pdf|checklist|dossier|deed|kyc)\b/u.test(normalized)
    ) && !/\b(?:vehicle\s+docs?\s+download|rto\s+document(?:\s+pdf)?\s+dikhao)\b/iu.test(normalized);
  if ((registrationNumber || vehicleSubject) && vehicleDocumentSignals) {
    return { name: 'vehicle.documents.detail', arguments: { query: registrationNumber || vehicleSubject } };
  }
  const isGeneralVehicleDocsIntent = hasAny(normalized, [
    /\b(?:vehicle|gaadi|gadi)\s+(?:docs?|documents?|dossier|kagaz|kaagaz|papers?)\b/u,
    /\b(?:saare|sare|all)\s+(?:(?:vehicle|gaadi|gadi)\s+)?(?:docs?|documents?|dossier|kagaz|kaagaz|papers?)\b/u,
    /\bgaadi\s+ke\s+(?:kagaz|kaagaz|documents?|papers?)\b/u,
  ]) && hasAny(normalized, [
    /\b(?:summary|status|list|overview|kitne|kitna|kitni|total|count|pending|batao|btao|dikhao|kya|show|all|real\s*time|current|live|module)\b/u,
  ]);
  if (isGeneralVehicleDocsIntent && !hasAny(normalized, MUTATION_PATTERNS) && !hasMutationIntent(normalized)) {
    return { name: 'vehicle.documents.summary', arguments: {} };
  }
  const storedFileRequest = hasAny(normalized, [
    /\b(?:resume|cv|invoice|bill|aadhaar|aadhar|pan|gst|rto|insurance|fitness|puc|hsrp|offer(?:\s+letter)?|vehicle\s+docs?|verification\s+templates?|document|pdf|file)\b/u,
  ]) && hasAny(normalized, [
    /\b(?:download|open|view|show|give|send|bhejo|nikal|nikaal|do|de|dikhao|dikhaiye|mangao|mangwana)\b/u,
  ]) && !(
    /\b(?:rto|insurance|fitness|puc|hsrp|readiness)\b/u.test(normalized)
    && !/\b(?:resume|cv|invoice|bill|aadhaar|aadhar|pan|gst|offer(?:\s+letter)?|pdf|file)\b/u.test(normalized)
  ) && !(
    /\b(?:aadhaar|aadhar|pan|gst)\b/u.test(normalized)
    && !/\b(?:resume|cv|invoice|bill|document|pdf|file|offer(?:\s+letter)?)\b/u.test(normalized)
    && /\b(?:verification|verfication|verify|status|stat|summary|count|total|details?|information|info|check)\b/u.test(normalized)
    && !/\b(?:ka|ki|ke)\b/u.test(normalized)
  ) && !(
    /\b(?:summary|status|count|total|report|statistics|stats|history|trend|readiness)\b/u.test(normalized)
    && !/\b(?:pdf|file|document)\b/u.test(normalized)
    && !/\b(?:download|open|view|send|bhejo|nikal|nikaal)\b/u.test(normalized)
  ) && !/\b(?:saare|sare|all\s+docs|zip|dossier|checklist|deed|pending|missing|na)\b/u.test(normalized);
  if (storedFileRequest) {
    const query = extractDocumentSearchQuery(message);
    if (query) return { name: 'ai.documents.search', arguments: { query, kind: documentKindFor(message), limit: 10 } };
  }
  if (registrationNumber && hasAny(normalized, [
    /\b(?:paper|papers|document|documents|docs?|kagaz|kaagaz|rc|insurance|fitness|puc|hsrp|rto)\b/u,
  ]) && hasAny(normalized, [
    /\b(?:pending|status|details?|information|info|what|which|batao|btao|dikhao)\b/u,
  ])) {
    return { name: 'vehicle.documents.detail', arguments: { query: registrationNumber } };
  }
  if (invoiceNumber && (entityLookupIntent || /\b(?:invoice|bill)\b/u.test(normalized))) {
    return { name: 'listing.detail', arguments: { invoiceNumber } };
  }
  if (vehicleSubject && (isVehicleMediaOrDocumentOrCommercialIntent || hasAny(normalized, [/\b(owner|malik|status|rto|validity|details?|info)\b/u]))) {
    return { name: 'listing.detail', arguments: { query: vehicleSubject } };
  }
  const customerDetailQuery = extractCustomerDetailQuery(normalized);
  if (customerSignals.test(normalized) && listingId && entityLookupIntent) {
    return { name: 'customer.detail', arguments: { customerId: listingId } };
  }
  if (/\b(?:won\s+customers?|won\s+customer\s+(?:module|page|wala|wale|wali)|customers?\s+(?:won|closed\s+as\s+won))\b/u.test(normalized)
    && hasAny(normalized, [
      /\b(summary|count|total|number|list|show|which|what|status|active|all|kitne|kitni|kitna|kaun|dikhao|batao|btao|details?|detail)\b/u,
    ])) {
    return { name: 'crm.won.customers.summary', arguments: {} };
  }
  if (customerSignals.test(normalized) && customerDetailQuery) {
    return { name: 'customer.detail', arguments: { query: customerDetailQuery } };
  }
  if (customerSignals.test(normalized) && hasAny(normalized, [
    /\b(summary|count|total|number|list|show|which|what|status|active|all|kitne|kitni|kaun|dikhao|batao|btao)\b/u,
  ])) {
    return { name: 'customer.summary', arguments: {} };
  }
  const contactDetailQuery = extractContactDetailQuery(normalized);
  if (/\bcontacts?\b/u.test(normalized) && contactDetailQuery) {
    return { name: 'crm.contact.detail', arguments: { query: contactDetailQuery } };
  }
  if (/\bcontacts?\b/u.test(normalized) && hasAny(normalized, [
    /\b(summary|count|total|number|list|show|which|what|status|history|activity|kitne|kitni|kaun|dikhao|batao|btao)\b/u,
  ])) {
    return { name: 'crm.contacts.summary', arguments: {} };
  }
  const enquiryDetailQuery = extractEnquiryDetailQuery(normalized);
  if (enquirySignals.test(normalized) && hasAny(normalized, [
    /\b(details?|information|info|status|specific)\b/u,
  ])) {
    if (listingId && /\b(?:enquiry|inquiry)\s+(?:id|details?|info)\b/u.test(normalized)) {
      return { name: 'enquiry.detail', arguments: { leadId: listingId } };
    }
    if (enquiryDetailQuery) return { name: 'enquiry.detail', arguments: { query: enquiryDetailQuery } };
    return null;
  }
  if (enquirySignals.test(normalized) && hasAny(normalized, [
    /\b(summary|count|total|number|list|show|which|what|status|history|activity|kitne|kitni|kaun|dikhao|batao|btao)\b/u,
  ])) {
    return { name: 'enquiry.summary', arguments: {} };
  }
  if (hasAny(normalized, [/\bpartners?\b/u, /\bdealers?\b/u])
    && hasAny(normalized, [/\bunanswered\b/u, /\bresponse\s+time\b/u, /\bhealth\b/u, /\bat\s+risk\b/u, /\bcoach(?:ing)?\b/u, /\bcopilot\b/u])) {
    return rangeTool('partner.copilot', normalized);
  }
  const leadDetailQuery = extractLeadDetailQuery(normalized);
  if (leadSignals.test(normalized) && hasAny(normalized, [
    /\b(next\s+action|follow[ -]?up\s+draft|reactivat(?:e|ion)|what\s+should\s+i\s+do|copilot|recommend(?:ation)s?)\b/u,
  ])) {
    const query = extractLeadCopilotQuery(normalized);
    if (query) return { name: 'crm.lead.copilot', arguments: { query } };
    return null;
  }
  if (leadSignals.test(normalized) && leadDetailSignals.test(normalized)) {
    if (listingId && /\b(?:lead|enquiry)\s+(?:id|details?|info)\b/u.test(normalized)) {
      return { name: 'crm.lead.detail', arguments: { leadId: listingId } };
    }
    if (leadDetailQuery) return { name: 'crm.lead.detail', arguments: { query: leadDetailQuery } };
    return null;
  }
  if (listingId && (entityLookupIntent || /\blisting\s+id\b/u.test(normalized))) {
    return { name: 'listing.detail', arguments: { listingId } };
  }
  if (partnerIdentifier && !(/\bkyc\b/u.test(normalized) && hasAny(normalized, [
    /\b(pending|awaiting|backlog|review|checklist|missing|expired|mismatch|copilot|recommendation)\b/u,
  ])) && hasAny(normalized, [
    /\b(performance|details?|information|info|status|show|tell|give|what|which|batao|btao|dikhao)\b/u,
  ])) {
    return { name: 'partner.performance', arguments: partnerIdentifier };
  }
  if (registrationNumber && hasAny(normalized, [
    /\b(engine|chassis|owner|malik|registration|rc|status|details?|information|info|verification|number|batao|btao|dikhao)\b/u,
  ])) {
    return { name: 'vehicle.identity', arguments: { query: registrationNumber } };
  }

  if (hasAny(normalized, [/\brto\b/u])
    && hasAny(normalized, [/\b(pending|backlog|task|tasks|kitne|kitni|count|total)\b/u])) {
    return { name: 'rto.pending.tasks', arguments: {} };
  }

  if (taskSignals.test(normalized) && hasAny(normalized, [
    /\b(summary|count|total|number|list|show|which|what|status|pending|overdue|due|history|activity|kitne|kitni|kaun|dikhao|batao|btao)\b/u,
  ])) {
    return { name: 'tasks.summary', arguments: {} };
  }

  if (hasAny(normalized, rtoDocumentSignals)
    && hasAny(normalized, [
      /\b(document|documents|transfer|insurance|fitness|puc|hsrp)\b/u,
      /\b(status|pending|readiness|ready|count|total|kitne|kitni|batao|btao)\b/u,
      /\b(priority|blockers?|checklist|next\s+action|copilot)\b/u,
    ])) {
    if (hasAny(normalized, [/\bpriority\b/u, /\bblockers?\b/u, /\bchecklist\b/u, /\bnext\s+action\b/u, /\bcopilot\b/u])) {
      return rangeTool('rto.copilot', normalized);
    }
    return rangeTool('rto.documents.summary', normalized);
  }

  if (hasAny(normalized, [
    /\bmarket\b/u,
    /\bindustry\b/u,
    /\boem\b/u,
    /\bcompetitors?\b/u,
    /\bgovernment\s+(?:update|news|change)\b/u,
    /\bregulatory\b/u,
    /\bauctions?\b/u,
  ]) && hasAny(normalized, [
    /\b(update|updates|news|change|watch|digest|impact|recommendation|trend|summary|batao|btao|dikhao)\b/u,
  ])) {
    return rangeTool('market.intelligence', normalized);
  }

  if (surepassSignals.test(normalized)
    && hasAny(normalized, [
      /\b(status|configured|configuration|connection|working|ready|enabled|settings?|summary)\b/u,
    ])) {
    return { name: 'surepass.status', arguments: {} };
  }

  if (hasAny(normalized, verificationSummarySignals)
    && hasAny(normalized, [
      /\b(status|summary|history|records?|count|total|stats?|statistics|result|results?|pending|failed|success)\b/u,
      /\b(kitne|kitni|batao|btao|ginti)\b/u,
    ])) {
    return rangeTool('verification.summary', normalized);
  }

  if (hasAny(normalized, vehicleIdentitySignals)) {
    const vehicleListingId = extractUuid(message);
    const query = extractVehicleIdentityQuery(normalized);
    if (vehicleListingId) return { name: 'vehicle.identity', arguments: { listingId: vehicleListingId } };
    if (query) return { name: 'vehicle.identity', arguments: { query } };
    return null;
  }

  if (listingSignals.test(normalized) && listingDetailSignals.test(normalized)) {
    const query = extractListingDetailQuery(normalized);
    if (listingId) return { name: 'listing.detail', arguments: { listingId } };
    if (query) return { name: 'listing.detail', arguments: { query } };
  }

  if (hasAny(normalized, [
    /\bsold\s+(?:vehicles?|listings?)\b/u,
    /\b(?:vehicles?|listings?|gaadi|gadi)\s+(?:sold|bik(?:e|i|na)?)\b/u,
    /\b(?:kitne|kitni)\s+(?:vehicles?|listings?|gaadi|gadi)\s+(?:bik|sold)\b/u,
  ])) {
    return rangeTool('sold.vehicles', normalized);
  }

  if (hasAny(normalized, [
    /\binventory\s+(?:trend|growth)\b/u,
    /\blisting(?:s)?\s+(?:trend|growth)\b/u,
    /\bnew\s+listings?\s+trend\b/u,
  ])) {
    return rangeTool('inventory.trend', normalized);
  }

  if (hasAny(normalized, [
    /\bpartner\s+performance\b/u,
    /\bdealer\s+performance\b/u,
    /\bpartners?\b.*\bperformance\b/u,
    /\btop\s+partners?\b/u,
    /\bbest\s+partners?\b/u,
  ])) {
    if (hasAny(normalized, [/\bunanswered\b/u, /\bresponse\s+time\b/u, /\bhealth\b/u, /\bat\s+risk\b/u, /\bcoach(?:ing)?\b/u, /\bcopilot\b/u])) {
      return rangeTool('partner.copilot', normalized);
    }
    return rangeTool('partner.performance', normalized);
  }

  if (/\b(?:invoice|invoices|bill|bills|credit\s+note|debit\s+note)\b/u.test(normalized)
    && !/\b(?:create|add|update|edit|cancel|send|generate)\b/u.test(normalized)) {
    return rangeTool('invoice.summary', normalized);
  }

  if (/\b(?:refund|refunds|refunded|forfeit|forfeiture)\b/u.test(normalized)
    && !/\b(?:create|add|update|edit|approve|reject|pay|process)\b/u.test(normalized)) {
    return rangeTool('refund.summary', normalized);
  }

  if (/\b(?:api\s+)?wallet\b/u.test(normalized)
    && hasAny(normalized, [
      /\b(balance|status|summary|usage|activity|transactions?|count|total|batao|btao)\b/u,
    ])) {
    return rangeTool('wallet.summary', normalized);
  }

  if (hasAny(normalized, [
    /\bapi\s+billing\b/u,
    /\bverification\s+(?:api|charges?|billing|cost|usage)\b/u,
    /\bprovider\s+(?:charges?|billing|usage)\b/u,
  ])) {
    return rangeTool('api.billing.summary', normalized);
  }

  if (/\b(?:sell\s+accounts?|sale\s+accounts?|commercial\s+accounts?)\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|list|details?|count|total|report|batao|btao|dikhao)\b/u])) {
    return rangeTool('sell.accounts.summary', normalized);
  }

  if (/\b(?:margin|margins|gross\s+profit|net\s+profit|profit\s+margin)\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|stats?|statistics|total|report|trend|batao|btao|dikhao|how\s+much)\b/u])) {
    return rangeTool('margin.summary', normalized);
  }

  if (/\b(?:payment|payments|receipt|receipts|collection|collections)\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|stats?|statistics|total|status|activity|history|report|count|batao|btao|dikhao|how\s+much)\b/u])) {
    return rangeTool('payment.summary', normalized);
  }

  if (/\bfinance\s+workspace\b/u.test(normalized)
    || /\b(?:finance\s+hub|accounting\s+workspace)\b/u.test(normalized)) {
    return rangeTool('finance.workspace.summary', normalized);
  }

  if (/\b(?:journal|journals)\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|history|activity|trend|report|count|total|batao|btao|dikhao)\b/u])) {
    return rangeTool('journal.summary', normalized);
  }

  if (/\b(?:accounting|chart\s+of\s+accounts|ledger)\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|history|activity|report|count|total|batao|btao|dikhao)\b/u])) {
    return rangeTool('accounting.summary', normalized);
  }

  if (/\bcategories?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|batao|btao|dikhao)\b/u])) {
    return rangeTool('categories.summary', normalized);
  }

  if (/\bbrands?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|batao|btao|dikhao)\b/u])) {
    return rangeTool('brands.summary', normalized);
  }

  if (!/\bai\b/u.test(normalized)
    && /\b(?:vehicle\s+)?models?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|batao|btao|dikhao)\b/u])) {
    return rangeTool('models.summary', normalized);
  }

  if (/\blocations?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|batao|btao|dikhao)\b/u])) {
    return rangeTool('locations.summary', normalized);
  }

  if (/\bblogs?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|history|activity|batao|btao|dikhao)\b/u])) {
    return rangeTool('blogs.summary', normalized);
  }

  if (/\btranslations?\b|\btranslation\s+catalog\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|catalog|coverage|pending|batao|btao|dikhao)\b/u])) {
    return rangeTool('translations.summary', normalized);
  }

  if (!/\b(?:whatsapp|sms|surepass)\b/u.test(normalized)
    && /\b(?:platform\s+)?settings?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|status|configuration|configured|count|total|batao|btao|dikhao)\b/u])) {
    return rangeTool('settings.summary', normalized);
  }

  if (/\busers?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|active|batao|btao|dikhao)\b/u])) {
    return rangeTool('users.summary', normalized);
  }

  if (/\broles?\b|\bpermissions?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|batao|btao|dikhao)\b/u])) {
    return rangeTool('roles.summary', normalized);
  }

  if (/\bsubscriptions?\b|\bprime\s+plans?\b/u.test(normalized)
    && hasAny(normalized, [/\b(summary|list|show|status|count|total|active|expired|batao|btao|dikhao)\b/u])) {
    return rangeTool('subscriptions.summary', normalized);
  }

  if (hasAny(normalized, [
    /\bfinance(?:s|ial)?\s+(?:trend|transactions?|activity|ledger)\b/u,
    /\bcash\s*flow\s+trend\b/u,
    /\b(?:income|expense|expenses)\s+trend\b/u,
  ])) {
    if (hasAny(normalized, [/\bcopilot\b/u, /\baction\b/u, /\brecommend(?:ation)?\b/u, /\bwhy\b/u, /\boverdue\b/u, /\bcollection\b/u, /\bcash\s*flow\b/u])) {
      return rangeTool('finance.copilot', normalized);
    }
    return rangeTool('finance.trend', normalized);
  }

  if (listingSignals.test(normalized) && (listingSearchSignals.test(normalized) || /\bshow\s+(?:me\s+)?/u.test(normalized))) {
    const query = extractListingSearchQuery(normalized);
    if (query) {
      return { name: 'listing.search', arguments: { query, limit: 10 } };
    }
  }

  if (listingSignals.test(normalized)
    && /\b(?:payment|payments|receipt|receipts|collection|collections)\b/u.test(normalized)
    && hasAny(normalized, [
      /\b(summary|stats?|statistics|total|status|activity|history|report|count|batao|btao|dikhao)\b/u,
    ])) {
    return rangeTool('payment.summary', normalized);
  }

  if (hasAny(normalized, [
    /\bfraud\b/u,
    /\bsuspicious\b/u,
    /\banomal(?:y|ies)\b/u,
    /\bduplicate\s+(?:media|image|receipt|listing)\b/u,
    /\bidentity\s+(?:conflict|mismatch)\b/u,
  ])) {
    return rangeTool('fraud.signals', normalized);
  }

  if (listingSignals.test(normalized) && hasAny(normalized, listingListIntent)) {
    const status = listingStatusForSummary(normalized);
    return { name: 'listing.summary', arguments: status ? { status } : {} };
  }

  if (listingSignals.test(normalized) && hasAny(normalized, listingReadIntent)) {
    return rangeTool('listing.statistics', normalized);
  }

  if (hasAny(normalized, [/\bfollow[ -]?ups?\b/u, /\breminders?\b/u])
    && hasAny(normalized, [/\b(pending|overdue|today|upcoming|count|total|kitne|kitni|status)\b/u])) {
    return { name: 'crm.followups', arguments: {} };
  }

  if (hasAny(normalized, [/\b(pending|awaiting|backlog)\b/u, /\bkyc\b/u])) {
    if (hasAny(normalized, [/\breview\b/u, /\bchecklist\b/u, /\bmissing\b/u, /\bexpired\b/u, /\bmismatch\b/u, /\bcopilot\b/u, /\brecommendation\b/u])) {
      const partner = extractPartnerIdentifier(message);
      if (partner?.partnerCode) return { name: 'kyc.copilot', arguments: { partnerCode: partner.partnerCode } };
      if (partner?.partnerId) return { name: 'kyc.copilot', arguments: { query: partner.partnerId } };
    }
    return { name: 'pending.kyc', arguments: {} };
  }

  if (hasAny(normalized, [/\bhot\s+leads?\b/u, /\btop\s+leads?\b/u])) {
    return { name: 'hot.leads', arguments: {} };
  }

  if (hasAny(normalized, [
    /\bleads?\s+(statistics|stats|count|funnel|trend)\b/u,
    /\bleads?\b.*\b(statistics|stats|count|funnel|trend)\b/u,
    /\bleads?\s+kitne\b/u,
  ])) {
    return rangeTool('lead.statistics', normalized);
  }

  if (leadSignals.test(normalized) && hasAny(normalized, leadSummaryIntent)) {
    return { name: 'crm.leads.summary', arguments: {} };
  }

  if (hasAny(normalized, [/\b(revenue|sales|earning|earnings|profit|income)\b/u])
    && hasAny(normalized, [/\b(summary|stats?|statistics|total|how\s+much|kitna|kitni|batao|btao|report|trend)\b/u])) {
    return rangeTool('revenue.summary', normalized);
  }

  if (hasAny(normalized, [/\bpartners?\b/u, /\bdealers?\b/u])
    && hasAny(normalized, [/\bunanswered\b/u, /\bresponse\s+time\b/u, /\bhealth\b/u, /\bat\s+risk\b/u, /\bcoach(?:ing)?\b/u, /\bcopilot\b/u])) {
    return rangeTool('partner.copilot', normalized);
  }

  if (hasAny(normalized, [/\bpartners?\b/u, /\bdealers?\b/u])
    && hasAny(normalized, [/\b(status|performance|details?|information|info|activity|history|trend)\b/u])) {
    return rangeTool('partner.performance', normalized);
  }

  if (hasAny(normalized, [/\bpartners?\b/u, /\bdealers?\b/u])
    && hasAny(normalized, partnerListIntent)) {
    return { name: 'partner.statistics', arguments: {} };
  }

  if (hasAny(normalized, [/\bpartners?\b/u, /\bdealers?\b/u])
    && hasAny(normalized, [/\b(count|total|number|stats?|statistics|status|kitne|kitni|how\s+many)\b/u])) {
    return { name: 'partner.statistics', arguments: {} };
  }

  if (hasAny(normalized, [/\brecruitment\b/u, /\bhiring\b/u, /\bjobs?\b/u, /\bcandidates?\b/u])
    && hasAny(normalized, [/\bscreen(?:ing)?\b/u, /\binterview\b/u, /\bnext\s+steps?\b/u, /\bcopilot\b/u])) {
    return { name: 'recruitment.copilot', arguments: {} };
  }

  if (hasAny(normalized, [/\brecruitment\b/u, /\bhiring\b/u, /\bjobs?\b/u, /\bcandidates?\b/u])
    && hasAny(normalized, [/\b(summary|stats?|statistics|count|total|status|kitne|kitni|report)\b/u])) {
    return { name: 'recruitment.summary', arguments: {} };
  }

  if (/\bwhatsapp\b/u.test(normalized)
    && (whatsappStatusSignals.test(normalized) || /\b(campaigns?|broadcast|bulk)\b/u.test(normalized))) {
    if (/\b(campaigns?|broadcast|bulk)\b/u.test(normalized)) {
      return rangeTool('whatsapp.campaigns.summary', normalized);
    }
    return rangeTool('whatsapp.status', normalized);
  }

  const mentionsBothCommunicationChannels = /\bwhatsapp\b.*\bsms\b|\bsms\b.*\bwhatsapp\b/u.test(normalized);
  const asksForDeliveryLog = /\bdelivery\s+(?:logs?|history|report)\b/u.test(normalized);
  if (mentionsBothCommunicationChannels || asksForDeliveryLog) {
    return rangeTool('communication.delivery.summary', normalized);
  }

  if (hasAny(normalized, [/\bwhatsapp\b/u, /\bmessage delivery\b/u, /\bmessages? sent\b/u])
    && hasAny(normalized, [/\b(activity|delivery|sent|failed|read|count|total|stats?|statistics|report)\b/u])) {
    return rangeTool('whatsapp.activity.summary', normalized);
  }

  if (/\bsms\b/u.test(normalized)
    && hasAny(normalized, [
      /\b(activity|delivery|sent|failed|read|count|total|stats?|statistics|report|status|summary)\b/u,
    ])) {
    return rangeTool('sms.activity.summary', normalized);
  }

  if (hasAny(normalized, [/\bnotifications?\b/u, /\balerts?\b/u]) && notificationSummarySignals.test(normalized)) {
    return rangeTool('notifications.summary', normalized);
  }

  if (hasAny(normalized, [
    /\banalytics\b/u,
    /\binsights?\b/u,
    /\banalytics\s+reports?\b/u,
  ]) && hasAny(normalized, [
    /\b(summary|overview|status|history|activity|trend|report|count|total|stats?|statistics|batao|btao|dikhao)\b/u,
  ])) {
    return rangeTool('analytics.summary', normalized);
  }

  if (hasAny(normalized, [/\bdashboard\b/u, /\boverall\s+(summary|stats?|status)\b/u, /\boperational\s+(summary|kpis?)\b/u])) {
    return rangeTool('dashboard.summary', normalized);
  }

  const catalogRequest = catalogFallbackRequest(normalized);
  if (catalogRequest) return catalogRequest;

  return null;
};

const clarificationForMessage = (message: string): string | null => {
  const normalized = normalizeMessage(message);
  const isDevanagari = /[\u0900-\u097f]/u.test(message);
  const isHinglish = hasAny(normalized, [
    /\b(batao|btao|kitne|kitni|ka|ki|ke|pichle|dikhao|chahiye)\b/u,
  ]);
  const localized = (english: string, hinglish: string, hindi: string) => isDevanagari ? hindi : isHinglish ? hinglish : english;
  const questionLike = hasAny(normalized, [
    /\b(show|tell|give|find|which|what|how\s+many|details?|status|count|batao|btao|dikhao|kitne|kitni)\b/u,
  ]);
  if (!questionLike) return null;
  if (hasAny(normalized, [/\blistings?\b/u, /\binventory\b/u, /\bvehicles?\b/u, /\bgaadi\b/u])) {
    return localized(
      'Which listing information do you need: total count, inventory search, or details for a specific listing/vehicle ID?',
      'Kaunsi listing information chahiye: total count, inventory search, ya kisi specific listing/vehicle ID ki details?',
      '\u0906\u092a\u0915\u094b listing \u0915\u0940 \u0915\u093f\u0938 \u091c\u093e\u0928\u0915\u093e\u0930\u0940 \u091a\u093e\u0939\u093f\u090f: total count, inventory search, \u092f\u093e \u0915\u093f\u0938\u0940 specific listing/vehicle ID \u0915\u0940 details?',
    );
  }
  if (hasAny(normalized, [/\bpartners?\b/u, /\bdealers?\b/u])) {
    return localized(
      'Which partner information do you need: partner count, performance, or a specific partner code/ID?',
      'Kaunsi partner information chahiye: partner count, performance, ya specific partner code/ID?',
      '\u0906\u092a\u0915\u094b kis partner ki jankari chahiye: partner count, performance, ya specific partner code/ID?',
    );
  }
  if (hasAny(normalized, [/\b(crm|leads?|enquir(?:y|ies))\b/u])) {
    return localized(
      'Which lead information do you need: total count, lead list, or details for a specific lead?',
      'Kaunsi lead information chahiye: total count, lead list, ya kisi specific lead ki details?',
      'Aapko lead ki kaunsi jankari chahiye: total count, lead list, ya kisi specific lead ki details?',
    );
  }
  if (hasAny(normalized, [/\binvoice\b/u, /\bbill\b/u])) {
    return localized(
      'Please provide the invoice number or the vehicle/listing ID you want me to check.',
      'Invoice number ya vehicle/listing ID bhej dijiye, main check kar dunga.',
      '\u0915\u0943\u092a\u092f\u093e invoice number ya vehicle/listing ID den, main check kar dunga.',
    );
  }
  if (hasAny(normalized, [/\b(registration|rc|chassis|engine)\b/u])) {
    return localized(
      'Please provide the registration, RC, chassis, or listing ID to check the vehicle record.',
      'Vehicle record check karne ke liye registration, RC, chassis, ya listing ID bhej dijiye.',
      'Vehicle record check karne ke liye registration, RC, chassis, ya listing ID den.',
    );
  }
  return null;
};

export const resolveAiMessage = (
  message: string,
  context: readonly AiIntentContextMessage[] = [],
  pageContext: FinancePageContext = {},
): AiIntentResolution => {
  const hasExplicitVehicleIdentifier = Boolean(
    extractRegistrationNumber(message) || extractChassisNumber(message)
  );
  const contextualFollowUp = !hasExplicitVehicleIdentifier ? followUpRequestFor(message, context) : null;
  const normalized = normalizeMessage(message);
  const shouldPreferContext = Boolean(contextualFollowUp) && (hasAny(normalized, [
    /^\s*(?:and|also|aur|or|plus)\b/u,
    /\b(?:iska|iske|uska|uske|this|that|same|again|bhi|it|its|ye|yeh|woh|vo)\b/u,
  ]) || (
      contextualFollowUp?.name === 'listing.detail' && hasAny(normalized, [
        /\b(?:photo|photos|image|images|pic|pics|picture|pictures|video|videos|dashboard|meter|reading|invoice|bill|receipt|challan|margin|profit|pricing|tax|fitness|insurance|rc|rto|engine|chassis|owner|malik)\b/u,
      ])
    ) || (
      contextualFollowUp?.name === 'vehicle.documents.detail' && hasAny(normalized, [
        /\b(?:doc|docs|document|documents|kagaz|kaagaz|paper|papers|dossier|checklist|pending|missing|na|zip|pdf|aadhaar|aadhar|pan|gst|deed|sale\s+deed|purchase\s+deed|challan|receipt|invoice|bill|rto|noc|buyer|seller)\b/u,
      ])
    ));
  if (shouldPreferContext && contextualFollowUp) return { kind: 'tool', request: contextualFollowUp };
  const request = routeAiMessage(message, pageContext);
  if (request) return { kind: 'tool', request };
  if (contextualFollowUp) return { kind: 'tool', request: contextualFollowUp };
  if (hasMutationIntent(normalized)) return { kind: 'none' };
  const clarification = clarificationForMessage(message);
  return clarification ? { kind: 'clarification', message: clarification } : { kind: 'none' };
};
