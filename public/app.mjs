import { FIELDS, assessCase, cleanProfile, inferProfile, nextQuestion, profileLabel, recommendationEvidenceCodes } from './engine.mjs';
import { createIndex, retrieve, evidenceFor, normalizePetTerms } from './retrieval.mjs';
import { answerToCaseQuestion, asksLegalPermission, classifyMessage, conversationalReply, isTopicFollowup, openingUseCaseQuestion } from './conversation.mjs';
import { clearHistory, loadHistory, saveHistory } from './history.mjs';
import { sourceNoteExcerpt } from './evidence-notes.mjs';
import { relatedMdiCase } from './related-cases.mjs';
import { validWebSource } from './web-sources.mjs';
import { originalSourceLabel, sourceCitationLabel } from './citations.mjs';
import { answerParagraphs, appendInlineFormatting } from './inline-format.mjs';
import { citationUnits } from './citation-layout.mjs';
import { snapshotAnswerView, restoreAnswerView } from './answer-snapshot.mjs';

const $ = selector => document.querySelector(selector);
const el = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const state = {
  index: createIndex([]), profile: {}, evidence: [], transcript: [],
  mode: 'learn', sourceStatus: 'loading', lastTopicQuery: '', pendingQuestion: null,
  busy: false, turn: 0, controller: null, apiUnavailable: false
};
state.webSuggestionHtml = '';
const messages = $('#messages');
const mascot = $('#mascot');
let browserStorage;
try { browserStorage = window.localStorage; } catch { browserStorage = null; }
let history = loadHistory(browserStorage);
let historySaved = Boolean(browserStorage);
state.chatId = history.chats.some(chat => chat.id === history.activeId)
  ? history.activeId : history.chats[0]?.id || crypto.randomUUID();
let mascotTimer;
let mascotReplyTimer;

function renderSavedChats() {
  const list = $('#chat-list');
  list.replaceChildren();
  const chats = history.chats.filter(chat => chat.messages.length);
  if (!chats.length) list.append(el('p', 'history-note', 'No saved chats yet.'));
  chats.forEach(chat => {
    const button = el('button', 'saved-chat', chat.title);
    button.type = 'button';
    button.title = chat.title;
    if (chat.id === state.chatId) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => openSavedChat(chat.id));
    list.append(button);
  });
  list.append(el('p', 'history-note', historySaved
    ? 'Saved in this browser only. Clear history on shared devices.'
    : 'This browser is not allowing chat history to be saved.'));
  if (chats.length) {
    const clear = el('button', 'clear-history', 'Clear saved chats');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      if (!window.confirm('Delete all chats saved in this browser?')) return;
      clearHistory(browserStorage);
      history = { activeId: null, chats: [] };
      reset();
    });
    list.append(clear);
  }
}

function saveCurrentChat() {
  if (!state.transcript.length) return;
  const firstQuestion = state.transcript.find(message => message.role === 'user')?.text || 'Chat';
  const chat = {
    id: state.chatId,
    title: firstQuestion.replace(/\s+/g, ' ').slice(0, 48),
    updatedAt: new Date().toISOString(),
    messages: state.transcript.slice(-80),
    profile: cleanProfile(state.profile),
    mode: state.mode,
    lastTopicQuery: state.lastTopicQuery,
    pendingField: state.pendingQuestion?.field || ''
  };
  history.chats = [chat, ...history.chats.filter(item => item.id !== chat.id)].slice(0, 30);
  history.activeId = state.chatId;
  historySaved = saveHistory(browserStorage, history);
  renderSavedChats();
}

