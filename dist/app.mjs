import { FIELDS, PETS, assessCase, cleanProfile, inferProfile, nextQuestion, profileLabel } from './engine.mjs';
import { createIndex, retrieve, evidenceFor } from './retrieval.mjs';

const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const state = { index: createIndex([]), profile: {}, evidence: [], transcript: [], mode: 'learn', sourceStatus: 'loading', lastTopicQuery: '' };
const messages = $('#messages');

function safeLink(url, label, className = '') {
  const a = el('a', className, label);
  if (/^https:\/\//.test(url || '')) {
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  return a;
}

function addMessage(kind, content) {
  messages.querySelectorAll('.choice:not([disabled])').forEach(button => { button.disabled = true; });
  const row = el('div', `message-row ${kind}`);
  const avatar = el('div', 'avatar', kind === 'assistant' ? '✳' : 'You');
  const bubble = el('div', 'bubble');
  if (typeof content === 'string') bubble.textContent = content;
  else bubble.append(content);
  row.append(avatar, bubble);
  messages.append(row);
  state.transcript.push({
    role: kind,
    text: (bubble.innerText || bubble.textContent || '').trim(),
    sources: kind === 'assistant' ? state.evidence.map(hit => ({ title: hit.document.title, url: hit.document.url })) : []
  });
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return bubble;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.rail-action').forEach(button => button.classList.toggle('active', button.dataset.starter === mode));
}

function setSourceStatus(status) {
  state.sourceStatus = status;
  const unavailable = status !== 'ready';
  $('#prompt').disabled = unavailable;
  $('#composer button[type="submit"]').disabled = unavailable;
  $('#assess').disabled = unavailable;
  $('#export').disabled = unavailable;
  document.querySelectorAll('[data-prompt], [data-starter="plan"]').forEach(button => { button.disabled = unavailable; });
}

function switchPanel(which) {
  const isCase = which === 'case';
  $('#tab-case').setAttribute('aria-selected', String(isCase));
  $('#tab-evidence').setAttribute('aria-selected', String(!isCase));
  $('#tab-case').tabIndex = isCase ? 0 : -1;
  $('#tab-evidence').tabIndex = isCase ? -1 : 0;
  $('#panel-case').hidden = !isCase;
  $('#panel-evidence').hidden = isCase;
}

function renderFields() {
  const container = $('#field-list');
  container.replaceChildren();
  const basic = ['goal', 'holders', 'rawMove', 'match', 'output'];
  const advanced = ['rowAccess', 'directRelease', 'repeated', 'sensitivity', 'capacity', 'authority'];
  const createField = (key) => {
    const field = FIELDS[key];
    const label = el('label', 'case-field');
    label.append(el('span', 'field-label', field.label));
    const select = el('select');
    select.name = key;
    const placeholder = el('option', '', 'Select an answer');
    placeholder.value = '';
    select.append(placeholder);
    for (const [value, text] of field.options) {
      const option = el('option', '', text);
      option.value = value;
      select.append(option);
    }
    select.value = state.profile[key] || '';
    select.addEventListener('change', () => {
      if (select.value) state.profile[key] = select.value;
      else delete state.profile[key];
      updateProgress();
    });
    label.append(select);
    return label;
  };
  basic.forEach(key => container.append(createField(key)));
  const details = el('details', 'advanced-fields');
  const summary = el('summary', '', 'More details that improve the result');
  details.append(summary);
  advanced.forEach(key => details.append(createField(key)));
  container.append(details);
  updateProgress();
}

function updateProgress() {
  const result = assessCase(state.profile);
  $('#progress-label').textContent = `${result.completeness}%`;
  $('#progress-bar').style.width = `${result.completeness}%`;
}

function renderEvidence(hits) {
  state.evidence = hits;
  $('#evidence-count').textContent = `${hits.length} source${hits.length === 1 ? '' : 's'}`;
  const list = $('#evidence-list');
  list.replaceChildren();
  if (!hits.length) {
    list.append(el('p', 'empty-evidence', 'No reviewed public source matched this question. Try a more specific PET or use case.'));
    return;
  }
  hits.forEach((hit, i) => {
    const d = hit.document;
    const card = el('article', 'source-card');
    card.append(el('span', 'source-number', String(i + 1).padStart(2, '0')));
    card.append(safeLink(d.url, d.title, 'source-title'));
    card.append(el('p', 'source-meta', `${d.publisher}${d.year ? ` · ${d.year}` : ''}${d.section ? ` · ${d.section}` : ''}${d.page ? ` · p. ${d.page}` : ''} · reviewed ${d.reviewed_at}`));
    card.append(el('p', 'source-text', d.text));
    list.append(card);
  });
}

function citedSources(hits) {
  const block = el('div', 'answer-sources');
  block.append(el('span', 'answer-label', 'PUBLIC SOURCES'));
  if (!hits.length) {
    block.append(el('span', 'no-source', 'No directly matched source. Ask a narrower question.'));
    return block;
  }
  const list = el('div', 'source-links');
  const unique = hits.map((hit, i) => ({ hit, i })).filter(({ hit, i }) => hits.findIndex(x => x.document.url === hit.document.url) === i);
  unique.slice(0, 4).forEach(({ hit }) => list.append(safeLink(hit.document.url, hit.document.publisher, 'citation')));
  block.append(list);
  return block;
}

function petCard(entry, number) {
  const pet = PETS[entry.code];
  const card = el('article', 'pet-card');
  const header = el('div', 'pet-card-header');
  header.append(el('span', 'pet-number', String(number).padStart(2, '0')));
  header.append(el('span', 'pet-family', pet.family));
  card.append(header, el('h4', '', entry.name), el('p', 'pet-reason', entry.reason));
  card.append(el('p', 'pet-watch', `Check: ${entry.caveat}`));
  const source = (entry.sourceIds || []).map(id => state.index.docs.find(doc => doc.id === id)).find(Boolean);
  if (source) card.append(safeLink(source.url, 'View source ↗', 'pet-source'));
  return card;
}

function recommendationMessage(result, query) {
  const card = el('div', 'answer');
  const status = result.status === 'escalate' ? 'Human review needed' : result.status === 'insufficient' ? 'More detail needed' : 'For expert review';
  const heading = el('div', 'answer-top');
  heading.append(el('span', 'answer-badge', 'ARCHITECTURE EXPLORER'), el('span', `status status-${result.status}`, status));
  card.append(heading, el('h3', '', result.status === 'escalate' ? 'Pause for expert review' : 'A layered path to explore'), el('p', 'answer-lead', result.summary));

  if (result.primary.length) {
    card.append(el('h4', 'answer-section-title', 'Start here'));
    const grid = el('div', 'pet-grid');
    result.primary.forEach((entry, i) => grid.append(petCard(entry, i + 1)));
    card.append(grid);
  }
  if (result.complementary.length) {
    card.append(el('h4', 'answer-section-title', 'Add as a layer'));
    const grid = el('div', 'pet-grid');
    result.complementary.forEach((entry, i) => grid.append(petCard(entry, i + 1)));
    card.append(grid);
  }
  if (result.alternatives.length) {
    const alt = el('div', 'answer-alt');
    alt.append(el('strong', '', 'Other paths to compare'));
    result.alternatives.forEach(x => alt.append(el('p', '', `${x.name}: ${x.reason}`)));
    card.append(alt);
  }
  if (result.avoid.length) {
    const caution = el('div', 'answer-caution');
    caution.append(el('strong', '', 'Do not assume'));
    const ul = el('ul');
    result.avoid.forEach(x => ul.append(el('li', '', x.reason)));
    caution.append(ul);
    card.append(caution);
  }
  const q = nextQuestion(result);
  if (q) {
    const follow = el('div', 'followup');
    follow.append(el('span', 'answer-label', 'NEXT QUESTION'), el('p', '', q.text));
    const choices = el('div', 'choice-list');
    FIELDS[q.field].options.forEach(([value, label]) => {
      const button = el('button', 'choice', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        state.profile[q.field] = value;
        renderFields();
        addMessage('user', `${q.text} ${label}`);
        showRecommendation(`Use case: ${q.text} ${label}`);
      });
      choices.append(button);
    });
    follow.append(choices);
    card.append(follow);
  }
  const codes = [...result.primary, ...result.alternatives, ...result.complementary].map(x => x.code);
  const hits = evidenceFor(state.index, query, codes, 5);
  renderEvidence(hits);
  card.append(citedSources(hits));
  card.append(el('p', 'answer-footnote', 'Explore this design with privacy and PET specialists before using it.'));
  return card;
}

