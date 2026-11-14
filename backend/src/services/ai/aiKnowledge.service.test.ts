import assert from 'node:assert/strict';
import test from 'node:test';
import { searchApprovedKnowledge, parseKnowledgeSources } from './aiKnowledge.service';

test('parses only valid approved knowledge sources and redacts sensitive text', () => {
  const sources = parseKnowledgeSources(JSON.stringify([
    { key: 'kyc-sop', title: 'KYC SOP', category: 'KYC', content: 'Review the approved document checklist. email test@example.com', sourceUrl: 'https://example.com/kyc', approved: true },
    { key: 'draft', title: 'Draft', category: 'KYC', content: 'Do not use this', approved: false },
    { key: 'bad', title: 'Bad', category: 'KYC', content: 'javascript:alert(1)', sourceUrl: 'javascript:alert(1)', approved: true },
  ]));

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.approved, true);
  assert.equal(sources[0]?.content.includes('test@example.com'), false);
  assert.equal(sources[0]?.sourceUrl, 'https://example.com/kyc');
});

test('returns ranked source-attributed snippets without identifiers', () => {
  const result = searchApprovedKnowledge('KYC document checklist', [
    { key: 'kyc-sop', title: 'KYC SOP', category: 'KYC', content: 'Check the approved document checklist before review.', sourceUrl: 'https://example.com/kyc', approved: true },
    { key: 'rto-sop', title: 'RTO SOP', category: 'RTO', content: 'Check insurance and PUC before transfer.', sourceUrl: 'https://example.com/rto', approved: true },
  ]);

  assert.equal(result.found, true);
  assert.equal(result.sources[0]?.title, 'KYC SOP');
  assert.equal('key' in (result.sources[0] || {}), false);
  assert.equal(JSON.stringify(result).includes('kyc-sop'), false);
});

