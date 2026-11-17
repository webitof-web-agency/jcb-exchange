import type { AiReadOnlyToolName } from './aiReadOnlyTools.service';

export const AI_QUESTION_INTENTS = [
  'summary',
  'list',
  'search',
  'detail',
  'status',
  'history',
  'activity',
  'compare',
  'trend',
  'forecast',
] as const;

export type AiQuestionIntent = (typeof AI_QUESTION_INTENTS)[number];
export type AiQuestionLanguage = 'en' | 'hi' | 'hinglish' | 'whatsapp';
export type AiQuestionCoverage = 'supported' | 'planned';

type AliasGroups = Record<AiQuestionLanguage, readonly string[]>;

export type AiQuestionCatalogEntry = {
  id: string;
  module: string;
  intent: AiQuestionIntent;
  coverage: AiQuestionCoverage;
  toolName?: AiReadOnlyToolName;
  plannedToolName?: string;
  aliases: AliasGroups;
  moduleAliases: AliasGroups;
  intentAliases: AliasGroups;
  examples: readonly string[];
};

export type AiQuestionCatalogMatch = AiQuestionCatalogEntry & {
  score: number;
  matchedModuleAlias: string;
  matchedIntentAlias: string;
};

const languageAliases = (en: readonly string[], hi: readonly string[] = [], hinglish: readonly string[] = [], whatsapp: readonly string[] = []): AliasGroups => ({
  en,
  hi,
  hinglish,
  whatsapp,
});

const INTENT_ALIASES: Record<AiQuestionIntent, AliasGroups> = {
  summary: languageAliases(
    ['summary', 'overview', 'count', 'total', 'number', 'how many', 'stats', 'statistics', 'latest', 'updates', 'signals'],
    ['सारांश', 'कुल', 'कितने', 'कितनी', 'कितना', 'संख्या'],
    ['kitne', 'kitni', 'kitna', 'ginti', 'total batao', 'count batao', 'sankhya'],
    ['cnt', 'count pls', 'total?', 'kitne?'],
  ),
  list: languageAliases(
    ['list', 'show all', 'which', 'what', 'all', 'available', 'dikhao'],
    ['सूची', 'दिखाओ', 'कौन कौन', 'कौन-कौन', 'सभी'],
    ['kaun kaun', 'kon kon', 'dikhao', 'list bhejo', 'sab dikhao', 'kaunsi'],
    ['show', 'all pls', 'list pls', 'kon kon'],
  ),
  search: languageAliases(
    ['search', 'find', 'locate', 'filter', 'lookup', 'download', 'open', 'view', 'file', 'pdf'],
    ['खोजो', 'ढूंढो', 'फ़िल्टर', 'खोज'],
    ['search karo', 'dhundo', 'dhoondo', 'filter karo', 'find karo', 'lookup karo'],
    ['search', 'find', 'filter', 'lookup'],
  ),
  detail: languageAliases(
    ['detail', 'details', 'information', 'info', 'record', 'specifications', 'recommendation', 'recommendations', 'checklist', 'next steps', 'interview'],
    ['विवरण', 'जानकारी', 'रिकॉर्ड', 'ब्योरा'],
    ['detail batao', 'details batao', 'puri jankari', 'poora record', 'info do', 'batao'],
    ['detail', 'details', 'info', 'full record'],
  ),
  status: languageAliases(
    ['status', 'state', 'current status', 'is it active', 'is it working', 'health', 'unanswered'],
    ['स्थिति', 'अवस्था', 'चालू है', 'काम कर रहा है'],
    ['status batao', 'kaisa chal raha', 'working hai', 'active hai', 'state batao'],
    ['status', 'working?', 'active?', 'ready?'],
  ),
  history: languageAliases(
    ['history', 'past records', 'previous records', 'timeline', 'audit trail'],
    ['इतिहास', 'पिछले रिकॉर्ड', 'समयरेखा'],
    ['history batao', 'pichla record', 'pichle records', 'timeline dikhao', 'audit batao'],
    ['history', 'past', 'previous', 'timeline'],
  ),
  activity: languageAliases(
    ['activity', 'activities', 'events', 'delivery activity', 'recent activity', 'updates', 'unanswered'],
    ['गतिविधि', 'गतिविधियां', 'हाल की गतिविधि', 'घटनाएं'],
    ['activity batao', 'recent activity', 'kya hua', 'events dikhao', 'delivery batao'],
    ['activity', 'events', 'recent', 'delivery'],
  ),
  compare: languageAliases(
    ['compare', 'comparison', 'versus', 'vs', 'difference', 'compared with'],
    ['तुलना', 'अंतर', 'मुकाबला'],
    ['compare karo', 'tulna karo', 'farak batao', 'vs batao', 'difference batao'],
    ['compare', 'vs', 'diff', 'difference'],
  ),
  trend: languageAliases(
    ['trend', 'growth', 'change over time', 'movement', 'performance trend'],
    ['रुझान', 'वृद्धि', 'समय के साथ बदलाव'],
    ['trend dikhao', 'growth batao', 'badlav batao', 'performance trend', 'kaise badha'],
    ['trend', 'growth', 'change', 'performance'],
  ),
  forecast: languageAliases(
    ['forecast', 'predict', 'prediction', 'future', 'projection', 'estimate', 'expected'],
    ['पूर्वानुमान', 'भविष्यवाणी', 'अनुमान', 'आगे का'],
    ['forecast batao', 'predict karo', 'aage kitna', 'future batao', 'estimate do', 'agle din'],
    ['forecast', 'predict', 'future', 'estimate', 'next'],
  ),
};

type ModuleSpec = {
  id: string;
  aliases: AliasGroups;
  tools: Partial<Record<AiQuestionIntent, AiReadOnlyToolName>>;
  plannedTools: Partial<Record<AiQuestionIntent, string>>;
};

const moduleAliases = (
  en: readonly string[],
  hi: readonly string[] = [],
  hinglish: readonly string[] = [],
  whatsapp: readonly string[] = [],
) => languageAliases(en, hi, hinglish, whatsapp);

const allPlanned = (module: string): Partial<Record<AiQuestionIntent, string>> => Object.fromEntries(
  AI_QUESTION_INTENTS.map((intent) => [intent, `${module}.${intent}`]),
) as Partial<Record<AiQuestionIntent, string>>;

const phase5Module = (
  id: string,
  aliases: AliasGroups,
  toolName: AiReadOnlyToolName,
): ModuleSpec => ({
  id,
  aliases,
  tools: Object.fromEntries(AI_QUESTION_INTENTS.map((intent) => [intent, toolName])) as Partial<Record<AiQuestionIntent, AiReadOnlyToolName>>,
  plannedTools: allPlanned(id),
});

