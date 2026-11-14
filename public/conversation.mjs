import { FIELDS, assessCase, inferProfile } from './engine.mjs';

export function conversationalReply(text) {
  const message = text.trim().toLowerCase().replace(/[!?.]+$/g, '').trim();
  if (/^(?:what(?:'s| is) your name|who are you|tell me about yourself)$/.test(message)) {
    return 'I’m PETs Model. Tell me about the privacy challenge you’re working on.';
  }
  if (/^(?:what can you do|how can you help|what do you do)$/.test(message)) {
    return 'I can help you work through a data privacy use case and explore suitable PETs. What are you trying to do with the data?';
  }
  if (/^(hi|hello|hey|hi there|hello there|hey there|good morning|good afternoon|good evening)$/.test(message)) {
    return 'Hi! Tell me what you’re working on or ask me about a privacy-enhancing technology.';
  }
  if (/^(thanks|thank you|thank you so much|thx)$/.test(message)) {
    return 'You’re welcome. What else would you like to explore?';
  }
  if (/^(?:do you have|do u have|is there|who is|can you be) (?:a |the |your )?privacy (?:or legal )?reviewer$/.test(message)) {
    return 'I can explain privacy questions, but I cannot approve a data-sharing arrangement. Your organization needs to identify its authorized privacy or legal reviewer.';
  }
  return null;
}

/** Keep short follow-ups attached to the subject already under discussion. */
export function isTopicFollowup(text) {
  const message = String(text || '').trim();
  return message.length <= 160 && (
    /\b(it|its|they|them|their|that|this|those)\b/i.test(message) ||
    /^\s*(tell me more|and how|and why|elaborate|expand(?: on that)?|what (?:are|would be) (?:some )?(?:good )?examples|(?:is there|do you have) (?:a |some )?resources?)\b/i.test(message)
  );
}

export function classifyMessage(text, inferred = {}, { hasTopic = false, mode = 'learn' } = {}) {
  const message = String(text || '').trim();
  if (mode === 'learn' && hasTopic && isTopicFollowup(message)) return 'learn';
  if (/\b(plan|pilot|implement|evaluate|roll.?out|deployment|how would we build)\b/i.test(message)) return 'plan';
  if (/^\s*(what is|what are|what's the difference|what is the difference|what's (?:the )?best practice|what is (?:the )?best practice|what are (?:the )?best practices|explain|define|how does|how do|when is|when does|tell me about|compare)\b/i.test(message)
    && !/\b(we need|our (case|data|agency)|for (?:us|our)|which should we|recommend for us)\b/i.test(message)) return 'learn';
  if (Object.keys(inferred).length || /\b(recommend|choose|best|which pet|what should|our case|we need|use case)\b/i.test(message)) return 'choose';
  return 'learn';
}

/** Ask for the case facts that determine a PET choice before retrieving studies. */
export function openingUseCaseQuestion(text, profile = {}, context = []) {
  const message = String(text || '');
  const factualQuestion = /^\s*(?:what is|what are|what's (?:the )?best practice|explain|define|how does|how do|tell me about|compare)\b/i.test(message);
  if (factualQuestion || conversationalReply(message)) return null;
  const caseCue = /\b(?:i|we|my|our|us|i'm|i’d|i'd|we're|we’d|we'd)\b/i.test(message)
    && /\b(?:data|records?|information|dataset|student|school|agency|department|project|use\s*case|results?|statistics|outputs?|dashboards?)\b/i.test(message)
    && /\b(?:shar\w*|send|transfer|provide|link\w*|match\w*|analy[sz]\w*|publish\w*|releas\w*|protect\w*|secur\w*|recommend\w*|help|use)\b/i.test(message);
  const continuing = Object.keys(profile).length > 0 && context.some(turn => turn?.role === 'assistant' && /\?/.test(turn.text || ''));
  if (!caseCue && !continuing) return null;
  const assessment = assessCase(profile);
  const priority = ['goal', 'output', 'holders', 'sensitivity', 'match', 'rawMove'];
  return priority.map(field => assessment.missing.find(question => question.field === field))
    .find(question => question && profile[question.field] !== 'unknown') || null;
}

/** Map a reply to the one case question currently visible in chat. */
export function answerToCaseQuestion(question, text) {
  const field = question?.field;
  if (!Object.hasOwn(FIELDS, field)) return null;
  const answer = String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();
  const options = FIELDS[field].options;
  const exact = options.find(([value, label]) => answer === value || answer === label.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim());
  if (exact) return exact[0];
  if (/^(yes|no|not sure|unknown)\b/.test(answer)) {
    const value = answer.startsWith('not sure') || answer.startsWith('unknown') ? 'unknown' : answer.startsWith('yes') ? 'yes' : 'no';
    if (options.some(([option]) => option === value)) return value;
  }
  if (field === 'holders') {
    if (/\b(?:three|3|four|4|five|5|multiple|several)\b/.test(answer)) return 'many';
    if (/\b(?:two|2)\b/.test(answer)) return 'two';
    if (/\b(?:one|1|single)\b/.test(answer)) return 'one';
  }
  if (field === 'sensitivity') {
    if (/\b(?:not protected|non sensitive|internal but not protected)\b/.test(answer)) return 'internal';
    if (/\b(?:already public|publicly available|public data)\b/.test(answer)) return 'public';
  }
  if (field === 'rawMove') {
    if (/\b(?:must|has to|have to|needs to)\s+(?:stay|remain)\b|\b(?:cannot|can t|must not)\s+(?:move|leave|be shared)\b/.test(answer)) return 'no';
    if (/\b(?:can|may|allowed to)\s+(?:move|be shared|be transferred)\b/.test(answer)) return 'yes';
  }
  const inferred = inferProfile(text);
  return options.some(([value]) => value === inferred[field]) ? inferred[field] : null;
}
