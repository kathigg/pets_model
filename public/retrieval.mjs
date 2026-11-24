/** Local, inspectable retrieval over draft public-source summaries. */
import { PETS } from './engine.mjs';
import { distance } from './vendor/fastest-levenshtein.mjs';
const STOP = new Set('a an and are as at be by can could describe do does explain for from has have how i in into is it its know of on or our please the their this to use we what when where which who why will with would your you data privacy private technology technologies pet pets'.split(' '));
const ALIASES = new Map(Object.entries({
  'smpc': 'mpc', 'multi-party': 'mpc', 'multiparty': 'mpc',
  'psi': 'psi', 'intersection': 'psi',
  'dp': 'differentialprivacy', 'differential': 'differentialprivacy',
  'pprl': 'recordlinkage', 'linkage': 'recordlinkage', 'matching': 'recordlinkage',
  'enclave': 'tre', 'researchenvironment': 'tre',
  'tee': 'tee', 'hardware': 'tee',
  'federation': 'federated', 'federatedlearning': 'federated',
  'hash': 'hashing', 'hashed': 'hashing',
  'fake': 'synthetic', 'simulation': 'synthetic',
  'ferpa': 'ferpa', 'student': 'education', 'school': 'education',
  'governance': 'governance', 'agreement': 'governance',
  'statistics': 'statistics', 'counts': 'statistics', 'aggregate': 'statistics'
}));

function stem(token) {
  if (token.length > 5 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (token.length > 6 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 5 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 5 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

// Match only a small PET vocabulary. Do not rewrite arbitrary visitor terms.
const PET_VOCABULARY = ['synthetic', 'differential', 'synthpop', 'tidysynthesis',
  'homomorphic', 'encryption', 'federated', 'linkage', 'anonymization',
  'pseudonymization', 'multiparty', 'intersection', 'probabilistic', 'privacy'];

function correctPetWord(word) {
  const lower = word.toLowerCase();
  if (PET_VOCABULARY.includes(lower)) return word;
  let best = null;
  let bestDistance = Infinity;
  let tie = false;
  for (const term of PET_VOCABULARY) {
    if (lower[0] !== term[0] || Math.abs(lower.length - term.length) > 2) continue;
    const edits = distance(lower, term);
    if (edits < bestDistance) { best = term; bestDistance = edits; tie = false; }
    else if (edits === bestDistance) tie = true;
  }
  if (tie || bestDistance > 2 || (bestDistance === 2 && lower.at(-1) !== best.at(-1))) return word;
  return best;
}

/** Correct close PET-term spelling without changing the visitor's displayed message. */
export function normalizePetTerms(input) {
  return String(input || '')
    .replace(/\bsynhpop\b/gi, 'synthpop')
    .replace(/\btidy[\s-]?(?:synethesis|synthesis)\b/gi, 'tidysynthesis')
    .replace(/\b[A-Za-z]{7,}\b/g, correctPetWord);
}

export function tokens(input) {
  const s = normalizePetTerms(input).toLowerCase()
    .replace(/differential privacy/g, ' differentialprivacy ')
    .replace(/record linkage/g, ' recordlinkage ')
    .replace(/federated learning/g, ' federatedlearning ')
    .replace(/research environment/g, ' researchenvironment ')
    .replace(/private set intersection/g, ' psi ')
    .replace(/trusted execution environment/g, ' tee ')
    .replace(/multi[ -]party computation/g, ' mpc ')
    .replace(/[^a-z0-9]+/g, ' ');
  return s.split(/\s+/).map(stem).map(x => ALIASES.get(x) || x).filter(x => x.length > 1 && !STOP.has(x));
}

function frequencies(xs) {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

function sourceWeight(doc) {
  let host = '';
  try { host = new URL(doc.url).hostname; } catch { /* Invalid URLs are already excluded. */ }
  if (['www.nist.gov', 'csrc.nist.gov', 'nvlpubs.nist.gov'].includes(host)) return 1.14;
  if (host === 'studentprivacy.ed.gov') return 0.8;
  if (host === 'digitalprivacy.ieee.org') return 1.04;
  const isMdiPets = [doc.url, doc.public_landing_url].some(value => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.hostname === 'mdi.georgetown.edu' && url.pathname.startsWith('/pets/');
    } catch { return false; }
  });
  if (!isMdiPets) return 1;
  // Prefer the project's own relevant evidence without treating its source
  // as inherently more accurate than specialist guidance.
  return doc.source_role === 'institutional_context' ? 1.04 : 1.08;
}

export function createIndex(documents) {
  if (!Array.isArray(documents)) throw new TypeError('documents must be an array');
  const docs = documents.filter(d => d && typeof d.id === 'string' && typeof d.text === 'string' && /^https:\/\//.test(d.url || ''));
  const vectors = docs.map(d => {
    const body = tokens(d.text);
    const title = tokens(d.title || '');
    const tags = tokens((d.tags || []).join(' '));
    return { body: frequencies(body), title: frequencies(title), tags: frequencies(tags), length: Math.max(1, body.length), sourceWeight: sourceWeight(d) };
  });
  const df = new Map();
  for (const vector of vectors) {
    const seen = new Set([...vector.body.keys(), ...vector.title.keys(), ...vector.tags.keys()]);
    for (const term of seen) df.set(term, (df.get(term) || 0) + 1);
  }
  const avgLength = vectors.reduce((s, v) => s + v.length, 0) / Math.max(1, vectors.length);
  return { docs, vectors, df, avgLength };
}

/** BM25 on body text with boosts for headings and curated taxonomy tags. */
export function retrieve(index, query, { limit = 5, tags = [] } = {}) {
  const q = [...new Set(tokens(query))];
  const boost = new Set(tokens(tags.join(' ')));
  if (!q.length && !boost.size) return [];
  const N = index.docs.length;
  const broad = new Set(['education', 'school', 'student']);
  const ferpaQuestion = /\bferpa\b/i.test(query);
  const definitionQuestion = /\b(?:what is|what are|define|definition|explain what)\b/i.test(query);
  const scored = index.docs.map((doc, i) => {
    const v = index.vectors[i];
    let score = 0;
    const matched = [];
    for (const term of new Set([...q, ...boost])) {
      const tf = v.body.get(term) || 0;
      const inTitle = v.title.get(term) || 0;
      const inTags = v.tags.get(term) || 0;
      if (!tf && !inTitle && !inTags) continue;
      matched.push(term);
      const df = index.df.get(term) || 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const bm25 = tf ? idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * v.length / index.avgLength)) : 0;
      score += bm25 + (inTitle ? idf * Math.min(inTitle, 2) * 1.4 : 0) + (inTags ? idf * Math.min(inTags, 2) * 0.8 : 0);
      if (boost.has(term)) score += idf * 0.35;
    }
    if (ferpaQuestion && doc.jurisdiction === 'US' && doc.source_role === 'legal_guidance') score *= 1.7;
    if (!ferpaQuestion) score *= v.sourceWeight;
    if (definitionQuestion && doc.tags?.includes('definition')) score *= 1.25;
    return { document: doc, score, matched };
  }).filter(x => {
    if (x.score <= 0 || !x.matched.some(term => !broad.has(term))) return false;
    if (q.length < 3 || x.matched.filter(term => !broad.has(term)).length >= 2) return true;
    // One exact named topic in a source title or tag is useful; one incidental
    // body word such as "look" in an unrelated question is not.
    const named = new Set(tokens(`${x.document.title} ${(x.document.tags || []).join(' ')}`));
    const generic = new Set(['look', 'internet', 'new', 'current', 'recent', 'option', 'work', 'want', 'share', 'researcher', 'organization']);
    return x.matched.some(term => named.has(term) && !generic.has(term) && !broad.has(term));
  });
  scored.sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id));
  return scored.slice(0, Math.max(0, Math.min(20, limit)));
}