function openSavedChat(id) {
  const chat = history.chats.find(item => item.id === id);
  if (!chat) return;
  state.turn++;
  state.controller?.abort();
  state.controller = null;
  state.busy = false;
  state.chatId = chat.id;
  state.profile = cleanProfile(chat.profile);
  state.transcript = chat.messages.map(message => ({ ...message, sources: message.sources || [] }));
  state.mode = chat.mode;
  state.lastTopicQuery = chat.lastTopicQuery;
  state.pendingQuestion = Object.hasOwn(FIELDS, chat.pendingField) && !state.profile[chat.pendingField]
    ? { field: chat.pendingField, text: FIELDS[chat.pendingField].label }
    : null;
  state.evidence = [];
  state.webSuggestionHtml = '';
  messages.replaceChildren();
  let lastQuestion = '';
  let lastAssistantBubble = null;
  for (const message of state.transcript) {
    const row = el('div', `message-row ${message.role} restored`);
    const bubble = el('div', 'bubble');
    const hits = message.role === 'assistant' ? (message.sources || []).map(source => knownOrWebSource(source))
      .filter(Boolean).map(document => ({ document })) : [];
    const known = new Map(hits.map(hit => [hit.document.id, hit.document]));
    const loadedSegments = message.role === 'assistant' && Array.isArray(message.answerSegments)
      ? message.answerSegments.map(segment => ({ text: segment.text, paragraph: segment.paragraph,
        docs: segment.source_ids.map(id => known.get(id)).filter(Boolean) })) : [];
    const savedSegments = loadedSegments.length && loadedSegments.every((segment, index) =>
      segment.docs.length === message.answerSegments[index].source_ids.length) ? loadedSegments : [];
    const savedView = message.role === 'assistant' ? restoreAnswerView(message.answerView) : [];
    const restoredAnswer = message.role === 'assistant' ? el('div', 'answer') : null;
    if (savedView.length) bubble.append(...savedView);
    else if (savedSegments.length) {
      if (message.answerTitle) restoredAnswer.append(el('h2', 'answer-title', message.answerTitle));
      restoredAnswer.append(citedParagraphs({ segments: savedSegments }));
    }
    else if (message.role === 'assistant') {
      for (const text of answerParagraphs(message.text)) {
        const paragraph = el('p', 'restored-text');
        appendInlineFormatting(paragraph, text);
        restoredAnswer.append(paragraph);
      }
    } else bubble.append(el('p', 'restored-text', message.text));
    if (message.role === 'user') lastQuestion = message.text;
    if (message.role === 'assistant' && hits.length) {
      const detailTarget = savedView.length ? bubble.querySelector('.answer') || bubble : restoredAnswer;
      if (!savedView.length && !savedSegments.length) {
        const links = el('p', 'restored-sources', 'Sources: ');
        const linked = new Set();
        hits.forEach(({ document: doc }) => {
          if (linked.has(doc.url)) return;
          if (linked.size) links.append(document.createTextNode(' · '));
          links.append(safeLink(doc.url, `${sourceCitationLabel(doc)} ↗`, 'inline-citation'));
          linked.add(doc.url);
        });
        detailTarget.append(links);
      }
      if (message.searchSuggestionHtml) detailTarget.append(searchSuggestion(message.searchSuggestionHtml));
      detailTarget.append(sourceDetails(hits, null, lastQuestion));
    }
    if (restoredAnswer && !savedView.length) bubble.append(restoredAnswer);
    if (message.role === 'assistant') lastAssistantBubble = bubble;
    row.append(bubble);
    messages.append(row);
  }
  if (state.pendingQuestion && state.transcript.at(-1)?.role === 'assistant' && lastAssistantBubble) {
    lastAssistantBubble.append(followupChoices(state.pendingQuestion));
  }
  document.body.classList.toggle('has-messages', Boolean(state.transcript.length));
  history.activeId = chat.id;
  historySaved = saveHistory(browserStorage, history);
  renderSavedChats();
  $('#history').open = false;
  updateControls();
  messages.scrollTop = messages.scrollHeight;
}

function setMascot(action, duration = 0) {
  clearTimeout(mascotTimer);
  clearTimeout(mascotReplyTimer);
  mascot.dataset.action = action;
  if (duration) mascotTimer = setTimeout(() => { mascot.dataset.action = 'idle'; }, duration);
}

function reactToAnswer(action) {
  clearTimeout(mascotTimer);
  clearTimeout(mascotReplyTimer);
  mascotReplyTimer = setTimeout(() => setMascot(action, action === 'jumping' ? 1450 : 1200), 240);
}