function showRecommendation(query) {
  if (state.sourceStatus !== 'ready') return;
  const result = assessCase(state.profile);
  addMessage('assistant', recommendationMessage(result, query));
}

function learningMessage(query, retrievalQuery = query) {
  let hits = retrieve(state.index, retrievalQuery, { limit: 12 });
  if (/^\s*(what is|what are|define|explain)\b/i.test(query)) {
    hits = hits.slice().sort((a, b) => {
      const definition = x => x.document.id.endsWith('definition') || x.document.tags.includes('definition') ? 1 : 0;
      const offTopic = x => /differential privacy|\bdp\b/i.test(query) && !/synthetic|fake/i.test(query) && x.document.tags.includes('synthetic_data') ? 1 : 0;
      return definition(b) - definition(a) || offTopic(a) - offTopic(b) || b.score - a.score;
    });
  }
  hits = hits.slice(0, 4);
  renderEvidence(hits);
  const answer = el('div', 'answer');
  answer.append(el('div', 'answer-badge', 'PUBLIC-SOURCE ANSWER'));
  if (!hits.length) {
    answer.append(el('h3', '', 'I need a narrower question'), el('p', 'answer-lead', 'I could not find a close match in the reviewed public source set. Try naming a PET, an output, or a data-sharing situation.'));
    return answer;
  }
  answer.append(el('h3', '', 'Here is what the sources say'));
  const seen = new Set();
  hits.slice(0, 3).forEach((hit, i) => {
    if (seen.has(hit.document.text)) return;
    seen.add(hit.document.text);
    const p = el('p', 'source-answer', hit.document.text + ' ');
    p.append(safeLink(hit.document.url, `[${i + 1}]`, 'inline-citation'));
    answer.append(p);
  });
  answer.append(citedSources(hits));
  const end = el('p', 'answer-footnote', 'Want to apply this to your case? Describe your goal, the data holders, what can move, and the output you need.');
  answer.append(end);
  return answer;
}

