/**
 * Original, inspectable decision-support rules for PET exploration.
 * Rules suggest an architecture to review; they do not certify compliance
 * or replace a privacy, legal, and technical review.
 */

export const FIELDS = {
  goal: {
    label: 'What are you trying to do?',
    options: [
      ['link', 'Link records across data holders'],
      ['statistics', 'Share statistics or dashboards'],
      ['test', 'Create test or training data'],
      ['access', 'Analyze protected records'],
      ['train', 'Train a model across holders']
    ]
  },
  holders: {
    label: 'How many organizations hold the data?',
    options: [['one', 'One'], ['two', 'Two'], ['many', 'Three or more']]
  },
  rawMove: {
    label: 'Can row-level source data move to a shared environment?',
    options: [['yes', 'Yes, with controls'], ['no', 'No'], ['unknown', 'Not sure']]
  },
  match: {
    label: 'If linking records, what kind of matching is needed?',
    options: [['exact', 'Exact or deterministic'], ['fuzzy', 'Approximate or probabilistic'], ['unknown', 'Not sure']]
  },
  output: {
    label: 'What must the output contain?',
    options: [['aggregate', 'Aggregate results'], ['rows', 'Linked or row-level records'], ['model', 'A trained model'], ['synthetic', 'Synthetic records'], ['unknown', 'Not sure']]
  },
  rowAccess: {
    label: 'Will anyone need linked or row-level records before release?',
    options: [['yes', 'Yes, in controlled access'], ['no', 'No'], ['unknown', 'Not sure']]
  },
  directRelease: {
    label: 'Will released output include names or direct identifiers?',
    options: [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Not sure']]
  },
  repeated: {
    label: 'Will analyses or releases repeat over time?',
    options: [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Not sure']]
  },
  sensitivity: {
    label: 'How sensitive are the source records?',
    options: [['protected', 'Student or other protected records'], ['internal', 'Internal but not protected'], ['public', 'Already public'], ['unknown', 'Not sure']]
  },
  capacity: {
    label: 'What technical capacity is available?',
    options: [['low', 'Limited'], ['medium', 'Some specialist support'], ['high', 'Dedicated PET engineers'], ['unknown', 'Not sure']]
  },
  authority: {
    label: 'Has the sharing or analysis authority been reviewed?',
    options: [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Not sure']]
  }
};

export const PETS = {
  'secure-hashing': {
    name: 'Keyed, standardized linkage tokens',
    family: 'Linkage',
    short: 'Transform agreed identifiers consistently so holders can compare matches without exchanging raw identifiers.',
    watch: 'Ordinary hashing is not anonymization. Predictable identifiers, key handling, normalization, and match bias need review.',
    tags: ['hashing', 'record-linkage', 'education'],
    sourceIds: ['nist-crypto-hashing-identifier-risk', 'mdi-arkansas-use-case']
  },
  'pprl': {
    name: 'Privacy-preserving record linkage',
    family: 'Linkage',
    short: 'Link records across holders while limiting exposure of identifying fields.',
    watch: 'Approximate matching needs specialist protocols and measured false-match and missed-match rates.',
    tags: ['record-linkage', 'hashing', 'psi'],
    sourceIds: ['nih-pprl-fuzzy', 'mdi-arkansas-use-case']
  },
  'psi': {
    name: 'Private set intersection',
    family: 'Private computation',
    short: 'Find overlap between holders’ sets without disclosing their nonmatching members.',
    watch: 'Exact-set overlap alone does not solve fuzzy linkage or every downstream analysis.',
    tags: ['psi', 'mpc', 'record-linkage'],
    sourceIds: ['ico-psi-definition', 'nist-crypto-psi-cardinality']
  },
  'mpc': {
    name: 'Secure multiparty computation',
    family: 'Private computation',
    short: 'Compute a defined joint result while each holder keeps its private inputs.',
    watch: 'Protocols, threat model, computation cost, and output leakage require specialist review.',
    tags: ['mpc', 'psi', 'private-computation'],
    sourceIds: ['nist-crypto-smpc', 'ico-smpc-definition']
  },
  'dp': {
    name: 'Differential privacy',
    family: 'Output protection',
    short: 'Limit what repeated statistical outputs reveal about any one person.',
    watch: 'Requires a privacy budget, bounds, contribution limits, and utility testing, especially for small groups.',
    tags: ['differential-privacy', 'statistics', 'education'],
    sourceIds: ['nist-dp-definition', 'nist-dp-repeated-releases']
  },
  'synthetic': {
    name: 'Synthetic data',
    family: 'Data development',
    short: 'Generate example records to test systems or support lower-risk exploration.',
    watch: 'Synthetic data is not automatically private; measure disclosure risk, utility, and multi-table integrity.',
    tags: ['synthetic-data', 'education'],
    sourceIds: ['ico-synthetic-risks', 'nist-dp-synthetic-caution']
  },
  'tre': {
    name: 'Trusted research environment',
    family: 'Controlled access',
    short: 'Keep protected records in a governed workspace with vetted users and output checks.',
    watch: 'A TRE depends on governance, access control, auditing, and output review; it is distinct from a hardware TEE.',
    tags: ['tre', 'secure-enclave', 'governance'],
    sourceIds: ['nist-crypto-release-models', 'nist-crypto-deid-governance']
  },
  'tee': {
    name: 'Trusted execution environment',
    family: 'Protected computation',
    short: 'Use hardware isolation for a specified computation on sensitive inputs.',
    watch: 'Hardware attestation, side-channel risk, implementation, and trust assumptions need expert assessment.',
    tags: ['tee', 'private-computation'],
    sourceIds: ['ico-tee-definition']
  },
  'federated': {
    name: 'Federated learning or analysis',
    family: 'Distributed analysis',
    short: 'Keep datasets with holders while coordinating a model or analysis across sites.',
    watch: 'Updates can leak information; governance and privacy protection for updates or outputs may still be needed.',
    tags: ['federated-learning', 'differential-privacy', 'mpc'],
    sourceIds: ['ico-federated-learning']
  },
  'k-anonymity': {
    name: 'Generalization and suppression',
    family: 'Output protection',
    short: 'Reduce identifying detail in a row-level release by grouping or suppressing attributes.',
    watch: 'These methods have limited guarantees and need re-identification risk assessment.',
    tags: ['de-identification', 'education'],
    sourceIds: ['ed-ferpa-deidentification-standard', 'ed-small-cell-risk']
  },
  'governance': {
    name: 'Governance and data agreements',
    family: 'Foundational control',
    short: 'Define lawful purpose, roles, access, retention, oversight, and the output review process.',
    watch: 'No PET substitutes for permission, contracts, security, or human accountability.',
    tags: ['governance', 'ferpa', 'education'],
    sourceIds: ['ed-ferpa-deidentification-standard', 'uk-governance-with-pets']
  }
};

const allowed = Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [k, new Set(v.options.map(([id]) => id))]));

export function cleanProfile(profile = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(profile)) {
    if (allowed[key]?.has(value)) clean[key] = value;
  }
  return clean;
}

