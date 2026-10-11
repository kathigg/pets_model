import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';
import { ModelBudget } from '../cloudflare/model-budget.mjs';

function budget(limit = '2') {
  const records = new Map();
  const storage = {
    transaction: async action => action({
      get: async key => records.get(key),
      put: async (key, value) => { records.set(key, value); }
    })
  };
  return new ModelBudget({ storage }, { DAILY_MODEL_LIMIT: limit });
}

test('the shared daily budget rejects further model reservations', async () => {
  const object = budget();
  const reserve = () => object.fetch(new Request('https://budget.internal/reserve', { method: 'POST' }));
  assert.equal((await reserve()).status, 204);
  assert.equal((await reserve()).status, 204);
  assert.equal((await reserve()).status, 429);
  assert.equal((await object.fetch(new Request('https://budget.internal/other', { method: 'POST' }))).status, 404);
});

test('public chat fails closed without a trusted visitor key or rate limiter', async () => {
  const url = 'https://pets-model.example/api/chat';
  const noIp = await worker.fetch(new Request(url, { method: 'POST' }), {});
  assert.equal(noIp.status, 503);
  const missingLimiter = await worker.fetch(new Request(url, {
    method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1' }
  }), {});
  assert.equal(missingLimiter.status, 503);
});

test('public chat rate limits before reading the message or calling Gemini', async () => {
  let suppliedKey;
  const response = await worker.fetch(new Request('https://pets-model.example/api/chat', {
    method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1' }
  }), {
    CHAT_RATE_LIMITER: { limit: async ({ key }) => { suppliedKey = key; return { success: false }; } },
    MODEL_BUDGET: {}
  });
  assert.equal(response.status, 429);
  assert.match(suppliedKey, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(suppliedKey, /192\.0\.2\.1/);
});
