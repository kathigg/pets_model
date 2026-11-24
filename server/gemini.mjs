/** Server-only Vertex AI transport. No API key or provider response is sent to the browser. */
export const DEFAULT_MODEL = 'gemini-3.8-flash';

function responseSchema(sourceIds) {
  const grounded = sourceIds.length > 0;
  return {
    type: 'OBJECT',
    description: grounded ? 'A PET answer grounded in the supplied public sources, with enough detail for the question.' : 'A conversational answer with enough detail for the question.',
    properties: {
      segments: {
        type: 'ARRAY', minItems: 1, maxItems: grounded ? 16 : 7,
        items: {
          type: 'OBJECT',
          properties: {
            ...(grounded ? { paragraph: { type: 'INTEGER', minimum: 1, maximum: 7,
              description: 'Paragraph group number. Use the same number for consecutive sentences in one paragraph.' } } : {}),
            text: { type: 'STRING', description: grounded ? 'One complete factual sentence. Put its public source IDs in source_ids.' : 'One plain-language answer segment; explain complex points fully.' },
            source_ids: {
              type: 'ARRAY', minItems: grounded ? 1 : 0, maxItems: grounded ? 3 : 0,
              description: 'IDs of the supplied public sources supporting this sentence.',
              items: grounded ? { type: 'STRING', format: 'enum', enum: sourceIds } : { type: 'STRING' }
            }
          },
          propertyOrdering: grounded ? ['paragraph', 'text', 'source_ids'] : ['text', 'source_ids'],
          required: grounded ? ['paragraph', 'text', 'source_ids'] : ['text', 'source_ids']
        }
      }
    },
    required: ['segments']
  };
}

export async function generateGeminiDraft(prompt, sourceIds, {
  apiKey, accessTokenProvider, model = DEFAULT_MODEL, projectId, location = 'global', fetchImpl = fetch, onUsage, thinkingLevel
} = {}) {
  if (!apiKey && (!accessTokenProvider || !projectId)) throw new Error('Missing model credential');
  if (apiKey && typeof apiKey !== 'string') throw new Error('Invalid model credential');
  if (accessTokenProvider && typeof accessTokenProvider !== 'function') throw new Error('Invalid token provider');
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/i.test(model)) throw new Error('Invalid model name');
  if (projectId && !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('Invalid Vertex project ID');
  if (projectId && !/^(?:global|[a-z]+-[a-z]+[0-9])$/.test(location)) throw new Error('Invalid Vertex location');
  if (!Array.isArray(sourceIds)) throw new Error('Invalid source IDs');
  if (thinkingLevel !== undefined && !['LOW', 'MEDIUM', 'HIGH'].includes(thinkingLevel)) throw new Error('Invalid thinking level');
  const effort = thinkingLevel || (sourceIds.length ? 'MEDIUM' : 'LOW');
  const modelPath = `publishers/google/models/${model}:generateContent`;
  const scope = projectId ? `projects/${projectId}/locations/${location}/` : '';
  const url = `https://aiplatform.googleapis.com/v1/${scope}${modelPath}`;
  const request = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: model.startsWith('gemini-2.5-') ? { thinkingBudget: 1024 } : { thinkingLevel: effort },
      maxOutputTokens: effort === 'LOW' && !model.startsWith('gemini-2.5-') ? 4096 : 6144,
      responseMimeType: 'application/json',
      responseSchema: responseSchema(sourceIds)
    }
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const headers = { 'content-type': 'application/json' };
    if (apiKey) {
      headers['x-goog-api-key'] = apiKey;
    } else {
      const token = await accessTokenProvider();
      if (typeof token !== 'string' || !token.trim()) throw new Error('Missing model credential');
      headers.authorization = `Bearer ${token}`;
    }
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
    const result = await response.json();
    if (typeof onUsage === 'function' && result?.usageMetadata) {
      const counts = Object.fromEntries(
        ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount']
          .filter(key => Number.isSafeInteger(result.usageMetadata[key]) && result.usageMetadata[key] >= 0)
          .map(key => [key, result.usageMetadata[key]])
      );
      try { onUsage({ model, ...counts }); } catch { /* Cost telemetry never changes an answer. */ }
    }
    const candidate = result?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Model response incomplete');
    const text = candidate?.content?.parts?.filter(part => typeof part.text === 'string').map(part => part.text).join('');
    if (!text || text.length > 16000) throw new Error('Model response missing or too long');
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}