function safeLink(url, label, className = '') {
  const link = el('a', className, label);
  if (/^https:\/\//.test(url || '')) {
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}

function knownOrWebSource(source) {
  const known = state.index.docs.find(doc => doc.id === source?.id);
  if (known) return source.url === known.url ? known : null;
  return validWebSource(source) ? { ...source, text: '' } : null;
}

function searchSuggestion(html) {
  const frame = el('iframe', 'search-suggestion');
  frame.title = 'Google Search suggestions';
  frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation');
  frame.referrerPolicy = 'no-referrer';
  frame.srcdoc = html;
  return frame;
}

function collapseEarlierRecommendations() {
  messages.querySelectorAll('.answer.is-recommendation:not(.is-collapsed)').forEach(answer => {
    const details = el('details', 'prior-answer');
    const content = el('div', 'prior-answer-content');
    content.append(...answer.childNodes);
    details.append(el('summary', '', 'Earlier recommendation'), content);
    answer.replaceChildren(details);
    answer.classList.add('is-collapsed');
  });
}

function messageText(bubble) {
  const copy = bubble.cloneNode(true);
  copy.querySelectorAll('details, .inline-citation, .ai-note, .choice-list').forEach(node => node.remove());
  copy.querySelectorAll('p, li, h2').forEach(node => node.after(document.createTextNode('\n\n')));
  return (copy.textContent || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n\n').trim();
}

function addMessage(kind, content) {
  messages.querySelectorAll('.choice:not([disabled]), .case-field select:not([disabled])')
    .forEach(control => { control.disabled = true; });
  if (kind === 'assistant') collapseEarlierRecommendations();
  const row = el('div', `message-row ${kind}`);
  const avatar = el('div', 'avatar', kind === 'assistant' ? '✳' : 'You');
  avatar.setAttribute('aria-hidden', 'true');
  const bubble = el('div', 'bubble');
  if (typeof content === 'string') bubble.textContent = content;
  else bubble.append(content);
  row.append(avatar, bubble);
  messages.append(row);
  document.body.classList.add('has-messages');
  if (kind === 'user') setMascot('waiting');
  else if (bubble.querySelector('.answer-warning')) reactToAnswer('review');
  else if (bubble.querySelector('.pet-step')) reactToAnswer('jumping');
  else reactToAnswer('waving');
  state.transcript.push({
    role: kind,
    text: messageText(bubble),
    ...(kind === 'assistant' ? { answerView: snapshotAnswerView(bubble) } : {}),
    ...(kind === 'assistant' && Array.isArray(content?.savedSegments)
      ? { answerSegments: content.savedSegments.slice(0, 16).map(segment => ({
        text: String(segment.text).slice(0, 2200), paragraph: segment.paragraph,
        source_ids: segment.source_ids.slice(0, 3)
      })), answerTitle: String(content.savedTitle || '').slice(0, 120) } : {}),
    sources: kind === 'assistant' ? state.evidence.map(hit => ({
      id: hit.document.id, title: hit.document.title, url: hit.document.url,
      source_role: hit.document.source_role, publisher: hit.document.publisher
    })) : [],
    searchSuggestionHtml: kind === 'assistant' ? state.webSuggestionHtml : ''
  });
  state.webSuggestionHtml = '';
  saveCurrentChat();
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateControls() {
  const disabled = state.sourceStatus !== 'ready' || state.busy;
  $('#prompt').disabled = disabled;
  $('#composer button[type="submit"]').disabled = disabled;
  $('#export').disabled = disabled;
  document.querySelectorAll('[data-prompt]').forEach(button => { button.disabled = disabled; });
}

function setSourceStatus(status) {
  state.sourceStatus = status;
  updateControls();
}

function sourceDetails(hits, extra, query = '') {
  const details = el('details', 'answer-details');
  details.append(el('summary', '', 'Why this answer'));
  const content = el('div', 'answer-detail-content');
  content.append(el('p', 'review-note', hits.some(hit => hit.document.source_role === 'web_grounding')
    ? 'Web sources returned by Google Search. Open a source to verify.'
    : 'Public source summaries. Open a source to verify.'));
  if (extra) content.append(extra);
  const groups = new Map();
  for (const { document: doc } of hits) {
    if (!groups.has(doc.url)) groups.set(doc.url, []);
    if (!groups.get(doc.url).some(other => other.id === doc.id)) groups.get(doc.url).push(doc);
  }
  if (groups.size) {
    const list = el('div', 'source-links');
    for (const [url, docs] of groups) {
      const item = el('div', 'source-evidence');
      const label = originalSourceLabel(docs);
      item.append(safeLink(url, `${label} ↗`, 'citation'));
      for (const doc of docs) {
        const excerpt = sourceNoteExcerpt(doc.text, query);
        const section = doc.section || '';
        if (doc.source_role !== 'web_grounding' && doc.title !== label) {
          item.append(el('p', 'source-excerpt', `Our note: ${doc.title}`));
        }
        if (doc.source_quote) item.append(el('p', 'source-excerpt', `Source text${section ? ` (${section})` : ''}: “${doc.source_quote}”`));
        if (excerpt) item.append(el('p', 'source-excerpt', `Our summary${section ? ` (${section})` : ''}: ${excerpt}`));
      }
      list.append(item);
    }
    content.append(list);
  } else content.append(el('p', '', 'No close public source matched this question.'));
  details.append(content);
  return details;
}

function checkedModelAnswer(payload) {
  if (!['ok', 'chat'].includes(payload?.status) || !Array.isArray(payload.segments) || !Array.isArray(payload.sources)
    || !payload.segments.length || payload.segments.length > 16) return null;
  if (payload.status === 'chat') {
    if (payload.sources.length || payload.segments.some(segment =>
      typeof segment?.text !== 'string' || !segment.text.trim() || segment.text.length > 2200 ||
      !Array.isArray(segment.source_ids) || segment.source_ids.length)) return null;
    const followup = payload.followup;
    if (followup && (!Object.hasOwn(FIELDS, followup.field) || followup.text !== FIELDS[followup.field].label ||
      payload.segments.some(segment => segment.text.includes('?')))) return null;
    return { kind: 'chat', segments: payload.segments.map(segment => ({ text: segment.text.trim(), docs: [] })), hits: [], followup };
  }
  const publicDocs = new Map(state.index.docs.map(doc => [doc.id, doc]));
  const supplied = new Map();
  for (const source of payload.sources) {
    const doc = publicDocs.get(source?.id) || knownOrWebSource(source);
    if (!doc || source.url !== doc.url || supplied.has(doc.id)) return null;
    supplied.set(doc.id, doc);
  }
  const webSources = [...supplied.values()].some(doc => doc.source_role === 'web_grounding');
  const suggestion = payload.web_suggestion_html;
  if (webSources && (typeof suggestion !== 'string' || !suggestion.trim() || suggestion.length > 60000)) return null;
  if (!webSources && suggestion !== undefined) return null;
  const segments = [];
  const cited = new Map();
  for (const segment of payload.segments) {
    const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
    if (!text || text.length > 2200 || !Array.isArray(segment.source_ids) || !segment.source_ids.length) return null;
    const docs = [];
    for (const id of segment.source_ids) {
      const doc = supplied.get(id);
      if (!doc) return null;
      if (!docs.some(entry => entry.id === id)) docs.push(doc);
      cited.set(id, doc);
    }
    const paragraph = segment.paragraph;
    if (paragraph !== undefined && (!Number.isInteger(paragraph) || paragraph < 1 || paragraph > 7)) return null;
    segments.push({ text, docs, paragraph });
  }
  return { segments, hits: [...cited.values()].map(document => ({ document, score: 1 })), webSuggestionHtml: webSources ? suggestion : '' };
}

function citedParagraphs(model) {
  const content = el('div', 'model-explanation');
  let group = null;
  let paragraph;
  for (const unit of citationUnits(model.segments)) {
    if (unit.group !== group) {
      paragraph = el('p', 'source-answer');
      content.append(paragraph);
      group = unit.group;
    } else paragraph.append(document.createTextNode(' '));
    appendInlineFormatting(paragraph, unit.text);
    const linked = new Set();
    unit.docs.forEach(doc => {
      if (linked.has(doc.url)) return;
      paragraph.append(document.createTextNode(' '));
      paragraph.append(safeLink(doc.url, `${sourceCitationLabel(doc)} ↗`, 'inline-citation'));
      linked.add(doc.url);
    });
  }
  return content;
}

function modelMessage(model, title = '', query = '') {
  state.evidence = model.hits;
  state.webSuggestionHtml = model.webSuggestionHtml || '';
  state.pendingQuestion = model.followup || null;
  const answer = el('div', 'answer');
  answer.savedSegments = model.segments.map(segment => ({
    text: segment.text, paragraph: segment.paragraph,
    source_ids: segment.docs.map(doc => doc.id)
  }));
  answer.savedTitle = title;
  if (title) answer.append(el('h2', 'answer-title', title));
  answer.append(citedParagraphs(model));
  if (model.webSuggestionHtml) answer.append(searchSuggestion(model.webSuggestionHtml));
  if (model.followup) answer.append(followupQuestion(model.followup));
  if (model.hits.length) answer.append(sourceDetails(model.hits, null, query));
  return answer;
}

async function requestModel(intent, query, topic = '') {
  if (state.apiUnavailable) return { unavailable: true };
  const controller = new AbortController();
  state.controller = controller;
  const timeout = setTimeout(() => controller.abort(), 115000);
  const context = state.transcript.slice(0, -1).slice(-8).map(entry => ({
    role: entry.role, text: entry.text.slice(0, 400)
  }));
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: query, intent, topic, profile: intent === 'learn' ? {} : cleanProfile(state.profile), context }),
      cache: 'no-store',
      signal: controller.signal
    });
    if (response.status === 404 || response.status === 405) state.apiUnavailable = true;
    if (!response.ok) return { unavailable: true, reason: response.status === 429 ? 'rate_limited' : 'http_error' };
    const payload = await response.json();
    if (payload?.status === 'review') return { review: true };
    if (payload?.status === 'unavailable') return { unavailable: true, reason: payload.reason };
    if (payload?.status === 'insufficient') return null;
    return checkedModelAnswer(payload) || { unavailable: true, reason: 'invalid_response' };
  } catch {
    return { unavailable: true };
  } finally {
    clearTimeout(timeout);
    if (state.controller === controller) state.controller = null;
  }
}

