import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketInsight, parseRssFeed, type MarketSource } from './marketIntelligence.service';

const source: MarketSource = {
  key: 'official-government',
  name: 'Official Government Updates',
  url: 'https://example.gov.in/updates.xml',
  category: 'GOVERNMENT',
};

test('market intelligence parses RSS items with source attribution and strips unsafe markup', () => {
  const items = parseRssFeed(`
    <rss><channel><item>
      <title>New GST compliance update for used vehicle sales</title>
      <link>https://example.gov.in/updates/1</link>
      <pubDate>Fri, 13 Nov 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Review <b>invoice</b> workflow &amp; tax fields.</p>]]></description>
    </item></channel></rss>
  `, source);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.sourceName, source.name);
  assert.equal(items[0]?.url, 'https://example.gov.in/updates/1');
  assert.equal(items[0]?.summary, 'Review invoice workflow & tax fields.');
  assert.equal(items[0]?.publishedAt?.toISOString(), '2026-11-13T10:00:00.000Z');
});

test('market intelligence classifies compliance risk and creates an explainable recommendation', () => {
  const item = buildMarketInsight({
    sourceKey: source.key,
    sourceName: source.name,
    sourceCategory: source.category,
    title: 'GST penalty and tax compliance deadline extended',
    summary: 'Businesses must review invoice and GST records before the deadline.',
    url: source.url,
    publishedAt: new Date('2026-11-13T10:00:00.000Z'),
  });

  assert.equal(item.impact, 'RISK');
  assert.equal(item.priority, 'HIGH');
  assert.match(item.recommendation, /finance|compliance|invoice/iu);
  assert.equal(item.sourceUrl, source.url);
});

test('market intelligence ignores malformed or unsupported links instead of inventing source data', () => {
  const items = parseRssFeed('<rss><channel><item><title>Missing link</title></item></channel></rss>', source);
  assert.deepEqual(items, []);
});