function planningMessage(query) {
  const assessment = assessCase(state.profile);
  const codes = [...assessment.primary, ...assessment.complementary].map(x => x.code);
  const hits = codes.length
    ? evidenceFor(state.index, query, codes, 5)
    : retrieve(state.index, `${query} pilot implementation risk evaluation governance`, { limit: 5 });
  renderEvidence(hits);
  const answer = el('div', 'answer');
  answer.append(el('div', 'answer-badge', 'IMPLEMENTATION PATH'), el('h3', '', 'Turn the idea into a reviewed pilot'));
  const steps = [
    ['Frame the decision', 'Write the purpose, people affected, data holders, exact fields, permitted data flows, and required output. Confirm authority and a human owner.'],
    ['Define the threat model', 'State who must not learn source records, who can see outputs, and what happens after repeated releases.'],
    ['Compare architectures', 'Pilot at least one simpler baseline and one layered PET design. Record security assumptions, engineering effort, and operations.'],
    ['Test privacy and usefulness', 'For linkage, measure false matches and missed matches. For synthetic data, test disclosure risk and cross-table utility. For DP, plan contribution bounds, budget, and small-group utility.'],
    ['Review before release', 'Have legal, privacy, domain, and technical owners inspect the result, source evidence, residual risks, and output controls.']
  ];
  const list = el('ol', 'plan-steps');
  steps.forEach(([title, body]) => {
    const li = el('li');
    li.append(el('strong', '', title), el('p', '', body));
    list.append(li);
  });
  answer.append(list);
  if (assessment.primary.length) answer.append(el('p', 'plan-tail', `For this case, begin by evaluating ${assessment.primary.map(x => x.name).join(' and ')}. The case panel can narrow that path.`));
  answer.append(citedSources(hits));
  return answer;
}