function localAnswer(answer, unavailable = false) {
  if (unavailable && answer instanceof HTMLElement) {
    answer.append(el('p', 'ai-note', 'AI is unavailable. Showing public sources.'));
  }
  return answer;
}

function modelFailureMessage(reason) {
  const answer = el('div', 'answer');
  const message = reason === 'daily_limit' || reason === 'web_daily_limit'
    ? 'Gemini has reached its daily limit. Please try again tomorrow.'
    : reason === 'rate_limited'
      ? 'Too many requests right now. Please wait a few minutes and send your message again.'
      : 'I could not complete a reliable answer. Please send your message again.';
  answer.append(el('p', 'answer-lead answer-warning', message));
  state.evidence = [];
  state.webSuggestionHtml = '';
  state.pendingQuestion = null;
  return answer;
}

function pendingMessage() {
  const row = el('div', 'message-row assistant pending');
  row.append(el('div', 'bubble pending-bubble', 'Thinking…'));
  messages.append(row);
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return row;
}

async function modelTurn(intent, query, fallback, title = '', topic = '') {
  if (state.apiUnavailable) {
    addMessage('assistant', localAnswer(fallback(), true));
    return;
  }
  const turn = ++state.turn;
  state.busy = true;
  updateControls();
  setMascot('waiting');
  const pending = pendingMessage();
  const model = await requestModel(intent, query, topic);
  if (turn !== state.turn) return;
  pending.remove();
  state.busy = false;
  updateControls();
  if (model?.review) addMessage('assistant', legalMessage(query));
  else if (model && !model.unavailable) addMessage('assistant', intent === 'choose' && model.kind !== 'chat' ? fallback(model) : modelMessage(model, model.kind === 'chat' ? '' : title, query));
  else if (model?.unavailable && !state.apiUnavailable) addMessage('assistant', modelFailureMessage(model.reason));
  else addMessage('assistant', localAnswer(fallback(), Boolean(model?.unavailable)));
  $('#prompt').focus();
}

