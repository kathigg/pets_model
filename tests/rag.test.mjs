import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithRag } from '../server/rag.mjs';
import { answerToCaseQuestion, classifyMessage, conversationalReply, isTopicFollowup, openingUseCaseQuestion } from '../public/conversation.mjs';
import { assessCase, inferProfile } from '../public/engine.mjs';
import { relatedMdiCase } from '../public/related-cases.mjs';

test('greetings use Gemini as conversation without PET citations', async () => {
  assert.match(conversationalReply('hello!'), /^Hi!/);
  assert.equal(conversationalReply('What is differential privacy?'), null);
  let calls = 0;
  const response = await answerWithRag({ message: 'hello!', intent: 'learn' }, {
    apiKey: 'test-key', fetchImpl: async () => { calls++; return modelReply([{ text: 'Hi! What would you like to explore?', source_ids: [] }]); }
  });
  assert.equal(response.status, 'chat');
  assert.equal(calls, 1);
  assert.match(response.segments[0].text, /^Hi!/);
});

test('asking the chatbot its name never retrieves name-matched pilot reports', async () => {
  const model = recordingModel((_ids, body) => {
    assert.deepEqual(body.generationConfig.responseSchema.properties.segments.items.properties.source_ids.items, { type: 'STRING' });
    return [{ text: 'I’m PETs Model. Tell me about your privacy challenge.', source_ids: [] }];
  });
  const response = await answerWithRag({ message: "what's your name?", intent: 'learn' }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'chat');
  assert.deepEqual(response.sources, []);
  assert.match(response.segments[0].text, /PETs Model/);
  assert.doesNotMatch(model.calls[0].body.contents[0].parts[0].text, /DC ETEP pilot: two exact PSI joins/);
});

test('package comparison and clarification remain informational turns', () => {
  assert.equal(classifyMessage("what's the difference between synthpop and tidysynthesis", {}), 'learn');
  assert.equal(classifyMessage("what's the best practice linkage variable in cross agency", { goal: 'link' }), 'learn');
  assert.equal(isTopicFollowup('they are synthetic data packages'), true);
  assert.equal(classifyMessage('they are synthetic data packages', { goal: 'synthetic' }, { hasTopic: true, mode: 'learn' }), 'learn');
  assert.equal(isTopicFollowup('what are good examples'), true);
  assert.equal(isTopicFollowup('elaborate'), true);
  assert.equal(isTopicFollowup('is there some resource i should look at'), true);
  assert.match(conversationalReply('do u have a privacy reviewer?'), /cannot approve/);
});

test('package comparison uses web research instead of a frozen package summary', async () => {
  let researched;
  const response = await answerWithRag({ message: "what's the difference between synthpop and tidysynthesis", intent: 'learn' },
    { apiKey: 'test-key', webResearch: async question => {
      researched = question;
      return { status: 'ok', segments: [{ text: 'A grounded comparison.', source_ids: ['web-0'] }],
        sources: [{ id: 'web-0', title: 'Official package docs', url: 'https://cran.r-project.org/package=synthpop', source_role: 'web_grounding' }],
        web_suggestion_html: '<a href="https://google.com/search?q=synthpop">Search</a>' };
    } });
  assert.equal(response.status, 'ok');
  assert.equal(researched, "what's the difference between synthpop and tidysynthesis");
  assert.deepEqual(response.segments[0].source_ids, ['web-0']);
});

test('misspelled package names are normalized before web research', async () => {
  let researched;
  const response = await answerWithRag({ message: 'whats the difference between synhpop and tidy synethesis', intent: 'learn' },
    { apiKey: 'test-key', webResearch: async question => {
      researched = question;
      return { status: 'ok', segments: [{ text: 'A grounded comparison.', source_ids: ['web-0'] }],
        sources: [{ id: 'web-0', title: 'Official package docs', url: 'https://cran.r-project.org/package=synthpop', source_role: 'web_grounding' }],
        web_suggestion_html: '<a href="https://google.com/search?q=synthpop">Search</a>' };
    } });
  assert.equal(response.status, 'ok');
  assert.equal(researched, 'whats the difference between synthpop and tidysynthesis');
});