function has(text, re) { return re.test(text); }

/** Extract only explicit statements. Unmentioned fields remain unknown. */
export function inferProfile(message) {
  const s = String(message || '').toLowerCase();
  const p = {};
  if (has(s, /\b(link|match|merge|join|deduplicat|record linkage|pprl)\w*\b/)) p.goal = 'link';
  else if (has(s, /\b(train|training|federated|machine learning|model)\b/)) p.goal = 'train';
  else if (has(s, /\b(synthetic|fake data|test data|test pipeline|sandbox data)\b/)) p.goal = 'test';
  else if (has(s, /\b(publish|release|dashboard|statistics|aggregate|counts|report)\w*\b/)) p.goal = 'statistics';
  else if (has(s, /\b(access|analy[sz]e|research|enclave)\w*\b.*\b(protected|sensitive|student|record|data)\w*\b/)) p.goal = 'access';

  if (has(s, /\b(three|3|four|4|multiple|several)\s+(agenc|organization|holder|party|department)\w*\b/)) p.holders = 'many';
  else if (has(s, /\b(two|2)\s+(agenc|organization|holder|party|department)\w*\b/)) p.holders = 'two';
  else if (has(s, /\b(one|1|single)\s+(agenc|organization|holder|party|department)\w*\b/)) p.holders = 'one';
  if (has(s, /\b(?:raw|row.level|source|individual)?\s*(?:student\s+)?(?:data|records|identifiers)\b.{0,25}\b(?:cannot|can't|may not|must not|won't|do not)\s+(?:move|be shared|be transferred|leave)\b/) || has(s, /\b(?:cannot|can't|may not|must not|won't|do not)\b.{0,25}\b(?:move|share|transfer)\s+(?:raw|row.level|source|individual)?\s*(?:student\s+)?(?:data|records|identifiers)\b/) || has(s, /\b(?:raw\s+)?(?:data|records|identifiers)\b.{0,20}\bstay local\b/)) p.rawMove = 'no';
  else if (has(s, /\b(?:raw|row.level|source|individual)\s+(?:student\s+)?(?:data|records|identifiers)\b.{0,25}\b(?:can|may|are allowed to)\s+(?:move|be shared|be transferred|leave)\b/) || has(s, /\b(?:can|may|allowed to)\b.{0,25}\b(?:move|share|transfer)\s+(?:raw|row.level|source|individual)\s+(?:student\s+)?(?:data|records|identifiers)\b/)) p.rawMove = 'yes';
  if (has(s, /\b(fuzzy|probabilistic|approximate|misspell|no universal id|no common id)\b/)) p.match = 'fuzzy';
  else if (has(s, /\b(exact|deterministic|common id|shared id|unique identifier)\b/)) p.match = 'exact';
  const rows = has(s, /\b(row.level|linked records|individual records|student names|student identifiers|student ids|direct identifiers|personally identifiable information)\b/);
  const aggregate = has(s, /\b(aggregate|statistics|counts|summary only|summary results)\b/);
  if (rows) p.rowAccess = 'yes';
  if (aggregate) p.output = 'aggregate';
  else if (rows) p.output = 'rows';
  else if (has(s, /\b(synthetic records|fake records)\b/)) p.output = 'synthetic';
  if (!has(s, /\b(?:cannot|can't|do not|not|never)\s+(?:publish|release|post|make public)\b/) && has(s, /\b(?:publish|release|post|make public)\b.{0,70}\b(?:student\s+names?|student\s+ids?|names?|direct\s+identifiers?|personally\s+identifiable\s+information|pii)\b/)) {
    p.directRelease = 'yes';
    p.output = 'rows';
  }
  if (has(s, /\b(repeated|recurring|monthly|quarterly|each year|every year|ongoing)\b/)) p.repeated = 'yes';
  if (has(s, /\b(student|ferpa|protected|pii|personally identifiable|sensitive)\b/)) p.sensitivity = 'protected';
  if (has(s, /\b(low|limited|small)\s+(technical|engineering|it)\s+(capacity|team|staff|resources)\b/)) p.capacity = 'low';
  if (has(s, /\b(?:no|without|lack|pending)\b.{0,25}\b(?:legal|privacy|sharing|permission|agreement|authority|approval|review)\b/) || has(s, /\b(?:legal|privacy|sharing|data.use)\s+(?:review|approval|agreement|authority|permission)\b.{0,18}\b(?:not|never|pending|unapproved|unsigned)\b/)) p.authority = 'no';
  else if (has(s, /\b(?:legal|privacy|sharing|data.use)\s+(?:review|approval|agreement|authority|permission)\s+(?:(?:has|have)\s+been\s+|(?:is|was)\s+)?(?:approved|signed|granted|confirmed)\b/) || has(s, /\b(?:permission|authority|approval)\s+(?:(?:has|have)\s+been\s+|(?:is|was)\s+)?(?:granted|approved|confirmed)\b/)) p.authority = 'yes';
  return p;
}

const question = (field) => ({ field, text: FIELDS[field].label });
const item = (code, reason, role = 'primary', caveat = PETS[code].watch) => ({ code, name: PETS[code].name, reason, role, caveat, tags: PETS[code].tags, sourceIds: PETS[code].sourceIds });
const known = value => Boolean(value && value !== 'unknown');

/** Return a multi-PET exploratory architecture and its rule trace. */
export function assessCase(input = {}) {
  const p = cleanProfile(input);
  const primary = [], complementary = [], alternatives = [], avoid = [], missing = [], trace = [];
  const add = (arr, code, reason, rule) => {
    if (![...primary, ...complementary, ...alternatives].some(x => x.code === code)) arr.push(item(code, reason, arr === primary ? 'primary' : arr === complementary ? 'complementary' : 'alternative'));
    trace.push(rule);
  };
  if (!p.goal) {
    missing.push(question('goal'));
    return { status: 'insufficient', profile: p, primary, complementary, alternatives, avoid, missing, trace, completeness: 0, summary: 'Tell me what you need to accomplish first. Then I can narrow the privacy architecture and show the supporting sources.' };
  }
  if (!known(p.holders)) missing.push(question('holders'));
  if (!known(p.rawMove) && (['link', 'access', 'train'].includes(p.goal) || (p.goal === 'statistics' && ['two', 'many'].includes(p.holders)))) missing.push(question('rawMove'));
  if (!known(p.output) && ['link', 'statistics', 'access'].includes(p.goal)) missing.push(question('output'));
  if (!known(p.match) && p.goal === 'link') missing.push(question('match'));
  if (!known(p.repeated) && ['statistics', 'link'].includes(p.goal)) missing.push(question('repeated'));
  if (!known(p.sensitivity)) missing.push(question('sensitivity'));
  if (!known(p.capacity)) missing.push(question('capacity'));
  if (!known(p.authority) && p.sensitivity === 'protected') missing.push(question('authority'));

  if (p.directRelease === 'yes') {
    add(complementary, 'governance', 'A privacy and legal reviewer must assess the proposed identifier disclosure before any public release.', 'GOV-DIRECT-RELEASE');
    return { status: 'escalate', profile: p, primary: [], complementary, alternatives, avoid, missing, trace, completeness: 0, summary: 'Do not publish names or direct identifiers through this tool. Take the proposed release to an authorized privacy or legal reviewer.' };
  }

  if (p.authority !== 'yes' && p.sensitivity === 'protected') {
    add(complementary, 'governance', 'Establish the lawful purpose and review the proposed disclosures before choosing a technical path.', 'GOV-STOP');
    return { status: 'escalate', profile: p, primary: [], complementary, alternatives, avoid, missing: [question('authority'), ...missing.filter(x => x.field !== 'authority')], trace, completeness: 0, summary: 'An authorized privacy or legal reviewer must confirm the permitted use and sharing before a technical recommendation can be made.' };
  }

  switch (p.goal) {
    case 'link': {
      if (p.match === 'fuzzy') {
        add(primary, 'pprl', 'Approximate linkage calls for a specialist linkage design that can measure matching errors while limiting identifier exposure.', 'LINK-FUZZY');
        avoid.push({ code: 'secure-hashing', reason: 'Exact hash equality alone will miss spelling variations and imperfect identifiers.' });
      } else if (p.match === 'exact') {
        add(primary, 'secure-hashing', 'A common, well-governed linkage token may support exact matching when identifiers can be standardized and keys protected.', 'LINK-EXACT');
        if (p.rawMove === 'no' && p.holders !== 'one') add(alternatives, 'psi', 'Explore PSI when the immediate question is exact overlap and holders cannot reveal nonmatches.', 'LINK-PSI');
      } else {
        add(alternatives, 'pprl', 'Linkage design depends on whether matches must be exact or approximate.', 'LINK-UNKNOWN');
      }
      if (p.rawMove === 'no' && p.holders !== 'one') add(complementary, 'mpc', 'A jointly specified computation may be possible without pooling holders’ raw inputs.', 'LINK-LOCAL');
      if (p.rawMove === 'yes' && p.output === 'rows') add(complementary, 'tre', 'A controlled environment can govern access to linked row-level data after authorized transfer.', 'LINK-TRE');
      if (p.rowAccess === 'yes' && p.output === 'aggregate') add(complementary, 'tre', 'If analysts also need linked row-level records, keep that stage in a controlled environment with reviewed outputs.', 'LINK-ROW-STAGE');
      if (p.output === 'aggregate') add(complementary, 'dp', 'For released aggregate results, evaluate output protection as a separate layer from linkage.', 'LINK-OUTPUT');
      break;
    }
    case 'statistics': {
      if (p.output === 'rows') {
        add(primary, 'tre', 'Protected row-level records may need controlled access instead of a public release.', 'STATS-ROWS-TRE');
        add(alternatives, 'k-anonymity', 'Generalization or suppression can be assessed, but do not establish safety on their own.', 'STATS-ROWS-DEID');
        avoid.push({ code: 'dp', reason: 'Differentially private statistics do not make an individual-level dataset safe to publish.' });
        break;
      }
      add(primary, 'dp', 'A statistical release calls for a quantified output-privacy approach, especially when users can make repeated queries.', 'STATS-DP');
      if (p.rowAccess === 'yes') add(complementary, 'tre', 'Any preceding row-level analysis needs a controlled workspace and output review before aggregate publication.', 'STATS-ROW-STAGE');
      if (p.holders === 'two' || p.holders === 'many') {
        if (p.rawMove === 'no') add(complementary, 'mpc', 'Distributed holders may compute approved statistics without pooling raw inputs.', 'STATS-MPC');
        else if (p.rawMove === 'yes') add(alternatives, 'tre', 'A governed shared environment is another path when protected data may move.', 'STATS-TRE');
      }
      if (p.repeated === 'yes') trace.push('STATS-BUDGET');
      break;
    }
    case 'test': {
      add(primary, 'synthetic', 'Purpose-built example data can support software testing without starting with production student records.', 'TEST-SYNTH');
      if (p.sensitivity === 'protected') add(complementary, 'dp', 'If synthetic data are learned from protected records and shared broadly, evaluate whether a formal privacy guarantee is needed.', 'TEST-DP');
      avoid.push({ code: 'synthetic', reason: 'Do not infer that a dataset is private simply because its records are synthetic.' });
      break;
    }
    case 'access': {
      if (p.rawMove === 'no' && (p.holders === 'two' || p.holders === 'many')) {
        add(primary, 'mpc', 'Joint analysis without raw-data pooling is a possible path when the computation is well specified.', 'ACCESS-LOCAL');
        add(alternatives, 'federated', 'Distributed analysis may fit when computation can remain at each holder.', 'ACCESS-FED');
      } else {
        add(primary, 'tre', 'A governed workspace supports vetted access, audit, and review of outputs from protected records.', 'ACCESS-TRE');
        add(alternatives, 'tee', 'Hardware isolation may be useful for a specific host-trust threat, after specialist review.', 'ACCESS-TEE');
      }
      if (p.output === 'aggregate') add(complementary, 'dp', 'Protect aggregate results released outside the controlled environment.', 'ACCESS-OUTPUT');
      break;
    }
    case 'train': {
      if (p.holders === 'two' || p.holders === 'many') {
        add(primary, 'federated', 'Distributed training may keep source datasets with their holders.', 'TRAIN-FED');
        add(complementary, 'mpc', 'Secure aggregation may reduce exposure of participant updates.', 'TRAIN-MPC');
      } else add(primary, 'tre', 'A controlled workspace may be simpler when one authorized holder trains on protected records.', 'TRAIN-TRE');
      add(complementary, 'dp', 'Assess whether training updates or released models need individual-level privacy protection.', 'TRAIN-DP');
      break;
    }
  }
  add(complementary, 'governance', 'Document purpose, permitted data flows, roles, retention, and human approval of the final design.', 'GOV-BASE');
  if (p.capacity === 'low' && [...primary, ...complementary].some(x => ['mpc', 'psi', 'tee', 'federated'].includes(x.code))) trace.push('CAPACITY-REVIEW');

  const required = ['goal', 'holders', 'sensitivity', 'capacity', ...(p.sensitivity === 'protected' ? ['authority'] : []), ...(p.goal === 'link' ? ['rawMove', 'match', 'output'] : p.goal === 'test' ? [] : p.goal === 'statistics' && p.holders === 'one' ? ['output'] : ['rawMove', 'output'])];
  const completeness = Math.round(100 * required.filter(k => known(p[k])).length / required.length);
  const rowRelease = p.goal === 'statistics' && p.output === 'rows' && p.sensitivity === 'protected';
  const status = rowRelease ? 'escalate' : completeness < 60 || (p.goal === 'link' && !known(p.match)) ? 'insufficient' : missing.length ? 'explore' : 'review';
  const summary = rowRelease
    ? 'Releasing protected row-level records requires a disclosure and legal review. Consider controlled access while specialists assess whether any release can be made safely.'
    : status === 'insufficient'
      ? 'There is enough context to suggest directions, but a key design choice is still missing. These are paths to explore, not a final selection.'
      : 'Here is an exploratory, layered architecture to review with a privacy and PET specialist.';
  return { status, profile: p, primary, complementary, alternatives, avoid, missing, trace, completeness, summary };
}

export function nextQuestion(assessment) {
  if (assessment.profile.directRelease === 'yes') return null;
  if (assessment.status === 'escalate' && assessment.profile.sensitivity === 'protected') {
    if (assessment.profile.authority === 'no' || assessment.profile.authority === 'unknown') return null;
    return assessment.missing.find(x => x.field === 'authority') || null;
  }
  const priority = ['goal', 'match', 'rawMove', 'output', 'holders', 'sensitivity', 'authority', 'repeated', 'capacity'];
  return assessment.missing.filter(x => assessment.profile[x.field] !== 'unknown').sort((a, b) => priority.indexOf(a.field) - priority.indexOf(b.field))[0] || null;
}

export function profileLabel(key, value) {
  return FIELDS[key]?.options.find(([id]) => id === value)?.[1] || value;
}
