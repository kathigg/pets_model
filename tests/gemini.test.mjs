import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiDraft } from '../server/gemini.mjs';

test('Gemini request uses structured citations and low thinking without exposing the key in the URL', async () => {
  let request;
  const draft = await generateGeminiDraft('Public evidence prompt', ['source-one'], {
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{
          text: JSON.stringify({ segments: [{ text: 'A short answer.', source_ids: ['source-one'] }] })
        }] } }]
      });
    }
  });
  assert.deepEqual(draft.segments[0].source_ids, ['source-one']);
  assert.equal(request.options.headers['x-goog-api-key'], 'test-key');
  assert.doesNotMatch(request.url, /test-key/);
  assert.equal(request.body.store, false);
  assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.equal(request.body.generationConfig.temperature, undefined);
  assert.equal(request.body.generationConfig.maxOutputTokens, undefined);
  assert.deepEqual(
    request.body.generationConfig.responseFormat.text.schema.properties.segments.items.properties.source_ids.items.enum,
    ['source-one']
  );
});
