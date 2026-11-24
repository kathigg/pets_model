import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import scenarios from '../data/persona_scenarios.json' with { type: 'json' };
import { answerWithRag } from '../server/rag.mjs';
import { DEFAULT_MODEL } from '../server/gemini.mjs';

const selected = process.argv.slice(2);
const cases = selected.length ? scenarios.filter(item => selected.includes(item.id)) : scenarios;
if (!cases.length || cases.length > 12) throw new Error('Select 1–12 known persona IDs.');
const gcloud = process.env.GCLOUD_BIN || 'gcloud';
let accessToken;
try {
  accessToken = execFileSync(gcloud, ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 }).trim();
} catch { throw new Error('Google Cloud login is unavailable. No Vertex calls were made.'); }
if (!accessToken) throw new Error('Google Cloud login is unavailable. No Vertex calls were made.');

const outputDirectory = resolve('work');
mkdirSync(outputDirectory, { recursive: true });
const results = [];
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const introductory = Date.now() < Date.parse('2027-01-01T00:00:00Z');
const inputRate = introductory ? 0.75 / 1_000_000 : 1.5 / 1_000_000;
const outputRate = introductory ? 3.75 / 1_000_000 : 7.5 / 1_000_000;
for (const scenario of cases) {
  const usage = [];
  const answer = await answerWithRag({ message: scenario.message, intent: scenario.intent }, {
    projectId: 'mdi-yimingwu-pets', location: 'global', model: DEFAULT_MODEL,
    accessTokenProvider: async () => accessToken,
    onUsage: event => usage.push(event)
  });
  const record = {
    id: scenario.id, persona: scenario.persona, question: scenario.message, expect: scenario.expect,
    status: answer.status, reason: answer.reason || '', followup: answer.followup?.text || '',
    answer: answer.segments.map(segment => segment.text).join('\n\n'),
    sources: answer.sources.map(source => ({ title: source.title, url: source.url, id: source.id })),
    usage
  };
  results.push(record);
  const tokenCost = usage.reduce((sum, event) => sum +
    (event.promptTokenCount || 0) * inputRate +
    ((event.candidatesTokenCount || 0) + (event.thoughtsTokenCount || 0)) * outputRate, 0);
  const groundingUpperBound = usage.reduce((sum, event) => sum + (event.webSearchQueries || 0) * 0.014, 0);
  const row = [new Date().toISOString(), 'Vertex AI Gemini', `persona evaluation: ${scenario.id}`,
    DEFAULT_MODEL, `${usage.length} call; ${usage.reduce((n, x) => n + (x.promptTokenCount || 0), 0)} prompt; ${usage.reduce((n, x) => n + (x.candidatesTokenCount || 0), 0)} response; ${usage.reduce((n, x) => n + (x.thoughtsTokenCount || 0), 0)} thinking; ${usage.reduce((n, x) => n + (x.webSearchQueries || 0), 0)} web queries`,
    (tokenCost + groundingUpperBound).toFixed(6), '', answer.status,
    'Conservative estimate includes all search queries at paid rate; actual billing and free grounding allowance pending'];
  appendFileSync(resolve(outputDirectory, 'cloud-cost-log.csv'), row.map(csv).join(',') + '\n');
  console.log(`${scenario.id}: ${answer.status}; ${answer.segments.length} segments; ${answer.sources.length} sources; ${usage.length} paid calls`);
}

const path = resolve(outputDirectory, `persona-evaluation-${new Date().toISOString().replaceAll(':', '-')}.json`);
writeFileSync(path, JSON.stringify(results, null, 2) + '\n');
console.log(`Saved local results: ${path}`);