function caseDetails() {
  const details = el('details', 'answer-details case-details');
  details.append(el('summary', '', 'Case details'));
  const editor = el('div', 'case-editor');
  for (const [key, field] of Object.entries(FIELDS)) {
    const label = el('label', 'case-field');
    label.append(el('span', 'field-label', field.label));
    const select = el('select');
    select.name = key;
    const placeholder = el('option', '', 'Not answered');
    placeholder.value = '';
    select.append(placeholder);
    field.options.forEach(([value, name]) => {
      const option = el('option', '', name);
      option.value = value;
      select.append(option);
    });
    select.value = state.profile[key] || '';
    select.addEventListener('change', () => {
      if (select.value) state.profile[key] = select.value;
      else delete state.profile[key];
      state.pendingQuestion = null;
      const answer = select.value ? profileLabel(key, select.value) : 'Not answered';
      addMessage('user', `${field.label} ${answer}`);
      showRecommendation(answer);
    });
    label.append(select);
    editor.append(label);
  }
  details.append(editor);
  return details;
}

function reasons(result) {
  const content = el('div', 'answer-reasons');
  const choices = [...result.primary, ...result.complementary, ...result.alternatives];
  if (choices.length) {
    const list = el('ul');
    choices.forEach(entry => {
      const item = el('li');
      item.append(el('strong', '', entry.name), document.createTextNode(` — ${entry.reason} Check: ${entry.caveat}`));
      list.append(item);
    });
    content.append(list);
  }
  if (result.avoid.length) {
    const list = el('ul');
    result.avoid.forEach(item => list.append(el('li', '', item.reason)));
    content.append(el('strong', '', 'Watch for'), list);
  }
  content.append(el('p', 'review-note', 'Review the design with privacy and PET specialists before use.'));
  return content;
}

function followupQuestion(question) {
  const follow = el('div', 'followup');
  follow.append(el('p', 'followup-question', question.text));
  follow.append(followupChoices(question));
  return follow;
}

function followupChoices(question) {
  const choices = el('div', 'choice-list');
  FIELDS[question.field].options.forEach(([value, label]) => {
    const button = el('button', 'choice', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.profile[question.field] = value;
      state.pendingQuestion = null;
      addMessage('user', label);
      showRecommendation(label);
    });
    choices.append(button);
  });
  return choices;
}

