import test from 'node:test';
import assert from 'node:assert/strict';
import corpus from '../public/data/sources.json' with { type: 'json' };
import { createIndex, retrieve } from '../public/retrieval.mjs';
import { validWebSource } from '../public/web-sources.mjs';
import { shouldResearchWeb, generateWebGroundedAnswer } from '../server/web-research.mjs';

const index = createIndex(corpus);
const route = message => shouldResearchWeb({ message, intent: 'learn', hits: retrieve(index, message, { limit: 6 }) });

test('web research handles software comparisons and unfamiliar PET terms, not routine case intake', () => {
  assert.equal(route('whats the difference between synhpop and tidy synethesis'), true);
  assert.equal(route('Compare synthpop and tidysynthesis'), true);
  assert.equal(route('What is the latest synthpop release?'), true);
  assert.equal(route('What is the difference between OpenDP and SmartNoise software?'), true);
  assert.equal(route("what's the best practice linkage variable in cross agency"), false);
  assert.equal(route('What is differential privacy?'), false);
  assert.equal(route('What does FERPA require for disclosure of student records?'), true);
  assert.equal(route('How do I share my student records with another agency?'), false);
  assert.equal(route('Search the web for our confidential meeting notes'), false);
  assert.equal(shouldResearchWeb({ message: 'Compare software for our student records', intent: 'choose', hits: [] }), false);
});

test('web source URLs reject local hosts and non-HTTPS links', () => {
  const source = { id: 'web-0', title: 'Official package docs', url: 'https://cran.r-project.org/package=synthpop', source_role: 'web_grounding' };
  assert.equal(validWebSource(source), true);
  assert.equal(validWebSource({ ...source, url: 'http://cran.r-project.org/' }), false);
  assert.equal(validWebSource({ ...source, url: 'https://localhost/private' }), false);
  assert.equal(validWebSource({ ...source, url: 'https://127.0.0.1/private' }), false);
});

test('grounded Vertex call returns only text and links backed by grounding metadata', async () => {
  let request;
  let usage;
  const answer = await generateWebGroundedAnswer('Compare synthpop and tidysynthesis', {
    projectId: 'pets-model-123', accessTokenProvider: async () => 'test-access-token',
    onUsage: value => { usage = value; },
    fetchImpl: async (url, options) => {
      request = { url, headers: options.headers, body: JSON.parse(options.body) };
      return Response.json({
        usageMetadata: { promptTokenCount: 110, candidatesTokenCount: 80, totalTokenCount: 190 },
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Unsupported lead. synthpop supports sequential synthesis. tidysynthesis has tuning controls.' }] },
          groundingMetadata: {
            webSearchQueries: ['synthpop tidysynthesis official documentation'],
            searchEntryPoint: { renderedContent: '<style>.chip{color:blue}</style><a class="chip" href="https://google.com/search?q=synthpop">Search</a>' },
            groundingChunks: [
              { web: { uri: 'https://cran.r-project.org/package=synthpop', title: 'synthpop documentation', domain: 'cran.r-project.org' } },
              { web: { uri: 'https://cran.r-project.org/package=tidysynthesis', title: 'tidysynthesis documentation', domain: 'cran.r-project.org' } }
            ],
            groundingSupports: [
              { segment: { startIndex: 18, text: 'synthpop supports sequential synthesis.' }, groundingChunkIndices: [0] },
              { segment: { startIndex: 58, text: 'tidysynthesis has tuning controls.' }, groundingChunkIndices: [1] }
            ]
          } }]
      });
    }
  });
  assert.deepEqual(answer.segments.map(segment => segment.text),
    ['synthpop supports sequential synthesis.', 'tidysynthesis has tuning controls.']);
  assert.deepEqual(answer.sources.map(source => source.id), ['web-0', 'web-1']);
  assert.equal(answer.web_suggestion_html.includes('<style>'), true);
  assert.deepEqual(request.body.tools, [{ googleSearch: {} }]);
  assert.equal(request.body.generationConfig.responseMimeType, undefined);
  assert.equal(request.headers.authorization, 'Bearer test-access-token');
  assert.deepEqual(usage, { model: 'gemini-3.5-flash', promptTokenCount: 110, candidatesTokenCount: 80, totalTokenCount: 190, webSearchQueries: 1 });
});

test('search without grounded citations fails closed', async () => {
  const answer = await generateWebGroundedAnswer('Compare packages', {
    apiKey: 'test-key',
    fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'An unsupported claim.' }] } }] })
  });
  assert.equal(answer, null);
});

test('grounding support must quote actual generated answer text', async () => {
  const answer = await generateWebGroundedAnswer('Compare packages', {
    apiKey: 'test-key',
    fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'STOP',
      content: { parts: [{ text: 'A different answer.' }] },
      groundingMetadata: {
        searchEntryPoint: { renderedContent: '<a href="https://google.com/search">Search</a>' },
        groundingChunks: [{ web: { uri: 'https://cran.r-project.org/package=synthpop', title: 'synthpop' } }],
        groundingSupports: [{ segment: { text: 'A fabricated supported sentence.' }, groundingChunkIndices: [0] }]
      }
    }] })
  });
  assert.equal(answer, null);
});
