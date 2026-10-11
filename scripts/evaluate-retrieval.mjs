import { readFileSync } from 'node:fs';
import { createIndex, retrieve } from '../dist/retrieval.mjs';

const docs = JSON.parse(readFileSync(new URL('../dist/data/sources.json', import.meta.url), 'utf8'));
const cases = JSON.parse(readFileSync(new URL('../data/eval_queries.json', import.meta.url), 'utf8'));
const index = createIndex(docs);
let successes = 0;
for (const sample of cases) {
  const hits = retrieve(index, sample.query, { limit: 5 });
  const passed = hits.some(hit => sample.expected_ids.some(id => hit.document.id.startsWith(id)));
  successes += Number(passed);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${sample.query}`);
  if (!passed) console.log(`  top: ${hits.map(x => x.document.id).join(', ') || '(none)'}`);
}
console.log(`Retrieval recall@5: ${successes}/${cases.length}`);
if (successes !== cases.length) process.exit(1);
