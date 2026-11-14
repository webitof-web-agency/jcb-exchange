import { redactSensitiveData } from './aiRedaction';

export type AiKnowledgeSource = {
  key: string;
  title: string;
  category: string;
  content: string;
  sourceUrl?: string;
  approved: boolean;
  updatedAt?: string;
};

export type AiKnowledgeSearchResult = {
  found: boolean;
  query: string;
  sources: Array<{
    title: string;
    category: string;
    content: string;
    sourceUrl: string | null;
    updatedAt: string | null;
  }>;
  maskedFields: string[];
};

const MAX_SOURCES = 200;
const MAX_CONTENT_LENGTH = 6_000;
const HTTP_URL = /^https?:\/\/[^\s]{1,2000}$/iu;
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'is', 'are', 'this', 'that', 'batao', 'btao', 'kya', 'ka', 'ki', 'ke']);

const safeText = (value: unknown, max: number) => typeof value === 'string'
  ? redactSensitiveData(value.replace(/\s+/gu, ' ').trim()).slice(0, max)
  : '';

const safeUrl = (value: unknown) => typeof value === 'string' && HTTP_URL.test(value.trim()) ? value.trim() : undefined;

const normalizeSource = (value: unknown): AiKnowledgeSource | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const key = safeText(record.key, 120).replace(/[^a-z0-9._-]/giu, '-');
  const title = safeText(record.title, 200);
  const category = safeText(record.category, 80).toUpperCase();
  const content = safeText(record.content, MAX_CONTENT_LENGTH);
  const sourceUrl = record.sourceUrl === undefined ? undefined : safeUrl(record.sourceUrl);
  if (!key || !title || !category || !content || record.approved !== true) return null;
  if (record.sourceUrl !== undefined && !sourceUrl) return null;
  return {
    key,
    title,
    category,
    content,
    ...(sourceUrl ? { sourceUrl } : {}),
    approved: true,
    ...(typeof record.updatedAt === 'string' && !Number.isNaN(Date.parse(record.updatedAt)) ? { updatedAt: new Date(record.updatedAt).toISOString() } : {}),
  };
};

export const parseKnowledgeSources = (raw: string | undefined = process.env.AI_KNOWLEDGE_SOURCES_JSON): AiKnowledgeSource[] => {
  if (!raw?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSource).filter((source): source is AiKnowledgeSource => Boolean(source)).slice(0, MAX_SOURCES);
  } catch {
    return [];
  }
};

const termsFor = (value: string) => [...new Set(value.toLocaleLowerCase('en-IN').match(/[a-z0-9]{2,}/gu) || [])]
  .filter((term) => !STOP_WORDS.has(term));

export const searchApprovedKnowledge = (query: string, sources: readonly AiKnowledgeSource[] = parseKnowledgeSources()): AiKnowledgeSearchResult => {
  const normalizedQuery = safeText(query, 500);
  const queryTerms = termsFor(normalizedQuery);
  const ranked = sources
    .filter((source) => source.approved)
    .map((source) => {
      const haystackTerms = new Set(termsFor(`${source.title} ${source.category} ${source.content}`));
      const score = queryTerms.reduce((total, term) => total + (haystackTerms.has(term) ? 1 : 0), 0)
        + (source.title.toLocaleLowerCase('en-IN').includes(normalizedQuery.toLocaleLowerCase('en-IN')) ? 2 : 0);
      return { source, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.source.title.localeCompare(right.source.title))
    .slice(0, 5)
    .map(({ source }) => ({
      title: source.title,
      category: source.category,
      content: source.content.slice(0, 2_000),
      sourceUrl: source.sourceUrl || null,
      updatedAt: source.updatedAt || null,
    }));

  return {
    found: ranked.length > 0,
    query: normalizedQuery,
    sources: ranked,
    maskedFields: ['sourceKey', 'documentId', 'rawFileUrl', 'providerToken', 'mobile', 'email'],
  };
};
