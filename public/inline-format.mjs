/** A tiny, text-only Markdown subset. It never interprets model output as HTML. */
export function answerParagraphs(value) {
  return String(value || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/)
    .map(part => part.trim()).filter(Boolean);
}

export function inlineTokens(value, depth = 0) {
  const text = String(value || '');
  if (depth > 2) return [{ type: 'text', text }];
  const pattern = /\*\*([^\n]+?)\*\*|__([^\n]+?)__|(?<!\*)\*([^*\n]+?)\*(?!\*)|(?<![\w_])_([^_\n]+?)_(?![\w_])/g;
  const tokens = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const inner = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (!inner?.trim() || /^\s|\s$/.test(inner)) continue;
    if (match.index > cursor) tokens.push({ type: 'text', text: text.slice(cursor, match.index) });
    tokens.push({ type: match[1] !== undefined || match[2] !== undefined ? 'strong' : 'em',
      children: inlineTokens(inner, depth + 1) });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) tokens.push({ type: 'text', text: text.slice(cursor) });
  return tokens.length ? tokens : [{ type: 'text', text }];
}

function appendTokens(parent, tokens, doc) {
  for (const token of tokens) {
    if (token.type === 'text') parent.append(doc.createTextNode(token.text));
    else {
      const element = doc.createElement(token.type === 'strong' ? 'strong' : 'em');
      appendTokens(element, token.children, doc);
      parent.append(element);
    }
  }
}

export function appendInlineFormatting(parent, value, doc = document) {
  appendTokens(parent, inlineTokens(value), doc);
}
