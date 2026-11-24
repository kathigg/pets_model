/** Save the rendered answer as a small, safe element tree. Never store or restore HTML. */
const TAGS = new Set(['DIV', 'P', 'SPAN', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'A', 'BR']);
const SKIP = new Set(['answer-details', 'case-details', 'choice-list', 'search-suggestion', 'ai-note']);

function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function snapshotNode(node, budget, depth) {
  if (budget.nodes-- <= 0 || depth > 12) return null;
  if (node.nodeType === 3) {
    const text = node.textContent || '';
    if (text.length > budget.text) return null;
    budget.text -= text.length;
    return { text };
  }
  if (node.nodeType !== 1 || !TAGS.has(node.tagName)) return null;
  const classes = typeof node.className === 'string' ? node.className.split(/\s+/) : [];
  if (classes.some(name => SKIP.has(name))) return null;
  const children = [...node.childNodes].map(child => snapshotNode(child, budget, depth + 1)).filter(Boolean);
  const view = { tag: node.tagName, children };
  if (node.className && /^[a-z0-9 _-]{1,160}$/i.test(node.className)) view.className = node.className;
  if (node.tagName === 'A') {
    const href = safeUrl(node.getAttribute('href'));
    if (!href) return null;
    view.href = href;
  }
  return view;
}

export function snapshotAnswerView(container) {
  const budget = { nodes: 240, text: 12000 };
  return [...container.childNodes].map(node => snapshotNode(node, budget, 0)).filter(Boolean);
}

function restoreNode(view, doc, budget, depth) {
  if (budget.nodes-- <= 0 || depth > 12 || !view || typeof view !== 'object') return null;
  if (typeof view.text === 'string' && Object.keys(view).length === 1) {
    if (view.text.length > budget.text) return null;
    budget.text -= view.text.length;
    return doc.createTextNode(view.text);
  }
  if (typeof view.tag !== 'string' || !TAGS.has(view.tag) || !Array.isArray(view.children)) return null;
  const node = doc.createElement(view.tag.toLowerCase());
  if (typeof view.className === 'string' && /^[a-z0-9 _-]{1,160}$/i.test(view.className)) node.className = view.className;
  if (view.tag === 'A') {
    const href = safeUrl(view.href);
    if (!href) return null;
    node.href = href;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  for (const child of view.children) {
    const restored = restoreNode(child, doc, budget, depth + 1);
    if (restored) node.append(restored);
  }
  return node;
}

export function restoreAnswerView(view, doc = document) {
  if (!Array.isArray(view) || view.length > 50) return [];
  const budget = { nodes: 240, text: 12000 };
  return view.map(node => restoreNode(node, doc, budget, 0)).filter(Boolean);
}
