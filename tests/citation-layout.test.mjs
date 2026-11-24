import test from 'node:test';
import assert from 'node:assert/strict';
import { citationUnits } from '../public/citation-layout.mjs';

test('each supported sentence keeps its own source within a shared paragraph', () => {
  const first = { id: 'nist' };
  const second = { id: 'ieee' };
  const units = citationUnits([
    { paragraph: 1, text: 'Encryption protects the input.', docs: [first] },
    { paragraph: 1, text: 'The output still needs review.', docs: [second] },
    { paragraph: 2, text: 'A separate option is available.', docs: [first] }
  ]);
  assert.deepEqual(units.map(unit => [unit.group, unit.text, unit.docs[0].id]), [
    ['1:0', 'Encryption protects the input.', 'nist'],
    ['1:0', 'The output still needs review.', 'ieee'],
    ['2:0', 'A separate option is available.', 'nist']
  ]);
});

test('a legacy multi-sentence segment gets a citation after each sentence', () => {
  const units = citationUnits([{ text: '**Synthetic data** can aid testing. It is not automatically anonymous.',
    docs: [{ id: 'ico' }] }]);
  assert.deepEqual(units.map(unit => unit.text), [
    '**Synthetic data** can aid testing.', 'It is not automatically anonymous.'
  ]);
  assert.deepEqual(units.map(unit => unit.group), ['1:0', '1:0']);
});
