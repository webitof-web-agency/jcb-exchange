import { AI_READ_ONLY_TOOL_NAMES, type AiReadOnlyToolName } from './aiReadOnlyTools.service';
import { moduleForAiTool } from './aiReliabilityObservability.service';

export const AI_PHASE7_SCENARIOS = [
  'english_query',
  'hindi_query',
  'hinglish_query',
  'spelling_mistake',
  'mixed_language_query',
  'valid_id',
  'invalid_id',
  'duplicate_record',
  'empty_result',
  'permission_denied',
  'surepass_unavailable',
  'database_unavailable',
  'provider_unavailable',
  'mutation_request',
  'sensitive_field_request',
] as const;

export type AiPhase7Scenario = (typeof AI_PHASE7_SCENARIOS)[number];

export type AiPhase7ModuleMatrixEntry = {
  toolName: AiReadOnlyToolName;
  module: string;
  scenarios: readonly AiPhase7Scenario[];
};

export const AI_PHASE7_TOOL_MATRIX: readonly AiPhase7ModuleMatrixEntry[] = AI_READ_ONLY_TOOL_NAMES.map((toolName) => ({
  toolName,
  module: moduleForAiTool(toolName),
  scenarios: AI_PHASE7_SCENARIOS,
}));

export type AiPhase7LanguageCase = {
  toolName: AiReadOnlyToolName;
  english: string;
  hindi: string;
  hinglish: string;
  spellingMistake: string;
  mixedLanguage: string;
};

/**
 * Representative real-user messages. These are deliberately short and
 * WhatsApp-like; identifiers and values are tested separately so language
 * normalization cannot silently alter them.
 */