function isLegalQuestion(text) {
  const clause = text.trim().split(/[.!?]/).map(x => x.trim()).filter(Boolean).at(-1) || text;
  const legalTerms = /\b(ferpa|gdpr|compliance|compliant|legal|legally|law|lawful|regulation|regulatory|permitted|allowed|consent|authorization|authority|data.sharing agreement)\b/i;
  return legalTerms.test(clause) && (/\b(under|according to)\b/i.test(clause) || /^\s*(can|may|must|should|do|does|is|are|what|how|which|whether|ferpa|gdpr|legal|compliance)\b/i.test(clause));
}

function legalMessage(query) {
  const ferpa = /\bferpa\b/i.test(query);
  const uk = /\b(uk|united kingdom|britain|ico)\b/i.test(query);
  const hits = (ferpa || uk ? retrieve(state.index, query, { limit: 20 }) : [])
    .filter(hit => {
      const host = new URL(hit.document.url).hostname;
      return ferpa ? host === 'studentprivacy.ed.gov' : host === 'ico.org.uk' || host === 'www.gov.uk';
    }).slice(0, 4);
  renderEvidence(hits);
  const answer = el('div', 'answer');
  answer.append(el('div', 'answer-badge', 'LEGAL AND PRIVACY REVIEW'));
  answer.append(el('h3', '', 'This needs a human review'));
  answer.append(el('p', 'answer-lead', 'I cannot determine from a chat whether a use or disclosure is legally permitted or compliant. The answer depends on the jurisdiction, purpose, authority, agreements, data, and who receives the result.'));
  if (hits.length) {
    answer.append(el('h4', 'answer-section-title', 'Relevant public guidance'));
    hits.slice(0, 2).forEach((hit, i) => {
      const p = el('p', 'source-answer', `${hit.document.text} `);
      p.append(safeLink(hit.document.url, `[${i + 1}]`, 'inline-citation'));
      answer.append(p);
    });
  } else {
    answer.append(el('p', 'source-answer', 'I do not have an applicable primary legal source for this question in the public source library.'));
  }
  answer.append(citedSources(hits));
  answer.append(el('p', 'answer-footnote', 'Please have a qualified privacy or legal reviewer confirm the applicable law and the facts before using a PET or releasing data.'));
  return answer;
}

function startsNewCase(text) {
  return /\b(?:new|another|different|separate|next|second)\s+(?:use\s*case|case|scenario|project)\b/i.test(text);
}

function isCaseContinuation(text) {
  return /^\s*(also|and|what if|in this case|for this case|in the same case|for the same project|we also|same case)\b/i.test(text);
}

function isTopicFollowup(text) {
  return text.length <= 100 && (/\b(it|its|they|them|their|that|this|those)\b/i.test(text) || /^\s*(tell me more|and how|and why)\b/i.test(text));
}

function classify(text, inferred) {
  if (/\b(plan|pilot|implement|evaluate|roll.?out|deployment|how would we build)\b/i.test(text)) return 'plan';
  if (/^\s*(what is|what are|explain|define|how does|how do|when is|when does|tell me about|compare)\b/i.test(text) && !/\b(we need|our (case|data|agency)|which should we|recommend for us)\b/i.test(text)) return 'learn';
  if (Object.keys(inferred).length || /\b(recommend|choose|best|which pet|what should|our case|we need)\b/i.test(text)) return 'choose';
  return 'learn';
}

function send(text) {
  const query = text.trim().slice(0, 1200);
  if (!query || state.sourceStatus !== 'ready') return false;
  const inferred = inferProfile(query);
  if (startsNewCase(query) || (inferred.goal && state.profile.goal && !isCaseContinuation(query))) reset();
  addMessage('user', query);
  const followup = Boolean(state.mode === 'learn' && state.lastTopicQuery && !inferred.goal && isTopicFollowup(query));
  const intent = isLegalQuestion(query) ? 'legal' : followup ? 'learn' : classify(query, inferred);
  if (intent === 'choose') {
    state.profile = { ...state.profile, ...inferred };
    renderFields();
  }
  setMode(intent === 'legal' ? 'learn' : intent);
  if (intent === 'legal') addMessage('assistant', legalMessage(query));
  else if (intent === 'plan') { addMessage('assistant', planningMessage(query)); state.lastTopicQuery = query; }
  else if (intent === 'choose') { showRecommendation(query); state.lastTopicQuery = query; }
  else {
    addMessage('assistant', learningMessage(query, followup ? `${state.lastTopicQuery} ${query}` : query));
    if (!followup) state.lastTopicQuery = query;
  }
  return true;
}

