import { env } from 'cloudflare:workers';
import { handleChatRequest } from '../../../server/http.mjs';

export async function POST(request) {
  return handleChatRequest(request, {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || undefined,
    projectId: env.VERTEX_PROJECT_ID || undefined,
    location: env.VERTEX_LOCATION || undefined,
    requireIdentity: !import.meta.env.DEV
  });
}
