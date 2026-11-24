import test from 'node:test';
import assert from 'node:assert/strict';
import { answerParagraphs, inlineTokens, appendInlineFormatting } from '../public/inline-format.mjs';

test('answer paragraphs and emphasis remain structured across a save and render', () => {
  assert.deepEqual(answerParagraphs('**Synthetic data** helps testing.\n\n*Privacy* depends on the method.'),
    ['**Synthetic data** helps testing.', '*Privacy* depends on the method.']);
  assert.deepEqual(inlineTokens('**Synthetic data** helps *testing*.'), [
    { type: 'strong', children: [{ type: 'text', text: 'Synthetic data' }] },
    { type: 'text', text: ' helps ' },
    { type: 'em', children: [{ type: 'text', text: 'testing' }] },
    { type: 'text', text: '.' }
  ]);
});

test('model text is inserted as text and never parsed as HTML', () => {
  const createNode = tag => ({ tag, children: [], append(...children) { this.children.push(...children); } });
  const doc = { createElement: createNode, createTextNode: text => ({ tag: '#text', text }) };
  const parent = createNode('p');
  appendInlineFormatting(parent, '**Safe** <img src=x onerror=alert(1)>', doc);
  assert.equal(parent.children[0].tag, 'strong');
  assert.deepEqual(parent.children[1], { tag: '#text', text: ' <img src=x onerror=alert(1)>' });
});
