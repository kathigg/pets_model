import test from 'node:test';
import assert from 'node:assert/strict';
import corpus from '../public/data/sources.json' with { type: 'json' };
import { createIndex, retrieve } from '../public/retrieval.mjs';
import { validWebSource } from '../public/web-sources.mjs';
import { canResearchWeb, shouldResearchWeb, generateWebGroundedAnswer } from '../server/web-research.mjs';

const index = createIndex(corpus);
const route = message => shouldResearchWeb({ message, intent: 'learn', hits: retrieve(index, message, { limit: 6 }) });

test('web research handles software comparisons and unfamiliar PET terms, not routine case intake', () => {
  assert.equal(route('whats the difference between synhpop and tidy synethesis'), true);
  assert.equal(route('Compare synthpop and tidysynthesis'), true);
  assert.equal(route('What is synthpop?'), true);
  assert.equal(route('can you explain what sythetic data is'), false);
  assert.equal(route('what is synthetic data'), false);
  assert.equal(route('What is private set intersection?'), false);
  assert.equal(route('What is secure multiparty computation?'), false);
  assert.equal(route('What is homomorphic encryption?'), false);
  assert.equal(route('What is pseudonymization?'), true);
  assert.equal(route('What is the best practice linkage variable in cross agency?'), false);
  assert.equal(route('What is k-anoymity?'), true);
  assert.equal(route("what's ur mom"), false);
  assert.equal(route('can you search the internet to see what papaparse is?'), true);
  assert.equal(route('What is differential privacy?'), false);
  assert.equal(route('What is the latest synthpop release?'), true);
  assert.equal(route('What is the difference between OpenDP and SmartNoise software?'), true);
  assert.equal(route("what's the best practice linkage variable in cross agency"), false);
  assert.equal(route('What does FERPA require for disclosure of student records?'), true);
  assert.equal(route('Who are researchers or organizations currently working on developing new PETs techniques?'), true);
  assert.equal(route('How do I share my student records with another agency?'), false);
  assert.equal(route('Search the web for our confidential meeting notes'), false);
  assert.equal(shouldResearchWeb({ message: 'Compare software for our student records', intent: 'choose', hits: [] }), false);
  assert.equal(canResearchWeb({ message: 'What is differential privacy?', topic: 'Our confidential student file', intent: 'learn' }), false);
  assert.equal(canResearchWeb({ message: 'elaborate', topic: 'synthetic data', intent: 'learn',
    context: [{ role: 'user', text: 'Our confidential dataset needs a synthesis tool.' }] }), false);
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
    previousAnswer: 'The first answer covered the basic distinction.',
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
  assert.match(request.body.contents[0].parts[0].text, /Match the visitor's level/);
  assert.match(request.body.contents[0].parts[0].text, /Synthetic data are not automatically anonymous or safe to release/);
  assert.match(request.body.contents[0].parts[0].text, /Prior assistant answer, for follow-up context only and not as evidence/);
  assert.equal(request.body.generationConfig.responseMimeType, undefined);
  assert.equal(request.headers.authorization, 'Bearer test-access-token');
  assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
  assert.equal(request.body.generationConfig.maxOutputTokens, 4096);
  assert.deepEqual(usage, { model: 'gemini-3.8-flash', promptTokenCount: 110, candidatesTokenCount: 80, totalTokenCount: 190, webSearchQueries: 1 });
});

test('search without grounded citations fails closed', async () => {
  const answer = await generateWebGroundedAnswer('Compare packages', {
    apiKey: 'test-key',
    fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'An unsupported claim.' }] } }] })
  });
  assert.equal(answer, null);
});

test('longer grounded answers retain consecutive supported points', async () => {
  const points = Array.from({ length: 6 }, (_, i) => `Supported explanation ${i + 1} gives a useful detail.`);
  const answer = await generateWebGroundedAnswer('Explain synthetic data in detail', {
    apiKey: 'test-key',
    fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'STOP',
      content: { parts: [{ text: points.join(' ') }] },
      groundingMetadata: {
        searchEntryPoint: { renderedContent: '<a href="https://google.com/search">Search</a>' },
        groundingChunks: [{ web: { uri: 'https://www.nist.gov/', title: 'NIST' } }],
        groundingSupports: points.map((text, i) => ({ segment: { startIndex: i * 50, text }, groundingChunkIndices: [0] }))
      }
    }] })
  });
  assert.equal(answer.segments.length, 6);
  assert.deepEqual(answer.segments.map(segment => segment.text), points);
  assert.ok(answer.segments.every(segment => segment.source_ids[0] === 'web-0'));
});

test('grounded answer retains punctuation and paragraph breaks around cited spans', async () => {
  const answer = await generateWebGroundedAnswer('Explain synthetic data', {
    apiKey: 'test-key',
    fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'STOP',
      content: { parts: [{ text: '**Synthetic data** is generated from real data.\n\nIt helps testing, but privacy is not automatic.' }] },
      groundingMetadata: {
        searchEntryPoint: { renderedContent: '<a href="https://google.com/search">Search</a>' },
        groundingChunks: [{ web: { uri: 'https://www.nist.gov/', title: 'NIST' } }],
        groundingSupports: [
          { segment: { startIndex: 0, text: '**Synthetic data** is generated from real data' }, groundingChunkIndices: [0] },
          { segment: { startIndex: 51, text: 'It helps testing, but privacy is not automatic' }, groundingChunkIndices: [0] }
        ]
      }
    }] })
  });
  assert.deepEqual(answer.segments.map(segment => segment.text), [
    '**Synthetic data** is generated from real data.',
    'It helps testing, but privacy is not automatic.'
  ]);
  assert.deepEqual(answer.segments.map(segment => segment.source_ids), [['web-0'], ['web-0']]);
  assert.deepEqual(answer.segments.map(segment => segment.paragraph), [1, 2]);
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