function recommendationMessage(result, query, model = null) {
  const answer = el('div', 'answer is-recommendation');
  const question = nextQuestion(result);
  if (result.status === 'escalate') {
    answer.append(el('h2', 'answer-title', 'Check permissions first'));
    answer.append(el('p', 'answer-lead answer-warning', result.summary));
  } else if (result.primary.length) {
    answer.append(el('h2', 'answer-title', 'A possible approach'));
    const steps = el('div', 'pet-steps');
    result.primary.forEach(entry => {
      const step = el('div', 'pet-step');
      step.append(el('strong', '', entry.name), el('p', '', entry.reason));
      steps.append(step);
    });
    answer.append(steps);
    const layers = result.complementary.filter(entry => entry.code !== 'governance');
    if (layers.length) answer.append(el('p', 'also-consider', `Also consider: ${layers.map(entry => entry.name).join(' · ')}`));
  }

  if (model) answer.append(citedParagraphs(model));

  const caseText = state.transcript.filter(entry => entry.role === 'user').map(entry => entry.text).join(' ');
  const relatedCase = relatedMdiCase(result, caseText || query);
  const alreadyShown = relatedCase && state.transcript.some(entry =>
    entry.role === 'assistant' && entry.text.includes(`Similar MDI use case: ${relatedCase.name}`));
  const relatedDocument = relatedCase && !alreadyShown && state.index.docs.find(doc =>
    doc.id === relatedCase.sourceId && doc.source_role === 'case_study' && doc.id.startsWith('mdi-'));
  if (relatedDocument) {
    const caseNote = el('div', 'related-case');
    caseNote.append(el('strong', '', `Similar MDI use case: ${relatedCase.name}`));
    const summary = el('p', '', `${relatedCase.summary} `);
    summary.append(safeLink(relatedDocument.url, 'Public source ↗', 'inline-citation'));
    caseNote.append(summary);
    answer.append(caseNote);
  }

  state.pendingQuestion = question;
  if (question) answer.append(followupQuestion(question));

  const codes = recommendationEvidenceCodes(result);
  const ruleHits = codes.length ? evidenceFor(state.index, query, codes, 5) : [];
  const hits = [...ruleHits, ...(model?.hits || []), ...(relatedDocument ? [{ document: relatedDocument }] : [])]
    .filter((hit, i, all) => all.findIndex(entry => entry.document.id === hit.document.id) === i);
  state.evidence = hits;
  if (codes.length || result.avoid.length) answer.append(sourceDetails(hits, reasons(result), query));
  if (Object.keys(state.profile).length) answer.append(caseDetails());
  return answer;
}

function showRecommendation(query) {
  if (state.sourceStatus !== 'ready') return;
  state.mode = 'choose';
  const assessment = assessCase(state.profile);
  const intake = openingUseCaseQuestion(query, state.profile, state.transcript.slice(0, -1));
  if (assessment.status === 'escalate') {
    addMessage('assistant', recommendationMessage(assessment, query));
    return;
  }
  if (intake) {
    void modelTurn('choose', query, () => {
      state.evidence = [];
      state.pendingQuestion = intake;
      const answer = el('div', 'answer');
      answer.append(el('p', '', 'I can help with that.'), followupQuestion(intake));
      return answer;
    });
    return;
  }
  void modelTurn('choose', query, model => recommendationMessage(assessment, query, model));
}

function learningMessage(query, retrievalQuery = query) {
  const socialReply = conversationalReply(query);
  if (socialReply) {
    state.evidence = [];
    return el('div', 'answer', socialReply);
  }
  const normalized = normalizePetTerms(query).toLowerCase();
  const packageComparison = /\bsynthpop\b/.test(normalized) && /\btidysynthesis\b/.test(normalized)
    && /\b(?:compare|difference|versus|vs|between)\b/.test(normalized);
  let hits = packageComparison
    ? ['cran-synthpop-package', 'cran-tidysynthesis-package']
      .map(id => state.index.docs.find(document => document.id === id)).filter(Boolean)
      .map(document => ({ document, score: 1 }))
    : retrieve(state.index, retrievalQuery, { limit: 12 });
  if (/^\s*(what is|what are|define|explain)\b/i.test(query)) {
    hits = hits.slice().sort((a, b) => {
      const definition = hit => hit.document.id.endsWith('definition') || hit.document.tags.includes('definition') ? 1 : 0;
      const offTopic = hit => /differential privacy|\bdp\b/i.test(query) && !/synthetic|fake/i.test(query) && hit.document.tags.includes('synthetic_data') ? 1 : 0;
      return definition(b) - definition(a) || offTopic(a) - offTopic(b) || b.score - a.score;
    });
  }
  hits = hits.slice(0, 4);
  state.evidence = [];
  state.pendingQuestion = null;
  const answer = el('div', 'answer');
  if (!hits.length) {
    answer.append(el('p', 'answer-lead', 'I could not find a close match. Try naming a PET or describing what you need to do.'));
    return answer;
  }
  if (packageComparison && hits.length === 2) {
    const [synthpop, tidy] = hits;
    const first = el('p', 'source-answer', 'Both are R packages for synthetic data. synthpop can automate sequential synthesis through syn() and includes tools to assess utility and disclosure risk. ');
    first.append(safeLink(synthpop.document.url, `${sourceCitationLabel(synthpop.document)} ↗`, 'inline-citation'));
    const second = el('p', 'source-answer', 'tidysynthesis uses a tidymodels-style workflow with explicit controls for ordering, tuning, constraints, and noise. Neither package makes a dataset safe to release without review. ');
    second.append(safeLink(tidy.document.url, `${sourceCitationLabel(tidy.document)} ↗`, 'inline-citation'));
    answer.append(first, second, sourceDetails(hits, null, retrievalQuery));
    state.evidence = hits;
    return answer;
  }
  const count = /\b(compare|difference|versus|vs\.?|between)\b/i.test(query) ? 2 : 1;
  const seen = new Set();
  const shown = [];
  hits.slice(0, count).forEach(hit => {
    if (seen.has(hit.document.text)) return;
    seen.add(hit.document.text);
    shown.push(hit);
    const paragraph = el('p', 'source-answer', `${hit.document.text} `);
    paragraph.append(safeLink(hit.document.url, `${sourceCitationLabel(hit.document)} ↗`, 'inline-citation'));
    answer.append(paragraph);
  });
  state.evidence = shown;
  answer.append(sourceDetails(shown, null, retrievalQuery));
  return answer;
}

