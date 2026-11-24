import test from 'node:test';
import assert from 'node:assert/strict';
import corpus from '../public/data/sources.json' with { type: 'json' };
import { originalSourceLabel, sourceCitationLabel } from '../public/citations.mjs';

const get = id => corpus.find(source => source.id === id);

test('local note headings are not passed off as original page titles in citations', () => {
  for (const source of corpus) {
    assert.notEqual(sourceCitationLabel(source), source.title, source.id);
    assert.ok(sourceCitationLabel(source).length <= 38, source.id);
  }
  assert.equal(sourceCitationLabel(get('mdi-nswers-report-utility')), 'MDI report, p. 6');
  assert.equal(sourceCitationLabel(get('nist-dp-synthetic-caution')), 'NIST source');
});

test('source details use the original report or page title where it is known', () => {
  assert.equal(originalSourceLabel([get('nist-dp-synthetic-caution'), get('nist-dp-synthetic-utility')]),
    'Differentially Private Synthetic Data');
  assert.equal(originalSourceLabel([get('mdi-nswers-report-utility')]),
    'Synthesizing Workforce and Education Data Using an Open Source Tool: Lessons Learned');
  assert.equal(originalSourceLabel([get('mdi-nebraska-use-case')]), 'MDI PETs use cases');
  assert.equal(sourceCitationLabel({ id: 'web-0', title: 'Official search result', url: 'https://example.org', source_role: 'web_grounding' }),
    'Official search result');
});
