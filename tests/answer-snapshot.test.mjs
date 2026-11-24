import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotAnswerView, restoreAnswerView } from '../public/answer-snapshot.mjs';
import { saveHistory, loadHistory } from '../public/history.mjs';

class Node {
  constructor(tag = '', text = '') {
    this.nodeType = tag ? 1 : 3;
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.className = '';
    this.value = text;
  }
  append(...nodes) { this.childNodes.push(...nodes); }
  get textContent() { return this.nodeType === 3 ? this.value : this.childNodes.map(node => node.textContent).join(''); }
  getAttribute(name) { return name === 'href' ? this.href : null; }
}
const doc = { createElement: tag => new Node(tag), createTextNode: text => new Node('', text) };

test('a saved rendered answer restores punctuation, emphasis, and inline source position', () => {
  const bubble = doc.createElement('div');
  const answer = doc.createElement('div'); answer.className = 'answer';
  const paragraph = doc.createElement('p'); paragraph.className = 'source-answer';
  const bold = doc.createElement('strong'); bold.append(doc.createTextNode('Synthetic data'));
  const link = doc.createElement('a'); link.className = 'inline-citation';
  link.href = 'https://www.nist.gov/example'; link.append(doc.createTextNode('NIST ↗'));
  paragraph.append(bold, doc.createTextNode(' can help with testing. '), link);
  answer.append(paragraph);
  const second = doc.createElement('p'); second.className = 'source-answer';
  second.append(doc.createTextNode('Privacy is not automatic.'));
  answer.append(second);
  const why = doc.createElement('details'); why.append(doc.createTextNode('Why this answer'));
  answer.append(why);
  bubble.append(answer);

  const view = snapshotAnswerView(bubble);
  const memory = new Map();
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  saveHistory(storage, { activeId: 'one', chats: [{ id: 'one', title: 'Synthetic data', messages: [
    { role: 'assistant', text: 'Synthetic data can help with testing. Privacy is not automatic.', answerView: view }
  ] }] });
  const restored = restoreAnswerView(loadHistory(storage).chats[0].messages[0].answerView, doc);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].childNodes.map(node => node.tagName), ['P', 'P']);
  assert.deepEqual(restored[0].childNodes[0].childNodes.map(node => node.tagName), ['STRONG', '', 'A']);
  assert.equal(restored[0].childNodes[0].textContent, 'Synthetic data can help with testing. NIST ↗');
  assert.equal(restored[0].childNodes[1].textContent, 'Privacy is not automatic.');
  assert.equal(restored[0].childNodes[0].childNodes[2].href, 'https://www.nist.gov/example');
});

test('a tampered saved answer cannot inject HTML or an unsafe link', () => {
  const view = [{ tag: 'DIV', children: [
    { text: '<img src=x onerror=alert(1)>' },
    { tag: 'SCRIPT', children: [{ text: 'alert(1)' }] },
    { tag: 'A', href: 'javascript:alert(1)', children: [{ text: 'click' }] }
  ] }];
  const restored = restoreAnswerView(view, doc);
  assert.equal(restored[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(restored[0].childNodes.length, 1);
});