function planningMessage(query) {
  const assessment = assessCase(state.profile);
  if (assessment.profile.goal && assessment.status === 'escalate') return recommendationMessage(assessment, query);
  const codes = [...assessment.primary, ...assessment.complementary].map(entry => entry.code);
  const hits = codes.length
    ? evidenceFor(state.index, query, codes, 5)
    : retrieve(state.index, query, { limit: 5 });
  state.evidence = hits;
  state.pendingQuestion = null;
  const answer = el('div', 'answer');
  answer.append(el('h2', 'answer-title', 'Plan a small pilot'));
  const steps = [
    ['Define the use', 'Record the purpose, data holders, permitted data flows, and needed output.'],
    ['Compare options', assessment.primary.length
      ? `Test ${assessment.primary.map(entry => entry.name).join(' and ')} against a simpler baseline.`
      : 'Compare a PET approach with a simpler baseline.'],
    ['Test', 'Use mock or approved data to measure privacy risk, usefulness, and effort.'],
    ['Review', 'Have privacy, legal, domain, and technical owners review before live use or release.']
  ];
  const list = el('ol', 'plan-steps');
  steps.forEach(([title, detail]) => {
    const item = el('li');
    item.append(el('strong', '', title), document.createTextNode(` — ${detail}`));
    list.append(item);
  });
  answer.append(list, sourceDetails(hits, null, query));
  return answer;
}

function isLegalQuestion(text) {
  if (/\b(?:pii|personally identifiable|student records?)\b/i.test(text)
    && /\b(?:agree|approval|permission|persuad\w*|convinc\w*|sign off)\b/i.test(text)
    && /\b(?:shar\w*|transferr?\w*|send)\b/i.test(text)) return true;
  return asksLegalPermission(text);
}

