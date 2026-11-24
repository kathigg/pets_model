import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHistory, saveHistory, clearHistory } from '../public/history.mjs';
import { matchingWords, sourceNoteExcerpt } from '../public/evidence-notes.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('chat history survives a reload and can be cleared locally', () => {
  const storage = memoryStorage();
  assert.equal(saveHistory(storage, { activeId: 'one', chats: [{
    id: 'one', title: 'Link records', updatedAt: '2026-11-03T00:00:00Z', profile: { goal: 'link' },
    mode: 'choose', lastTopicQuery: 'Link records', pendingField: 'holders', messages: [
      { role: 'user', text: 'Link records', sources: [] },
      { role: 'assistant', text: 'Consider PPRL.',
        answerTitle: 'A possible approach',
        answerSegments: [{ text: '**Consider PPRL.**', source_ids: ['nih-pprl-fuzzy'] }],
        sources: [{ id: 'nih-pprl-fuzzy', url: 'https://example.org' }] }
    ]
  }] }), true);
  const restored = loadHistory(storage);
  assert.equal(restored.activeId, 'one');
  assert.equal(restored.chats[0].messages[1].sources[0].id, 'nih-pprl-fuzzy');
  assert.deepEqual(restored.chats[0].messages[1].answerSegments,
    [{ text: '**Consider PPRL.**', source_ids: ['nih-pprl-fuzzy'] }]);
  assert.equal(restored.chats[0].messages[1].answerTitle, 'A possible approach');
  assert.equal(restored.chats[0].pendingField, 'holders');
  clearHistory(storage);
  assert.deepEqual(loadHistory(storage), { activeId: null, chats: [] });
});

test('corrupt or blocked browser storage leaves chat usable', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadHistory(broken), { activeId: null, chats: [] });
  assert.equal(saveHistory(broken, { activeId: 'one', chats: [] }), false);
});

test('reload retains every cited web source in a multi-paragraph answer', () => {
  const storage = memoryStorage();
  const sources = Array.from({ length: 12 }, (_, index) => ({
    id: `web-${index}`, url: `https://example.org/source-${index}`, source_role: 'web_grounding'
  }));
  const answerSegments = sources.map((source, index) => ({
    text: `Sentence ${index + 1}.`, paragraph: Math.floor(index / 2) + 1, source_ids: [source.id]
  }));
  saveHistory(storage, { activeId: 'web', chats: [{
    id: 'web', title: 'Sources', messages: [{ role: 'assistant', text: 'Answer.', sources,
      answerSegments }]
  }] });
  const restored = loadHistory(storage).chats[0].messages[0];
  assert.equal(restored.sources.length, 12);
  assert.deepEqual(restored.answerSegments, answerSegments);
});

test('evidence excerpt quotes the matching draft note sentence exactly', () => {
  const note = 'Private set intersection compares sets. Differential privacy limits information about individuals in aggregate releases.';
  const excerpt = sourceNoteExcerpt(note, 'How does differential privacy help?');
  assert.equal(excerpt, 'Differential privacy limits information about individuals in aggregate releases.');
  assert.deepEqual(matchingWords('How does differential privacy help?', note), ['differential', 'privacy']);
  assert.equal(sourceNoteExcerpt('The D.C. pilot tested PSI with mock records. It reported caveats.', 'PSI in D.C.?'),
    'The D.C. pilot tested PSI with mock records.');
});
