import { handleChatRequest } from '../server/http.mjs';
export { ModelBudget } from './model-budget.mjs';

function json(body, status) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

async function visitorKey(request) {
  // Cloudflare supplies this header at the edge. Hash it before using a limiter key.
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function reserveModelCall(env) {
  const id = env.MODEL_BUDGET.idFromName('pets-model-global');
  const stub = env.MODEL_BUDGET.get(id);
  const response = await stub.fetch('https://budget.internal/reserve', { method: 'POST' });
  return response.ok;
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/chat') return json({ error: 'Not found.' }, 404);
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const key = await visitorKey(request);
    if (!key || !env.CHAT_RATE_LIMITER || !env.MODEL_BUDGET) {
      return json({ status: 'unavailable', segments: [], sources: [], reason: 'host_unavailable' }, 503);
    }
    const { success } = await env.CHAT_RATE_LIMITER.limit({ key });
    if (!success) return json({ error: 'Please wait before trying again.' }, 429);
    return handleChatRequest(request, {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || undefined,
      projectId: env.VERTEX_PROJECT_ID || undefined,
      location: env.VERTEX_LOCATION || undefined,
      requireIdentity: false,
      rateKey: key,
      reserveModelCall: () => reserveModelCall(env)
    });
  }
};