test('daily web limit prevents an additional grounded search call', async () => {
  let calls = 0;
  const response = await answerWithRag({ message: 'Compare synthpop and tidysynthesis', intent: 'learn' }, {
    apiKey: 'test-key', reserveModelCall: async () => true, reserveWebResearch: async () => false,
    webResearch: async () => { calls++; throw new Error('unexpected'); }
  });
  assert.equal(response.reason, 'web_daily_limit');
  assert.equal(calls, 0);
});

test('linkage-variable advice is prompted for case context, not a universal field or tool', async () => {
  const model = recordingModel(ids => [{ text: 'The fields depend on what each agency can reliably use. Which common identifiers are available?', source_ids: [ids[0]] }]);
  const response = await answerWithRag({ message: "what's the best practice linkage variable in cross agency", intent: 'learn' },
    { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /no single field is best/);
  assert.match(prompt, /uk-linkage-quality-assessment/);
  assert.doesNotMatch(prompt, /mdi-ar-report-linkja-results|mdi-dc-report-triangulation/);
});

test('a linkage example follow-up retrieves detailed MDI public cases', async () => {
  const model = recordingModel(ids => [{ text: 'MDI tested cross-jurisdiction linkage with mock D.C. records.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'what are good examples', topic: 'cross-agency record linkage', intent: 'learn',
    context: [{ role: 'user', text: 'What is cross-agency record linkage?' }]
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /mdi-dc-report-triangulation/);
  assert.match(prompt, /mdi-nysed-clean-room-overview/);
  assert.doesNotMatch(prompt, /NYSED-MDI Running Meeting Notes/);
});

test('similar MDI case follows the described task, not just the agency name', () => {
  const synthetic = assessCase({ goal: 'test', holders: 'one', sensitivity: 'internal', capacity: 'medium' });
  assert.equal(relatedMdiCase(synthetic, 'We want fake data for NYSED')?.sourceId, 'mdi-nswers-report-utility');
  assert.equal(relatedMdiCase(assessCase({ goal: 'test' }), 'We want fake data'), null);
  assert.equal(relatedMdiCase(assessCase({ goal: 'test', sensitivity: 'protected' }), 'We want fake data'), null);

  const linkage = { goal: 'link', holders: 'two', rawMove: 'no', output: 'rows', sensitivity: 'internal', capacity: 'medium', repeated: 'no' };
  assert.equal(relatedMdiCase(assessCase({ ...linkage, match: 'exact' }), 'Link agency records')?.sourceId,
    'mdi-dc-report-triangulation');
  assert.equal(relatedMdiCase(assessCase({ ...linkage, match: 'fuzzy' }), 'Link agency records')?.sourceId,
    'mdi-ar-report-probabilistic-gap');
  assert.equal(relatedMdiCase(assessCase({ ...linkage, match: 'exact' }), 'Try a clean room for linkage')?.sourceId,
    'mdi-nysed-clean-room-overview');
});

test('synthetic-data advice leaves the MDI example to a separate linked card', async () => {
  const model = recordingModel(ids => [{ text: 'Purpose-built synthetic data can support testing, with disclosure and utility review.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'We want fake data to test our software.', intent: 'choose',
    profile: { goal: 'test', holders: 'one', sensitivity: 'internal', capacity: 'medium' }
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /"separate_mdi_case_card":true/);
  assert.doesNotMatch(prompt, /ed-ferpa-deidentification-standard/);
  assert.match(prompt, /Add one or two cited paragraphs with a material limitation, tradeoff, or next check/);
  assert.match(prompt, /interface separately shows one short, linked public MDI example/);
  assert.doesNotMatch(prompt, /NYSED-MDI Running Meeting Notes/);
});

test('public sensitivity answer continues the synthetic case instead of triggering protected-data review', async () => {
  const model = recordingModel(ids => [{ text: 'Synthetic test data still need utility and disclosure review.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'Already public', intent: 'choose',
    profile: { goal: 'test', holders: 'one', sensitivity: 'public', capacity: 'low' },
    context: [{ role: 'assistant', text: 'How sensitive are the source records?' }]
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  assert.equal(model.calls.length, 1);
  assert.match(model.calls[0].body.contents[0].parts[0].text, /"sensitivity":"public"/);
  assert.match(model.calls[0].body.contents[0].parts[0].text, /"separate_mdi_case_card":true/);
});

test('clean-room context survives a short case-detail reply', async () => {
  const model = recordingModel(ids => [{ text: 'The matching design depends on the agreed identifiers and access controls.', source_ids: [ids[0]] }]);
  await answerWithRag({
    message: 'Exact or deterministic', intent: 'choose',
    profile: { goal: 'link', holders: 'two', rawMove: 'no', match: 'exact', output: 'rows', sensitivity: 'internal', capacity: 'medium', repeated: 'no' },
    context: [{ role: 'user', text: 'We want a clean room for cross-agency linkage.' }]
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /"separate_mdi_case_card":true/);
});

test('elaborate focuses the last named pilot instead of repeating the whole example list', async () => {
  const model = recordingModel(ids => [{ text: 'The D.C. pilot tested an intermediate linkage step.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'elaborate', topic: 'cross-agency record linkage', intent: 'learn',
    context: [
      { role: 'user', text: 'what are good examples' },
      { role: 'assistant', text: 'The D.C. ETEP pilot tested cross-jurisdiction linkage.' }
    ]
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /mdi-dc-report-triangulation/);
  assert.doesNotMatch(prompt, /mdi-nysed-clean-room-overview/);
});

test('elaborate on general linkage advice stays with linkage quality guidance', async () => {
  const model = recordingModel(ids => [{ text: 'Compare missingness and false-link rates for the common identifiers.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'elaborate', topic: "what's the best practice linkage variable in cross agency", intent: 'learn',
    context: [
      { role: 'user', text: "what's the best practice linkage variable in cross agency" },
      { role: 'assistant', text: 'No single field is best. Assess the quality of shared identifiers and the intended analysis.' }
    ]
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /uk-linkage-quality-assessment/);
  assert.doesNotMatch(prompt, /mdi-dc-report-triangulation|mdi-ar-report-linkja-results/);
  assert.match(prompt, /expand the substance of the most recent assistant reply/);
});

test('resource follow-up after an MDI example retrieves its named public report', async () => {
  const model = recordingModel(ids => [{ text: 'The D.C. ETEP report gives the exact-match design and its limits.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'is there some resource i should look at', topic: 'cross-agency linkage', intent: 'learn',
    context: [
      { role: 'user', text: 'what are good examples' },
      { role: 'assistant', text: 'The D.C. ETEP pilot tested a two-step private set intersection linkage.' }
    ]
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  assert.equal(response.sources[0].id, 'mdi-dc-report-triangulation');
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /one or two specific documents/);
  assert.doesNotMatch(prompt, /mdi-nysed-clean-room-overview|mdi-ar-report-linkja-results/);
});

test('request to secure agency agreement for sharing PII goes to human review without a Gemini call', async () => {
  let calls = 0;
  const response = await answerWithRag({ message: 'how do I have other agencies agree sharing PII with me', intent: 'learn' },
    { apiKey: 'test-key', fetchImpl: async () => { calls++; throw new Error('unexpected'); } });
  assert.equal(response.status, 'review');
  assert.equal(calls, 0);
});

test('an underspecified data-sharing use case asks for purpose without a pilot citation', async () => {
  const model = recordingModel(() => [{ text: 'I can help with the sharing plan.', source_ids: [] }]);
  for (const message of [
    'I have a set of data I want to share with the DC department of education. What PET should I use?',
    "Hello! I'm working with the New York Department of Education and I'd like to share some information securely. Could you help?"
  ]) {
    const response = await answerWithRag({ message, intent: 'learn' }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
    assert.equal(response.status, 'chat', message);
    assert.deepEqual(response.sources, []);
    assert.equal(response.followup.field, 'goal');
    assert.equal(response.followup.text, 'What are you trying to do?');
    assert.doesNotMatch(response.segments[0].text, /\?/);
  }
});

test('intake rejects a model answer that parrots a prior pilot', async () => {
  const response = await answerWithRag({
    message: 'I want to share data with the DC department of education. What PET should I use?', intent: 'choose'
  }, {
    apiKey: 'test-key',
    fetchImpl: async () => modelReply([{ text: 'The DC ETEP pilot used PSI. Want to use that?', source_ids: [] }])
  });
  assert.equal(response.status, 'chat');
  assert.equal(response.followup.field, 'goal');
  assert.equal(response.segments[0].text, 'I can help with that.');
  assert.deepEqual(response.sources, []);
});

test('case intake asks one question and advances past an answered field', async () => {
  const visitorMessage = 'aggregate results. I want it to be as secure as possible.';
  assert.equal(openingUseCaseQuestion(visitorMessage, inferProfile(visitorMessage))?.field, 'holders');
  const model = recordingModel(() => [{ text: 'I can help narrow the options.', source_ids: [] }]);
  const profile = { goal: 'statistics', output: 'aggregate' };
  const first = await answerWithRag({
    message: 'We want secure aggregate results.', intent: 'choose', profile
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(first.status, 'chat');
  assert.equal(first.followup.field, 'holders');
  assert.equal(first.segments[0].text.includes('?'), false);
  assert.equal(answerToCaseQuestion(first.followup, 'Three or more'), 'many');
  assert.equal(answerToCaseQuestion(first.followup, 'There are 3 or more organizations'), 'many');

  const second = await answerWithRag({
    message: 'Three or more', intent: 'choose', profile: { ...profile, holders: 'many' },
    context: [{ role: 'assistant', text: `${first.segments[0].text} ${first.followup.text}` }]
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(second.status, 'chat');
  assert.equal(second.followup.field, 'sensitivity');
  assert.notEqual(second.followup.field, first.followup.field);
  assert.equal(answerToCaseQuestion(second.followup, 'Already public'), 'public');
  assert.equal(answerToCaseQuestion(second.followup, 'The records are internal but not protected'), 'internal');
});

test('completed core case facts reach grounded advice without re-asking intake', async () => {
  const profile = { goal: 'statistics', output: 'aggregate', holders: 'many', sensitivity: 'internal', rawMove: 'no' };
  assert.equal(openingUseCaseQuestion('We want aggregate results', profile, [{ role: 'assistant', text: 'What are you trying to do?' }]), null);
  const model = recordingModel(ids => [{ text: 'Differential privacy can help limit disclosure in aggregate releases.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({ message: 'We want secure aggregate results.', intent: 'choose', profile },
    { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  assert.equal(response.followup, undefined);
});

test('grounded case advice cannot add a second model-generated question', async () => {
  const profile = { goal: 'statistics', output: 'aggregate', holders: 'many', sensitivity: 'internal', rawMove: 'no' };
  const model = recordingModel(ids => [{ text: 'Consider differential privacy. Will analyses repeat over time?', source_ids: [ids[0]] }]);
  const response = await answerWithRag({ message: 'We want secure aggregate results.', intent: 'choose', profile },
    { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'unavailable');
});

function modelReply(segments) {
  return new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ segments }) }] } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function recordingModel(makeSegments) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    const ids = body.generationConfig.responseSchema.properties.segments.items.properties.source_ids.items.enum || [];
    return modelReply(makeSegments(ids, body));
  };
  return { calls, fetchImpl };
}

test('grounded informational answer exposes only cited public-source metadata', async () => {
  const model = recordingModel(ids => [{ text: 'Differential privacy needs a release budget.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({ message: 'What is differential privacy?', intent: 'learn' }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  assert.equal(response.segments.length, 1);
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].id, response.segments[0].source_ids[0]);
  assert.match(response.sources[0].url, /^https:\/\//);
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].options.headers['x-goog-api-key'], 'test-key');
  assert.equal(model.calls[0].body.store, undefined);
  assert.match(model.calls[0].url, /gemini-3\.5-flash:generateContent$/);
});

test('invented citations cause fail-closed response', async () => {
  const model = recordingModel(() => [{ text: 'An unsupported claim.', source_ids: ['invented-source'] }]);
  const response = await answerWithRag({ message: 'Explain private set intersection', intent: 'learn' }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'unavailable');
  assert.equal(response.reason, 'invalid_citations');
  assert.deepEqual(response.sources, []);
});

test('no matching PET source uses conversational Gemini without citations', async () => {
  let calls = 0;
  const response = await answerWithRag({ message: 'volcanoes astrophysics xylophone', intent: 'learn' }, {
    apiKey: 'test-key', fetchImpl: async () => { calls++; return modelReply([{ text: 'Could you clarify your question?', source_ids: [] }]); }
  });
  assert.equal(response.status, 'chat');
  assert.equal(response.sources.length, 0);
  assert.equal(calls, 1);
});

test('daily model budget is reserved only after evidence and review gates, and fails closed', async () => {
  const model = recordingModel(ids => [{ text: 'A cited answer.', source_ids: [ids[0]] }]);
  let reservations = 0;
  const reserveModelCall = async () => { reservations++; return false; };
  const noEvidence = await answerWithRag({ message: 'volcanoes astrophysics xylophone', intent: 'learn' },
    { apiKey: 'test-key', fetchImpl: model.fetchImpl, reserveModelCall });
  assert.equal(noEvidence.reason, 'daily_limit');
  const review = await answerWithRag({ message: 'Can we share student records under FERPA?', intent: 'learn' },
    { apiKey: 'test-key', fetchImpl: model.fetchImpl, reserveModelCall });
  assert.equal(review.reason, 'human_review_required');
  assert.equal(reservations, 1);
  const limited = await answerWithRag({ message: 'What is differential privacy?', intent: 'learn' },
    { apiKey: 'test-key', fetchImpl: model.fetchImpl, reserveModelCall });
  assert.equal(limited.reason, 'daily_limit');
  assert.equal(reservations, 2);
  assert.equal(model.calls.length, 0);
  const failed = await answerWithRag({ message: 'What is differential privacy?', intent: 'learn' },
    { apiKey: 'test-key', fetchImpl: model.fetchImpl, reserveModelCall: async () => { throw new Error('storage unavailable'); } });
  assert.equal(failed.status, 'unavailable');
  assert.equal(model.calls.length, 0);
});

test('protected case without reviewed authority never reaches the model', async () => {
  const model = recordingModel(() => { throw new Error('Should not call model'); });
  const response = await answerWithRag({
    message: 'We need fuzzy student record linkage across agencies.', intent: 'choose',
    profile: { goal: 'link', holders: 'many', match: 'fuzzy', sensitivity: 'protected', authority: 'unknown' }
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'review');
  assert.equal(response.reason, 'human_review_required');
  assert.equal(model.calls.length, 0);
});

test('informational PET explanation about student records can use public evidence', async () => {
  const model = recordingModel(ids => [{ text: 'Approximate record linkage requires measuring false matches.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'Explain fuzzy linkage for student records.', intent: 'learn'
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  assert.equal(model.calls.length, 1);
});

test('legal permission question routes to review without a model call', async () => {
  let called = false;
  const response = await answerWithRag({
    message: 'Can we share student records under FERPA?', intent: 'learn'
  }, { apiKey: 'test-key', fetchImpl: async () => { called = true; throw new Error('Should not call model'); } });
  assert.equal(response.status, 'review');
  assert.equal(called, false);
});

test('legal permission to link or train records is reviewed even if labeled learn', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('Should not call model'); };
  for (const message of [
    'May we link student records under FERPA?',
    'Would FERPA allow us to train a model on student records?'
  ]) {
    const response = await answerWithRag({ message, intent: 'learn' }, { apiKey: 'test-key', fetchImpl });
    assert.equal(response.status, 'review', message);
    assert.equal(response.reason, 'human_review_required', message);
  }
  assert.equal(called, false);
});

test('case-specific protected-data advice cannot bypass authority review with learn intent', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('Should not call model'); };
  for (const message of [
    'Can we train on protected student records?',
    'Which PET should we use for protected student records?'
  ]) {
    const response = await answerWithRag({ message, intent: 'learn' }, { apiKey: 'test-key', fetchImpl });
    assert.equal(response.status, 'review', message);
    assert.equal(response.reason, 'human_review_required', message);
  }
  assert.equal(called, false);
});

test('approved case advice labeled learn still uses decision rules and curated evidence', async () => {
  const model = recordingModel(ids => [{ text: 'Approximate linkage needs specialist evaluation.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'We need fuzzy student record linkage. Legal review is approved.', intent: 'learn',
    profile: { goal: 'link', holders: 'many', rawMove: 'no', match: 'fuzzy', output: 'aggregate', sensitivity: 'protected', capacity: 'medium', authority: 'yes' }
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /"intent":"choose"/);
  assert.match(prompt, /"decision_rules":\{"status"/);
  assert.match(prompt, /nih-pprl-fuzzy/);
});

test('direct identifier or protected row-level release skips the model', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('Should not call model'); };
  const direct = await answerWithRag({
    message: 'Can I publish student names in a public dashboard?', intent: 'choose',
    profile: { authority: 'yes', sensitivity: 'protected' }
  }, { apiKey: 'test-key', fetchImpl });
  assert.equal(direct.status, 'review');
  const rows = await answerWithRag({
    message: 'We want to release row-level student records.', intent: 'choose',
    profile: { goal: 'statistics', holders: 'one', output: 'rows', sensitivity: 'protected', authority: 'yes' }
  }, { apiKey: 'test-key', fetchImpl });
  assert.equal(rows.status, 'review');
  const noGoal = await answerWithRag({
    message: 'Are direct identifiers okay here?', intent: 'choose',
    profile: { directRelease: 'yes', sensitivity: 'protected', authority: 'yes' }
  }, { apiKey: 'test-key', fetchImpl });
  assert.equal(noGoal.status, 'review');
  assert.equal(called, false);
});

test('fuzzy linkage presents approximate-match evidence, not exact PSI evidence', async () => {
  const model = recordingModel(ids => [{ text: 'Approximate linkage needs specialist evaluation.', source_ids: [ids[0]] }]);
  const response = await answerWithRag({
    message: 'Three agencies need fuzzy student linkage. Legal review is approved.', intent: 'choose',
    profile: { goal: 'link', holders: 'many', rawMove: 'no', match: 'fuzzy', output: 'aggregate', sensitivity: 'protected', capacity: 'medium', authority: 'yes' }
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  const evidence = model.calls[0].body.contents[0].parts[0].text;
  assert.match(evidence, /nih-pprl-fuzzy/);
  assert.doesNotMatch(evidence, /ico-psi-definition/);
});

test('exact cross-holder linkage includes the PSI alternative and evidence', async () => {
  const model = recordingModel(ids => [{ text: 'PSI can compare exact overlap.', source_ids: [ids.find(id => id === 'ico-psi-definition')] }]);
  const response = await answerWithRag({
    message: 'How did MDI DC ETEP test exact linkage when raw data could not move?', intent: 'choose',
    profile: { goal: 'link', holders: 'two', rawMove: 'no', match: 'exact', output: 'aggregate', sensitivity: 'internal', capacity: 'high' }
  }, { apiKey: 'test-key', fetchImpl: model.fetchImpl });
  assert.equal(response.status, 'ok');
  assert.ok(response.sources.some(source => source.id === 'ico-psi-definition'));
  const prompt = model.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Private set intersection/);
  assert.match(prompt, /mdi-dc-report-triangulation/);
});

test('provider failure returns an unavailable response without provider details', async () => {
  const response = await answerWithRag({ message: 'What is differential privacy?', intent: 'learn' }, {
    apiKey: 'test-key', fetchImpl: async () => new Response('secret provider detail', { status: 503 })
  });
  assert.equal(response.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(response), /secret provider detail/);
});

test('service identity is requested for conversation and grounded answers after privacy review gates', async () => {
  const model = recordingModel(ids => ids.length
    ? [{ text: 'A cited answer.', source_ids: [ids[0]] }]
    : [{ text: 'Could you clarify?', source_ids: [] }]);
  let tokenCalls = 0;
  const options = {
    projectId: 'pets-model-123',
    accessTokenProvider: async () => { tokenCalls++; return 'test-access-token'; },
    fetchImpl: model.fetchImpl
  };
  const review = await answerWithRag({ message: 'Can we share student records under FERPA?', intent: 'learn' }, options);
  assert.equal(review.reason, 'human_review_required');
  const noEvidence = await answerWithRag({ message: 'volcanoes astrophysics xylophone', intent: 'learn' }, options);
  assert.equal(noEvidence.status, 'chat');
  assert.equal(tokenCalls, 1);
  const answer = await answerWithRag({ message: 'What is differential privacy?', intent: 'learn' }, options);
  assert.equal(answer.status, 'ok');
  assert.equal(tokenCalls, 2);
  assert.equal(model.calls[1].options.headers.authorization, 'Bearer test-access-token');
});
