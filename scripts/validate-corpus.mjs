import { readFileSync } from 'node:fs';
import { PETS } from '../dist/engine.mjs';

const docs = JSON.parse(readFileSync(new URL('../dist/data/sources.json', import.meta.url), 'utf8'));
const hosts = new Set(['mdi.georgetown.edu', 'www.nist.gov', 'csrc.nist.gov', 'nvlpubs.nist.gov', 'ico.org.uk', 'studentprivacy.ed.gov', 'www.gov.uk', 'pmc.ncbi.nlm.nih.gov', 'georgetown.app.box.com']);
const publicReportShares = new Set([
  '/s/vid4zxlg2khg79v8vrjsjbym1g25c04w', // DC ETEP, linked from MDI's public use-case page
  '/s/1scuwwt0yynk31nbgzpvl87ucfb99rlg', // Arkansas
  '/s/azphzj3777cbxbhtx0m1qetdwiq5pckx'  // NSWERS
]);
const jurisdictions = new Set(['US', 'UK', 'international']);
const sourceRoles = new Set(['case_study', 'technical_guidance', 'legal_guidance', 'research_evidence', 'institutional_context']);
const ids = new Set();
let errors = 0;
for (const [i, doc] of docs.entries()) {
  const fail = reason => { console.error(`source ${i + 1} (${doc.id || '?'}) ${reason}`); errors++; };
  if (!doc.id || ids.has(doc.id)) fail('has missing or duplicate id');
  ids.add(doc.id);
  if (!doc.title || !doc.publisher || !doc.text || !Array.isArray(doc.tags) || !doc.tags.length) fail('has incomplete metadata');
  if (!jurisdictions.has(doc.jurisdiction)) fail('has missing or invalid jurisdiction');
  if (!sourceRoles.has(doc.source_role)) fail('has missing or invalid source role');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.reviewed_at || '')) fail('has no review date');
  if (doc.year !== null && (!Number.isInteger(doc.year) || doc.year < 2000 || doc.year > 2100)) fail('has invalid year');
  if (doc.text?.length > 850) fail('chunk is too long');
  try {
    const url = new URL(doc.url);
    if (url.protocol !== 'https:' || !hosts.has(url.hostname)) fail('uses a non-reviewed source host');
    if (url.hostname === 'georgetown.app.box.com') {
      if (!publicReportShares.has(url.pathname)) fail('uses a Box link not confirmed by the MDI public corpus inventory');
      if (!Number.isInteger(doc.page) || doc.page < 1 || url.hash !== `#page=${doc.page}`) fail('has no matching report page URL');
      if (!doc.section || !doc.source_document) fail('has no report section or document title');
      try {
        const landing = new URL(doc.public_landing_url);
        if (landing.protocol !== 'https:' || landing.hostname !== 'mdi.georgetown.edu') fail('has no MDI public landing page');
      } catch { fail('has invalid MDI public landing page'); }
    }
  } catch { fail('has invalid URL'); }
}
for (const [code, pet] of Object.entries(PETS)) {
  for (const sourceId of pet.sourceIds || []) {
    if (!ids.has(sourceId)) { console.error(`PET ${code} references missing source ${sourceId}`); errors++; }
  }
}
if (docs.length < 30) { console.error('Corpus is too small for the reviewed launch set'); errors++; }
if (errors) process.exit(1);
console.log(`Validated ${docs.length} public-source chunks.`);
