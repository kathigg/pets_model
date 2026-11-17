/** Bound web citations to public HTTPS pages before they reach the chat UI. */
export function validWebSource(source) {
  if (!source || !/^web-[0-9]{1,2}$/.test(source.id || '') || source.source_role !== 'web_grounding' ||
      typeof source.title !== 'string' || !source.title.trim() || source.title.length > 180 ||
      typeof source.url !== 'string' || source.url.length > 2048) return false;
  try {
    const url = new URL(source.url);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      host.includes('.') && !/^(?:localhost|\d+\.\d+\.\d+\.\d+)$/.test(host) &&
      !/\.(?:local|internal|localhost|test)$/.test(host);
  } catch { return false; }
}
