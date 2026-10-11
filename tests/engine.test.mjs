import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCase, cleanProfile, inferProfile, nextQuestion } from '../public/engine.mjs';

const codes = xs => xs.map(x => x.code);

test('case profile ignores inherited property names in submitted JSON', () => {
  const profile = JSON.parse('{"constructor":"x","__proto__":"y","goal":"link"}');
  assert.deepEqual(cleanProfile(profile), { goal: 'link' });
});

test('fuzzy cross-agency linkage returns layered design and rejects exact hashing alone', () => {
  const result = assessCase({ goal: 'link', holders: 'many', rawMove: 'no', match: 'fuzzy', output: 'aggregate', repeated: 'yes', sensitivity: 'protected', capacity: 'medium', authority: 'yes' });
  assert.ok(codes(result.primary).includes('pprl'));
  assert.ok(codes(result.complementary).includes('mpc'));
  assert.ok(codes(result.complementary).includes('dp'));
  assert.ok(codes(result.complementary).includes('governance'));
  assert.ok(result.avoid.some(x => x.code === 'secure-hashing'));
  assert.equal(result.status, 'review');
});

test('exact linkage can compare PSI but does not silently treat hashes as anonymous', () => {
  const result = assessCase({ goal: 'link', holders: 'two', rawMove: 'no', match: 'exact', output: 'rows', sensitivity: 'protected', capacity: 'high', authority: 'yes' });
  assert.ok(codes(result.primary).includes('secure-hashing'));
  assert.ok(codes(result.alternatives).includes('psi'));
  assert.match(result.primary[0].caveat, /not anonymization/i);
});

test('no authority for protected records stops a technical recommendation', () => {
  const result = assessCase({ goal: 'link', holders: 'two', rawMove: 'no', match: 'exact', sensitivity: 'protected', authority: 'no' });
  assert.equal(result.status, 'escalate');
  assert.equal(result.primary.length, 0);
  assert.equal(nextQuestion(result), null);
});

test('unknown and missing authority keep protected cases out of recommendations', () => {
  const profile = { goal: 'link', holders: 'two', rawMove: 'no', match: 'exact', output: 'aggregate', repeated: 'no', sensitivity: 'protected', capacity: 'high' };
  for (const authority of [undefined, 'unknown']) {
    const result = assessCase({ ...profile, authority });
    assert.equal(result.status, 'escalate');
    assert.equal(result.primary.length, 0);
    assert.ok(result.missing.some(x => x.field === 'authority'));
  }
  assert.equal(nextQuestion(assessCase(profile))?.field, 'authority');
  assert.equal(nextQuestion(assessCase({ ...profile, authority: 'unknown' })), null);
});

test('unknown constraints cannot count as complete or expert-ready', () => {
  const result = assessCase({ goal: 'link', holders: 'two', rawMove: 'unknown', match: 'unknown', output: 'aggregate', repeated: 'unknown', sensitivity: 'internal', capacity: 'high' });
  assert.notEqual(result.status, 'review');
  assert.ok(result.missing.some(x => x.field === 'rawMove'));
  assert.ok(result.missing.some(x => x.field === 'match'));
});

test('negation and aggregate-only sharing do not imply permission for raw data', () => {
  const facts = inferProfile('Legal review is not approved. We can share aggregate statistics only, but raw student records cannot move.');
  assert.equal(facts.authority, 'no');
  assert.equal(facts.rawMove, 'no');
  assert.equal(facts.output, 'aggregate');
  const aggregate = inferProfile('We can share aggregate statistics with two agencies.');
  assert.equal(aggregate.rawMove, undefined);
});

test('publishing direct student identifiers pauses the recommendation', () => {
  const facts = inferProfile('Can I publish student names in a public dashboard?');
  assert.equal(facts.directRelease, 'yes');
  assert.equal(facts.output, 'rows');
  const result = assessCase({ ...facts, authority: 'yes', capacity: 'high', holders: 'one' });
  assert.equal(result.status, 'escalate');
  assert.equal(result.primary.length, 0);
  assert.equal(nextQuestion(result), null);
});

test('controlled rows and aggregate release can form separate architecture layers', () => {
  const facts = inferProfile('We need linked row-level student records in an enclave and aggregate dashboard reports from two agencies. Raw records can move after an approved legal review.');
  assert.equal(facts.rowAccess, 'yes');
  assert.equal(facts.output, 'aggregate');
  const result = assessCase({ ...facts, match: 'exact', repeated: 'no', sensitivity: 'protected', capacity: 'high', authority: 'yes' });
  assert.ok(codes(result.complementary).includes('tre'));
  assert.ok(codes(result.complementary).includes('dp'));
});

test('incomplete use case asks a clarifying question', () => {
  const result = assessCase({ holders: 'many' });
  assert.equal(result.status, 'insufficient');
  assert.equal(nextQuestion(result)?.field, 'goal');
});

test('test-data route never claims synthetic records are intrinsically private', () => {
  const result = assessCase({ goal: 'test', holders: 'one', sensitivity: 'protected', capacity: 'medium', authority: 'yes' });
  assert.ok(codes(result.primary).includes('synthetic'));
  assert.ok(codes(result.complementary).includes('dp'));
  assert.ok(result.avoid.some(x => /not infer.*private/i.test(x.reason)));
});

test('natural-language intake keeps unknowns unknown and captures explicit constraints', () => {
  const facts = inferProfile('Three agencies need fuzzy linkage. Identifiers cannot move and only aggregate results may leave. Analyses repeat monthly.');
  assert.equal(facts.goal, 'link');
  assert.equal(facts.holders, 'many');
  assert.equal(facts.match, 'fuzzy');
  assert.equal(facts.rawMove, 'no');
  assert.equal(facts.output, 'aggregate');
  assert.equal(facts.repeated, 'yes');
  assert.equal(facts.authority, undefined);
  assert.equal(inferProfile('Two education agencies need to link student records.').holders, 'two');
});