export const AI_PHASE7_LANGUAGE_CASES: readonly AiPhase7LanguageCase[] = [
  { toolName: 'dashboard.summary', english: 'show overall dashboard summary', hindi: 'डैशबोर्ड का कुल सारांश दिखाओ', hinglish: 'overall dashboard summary batao', spellingMistake: 'show dashbord summry', mixedLanguage: 'overall डैशबोर्ड summary batao' },
  { toolName: 'pending.kyc', english: 'show pending KYC cases', hindi: 'लंबित केवाईसी मामले दिखाओ', hinglish: 'pending KYC cases batao', spellingMistake: 'show pendng KYC cases', mixedLanguage: 'pending केवाईसी cases batao' },
  { toolName: 'hot.leads', english: 'show hot leads', hindi: 'हॉट लीड्स दिखाओ', hinglish: 'hot leads batao', spellingMistake: 'show hott leeds', mixedLanguage: 'हॉट leads batao' },
  { toolName: 'lead.statistics', english: 'show lead statistics', hindi: 'लीड के आंकड़े दिखाओ', hinglish: 'leads ka stats batao', spellingMistake: 'show leed statstics', mixedLanguage: 'lead आंकड़े batao' },
  { toolName: 'listing.statistics', english: 'how many listings do we have', hindi: 'कितनी लिस्टिंग हैं', hinglish: 'total listing kitni hain', spellingMistake: 'how many listngs', mixedLanguage: 'कितनी listings hain' },
  { toolName: 'listing.detail', english: 'show listing details for JCB 3DX', hindi: 'JCB 3DX लिस्टिंग का विवरण दिखाओ', hinglish: 'JCB 3DX listing ka detail batao', spellingMistake: 'show listng detials for JCB 3DX', mixedLanguage: 'JCB 3DX listing का विवरण batao' },
  { toolName: 'vehicle.identity', english: 'what is the owner of CG04NF0268', hindi: 'CG04NF0268 का मालिक बताओ', hinglish: 'CG04NF0268 ka owner batao', spellingMistake: 'CG04NF0268 ka ower btao', mixedLanguage: 'CG04NF0268 का owner batao' },
  { toolName: 'sold.vehicles', english: 'how many sold vehicles in the last 14 days', hindi: 'पिछले 14 दिनों में कितने वाहन बिके', hinglish: 'pichle 14 din me kitne vehicles bike', spellingMistake: 'how many sold vechiles last 14 days', mixedLanguage: 'पिछले 14 days me kitne vehicles sold' },
  { toolName: 'inventory.trend', english: 'show inventory trend for the last 30 days', hindi: 'पिछले 30 दिनों का इन्वेंटरी ट्रेंड दिखाओ', hinglish: 'inventory trend pichle 30 din ka batao', spellingMistake: 'show inventry trand last 30 days', mixedLanguage: 'इन्वेंटरी trend pichle 30 days' },
  { toolName: 'revenue.summary', english: 'how much revenue did we make this month', hindi: 'इस महीने का कुल revenue बताओ', hinglish: 'is month ka revenue batao', spellingMistake: 'how much reveue this month', mixedLanguage: 'इस महीने revenue kitna' },
  { toolName: 'partner.statistics', english: 'how many partners do we have', hindi: 'कितने पार्टनर हैं', hinglish: 'partners kitne hain', spellingMistake: 'how many partnrs', mixedLanguage: 'कितने partners hain' },
  { toolName: 'partner.performance', english: 'which partners have the best performance', hindi: 'कौन से पार्टनर का प्रदर्शन अच्छा है', hinglish: 'partners ki performance batao', spellingMistake: 'which partnr has best performnce', mixedLanguage: 'कौन से partners ki performance achhi' },
  { toolName: 'finance.trend', english: 'show finance trend this month', hindi: 'इस महीने का वित्तीय रुझान दिखाओ', hinglish: 'finance trend is month batao', spellingMistake: 'show finace trnd this month', mixedLanguage: 'इस महीने finance trend' },
  { toolName: 'forecast.operations', english: 'forecast inventory for the next 14 days', hindi: 'अगले 14 दिनों की इन्वेंटरी का पूर्वानुमान बताओ', hinglish: 'agle 14 din inventory forecast batao', spellingMistake: 'forcast inventry next 14 days', mixedLanguage: 'अगले 14 days inventory forecast' },
  { toolName: 'rto.pending.tasks', english: 'show pending RTO tasks', hindi: 'आरटीओ के लंबित कार्य दिखाओ', hinglish: 'RTO ke pending tasks batao', spellingMistake: 'show pendng RTO tsk', mixedLanguage: 'आरटीओ pending tasks batao' },
  { toolName: 'rto.documents.summary', english: 'show RTO document readiness', hindi: 'आरटीओ दस्तावेज़ की स्थिति बताओ', hinglish: 'RTO documents ka status batao', spellingMistake: 'show RTO documnt readiness', mixedLanguage: 'आरटीओ documents ka status' },
  { toolName: 'crm.followups', english: 'show pending follow-ups', hindi: 'आज के लंबित फॉलोअप बताओ', hinglish: 'pending followups batao', spellingMistake: 'show pending folowups', mixedLanguage: 'आज ke pending followups' },
  { toolName: 'recruitment.summary', english: 'show recruitment summary', hindi: 'भर्ती का सारांश दिखाओ', hinglish: 'recruitment ka summary batao', spellingMistake: 'show recr uitment summry', mixedLanguage: 'भर्ती summary batao' },
  { toolName: 'listing.search', english: 'search listings for JCB 3DX', hindi: 'JCB 3DX वाली लिस्टिंग खोजो', hinglish: 'JCB 3DX wali listings search karo', spellingMistake: 'serach listngs for JCB 3DX', mixedLanguage: 'JCB 3DX वाली listings search' },
  { toolName: 'whatsapp.activity.summary', english: 'show WhatsApp delivery activity', hindi: 'व्हाट्सऐप संदेश डिलीवरी की गतिविधि दिखाओ', hinglish: 'WhatsApp messages ki delivery batao', spellingMistake: 'show whatasapp delivry activity', mixedLanguage: 'व्हाट्सऐप delivery activity batao' },
  { toolName: 'verification.summary', english: 'show PAN GST Aadhaar verification status', hindi: 'PAN GST आधार सत्यापन की स्थिति बताओ', hinglish: 'PAN GST Aadhaar verification status batao', spellingMistake: 'show PAN GST verfication stat', mixedLanguage: 'PAN GST आधार verification status' },
  { toolName: 'surepass.status', english: 'is Surepass configured and working', hindi: 'Surepass की configuration बताओ', hinglish: 'Surepass configured hai kya', spellingMistake: 'is Surepas configured', mixedLanguage: 'Surepass की configuration batao' },
  { toolName: 'whatsapp.status', english: 'show WhatsApp templates and integration status', hindi: 'व्हाट्सऐप टेम्पलेट और इंटीग्रेशन की स्थिति बताओ', hinglish: 'WhatsApp templates ka status batao', spellingMistake: 'show whatasapp templat status', mixedLanguage: 'व्हाट्सऐप templates ka status' },
  { toolName: 'whatsapp.campaigns.summary', english: 'show WhatsApp campaigns status', hindi: 'व्हाट्सऐप campaigns ka status batao', hinglish: 'WhatsApp campaigns ka status batao', spellingMistake: 'show whatasapp campaigns status', mixedLanguage: 'व्हाट्सऐप campaigns status batao' },
  { toolName: 'communication.delivery.summary', english: 'show WhatsApp and SMS delivery logs', hindi: 'व्हाट्सऐप और SMS delivery logs दिखाओ', hinglish: 'WhatsApp aur SMS delivery logs batao', spellingMistake: 'show whatasapp and SMS delivery logs', mixedLanguage: 'व्हाट्सऐप and SMS delivery logs batao' },
  { toolName: 'sms.activity.summary', english: 'show SMS delivery for the last 7 days', hindi: 'पिछले 7 दिनों की SMS डिलीवरी दिखाओ', hinglish: 'SMS delivery pichle 7 din ki batao', spellingMistake: 'show SMS delivry last 7 days', mixedLanguage: 'पिछले 7 days SMS delivery' },
  { toolName: 'notifications.summary', english: 'how many notifications are unread', hindi: 'कितनी सूचनाएं अनपढ़ी हैं', hinglish: 'kitni notifications unread hain', spellingMistake: 'how many notificatons unread', mixedLanguage: 'कितनी notifications unread hain' },
  { toolName: 'customer.summary', english: 'show all customers and visitors', hindi: '\u0938\u092d\u0940 \u0917\u094d\u0930\u093e\u0939\u0915 \u0926\u093f\u0916\u093e\u0913', hinglish: 'customer ka summary batao', spellingMistake: 'show custmer summary', mixedLanguage: '\u0938\u092d\u0940 customers dikhao' },
  { toolName: 'customer.detail', english: 'show customer details for Ramesh', hindi: '\u0917\u094d\u0930\u093e\u0939\u0915 Ramesh \u0915\u093e \u0935\u093f\u0935\u0930\u0923 \u092c\u0924\u093e\u0913', hinglish: 'customer Ramesh ka detail batao', spellingMistake: 'customer Ramesh ka detial batao', mixedLanguage: '\u0917\u094d\u0930\u093e\u0939\u0915 Ramesh ka detail batao' },
  { toolName: 'enquiry.summary', english: 'show all enquiries', hindi: '\u092a\u0942\u091b\u0924\u093e\u091b \u0926\u093f\u0916\u093e\u0913', hinglish: 'enquiry ka summary batao', spellingMistake: 'show enquries', mixedLanguage: 'enquiries ka summary batao' },
  { toolName: 'enquiry.detail', english: 'show enquiry details for JCB 3DX', hindi: 'show enquiry details for JCB 3DX batao', hinglish: 'enquiry details for JCB 3DX batao', spellingMistake: 'show enqury details for JCB 3DX', mixedLanguage: '\u092a\u0942\u091b\u0924\u093e\u091b JCB 3DX details batao' },
  { toolName: 'tasks.summary', english: 'show pending tasks', hindi: '\u0932\u0902\u092c\u093f\u0924 \u0915\u093e\u0930\u094d\u092f \u0926\u093f\u0916\u093e\u0913', hinglish: 'pending tasks ka summary batao', spellingMistake: 'show pending taks', mixedLanguage: '\u0932\u0902\u092c\u093f\u0924 tasks batao' },
  { toolName: 'invoice.summary', english: 'show invoice summary', hindi: '\u091a\u093e\u0932\u093e\u0928 \u0915\u093e \u0938\u093e\u0930\u093e\u0902\u0936 \u0926\u093f\u0916\u093e\u0913', hinglish: 'invoice ka summary batao', spellingMistake: 'show invoice summry', mixedLanguage: '\u091a\u093e\u0932\u093e\u0928 invoice summary batao' },
  { toolName: 'categories.summary', english: 'show categories summary', hindi: '\u0936\u094d\u0930\u0947\u0923\u0940 ka summary dikhao', hinglish: 'categories ka summary batao', spellingMistake: 'show categories summry', mixedLanguage: '\u0936\u094d\u0930\u0947\u0923\u0940 categories batao' },
  { toolName: 'blogs.summary', english: 'show blog summary', hindi: '\u092c\u094d\u0932\u0949\u0917 ka summary dikhao', hinglish: 'blogs ka summary batao', spellingMistake: 'show blog summry', mixedLanguage: '\u092c\u094d\u0932\u0949\u0917 blogs summary batao' },
  { toolName: 'settings.summary', english: 'show platform settings', hindi: '\u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e settings dikhao', hinglish: 'settings ka summary batao', spellingMistake: 'show platform settings summry', mixedLanguage: '\u0938\u0947\u091f\u093f\u0902\u0917\u094d\u0938 settings batao' },
  { toolName: 'users.summary', english: 'show users summary', hindi: '\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093eon ka summary dikhao', hinglish: 'users ka summary batao', spellingMistake: 'show users summry', mixedLanguage: '\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e users batao' },
  { toolName: 'subscriptions.summary', english: 'show subscription summary', hindi: '\u0938\u0926\u0938\u094d\u092f\u0924\u093e ka summary dikhao', hinglish: 'subscriptions ka summary batao', spellingMistake: 'show subscription summry', mixedLanguage: '\u0938\u0926\u0938\u094d\u092f\u0924\u093e subscriptions batao' },
];
