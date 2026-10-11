/** Server-only Gemini transport. No API key or provider response is sent to the browser. */
export const DEFAULT_MODEL = 'gemini-3.8-flash';

function responseSchema(sourceIds) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      segments: {
        type: 'array', minItems: 1, maxItems: 3,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            text: { type: 'string' },
            source_ids: {
              type: 'array', minItems: 1, maxItems: 3,
              items: { type: 'string', enum: sourceIds }
            }
          },
          required: ['text', 'source_ids']
        }
      }
    },
    required: ['segments']
  };
}

export async function generateGeminiDraft(prompt, sourceIds, {
  apiKey, model = DEFAULT_MODEL, fetchImpl = fetch
} = {}) {
  if (!apiKey || typeof apiKey !== 'string') throw new Error('Missing model credential');
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/i.test(model)) throw new Error('Invalid model name');
  if (!Array.isArray(sourceIds) || !sourceIds.length) throw new Error('No source IDs');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const request = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    store: false,
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'low' },
      responseFormat: {
        text: { mimeType: 'application/json', schema: responseSchema(sourceIds) }
      }
    }
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Model request failed');
    const result = await response.json();
    const candidate = result?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Model response incomplete');
    const text = candidate?.content?.parts?.filter(part => typeof part.text === 'string').map(part => part.text).join('');
    if (!text || text.length > 16000) throw new Error('Model response missing or too long');
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}