export function evidenceFor(index, query, petCodes = [], limit = 5) {
  // Architecture citations are curated to support each rule's claim. Lexical
  // similarity alone can cite exact-match PSI for fuzzy record linkage.
  const selected = [];
  const seen = new Set();
  const max = Math.max(0, Math.min(20, limit));
  for (const code of petCodes) {
    if (selected.length >= max) break;
    const source = (PETS[code]?.sourceIds || []).map(id => index.docs.find(d => d.id === id)).find(d => d && !seen.has(d.id));
    if (source) {
      selected.push({ document: source, score: 1, matched: [code], evidence_for: code });
      seen.add(source.id);
    }
  }
  // Keep one source for each proposed PET first. Add an MDI pilot only when
  // the question explicitly asks about that project or one of its pilots.
  const asksAboutMdi = /\b(?:mdi|georgetown|etep|ardata|nswers|linkja|arkansas|nebraska)\b/i.test(query);
  if (selected.length < max && asksAboutMdi) {
    const approximate = /\b(?:fuzzy|probabilistic|approximate|imperfect|misspell\w*)\b/i.test(query);
    const relevance = new Map(retrieve(index, query, { limit: 20 }).map(hit => [hit.document.id, hit.score]));
    const examples = petCodes.flatMap(code => (PETS[code]?.sourceIds || [])
      .map(id => ({ code, document: index.docs.find(d => d.id === id) }))
      .filter(({ document }) => document && !seen.has(document.id) &&
        sourceWeight(document) > 1 && document.source_role === 'case_study' && relevance.has(document.id) &&
        (!approximate || document.tags.includes('fuzzy'))));
    examples.sort((a, b) => relevance.get(b.document.id) - relevance.get(a.document.id));
    if (examples[0]) {
      const { code, document } = examples[0];
      selected.push({ document, score: relevance.get(document.id), matched: [code], evidence_for: code });
    }
  }
  return selected;
}