const PHASE5_MODULE_SPECS: readonly ModuleSpec[] = [
  phase5Module('finance-invoices', moduleAliases(['invoice', 'invoices', 'bill', 'bills'], ['चालान', 'बिल'], ['invoice ka', 'bill ka'], ['invoice', 'bill']), 'invoice.summary'),
  phase5Module('finance-payments', moduleAliases(['payment', 'payments', 'payment records', 'receipts', 'collections'], ['à¤­à¥à¤—à¤¤à¤¾à¤¨'], ['payment ka', 'receipt ka'], ['payment', 'receipts']), 'payment.summary'),
  phase5Module('finance-margins', moduleAliases(['margin', 'margins', 'gross profit', 'net profit'], [], ['margin ka', 'profit margin'], ['margin', 'profit']), 'margin.summary'),
  phase5Module('finance-wallet', moduleAliases(['wallet', 'api wallet'], [], ['wallet ka'], ['wallet']), 'wallet.summary'),
  phase5Module('api-billing', moduleAliases(['api billing', 'billing usage', 'provider charges'], [], ['api billing ka'], ['billing', 'api billing']), 'api.billing.summary'),
  phase5Module('sell-accounts', moduleAliases(['sell accounts', 'sale accounts', 'commercial accounts'], [], ['sell account ka'], ['sell accounts']), 'sell.accounts.summary'),
  phase5Module('finance-refunds', moduleAliases(['refund', 'refunds', 'forfeit'], ['à¤°à¤¿à¤«à¤‚à¤¡'], ['refund ka'], ['refund']), 'refund.summary'),
  phase5Module('finance-workspace', moduleAliases(['finance workspace', 'finance hub'], ['à¤µà¤¿à¤¤à¥à¤¤ à¤•à¤¾à¤°à¥à¤¯à¤•à¥à¤·à¥‡à¤¤à¥à¤°'], ['finance workspace'], ['finance workspace']), 'finance.workspace.summary'),
  phase5Module('accounting', moduleAliases(['accounting', 'chart of accounts', 'ledger'], ['à¤²à¥‡à¤–à¤¾', 'à¤–à¤¾à¤¤à¤¾'], ['accounting ka', 'ledger ka'], ['accounting', 'ledger']), 'accounting.summary'),
  phase5Module('journal', moduleAliases(['journal', 'journals'], ['à¤œà¤°à¥à¤¨à¤²'], ['journal ka'], ['journal']), 'journal.summary'),
];

const PHASE6_MODULE_SPECS: readonly ModuleSpec[] = [
  phase5Module('master-categories', moduleAliases(['category', 'categories'], ['श्रेणी'], ['category ka'], ['category']), 'categories.summary'),
  phase5Module('master-brands', moduleAliases(['brand', 'brands'], ['à¤¬à¥à¤°à¤¾à¤‚à¤¡'], ['brand ka'], ['brand']), 'brands.summary'),
  phase5Module('master-models', moduleAliases(['model', 'models', 'vehicle models'], ['à¤®à¥‰à¤¡à¤²'], ['model ka'], ['model']), 'models.summary'),
  phase5Module('master-locations', moduleAliases(['location', 'locations', 'cities', 'states'], ['à¤¸à¥à¤¥à¤¾à¤¨'], ['location ka'], ['location']), 'locations.summary'),
  phase5Module('content-blogs', moduleAliases(['blog', 'blogs'], ['ब्लॉग'], ['blog ka'], ['blog']), 'blogs.summary'),
  phase5Module('content-translations', moduleAliases(['translation', 'translations', 'translation catalog'], ['à¤…à¤¨à¥à¤µà¤¾à¤¦'], ['translation ka'], ['translation']), 'translations.summary'),
  phase5Module('platform-settings', moduleAliases(['platform settings', 'settings'], ['सेटिंग्स'], ['settings ka'], ['settings']), 'settings.summary'),
  phase5Module('users', moduleAliases(['user', 'users'], ['उपयोगकर्ता'], ['user ka'], ['users']), 'users.summary'),
  phase5Module('roles', moduleAliases(['role', 'roles', 'permissions'], ['à¤­à¥‚à¤®à¤¿à¤•à¤¾', 'à¤…à¤¨à¥à¤®à¤¤à¤¿'], ['role ka'], ['roles', 'permissions']), 'roles.summary'),
  phase5Module('subscriptions', moduleAliases(['subscription', 'subscriptions', 'prime plan'], ['सदस्यता'], ['subscription ka'], ['subscriptions']), 'subscriptions.summary'),
];

