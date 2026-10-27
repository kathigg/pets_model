import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIndex, retrieve, evidenceFor } from '../public/retrieval.mjs';

const corpus = JSON.parse(readFileSync(new URL('../public/data/sources.json', import.meta.url), 'utf8'));
const index = createIndex(corpus);

test('public corpus has unique source chunks and no private inventory URLs', () => {
  assert.ok(corpus.length >= 30);
  assert.equal(new Set(corpus.map(x => x.id)).size, corpus.length);
  const publishedReports = new Set(['vid4zxlg2khg79v8vrjsjbym1g25c04w', '1scuwwt0yynk31nbgzpvl87ucfb99rlg', 'azphzj3777cbxbhtx0m1qetdwiq5pckx']);
  for (const doc of corpus) {
    assert.match(doc.url, /^https:\/\//);
    assert.doesNotMatch(doc.url, /docs\.google\.com|drive\.google\.com/i);
    const url = new URL(doc.url);
    if (url.hostname === 'georgetown.app.box.com') {
      assert.ok(publishedReports.has(url.pathname.split('/').at(-1)));
      assert.ok(doc.public_landing_url?.startsWith('https://mdi.georgetown.edu/pets/'));
      assert.ok(Number.isInteger(doc.page) && doc.section && doc.source_document);
    }
    assert.ok(doc.title && doc.publisher && doc.text && Array.isArray(doc.tags));
    assert.ok(doc.jurisdiction && doc.source_role);
  }
});

test('retrieval finds a direct differential-privacy source for repeated aggregate releases', () => {
  const hits = retrieve(index, 'differential privacy budget for repeated statistics', { limit: 5 });
  assert.ok(hits.length >= 1);
  assert.ok(hits.some(x => x.document.id.startsWith('nist-dp-')));
  assert.ok(hits.every(x => x.score > 0));
});

test('retrieval finds private set intersection evidence for cross-holder linkage', () => {
  const hits = retrieve(index, 'private set intersection PSI exact overlap linkage between agencies', { limit: 7 });
  assert.ok(hits.some(x => x.document.tags.includes('psi')));
});

test('MDI sources receive a small relevance boost while FERPA favors legal guidance', () => {
  const sameText = 'education workforce linkage pilot';
  const comparison = createIndex([
    { id: 'other', title: sameText, text: sameText, tags: [], url: 'https://www.nist.gov/example', source_role: 'case_study' },
    { id: 'mdi', title: sameText, text: sameText, tags: [], url: 'https://mdi.georgetown.edu/pets/example/', source_role: 'case_study' }
  ]);
  const boosted = retrieve(comparison, sameText, { limit: 2 });
  assert.equal(boosted[0].document.id, 'mdi');
  assert.ok(boosted[0].score / boosted[1].score < 1.1);

  const project = retrieve(index, 'What privacy-enhancing technologies has MDI tested with education agencies?', { limit: 3 });
  assert.ok(project.every(hit => hit.document.id.startsWith('mdi-')));

  const legal = retrieve(index, 'Can FERPA allow sharing identifiable student records?', { limit: 2 });
  assert.equal(legal.length, 2);
  assert.ok(legal.every(hit => hit.document.source_role === 'legal_guidance'));
});

test('unrelated query has no fabricated evidence', () => {
  assert.deepEqual(retrieve(index, 'volcanoes astrophysics xylophone', { limit: 5 }), []);
  assert.deepEqual(retrieve(index, 'What are the cafeteria menus in schools?', { limit: 5 }), []);
});

test('fuzzy linkage evidence supports approximate matching rather than exact PSI', () => {
  const hits = evidenceFor(index, 'How does MDI Arkansas inform fuzzy student record linkage?', ['pprl'], 3);
  assert.equal(hits[0]?.document.id, 'nih-pprl-fuzzy');
  assert.ok(hits.some(x => x.document.id === 'mdi-ar-report-probabilistic-gap'));
  assert.ok(hits.every(x => !x.document.id.includes('psi')));
});

test('published pilot passages answer report-specific questions', () => {
  const cases = [
    ['Why did DC ETEP need an intermediate TANF file?', 'mdi-dc-report-triangulation'],
    ['What did Arkansas Linkja do with missing input attributes?', 'mdi-ar-report-linkja-results'],
    ['What did NSWERS need to preserve in synthetic longitudinal data?', 'mdi-nswers-report-utility']
  ];
  for (const [question, expected] of cases) {
    assert.ok(retrieve(index, question, { limit: 5 }).some(x => x.document.id === expected), question);
  }
});