function legalMessage(query) {
  const uk = /\b(uk|united kingdom|britain|ico)\b/i.test(query);
  const resources = uk ? [
    ['ICO data-sharing guidance', 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/'],
    ['UK PET adoption guide', 'https://www.gov.uk/data-ethics-guidance/privacy-enhancing-technologies-adoption-guide']
  ] : [
    ['U.S. Education Department: privacy and data sharing', 'https://studentprivacy.ed.gov/privacy-and-data-sharing'],
    ['PTAC: data-sharing agreement assistance', 'https://studentprivacy.ed.gov/request-ptac-training-or-technical-assistance']
  ];
  state.evidence = [];
  state.pendingQuestion = null;
  const answer = el('div', 'answer');
  answer.append(el('h2', 'answer-title', 'Ask a privacy or legal reviewer'));
  answer.append(el('p', 'answer-lead answer-warning', 'A chat cannot confirm whether this use or disclosure is allowed. A reviewer needs the purpose, data, agreements, and people receiving the result.'));
  const reading = el('p', 'background-reading', 'Helpful resources: ');
  resources.forEach(([title, url], index) => {
    if (index) reading.append(document.createTextNode(' · '));
    reading.append(safeLink(url, title, 'inline-citation'));
  });
  answer.append(reading);
  return answer;
}

function startsNewCase(text) {
  return /\b(?:new|another|different|separate|next|second)\s+(?:use\s*case|case|scenario|project)\b/i.test(text);
}

function isCaseContinuation(text) {
  return /^\s*(also|and|what if|in this case|for this case|in the same case|for the same project|we also|same case|actually|correction|instead)\b/i.test(text);
}

function send(text) {
  const query = text.trim().slice(0, 1200);
  if (!query || state.sourceStatus !== 'ready' || state.busy) return false;
  const inferred = inferProfile(query);
  if (/\b(?:won't|will not|do not|never|no plans? to)\b.{0,35}\b(?:publish|release|share)\b.{0,60}\b(?:names?|identifiers?|pii)\b/i.test(query)) inferred.directRelease = 'no';
  const followup = Boolean(state.mode === 'learn' && state.lastTopicQuery && isTopicFollowup(query));
  const newCase = startsNewCase(query) || Boolean(!followup && inferred.goal && state.profile.goal && inferred.goal !== state.profile.goal && !isCaseContinuation(query));
  if (newCase) reset();
  const pendingAnswer = newCase ? null : answerToCaseQuestion(state.pendingQuestion, query);
  const intent = pendingAnswer ? 'choose' : isLegalQuestion(query) ? 'legal' : classifyMessage(query, inferred, { hasTopic: followup, mode: state.mode });
  if (intent === 'learn') state.pendingQuestion = null;
  if (intent === 'choose' || intent === 'plan') {
    state.profile = { ...state.profile, ...inferred };
    if (pendingAnswer) state.profile[state.pendingQuestion.field] = pendingAnswer;
  }
  if (pendingAnswer) state.pendingQuestion = null;
  state.mode = intent;
  addMessage('user', query);
  if (intent === 'legal') addMessage('assistant', legalMessage(query));
  else if (intent === 'plan') {
    const assessment = assessCase(state.profile);
    if (assessment.profile.goal && assessment.status === 'escalate') addMessage('assistant', recommendationMessage(assessment, query));
    else void modelTurn('plan', query, () => planningMessage(query), 'Plan a small pilot');
    state.lastTopicQuery = query;
  }
  else if (intent === 'choose') { showRecommendation(query); state.lastTopicQuery = query; }
  else {
    const retrievalQuery = followup ? `${state.lastTopicQuery} ${query}` : query;
    void modelTurn('learn', query, () => learningMessage(query, retrievalQuery), '', followup ? state.lastTopicQuery : '');
    if (!followup) state.lastTopicQuery = query;
  }
  return true;
}

function exportSummary() {
  if (!state.transcript.length) return;
  const assessment = assessCase(state.profile);
  const lines = ['# PETs Model case summary', '', `Exported: ${new Date().toISOString()}`, '', '## Case details'];
  for (const [key, value] of Object.entries(cleanProfile(state.profile))) lines.push(`- ${FIELDS[key].label} ${profileLabel(key, value)}`);
  lines.push('', '## Exploratory architecture', assessment.summary, '', '### Suggested approaches');
  assessment.primary.forEach(entry => lines.push(`- ${entry.name}: ${entry.reason} Check: ${entry.caveat}`));
  assessment.complementary.forEach(entry => lines.push(`- ${entry.name}: ${entry.reason} Check: ${entry.caveat}`));
  lines.push('', '### Questions to resolve');
  assessment.missing.forEach(question => lines.push(`- ${question.text}`));
  lines.push('', '## Conversation', ...state.transcript.flatMap(entry => [
    `### ${entry.role === 'assistant' ? 'Assistant' : 'You'}`,
    entry.text,
    ...(entry.sources.length ? ['', 'Sources:', ...entry.sources.map(source => `- ${source.source_role === 'web_grounding' ? source.title : `Our note: ${source.title}`} — ${source.url}`)] : []),
    ''
  ]));
  lines.push('Review this local export before sharing. It is not an expert-approved recommendation.');
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pets-model-case-summary.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reset({ initial = false } = {}) {
  state.turn += 1;
  state.controller?.abort();
  state.controller = null;
  state.busy = false;
  state.profile = {};
  state.evidence = [];
  state.transcript = [];
  state.lastTopicQuery = '';
  state.pendingQuestion = null;
  state.mode = 'learn';
  if (!initial) state.chatId = crypto.randomUUID();
  messages.replaceChildren();
  document.body.classList.remove('has-messages');
  $('#prompt').value = '';
  updateControls();
  setMascot('waving', 1200);
  history.activeId = state.chatId;
  historySaved = saveHistory(browserStorage, history);
  renderSavedChats();
}

$('#composer').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#prompt');
  if (send(input.value)) input.value = '';
  input.focus();
});
$('#prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('#composer').requestSubmit();
  }
});
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
$('#export').addEventListener('click', () => { exportSummary(); setMascot('waving', 1200); });
$('#reset').addEventListener('click', reset);

reset({ initial: true });
setSourceStatus('loading');
setMascot('waiting');
fetch('./data/sources.json', { cache: 'no-cache' }).then(response => {
  if (!response.ok) throw new Error(`Sources unavailable (${response.status})`);
  return response.json();
}).then(documents => {
  state.index = createIndex(documents);
  if (!state.index.docs.length) throw new Error('No source passages loaded');
  $('#source-count').textContent = `${state.index.docs.length} source notes`;
  setSourceStatus('ready');
  const savedChat = history.chats.find(chat => chat.id === history.activeId);
  if (savedChat) openSavedChat(savedChat.id);
  setMascot('waving', 1200);
}).catch(() => {
  setSourceStatus('failed');
  $('#source-count').textContent = 'Sources unavailable';
  addMessage('assistant', 'The public sources did not load. Refresh the page to try again.');
  setMascot('failed', 1500);
});