const FINANCIAL_REPORTS_MODULE_SPECS: readonly ModuleSpec[] = [
  phase5Module(
    'profit-loss',
    moduleAliases(
      ['profit and loss', 'profit loss', 'p&l', 'pnl', 'income statement', 'loss profit'],
      ['लाभ और हानि', 'नफा नुकसान', 'मुनाफा', 'आमदनी और खर्च'],
      ['profit loss ka', 'pnl ka', 'kamai aur kharcha', 'nafa nuksan', 'profit and loss statement'],
      ['pnl', 'pl', 'profit', 'loss', 'profit loss']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'balance-sheet',
    moduleAliases(
      ['balance sheet', 'balancesheet', 'statement of assets and liabilities', 'financial position'],
      ['तुलन पत्र', 'चिट्ठा', 'संपत्ति और देनदारियां'],
      ['balance sheet ka', 'aamdani chitha', 'assets liabilities', 'balance sheet report'],
      ['bs', 'balancesheet', 'chitha', 'sheet']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'cash-flow-statement',
    moduleAliases(
      ['cash flow statement', 'cashflow statement', 'direct cash flow', 'cash movement statement'],
      ['रोकड़ प्रवाह', 'कैश फ्लो विवरण'],
      ['cash flow statement ka', 'cash in cash out statement', 'rokad pravah'],
      ['cfs', 'cashflow', 'cash in out', 'cash flow']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'revenue-purchase-reports',
    moduleAliases(
      ['revenue and purchase reports', 'revenue purchase reports', 'revenue by vehicle', 'purchases by supplier'],
      ['राजस्व और खरीद', 'बिक्री और खरीद रिपोर्ट'],
      ['revenue purchase report ka', 'bikri aur kharid', 'aamdani purchase'],
      ['revenue purchase', 'monthly revenue', 'supplier purchases']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'vehicle-profitability',
    moduleAliases(
      ['vehicle profitability', 'vehicle profit report', 'machine profitability', 'per vehicle profit'],
      ['वाहन लाभप्रदता', 'गाड़ी का मुनाफा', 'मशीन का नफा'],
      ['vehicle profitability ka', 'gaadi ka profit', 'vehicle wise profit', 'profitability report'],
      ['veh profit', 'gaadi margin', 'machine profit']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'expense-margin-analysis',
    moduleAliases(
      ['expense and margin analysis', 'expense margin analysis', 'margin trend', 'expense mix'],
      ['व्यय और मार्जिन विश्लेषण', 'खर्च और मार्जिन'],
      ['expense margin ka', 'kharcha aur margin', 'margin trend analysis'],
      ['expense margin', 'margin analysis', 'cost analysis']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'receivables-payables-report',
    moduleAliases(
      ['receivables and payables report', 'receivables payables', 'due aging report', 'outstanding report'],
      ['प्राप्य और देय', 'उधारी और बकाया', 'लेना देना रिपोर्ट'],
      ['receivables payables ka', 'baki paisa report', 'dena lena report', 'dues payables'],
      ['recv pay', 'dues payables', 'aging report']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'bank-cash-reports',
    moduleAliases(
      ['bank and cash reports', 'bank cash reports', 'bank balances', 'cash movement report'],
      ['बैंक और रोकड़ रिपोर्ट', 'बैंक बैलेंस रिपोर्ट'],
      ['bank cash report ka', 'bank aur cash balance', 'all bank accounts'],
      ['bank cash', 'bank balances', 'cash book report']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'tax-reports',
    moduleAliases(
      ['tax reports', 'tax report', 'gst and tds report', 'tax liability report'],
      ['कर रिपोर्ट', 'जीएसटी रिपोर्ट', 'टीडीएस रिपोर्ट'],
      ['tax report ka', 'gst tds report', 'tax liability', 'tax challans'],
      ['tax report', 'gst report', 'tds report']
    ),
    'finance.hub.page'
  ),
];

const CA_AUDIT_MODULE_SPECS: readonly ModuleSpec[] = [
  phase5Module(
    'ca-dashboard',
    moduleAliases(
      ['ca dashboard', 'ca workspace dashboard', 'ca overview', 'audit dashboard', 'chartered accountant dashboard'],
      ['सीए डैशबोर्ड', 'ऑडिट डैशबोर्ड', 'सीए कार्यक्षेत्र'],
      ['ca dashboard ka', 'audit overview', 'ca closing progress', 'ca status'],
      ['ca dash', 'ca dashboard', 'audit dash']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'document-vault',
    moduleAliases(
      ['document vault', 'ca vault', 'tax return documents', 'audit documents', 'vault files', 'stored certificates'],
      ['दस्तावेज़ वॉल्ट', 'सीए वॉल्ट', 'ऑडिट कागजात', 'टैक्स रिटर्न दस्तावेज'],
      ['document vault ka', 'ca vault files', 'stored returns', 'vault documents'],
      ['vault', 'doc vault', 'vault files']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'monthly-closing',
    moduleAliases(
      ['monthly closing', 'month end closing', 'monthly close checklist', 'month end checklist', 'period closing'],
      ['मासिक क्लोजिंग', 'महीने का समापन', 'माह समाप्ति चेकलिस्ट'],
      ['monthly closing ka', 'month end checklist', 'maheene ki closing', 'month close'],
      ['month close', 'monthly closing', 'close checklist']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'financial-year-closing',
    moduleAliases(
      ['financial year closing', 'year end closing', 'fy closing', 'annual close', 'year close gates'],
      ['वित्तीय वर्ष क्लोजिंग', 'साल का समापन', 'वार्षिक क्लोजिंग'],
      ['financial year closing ka', 'saal ki closing', 'year end close', 'fy close'],
      ['year close', 'fy close', 'fy closing']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'audit-trail',
    moduleAliases(
      ['audit trail', 'audit log', 'financial audit trail', 'system audit log', 'action history'],
      ['ऑडिट ट्रेल', 'ऑडिट लॉग', 'सिस्टम ऑडिट'],
      ['audit trail ka', 'audit log data', 'kaunsa change hua', 'audit records'],
      ['audit trail', 'audit log', 'trail']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'ca-queries-checklist',
    moduleAliases(
      ['ca queries and checklist', 'ca queries', 'ca checklist', 'auditor queries', 'ca questions'],
      ['सीए प्रश्न और चेकलिस्ट', 'सीए सवाल', 'ऑडिटर प्रश्न'],
      ['ca queries ka', 'ca sawal jawab', 'ca questions checklist', 'auditor queries'],
      ['ca queries', 'ca query', 'ca checklist']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'accounting-review',
    moduleAliases(
      ['accounting review', 'voucher review', 'accounting review queue', 'self approved entries', 'ca review'],
      ['अकाउंटिंग समीक्षा', 'वाउचर समीक्षा', 'सेल्फ अप्रूव्ड एंट्री'],
      ['accounting review ka', 'voucher check', 'self approved vouchers', 'review queue'],
      ['acct review', 'voucher review', 'review queue']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'import-export',
    moduleAliases(
      ['import and export', 'import export', 'data exchange', 'import export hub', 'data exchange hub'],
      ['आयात और निर्यात', 'डेटा एक्सचेंज', 'इंपोर्ट एक्सपोर्ट हब'],
      ['import export ka', 'data exchange hub', 'data import export'],
      ['import export', 'data exchange', 'imp exp']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'import-bank-statements',
    moduleAliases(
      ['import bank statements', 'bank statement import', 'bank statement batches', 'statement import history'],
      ['बैंक स्टेटमेंट आयात', 'बैंक विवरण आयात'],
      ['import bank statements ka', 'bank statement import batches', 'statement upload history'],
      ['import stmt', 'bank stmt import', 'statement batches']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'import-opening-balances',
    moduleAliases(
      ['import opening balances', 'opening balance import', 'opening sheet import', 'initial balances import'],
      ['आरंभिक शेष आयात', 'ओपनिंग बैलेंस आयात'],
      ['import opening balances ka', 'opening balance csv import', 'opening sheet'],
      ['import opening', 'opening import', 'op bal import']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'import-transactions',
    moduleAliases(
      ['import transactions', 'voucher import', 'csv transaction import', 'transaction import batches'],
      ['लेन-देन आयात', 'वाउचर आयात'],
      ['import transactions ka', 'voucher csv import', 'import transactions batch'],
      ['import txn', 'voucher import', 'import vouchers']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'tally-accounting-export',
    moduleAliases(
      ['tally accounting export', 'tally export', 'tally prime export', 'tally xml export', 'export to tally'],
      ['टैली निर्यात', 'टैली एक्सपोर्ट', 'टैली प्राइम एक्सएमएल'],
      ['tally accounting export ka', 'tally xml export', 'tally data bhejo', 'tally export'],
      ['tally export', 'tally xml', 'tally prime']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'download-reports',
    moduleAliases(
      ['download reports', 'ca download reports', 'csv audit reports', 'download financial reports'],
      ['रिपोर्ट डाउनलोड करें', 'वित्तीय रिपोर्ट डाउनलोड'],
      ['download reports ka', 'report download krna hai', 'csv reports download', 'ca reports'],
      ['download rpt', 'download reports', 'reports csv']
    ),
    'finance.hub.page'
  ),
  phase5Module(
    'bulk-upload-history',
    moduleAliases(
      ['bulk upload history', 'upload history', 'import export history', 'batch history'],
      ['अपलोड इतिहास', 'थोक अपलोड इतिहास', 'बैच इतिहास'],
      ['bulk upload history ka', 'upload history dikhao', 'batch upload status'],
      ['upload history', 'bulk history', 'batch history']
    ),
    'finance.hub.page'
  ),
];

const MODULE_SPECS: readonly ModuleSpec[] = [
  {
    id: 'dashboard',
    aliases: moduleAliases(['dashboard', 'operations', 'kpi', 'overall'], ['डैशबोर्ड', 'संचालन'], ['dashboard ka', 'overall report'], ['dashboard', 'kpi', 'overall']),
    tools: { summary: 'dashboard.summary', status: 'dashboard.summary', compare: 'dashboard.summary', trend: 'dashboard.summary', forecast: 'forecast.operations' },
    plannedTools: allPlanned('dashboard'),
  },
  {
    id: 'listings',
    aliases: moduleAliases(['listing', 'listings', 'vehicle listing', 'vehicles'], ['लिस्टिंग', 'सूची', 'वाहन'], ['listing', 'listng', 'vehicle wali listing', 'gaadi'], ['listing', 'listng', 'vehicle', 'gaadi']),
    tools: { summary: 'listing.statistics', list: 'listing.summary', search: 'listing.search', detail: 'listing.detail', status: 'listing.summary', history: 'listing.statistics', activity: 'listing.statistics', compare: 'listing.statistics', trend: 'inventory.trend', forecast: 'forecast.operations' },
    plannedTools: allPlanned('listings'),
  },
  {
    id: 'inventory',
    aliases: moduleAliases(['inventory', 'stock', 'available vehicles'], ['इन्वेंटरी', 'स्टॉक'], ['inventory', 'stock', 'available gaadi'], ['inventory', 'stock', 'available']),
    tools: { summary: 'listing.statistics', list: 'listing.summary', search: 'listing.search', detail: 'listing.detail', status: 'listing.summary', history: 'inventory.trend', activity: 'inventory.trend', compare: 'inventory.trend', trend: 'inventory.trend', forecast: 'forecast.operations' },
    plannedTools: allPlanned('inventory'),
  },
  ...PHASE5_MODULE_SPECS,
  ...PHASE6_MODULE_SPECS,
  ...FINANCIAL_REPORTS_MODULE_SPECS,
  ...CA_AUDIT_MODULE_SPECS,
  {
    id: 'analytics',
    aliases: moduleAliases(['analytics', 'analytics overview', 'analytics reports', 'insights'], ['à¤µà¤¿à¤¶à¥à¤²à¥‡à¤·à¤£'], ['analytics ka', 'insights ka', 'analytics report'], ['analytics', 'insights', 'reports']),
    tools: { summary: 'analytics.summary', list: 'analytics.summary', search: 'analytics.summary', detail: 'analytics.summary', status: 'analytics.summary', history: 'analytics.summary', activity: 'analytics.summary', compare: 'analytics.summary', trend: 'analytics.summary', forecast: 'forecast.operations' },
    plannedTools: allPlanned('analytics'),
  },
  {
    id: 'sold-vehicles',
    aliases: moduleAliases(['sold vehicles', 'sold vehicle', 'sales', 'sold'], ['बिके वाहन', 'बिक्री'], ['sold gaadi', 'bikri', 'sales hua'], ['sold', 'sales']),
    tools: { summary: 'sold.vehicles', list: 'sold.vehicles', search: 'sold.vehicles', detail: 'listing.detail', status: 'sold.vehicles', history: 'sold.vehicles', activity: 'sold.vehicles', compare: 'sold.vehicles', trend: 'sold.vehicles', forecast: 'forecast.operations' },
    plannedTools: allPlanned('sold-vehicles'),
  },
  {
    id: 'vehicle-docs',
    aliases: moduleAliases(['vehicle docs', 'vehicle documents', 'vehicle document vault'], ['à¤µà¤¾à¤¹à¤¨ à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œ'], ['vehicle docs ka', 'vehicle document ka', 'gaadi ke documents'], ['vehicle docs', 'vehicle documents']),
    tools: { summary: 'rto.documents.summary', list: 'rto.documents.summary', search: 'ai.documents.search', detail: 'vehicle.documents.detail', status: 'rto.documents.summary', history: 'rto.documents.summary', activity: 'rto.copilot', trend: 'rto.documents.summary' },
    plannedTools: allPlanned('vehicle-docs'),
  },
  {
    id: 'vehicle-identity',
    aliases: moduleAliases(['vehicle identity', 'vehicle', 'registration', 'rc', 'chassis', 'engine', 'owner'], ['वाहन पहचान', 'पंजीकरण', 'मालिक'], ['vehicle ka owner', 'registration number', 'engine number', 'chassis number', 'gaadi'], ['vehicle', 'rc', 'reg no', 'owner']),
    tools: { summary: 'vehicle.identity', detail: 'vehicle.identity', status: 'vehicle.identity', history: 'vehicle.identity', activity: 'vehicle.identity' },
    plannedTools: allPlanned('vehicle-identity'),
  },
  {
    id: 'identity-hub',
    aliases: moduleAliases(['identity hub', 'identity verification hub', 'identity history'], ['आइडेंटिटी हब', 'पहचान इतिहास'], ['identity hub ka', 'identity verification history'], ['identity hub', 'identity history']),
    tools: { summary: 'verification.summary', list: 'verification.history', search: 'verification.history', detail: 'verification.history', status: 'verification.summary', history: 'verification.history', activity: 'verification.history', compare: 'verification.summary', trend: 'verification.summary' },
    plannedTools: allPlanned('identity-hub'),
  },
  {
    id: 'vehicle-transport',
    aliases: moduleAliases(['vehicle transport', 'vehicle and transport', 'vehicle verification history'], ['व्हीकल ट्रांसपोर्ट', 'वाहन इतिहास'], ['vehicle transport ka', 'vehicle history'], ['vehicle transport', 'vehicle history']),
    tools: { summary: 'rto.documents.summary', list: 'verification.history', search: 'verification.history', detail: 'vehicle.documents.detail', status: 'rto.documents.summary', history: 'verification.history', activity: 'verification.history', compare: 'verification.summary', trend: 'rto.documents.summary' },
    plannedTools: allPlanned('vehicle-transport'),
  },
  {
    id: 'rto-documents',
    aliases: moduleAliases(['rto', 'documents', 'document', 'transfer', 'insurance', 'fitness', 'puc'], ['आरटीओ', 'दस्तावेज', 'कागजात'], ['rto ka', 'documents ka', 'transfer ka', 'insurance ka'], ['rto', 'docs', 'documents', 'rc docs']),
    tools: { summary: 'rto.documents.summary', list: 'rto.documents.summary', search: 'rto.documents.summary', detail: 'rto.copilot', status: 'rto.documents.summary', history: 'rto.documents.summary', activity: 'rto.copilot', compare: 'rto.documents.summary', trend: 'rto.documents.summary' },
    plannedTools: allPlanned('rto-documents'),
  },
  {
    id: 'partners',
    aliases: moduleAliases(['partner', 'partners', 'dealer', 'dealers', 'vendor'], ['पार्टनर', 'डीलर', 'विक्रेता'], ['partner ki', 'dealer ki', 'partner wali'], ['partner', 'dealer', 'vendor']),
    tools: { summary: 'partner.statistics', list: 'partner.statistics', search: 'partner.statistics', detail: 'partner.performance', status: 'partner.copilot', history: 'partner.performance', activity: 'partner.copilot', compare: 'partner.performance', trend: 'partner.performance', forecast: 'forecast.operations' },
    plannedTools: allPlanned('partners'),
  },
  {
    id: 'partner-agreements',
    aliases: moduleAliases(['partner agreement', 'partner agreements', 'agreement catalogue', 'agreement catalog'], ['पार्टनर एग्रीमेंट', 'पार्टनर समझौते'], ['partner agreement ka', 'agreement catalogue ka', 'agreement list'], ['partner agreement', 'agreements', 'agreement']),
    tools: { summary: 'partner.agreements.summary', list: 'partner.agreements.summary', search: 'partner.agreements.summary', detail: 'partner.agreements.summary', status: 'partner.agreements.summary', history: 'partner.agreements.summary', activity: 'partner.agreements.summary' },
    plannedTools: allPlanned('partner-agreements'),
  },
  {
    id: 'crm-leads',
    aliases: moduleAliases(['crm', 'lead', 'leads', 'enquiry', 'enquiries'], ['सीआरएम', 'लीड', 'पूछताछ'], ['crm me', 'lead ki', 'enquiry wali'], ['crm', 'lead', 'leads', 'enquiry']),
    tools: { summary: 'crm.leads.summary', list: 'crm.leads.summary', search: 'crm.lead.detail', detail: 'crm.lead.detail', status: 'crm.leads.summary', history: 'lead.statistics', activity: 'lead.statistics', compare: 'lead.statistics', trend: 'lead.statistics', forecast: 'forecast.operations' },
    plannedTools: allPlanned('crm-leads'),
  },
  {
    id: 'crm-dashboard',
    aliases: moduleAliases(['crm dashboard', 'crm home', 'crm overview'], [], ['crm dashboard', 'crm ka dashboard', 'crm overview'], ['crm dashboard', 'crm overview']),
    tools: { summary: 'crm.dashboard.summary', status: 'crm.dashboard.summary', compare: 'crm.dashboard.summary', trend: 'crm.dashboard.summary', forecast: 'forecast.operations' },
    plannedTools: allPlanned('crm-dashboard'),
  },
  {
    id: 'crm-pipeline',
    aliases: moduleAliases(['crm pipeline', 'pipeline board', 'sales pipeline'], [], ['crm pipeline', 'pipeline board', 'sales pipeline'], ['pipeline', 'crm pipeline']),
    tools: { summary: 'crm.leads.summary', list: 'crm.leads.summary', search: 'crm.lead.detail', detail: 'crm.lead.detail', status: 'crm.leads.summary', history: 'lead.statistics', activity: 'lead.statistics', compare: 'lead.statistics', trend: 'lead.statistics', forecast: 'forecast.operations' },
    plannedTools: allPlanned('crm-pipeline'),
  },
  {
    id: 'crm-contacts',
    aliases: moduleAliases(['crm contacts', 'contacts', 'contact directory'], [], ['crm contacts', 'contact list', 'contact detail'], ['contacts', 'contact']),
    tools: { summary: 'crm.contacts.summary', list: 'crm.contacts.summary', search: 'crm.contacts.summary', detail: 'crm.contact.detail', status: 'crm.contacts.summary', history: 'crm.contact.detail', activity: 'crm.contact.detail' },
    plannedTools: allPlanned('crm-contacts'),
  },
  {
    id: 'crm-followups',
    aliases: moduleAliases(['follow-up', 'followups', 'reminder', 'reminders'], ['फॉलोअप', 'अनुस्मारक'], ['follow up', 'followup', 'reminder'], ['followup', 'reminder', 'due']),
    tools: { summary: 'crm.followups', list: 'crm.followups', search: 'crm.followups', detail: 'crm.followups', status: 'crm.followups', history: 'crm.followups', activity: 'crm.followups', trend: 'crm.followups' },
    plannedTools: allPlanned('crm-followups'),
  },
  {
    id: 'crm-reports',
    aliases: moduleAliases(['crm reports', 'crm report', 'lead reports'], [], ['crm report', 'crm reports', 'lead report'], ['crm reports', 'reports']),
    tools: { summary: 'lead.statistics', list: 'lead.statistics', search: 'lead.statistics', detail: 'lead.statistics', status: 'lead.statistics', history: 'lead.statistics', activity: 'lead.statistics', compare: 'lead.statistics', trend: 'lead.statistics', forecast: 'forecast.operations' },
    plannedTools: allPlanned('crm-reports'),
  },
  {
    id: 'crm-campaigns',
    aliases: moduleAliases(['crm campaigns', 'crm campaign', 'audience segments', 'segments'], [], ['crm campaign', 'crm campaigns', 'segment ka'], ['campaigns', 'segments']),
    tools: { summary: 'crm.campaigns.summary', list: 'crm.campaigns.summary', search: 'crm.campaigns.summary', detail: 'crm.campaigns.summary', status: 'crm.campaigns.summary', history: 'crm.campaigns.summary', activity: 'crm.campaigns.summary', trend: 'crm.campaigns.summary' },
    plannedTools: allPlanned('crm-campaigns'),
  },
  {
    id: 'crm-import',
    aliases: moduleAliases(['crm import', 'import history', 'lead import'], [], ['crm import', 'import history', 'import ka record'], ['import', 'import history']),
    tools: { summary: 'crm.import.summary', list: 'crm.import.summary', search: 'crm.import.summary', detail: 'crm.import.summary', status: 'crm.import.summary', history: 'crm.import.summary', activity: 'crm.import.summary' },
    plannedTools: allPlanned('crm-import'),
  },
  {
    id: 'stored-documents',
    aliases: moduleAliases(['stored documents', 'files', 'pdf', 'resume', 'cv', 'invoice file', 'identity document'], ['दस्तावेज', 'फाइल', 'रिज्यूमे'], ['file do', 'pdf do', 'resume do', 'cv do', 'invoice file', 'document nikalo'], ['files', 'pdf', 'resume', 'cv', 'invoice']),
    tools: { summary: 'ai.documents.search', list: 'ai.documents.search', search: 'ai.documents.search', detail: 'ai.documents.search', status: 'ai.documents.search', history: 'ai.documents.search' },
    plannedTools: allPlanned('stored-documents'),
  },
  {
    id: 'call-intelligence',
    aliases: moduleAliases(['call intelligence', 'call log', 'call logs', 'phone calls', 'call outcomes'], ['कॉल इंटेलिजेंस', 'कॉल लॉग', 'फोन कॉल'], ['call ka analysis', 'call log batao', 'phone calls ka status'], ['call intelligence', 'call log', 'calls']),
    tools: { summary: 'crm.call.intelligence', list: 'crm.call.intelligence', search: 'crm.call.intelligence', detail: 'crm.call.intelligence', status: 'crm.call.intelligence', history: 'crm.call.intelligence', activity: 'crm.call.intelligence', trend: 'crm.call.intelligence' },
    plannedTools: allPlanned('call-intelligence'),
  },
  {
    id: 'finance',
    aliases: moduleAliases(['finance', 'financial', 'revenue', 'income', 'expense', 'payment', 'cash flow'], ['वित्त', 'राजस्व', 'भुगतान', 'खर्च'], ['finance ka', 'revenue', 'income expense', 'payment ka'], ['finance', 'revenue', 'cashflow', 'payment']),
    tools: { summary: 'revenue.summary', list: 'finance.trend', search: 'finance.trend', detail: 'finance.copilot', status: 'finance.copilot', history: 'finance.trend', activity: 'finance.copilot', compare: 'finance.trend', trend: 'finance.trend', forecast: 'forecast.operations' },
    plannedTools: allPlanned('finance'),
  },
  {
    id: 'recruitment',
    aliases: moduleAliases(['recruitment', 'hiring', 'jobs', 'candidates'], ['भर्ती', 'नौकरी', 'उम्मीदवार'], ['hiring ka', 'job candidates', 'recruitment'], ['hiring', 'jobs', 'candidates']),
    tools: { summary: 'recruitment.summary', list: 'recruitment.summary', detail: 'recruitment.copilot', status: 'recruitment.copilot', history: 'recruitment.summary', activity: 'recruitment.copilot', trend: 'recruitment.summary' },
    plannedTools: allPlanned('recruitment'),
  },
  {
    id: 'market-intelligence',
    aliases: moduleAliases(['market intelligence', 'market updates', 'industry updates', 'oem updates', 'government updates', 'competitor updates', 'technology updates'], ['बाजार अपडेट', 'उद्योग अपडेट'], ['market update', 'industry news', 'government change', 'competitor update'], ['market', 'industry', 'oem', 'updates']),
    tools: { summary: 'market.intelligence', list: 'market.intelligence', search: 'market.intelligence', detail: 'market.intelligence', status: 'market.intelligence', history: 'market.intelligence', activity: 'market.intelligence', compare: 'market.intelligence', trend: 'market.intelligence' },
    plannedTools: allPlanned('market-intelligence'),
  },
  {
    id: 'fraud-signals',
    aliases: moduleAliases(['fraud', 'fraud signals', 'suspicious listings', 'duplicate media', 'anomaly'], ['धोखाधड़ी', 'संदिग्ध'], ['fraud check', 'suspicious listing', 'duplicate image', 'anomaly check'], ['fraud', 'suspicious', 'duplicate']),
    tools: { summary: 'fraud.signals', list: 'fraud.signals', search: 'fraud.signals', detail: 'fraud.signals', status: 'fraud.signals', history: 'fraud.signals', activity: 'fraud.signals', compare: 'fraud.signals', trend: 'fraud.signals' },
    plannedTools: allPlanned('fraud-signals'),
  },
  {
    id: 'verification',
    aliases: moduleAliases(['verification', 'pan', 'gst', 'gstin', 'aadhaar', 'aadhar', 'driving license', 'dl'], ['सत्यापन', 'पैन', 'जीएसटी', 'आधार'], ['verification ka', 'pan gst', 'aadhaar check', 'dl check'], ['verification', 'pan', 'gst', 'aadhaar', 'dl']),
    tools: { summary: 'verification.summary', list: 'verification.summary', search: 'ai.documents.search', detail: 'verification.summary', status: 'verification.summary', history: 'verification.summary', activity: 'verification.summary', compare: 'verification.summary', trend: 'verification.summary' },
    plannedTools: allPlanned('verification'),
  },
  {
    id: 'kyc-review',
    aliases: moduleAliases(['kyc review', 'kyc checklist', 'partner kyc'], ['केवाईसी समीक्षा'], ['kyc review', 'kyc checklist', 'partner kyc check'], ['kyc', 'kyc review']),
    tools: { summary: 'pending.kyc', list: 'pending.kyc', search: 'kyc.copilot', detail: 'kyc.copilot', status: 'pending.kyc', history: 'pending.kyc', activity: 'kyc.copilot', compare: 'pending.kyc', trend: 'pending.kyc' },
    plannedTools: allPlanned('kyc-review'),
  },
  {
    id: 'surepass',
    aliases: moduleAliases(['surepass', 'identity api', 'verification provider'], ['सुरेपस', 'पहचान एपीआई'], ['surepass ka', 'surepass status'], ['surepass', 'api status']),
    tools: { summary: 'surepass.status', status: 'surepass.status', history: 'surepass.status', activity: 'surepass.status' },
    plannedTools: allPlanned('surepass'),
  },
  {
    id: 'whatsapp',
    aliases: moduleAliases(['whatsapp', 'whatsapp cloud', 'templates', 'message delivery'], ['व्हाट्सऐप', 'संदेश', 'टेम्पलेट'], ['whatsapp ka', 'template ka', 'message delivery'], ['whatsapp', 'wa', 'templates', 'delivery']),
    tools: { summary: 'whatsapp.activity.summary', list: 'whatsapp.activity.summary', search: 'whatsapp.activity.summary', detail: 'whatsapp.activity.summary', status: 'whatsapp.status', history: 'whatsapp.activity.summary', activity: 'whatsapp.activity.summary', compare: 'whatsapp.activity.summary', trend: 'whatsapp.activity.summary' },
    plannedTools: allPlanned('whatsapp'),
  },
  {
    id: 'whatsapp-campaigns',
    aliases: moduleAliases(['whatsapp campaigns', 'campaigns', 'broadcasts', 'bulk messages'], [], ['whatsapp campaign ka', 'broadcast ka', 'bulk message'], ['campaigns', 'broadcast', 'bulk']),
    tools: { summary: 'whatsapp.campaigns.summary', list: 'whatsapp.campaigns.summary', search: 'whatsapp.campaigns.summary', detail: 'whatsapp.campaigns.summary', status: 'whatsapp.campaigns.summary', history: 'whatsapp.campaigns.summary', activity: 'whatsapp.campaigns.summary', compare: 'whatsapp.campaigns.summary', trend: 'whatsapp.campaigns.summary' },
    plannedTools: allPlanned('whatsapp-campaigns'),
  },
  {
    id: 'delivery-logs',
    aliases: moduleAliases(['delivery logs', 'delivery history', 'delivery report'], [], ['delivery logs dikhao', 'delivery history batao'], ['delivery logs', 'delivery history', 'delivery report']),
    tools: { summary: 'communication.delivery.summary', list: 'communication.delivery.summary', search: 'communication.delivery.summary', detail: 'communication.delivery.summary', status: 'communication.delivery.summary', history: 'communication.delivery.summary', activity: 'communication.delivery.summary', compare: 'communication.delivery.summary', trend: 'communication.delivery.summary' },
    plannedTools: allPlanned('delivery-logs'),
  },
  {
    id: 'sms',
    aliases: moduleAliases(['sms', 'text messages', 'messaging'], ['एसएमएस', 'संदेश'], ['sms ka', 'message bheje'], ['sms', 'text', 'messages']),
    tools: { summary: 'sms.activity.summary', list: 'sms.activity.summary', search: 'sms.activity.summary', detail: 'sms.activity.summary', status: 'sms.activity.summary', history: 'sms.activity.summary', activity: 'sms.activity.summary', compare: 'sms.activity.summary', trend: 'sms.activity.summary' },
    plannedTools: allPlanned('sms'),
  },
  {
    id: 'notifications',
    aliases: moduleAliases(['notification', 'notifications', 'alerts'], ['सूचना', 'नोटिफिकेशन', 'अलर्ट'], ['notification ka', 'unread alert'], ['notifications', 'alerts', 'unread']),
    tools: { summary: 'notifications.summary', list: 'notifications.summary', search: 'notifications.summary', detail: 'notifications.summary', status: 'notifications.summary', history: 'notifications.summary', activity: 'notifications.summary', compare: 'notifications.summary', trend: 'notifications.summary' },
    plannedTools: allPlanned('notifications'),
  },
  {
    id: 'won-customers',
    aliases: moduleAliases(['won customers', 'won customer', 'closed won customers'], [], ['won customer ka', 'won customers ka', 'won customer module', 'won customer wala module'], ['won customers', 'won customer']),
    tools: { summary: 'crm.won.customers.summary', list: 'crm.won.customers.summary', search: 'crm.won.customers.summary', detail: 'crm.won.customers.summary', status: 'crm.won.customers.summary', history: 'crm.won.customers.summary', activity: 'crm.won.customers.summary' },
    plannedTools: allPlanned('won-customers'),
  },
  {
    id: 'customers-visitors',
    aliases: moduleAliases(['customer', 'customers', 'visitor', 'visitors'], ['ग्राहक', 'आगंतुक'], ['customer ka', 'visitor ka'], ['customers', 'visitors', 'buyers']),
    tools: { summary: 'customer.summary', list: 'customer.summary', search: 'customer.detail', detail: 'customer.detail', status: 'customer.summary', history: 'customer.detail', activity: 'customer.detail' },
    plannedTools: allPlanned('customers-visitors'),
  },
  {
    id: 'enquiries',
    aliases: moduleAliases(['enquiry', 'enquiries', 'inquiry', 'inquiries', 'requests'], [], ['enquiry ki', 'enquiries wali', 'inquiry ka', 'request wali'], ['enquiry', 'enquiries', 'inquiry', 'requests']),
    tools: { summary: 'enquiry.summary', list: 'enquiry.summary', search: 'enquiry.detail', detail: 'enquiry.detail', status: 'enquiry.summary', history: 'lead.statistics', activity: 'lead.statistics', compare: 'lead.statistics', trend: 'lead.statistics', forecast: 'forecast.operations' },
    plannedTools: allPlanned('enquiries'),
  },
  {
    id: 'tasks',
    aliases: moduleAliases(['task', 'tasks', 'work items', 'pending work'], [], ['task ka', 'pending task', 'kaam ka'], ['tasks', 'work', 'pending']),
    tools: { summary: 'tasks.summary', list: 'tasks.summary', search: 'tasks.summary', detail: 'tasks.summary', status: 'tasks.summary', history: 'tasks.summary', activity: 'tasks.summary', trend: 'tasks.summary' },
    plannedTools: allPlanned('tasks'),
  },
  {
    id: 'finance-hub',
    aliases: moduleAliases(['finance hub', 'accounting', 'ledger', 'journal', 'trading'], ['लेखा', 'खाता', 'जर्नल'], ['accounts ka', 'ledger ka', 'journal'], ['accounts', 'ledger', 'journal']),
    tools: { summary: 'finance.workspace.summary', list: 'accounting.summary', search: 'accounting.summary', detail: 'journal.summary', status: 'accounting.summary', history: 'journal.summary', activity: 'journal.summary', compare: 'margin.summary', trend: 'journal.summary', forecast: 'forecast.operations' },
    plannedTools: allPlanned('finance-hub'),
  },
  {
    id: 'content-cms',
    aliases: moduleAliases(['content', 'cms', 'homepage', 'website', 'blog', 'translation'], ['सामग्री', 'वेबसाइट', 'अनुवाद'], ['website ka', 'homepage ka', 'content'], ['cms', 'website', 'homepage', 'content']),
    tools: { summary: 'blogs.summary', list: 'blogs.summary', search: 'blogs.summary', detail: 'blogs.summary', status: 'blogs.summary', history: 'blogs.summary', activity: 'blogs.summary', trend: 'blogs.summary' },
    plannedTools: allPlanned('content-cms'),
  },
  {
    id: 'users-permissions',
    aliases: moduleAliases(['users', 'roles', 'permissions', 'security', 'access'], ['उपयोगकर्ता', 'भूमिका', 'अनुमति', 'सुरक्षा'], ['role ka', 'permission ka', 'access ka', 'user'], ['users', 'roles', 'permissions', 'access']),
    tools: { summary: 'users.summary', list: 'users.summary', search: 'users.summary', detail: 'roles.summary', status: 'users.summary', history: 'users.summary', activity: 'users.summary' },
    plannedTools: allPlanned('users-permissions'),
  },
  {
    id: 'settings-ai',
    aliases: moduleAliases(['settings', 'ai gateway', 'ai provider', 'model'], ['सेटिंग्स', 'एआई मॉडल'], ['settings me', 'ai model', 'provider ka'], ['settings', 'ai', 'model', 'provider']),
    tools: { summary: 'settings.summary', status: 'settings.summary', detail: 'settings.summary', history: 'settings.summary', activity: 'settings.summary' },
    plannedTools: allPlanned('settings-ai'),
  },
];

const COMMON_EXAMPLES: Record<AiQuestionIntent, readonly string[]> = {
  summary: ['How many records are there?', 'कितने records हैं?', 'kitne records hain batao'],
  list: ['Show all records', 'सभी records दिखाओ', 'kaun kaun se records hain'],
  search: ['Search records by name or ID', 'नाम या ID से खोजो', 'name se search karo'],
  detail: ['Show the complete record details', 'पूरी जानकारी दिखाओ', 'iska detail batao'],
  status: ['What is the current status?', 'वर्तमान स्थिति बताओ', 'status kya hai'],
  history: ['Show record history', 'पिछला इतिहास दिखाओ', 'pichla record batao'],
  activity: ['Show recent activity', 'हाल की गतिविधि दिखाओ', 'recent activity batao'],
  compare: ['Compare this period with the previous one', 'तुलना बताओ', 'pichle period se compare karo'],
  trend: ['Show the trend over time', 'रुझान दिखाओ', 'trend dikhao'],
  forecast: ['Forecast the next period', 'आगे का अनुमान बताओ', 'agle din ka forecast batao'],
};

const buildCatalog = (): readonly AiQuestionCatalogEntry[] => MODULE_SPECS.flatMap((module) => AI_QUESTION_INTENTS.map((intent) => {
  const toolName = module.tools[intent];
  const coverage = toolName
    ? { coverage: 'supported' as const, toolName }
    : { coverage: 'planned' as const, plannedToolName: module.plannedTools[intent] ?? `${module.id}.${intent}` };
  return {
    id: `${module.id}.${intent}`,
    module: module.id,
    intent,
    ...coverage,
    aliases: {
      en: [...module.aliases.en, ...INTENT_ALIASES[intent].en],
      hi: [...module.aliases.hi, ...INTENT_ALIASES[intent].hi],
      hinglish: [...module.aliases.hinglish, ...INTENT_ALIASES[intent].hinglish],
      whatsapp: [...module.aliases.whatsapp, ...INTENT_ALIASES[intent].whatsapp],
    },
    moduleAliases: module.aliases,
    intentAliases: INTENT_ALIASES[intent],
    examples: COMMON_EXAMPLES[intent],
  } satisfies AiQuestionCatalogEntry;
}));

export const AI_QUESTION_CATALOG = buildCatalog();

const SPELLING_ALIASES: readonly [RegExp, string][] = [
  [/\blistngs?\b/gu, 'listing'],
  [/\blistins?\b/gu, 'listing'],
  [/\bvechiles?\b/gu, 'vehicle'],
  [/\bvehicals?\b/gu, 'vehicle'],
  [/\bpartnrs?\b/gu, 'partner'],
  [/\bdetial(?:s)?\b/gu, 'details'],
  [/\bstatstics?\b/gu, 'statistics'],
  [/\bforcast\b/gu, 'forecast'],
  [/\bserach\b/gu, 'search'],
  [/\bnotificaton\b/gu, 'notification'],
  [/\bfolowups?\b/gu, 'followups'],
  [/\bcnt\b/gu, 'count'],
  [/\bpls\b/gu, 'please'],
  [/\bkon\b/gu, 'kaun'],
];

export const normalizeAiQuestion = (message: string): string => {
  let normalized = message
    .normalize('NFKC')
    .toLocaleLowerCase('en-IN')
    .replace(/[\u201c\u201d\u2018\u2019]/gu, '"');
  for (const [pattern, replacement] of SPELLING_ALIASES) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
};

const aliasMatches = (message: string, alias: string): boolean => {
  const normalizedAlias = normalizeAiQuestion(alias);
  if (!normalizedAlias) return false;
  const paddedMessage = ` ${message} `;
  return paddedMessage.includes(` ${normalizedAlias} `)
    || message === normalizedAlias
    || message.startsWith(`${normalizedAlias} `)
    || message.endsWith(` ${normalizedAlias}`);
};

const bestAlias = (message: string, aliases: readonly string[]): string | null => {
  const matches = aliases.filter((alias) => aliasMatches(message, alias));
  return matches.sort((left, right) => normalizeAiQuestion(right).length - normalizeAiQuestion(left).length)[0] || null;
};

export const findSupportedQuestionMatches = (message: string): AiQuestionCatalogMatch[] => {
  const normalized = normalizeAiQuestion(message);
  if (!normalized) return [];

  return AI_QUESTION_CATALOG
    .filter((entry) => entry.coverage === 'supported' && entry.toolName)
    .flatMap((entry) => {
      const matchedModuleAlias = bestAlias(normalized, [
        ...entry.moduleAliases.en,
        ...entry.moduleAliases.hi,
        ...entry.moduleAliases.hinglish,
        ...entry.moduleAliases.whatsapp,
      ]);
      const matchedIntentAlias = bestAlias(normalized, [
        ...entry.intentAliases.en,
        ...entry.intentAliases.hi,
        ...entry.intentAliases.hinglish,
        ...entry.intentAliases.whatsapp,
      ]);
      if (!matchedModuleAlias || !matchedIntentAlias) return [];
      return [{
        ...entry,
        score: normalizeAiQuestion(matchedModuleAlias).length + normalizeAiQuestion(matchedIntentAlias).length,
        matchedModuleAlias,
        matchedIntentAlias,
      }];
    })
    .sort((left, right) => right.score - left.score);
};

export const getQuestionCatalogCoverage = () => {
  const byModule: Record<string, Set<AiQuestionIntent>> = {};
  for (const entry of AI_QUESTION_CATALOG) {
    const moduleIntents = byModule[entry.module] ?? new Set<AiQuestionIntent>();
    moduleIntents.add(entry.intent);
    byModule[entry.module] = moduleIntents;
  }
  return { modules: Object.keys(byModule), byModule };
};
