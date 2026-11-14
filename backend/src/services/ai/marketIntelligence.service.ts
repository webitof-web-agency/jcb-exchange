import crypto from 'node:crypto';
import prisma from '../../lib/prisma';

export type MarketCategory = 'INDUSTRY' | 'OEM' | 'GOVERNMENT' | 'FINANCE' | 'COMPETITOR' | 'TECHNOLOGY';
export type MarketImpact = 'OPPORTUNITY' | 'RISK' | 'WATCH';
export type MarketPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'WATCH';

export type MarketSource = {
  key: string;
  name: string;
  url: string;
  category: MarketCategory;
};

export type ParsedMarketItem = {
  sourceKey: string;
  sourceName: string;
  sourceCategory: MarketCategory;
  title: string;
  summary: string;
  url: string;
  publishedAt: Date | null;
};

export type MarketInsight = ParsedMarketItem & {
  sourceUrl: string;
  impact: MarketImpact;
  priority: MarketPriority;
  recommendation: string;
  contentHash: string;
};

const xmlDecode = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, '$1')
  .replace(/&amp;/giu, '&')
  .replace(/&lt;/giu, '<')
  .replace(/&gt;/giu, '>')
  .replace(/&quot;/giu, '"')
  .replace(/&#39;/giu, "'");

const stripMarkup = (value: string) => xmlDecode(value)
  .replace(/<[^>]*>/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim()
  .slice(0, 1200);

const firstTag = (block: string, tag: string) => {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'iu'));
  return match?.[1] ? stripMarkup(match[1]) : '';
};

const validHttpsUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
};

export const parseRssFeed = (xml: string, source: MarketSource): ParsedMarketItem[] => {
  if (!xml || xml.length > 2_000_000) return [];
  const blocks = [...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/giu)].map((match) => match[0]);
  return blocks.map((block) => {
    const title = firstTag(block, 'title');
    const url = firstTag(block, 'link') || (block.match(/<link[^>]+href=["']([^"']+)["']/iu)?.[1] ?? '');
    const summary = firstTag(block, 'description') || firstTag(block, 'summary') || firstTag(block, 'content');
    const publishedText = firstTag(block, 'pubDate') || firstTag(block, 'published') || firstTag(block, 'updated');
    const publishedAt = publishedText ? new Date(publishedText) : null;
    return {
      sourceKey: source.key,
      sourceName: source.name,
      sourceCategory: source.category,
      title,
      summary,
      url,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    };
  }).filter((item) => item.title && validHttpsUrl(item.url));
};

const normalizedText = (item: Pick<ParsedMarketItem, 'title' | 'summary'>) => `${item.title} ${item.summary}`.toLowerCase();

export const buildMarketInsight = (item: ParsedMarketItem): MarketInsight => {
  const text = normalizedText(item);
  const risk = /(penalty|fraud|deadline|compliance|ban|recall|challan|tax|rate hike|security|outage|warning|restriction)/iu.test(text);
  const opportunity = /(demand|project|auction|launch|offer|discount|growth|funding|incentive|rate cut|expansion|tender)/iu.test(text);
  const impact: MarketImpact = risk ? 'RISK' : opportunity ? 'OPPORTUNITY' : 'WATCH';
  const priority: MarketPriority = risk && /(deadline|penalty|ban|recall|security)/iu.test(text)
    ? 'HIGH'
    : risk ? 'MEDIUM' : opportunity ? 'MEDIUM' : 'WATCH';
  const recommendation = risk
    ? `Ask the ${item.sourceCategory === 'FINANCE' ? 'finance' : 'compliance'} owner to review this update against current JCB Exchange workflows and record any required change before the stated deadline.`
    : opportunity
      ? 'Review the opportunity with sales and partner teams, validate the source against internal demand, and create a campaign or inventory action only after approval.'
      : 'Monitor this update and validate whether it affects inventory, customers, compliance, finance, or product priorities.';
  const contentHash = crypto.createHash('sha256').update(`${item.sourceKey}|${item.url}|${item.title}|${item.summary}`).digest('hex');
  return { ...item, sourceUrl: item.url, impact, priority, recommendation, contentHash };
};

const configuredSources = (): MarketSource[] => {
  const raw = process.env.AI_MARKET_SOURCES_JSON?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is MarketSource => {
      if (!value || typeof value !== 'object') return false;
      const row = value as Record<string, unknown>;
      return typeof row.key === 'string' && /^[a-z0-9_-]{2,80}$/iu.test(row.key)
        && typeof row.name === 'string' && row.name.length <= 160
        && typeof row.url === 'string' && validHttpsUrl(row.url)
        && ['INDUSTRY', 'OEM', 'GOVERNMENT', 'FINANCE', 'COMPETITOR', 'TECHNOLOGY'].includes(row.category as string);
    });
  } catch {
    return [];
  }
};

export const getMarketSources = () => configuredSources();

const fetchSource = async (source: MarketSource, timeoutMs = 10_000): Promise<ParsedMarketItem[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' },
    });
    if (!response.ok) throw new Error(`MARKET_SOURCE_HTTP_${response.status}`);
    return parseRssFeed(await response.text(), source);
  } finally {
    clearTimeout(timeout);
  }
};

export const ingestMarketSources = async (sources = getMarketSources()) => {
  const result = { sources: sources.length, fetched: 0, stored: 0, failed: 0 };
  for (const source of sources) {
    try {
      const items = await fetchSource(source);
      result.fetched += items.length;
      for (const item of items.slice(0, 50).map(buildMarketInsight)) {
        await prisma.aiMarketInsight.upsert({
          where: { sourceKey_contentHash: { sourceKey: source.key, contentHash: item.contentHash } },
          update: {
            title: item.title,
            summary: item.summary,
            sourceUrl: item.sourceUrl,
            sourcePublishedAt: item.publishedAt,
            impact: item.impact,
            priority: item.priority,
            recommendation: item.recommendation,
            observedAt: new Date(),
          },
          create: {
            sourceKey: item.sourceKey,
            sourceName: item.sourceName,
            sourceCategory: item.sourceCategory,
            title: item.title,
            summary: item.summary,
            sourceUrl: item.sourceUrl,
            sourcePublishedAt: item.publishedAt,
            impact: item.impact,
            priority: item.priority,
            recommendation: item.recommendation,
            contentHash: item.contentHash,
          },
        });
        result.stored += 1;
      }
    } catch {
      result.failed += 1;
    }
  }
  return result;
};

export const listMarketInsights = async (options: { limit?: number; category?: MarketCategory; priority?: MarketPriority } = {}) => {
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)));
  const rows = await prisma.aiMarketInsight.findMany({
    where: {
      ...(options.category ? { sourceCategory: options.category } : {}),
      ...(options.priority ? { priority: options.priority } : {}),
    },
    orderBy: [{ priority: 'asc' }, { sourcePublishedAt: 'desc' }, { observedAt: 'desc' }],
    take: limit,
    select: { sourceName: true, sourceCategory: true, title: true, summary: true, sourceUrl: true, sourcePublishedAt: true, impact: true, priority: true, recommendation: true },
  });
  return { returned: rows.length, items: rows.map((row) => ({ ...row, sourcePublishedAt: row.sourcePublishedAt?.toISOString() ?? null })) };
};