function exportSummary() {
  const assessment = assessCase(state.profile);
  const lines = ['# PETs Model case summary', '', `Exported: ${new Date().toISOString()}`, '', '## Case details'];
  for (const [key, value] of Object.entries(cleanProfile(state.profile))) lines.push(`- ${FIELDS[key].label} ${profileLabel(key, value)}`);
  lines.push('', '## Exploratory architecture', assessment.summary, '', '### Start here');
  assessment.primary.forEach(x => lines.push(`- ${x.name}: ${x.reason} Caveat: ${x.caveat}`));
  lines.push('', '### Complementary layers');
  assessment.complementary.forEach(x => lines.push(`- ${x.name}: ${x.reason} Caveat: ${x.caveat}`));
  lines.push('', '### Questions to resolve');
  assessment.missing.forEach(x => lines.push(`- ${x.text}`));
  lines.push('', '## Public sources');
  state.evidence.forEach(x => lines.push(`- ${x.document.title} — ${x.document.url}`));
  lines.push('', '## Conversation', ...state.transcript.flatMap(x => [
    `### ${x.role === 'assistant' ? 'Assistant' : 'You'}`,
    x.text,
    ...(x.sources.length ? ['', 'Sources for this answer:', ...x.sources.map(source => `- ${source.title} — ${source.url}`)] : []),
    ''
  ]));
  lines.push('Review this local export before sharing. It is not an expert-approved recommendation.');
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pets-model-case-summary.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reset() {
  state.profile = {};
  state.evidence = [];
  state.transcript = [];
  state.lastTopicQuery = '';
  messages.replaceChildren();
  renderFields();
  renderEvidence([]);
  switchPanel('case');
  $('#prompt').value = '';
  setMode('learn');
  addMessage('assistant', 'Ask about a PET or describe a use case.');
}

$('#composer').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#prompt');
  if (send(input.value)) input.value = '';
  input.focus();
});
$('#prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#composer').requestSubmit(); }
});
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
document.querySelectorAll('[data-starter]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.starter;
  setMode(mode);
  if (mode === 'learn') { $('#prompt').value = 'What is differential privacy, and when is it useful?'; $('#prompt').focus(); }
  if (mode === 'choose') { switchPanel('case'); $('#prompt').value = 'We need to '; $('#prompt').focus(); }
  if (mode === 'plan') send('How would we plan and evaluate a privacy-enhancing technology pilot?');
}));
$('#tab-case').addEventListener('click', () => switchPanel('case'));
$('#tab-evidence').addEventListener('click', () => switchPanel('evidence'));
for (const tab of [$('#tab-case'), $('#tab-evidence')]) {
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = tab.id === 'tab-case' ? 'evidence' : 'case';
    const which = event.key === 'Home' ? 'case' : event.key === 'End' ? 'evidence' : next;
    switchPanel(which);
    $(`#tab-${which}`).focus();
  });
}
$('#assess').addEventListener('click', () => { if (state.sourceStatus === 'ready') { setMode('choose'); showRecommendation('Structured use case privacy architecture'); } });
$('#export').addEventListener('click', exportSummary);
$('#reset').addEventListener('click', reset);

reset();
setSourceStatus('loading');
fetch('./data/sources.json', { cache: 'no-cache' }).then(response => {
  if (!response.ok) throw new Error(`Sources unavailable (${response.status})`);
  return response.json();
}).then(documents => {
  state.index = createIndex(documents);
  if (!state.index.docs.length) throw new Error('No source passages loaded');
  $('#source-count').textContent = `${state.index.docs.length} reviewed public passages`;
  setSourceStatus('ready');
}).catch(() => {
  setSourceStatus('failed');
  $('#source-count').textContent = 'Source library unavailable';
  renderEvidence([]);
  addMessage('assistant', 'The public-source library did not load, so case assessment is unavailable. Please refresh the page and try again.');
});
