/** Curated public MDI examples for sufficiently described use cases. */
import { nextQuestion } from './engine.mjs';
const CASES = Object.freeze({
  synthetic: {
    sourceId: 'mdi-nswers-report-utility',
    name: 'Nebraska NSWERS',
    summary: 'NSWERS tested synthetic education and workforce data; its public report emphasizes preserving relationships needed for the intended analysis.'
  },
  exactLinkage: {
    sourceId: 'mdi-dc-report-triangulation',
    name: 'D.C. ETEP',
    summary: 'ETEP used mock data and two exact private-set-intersection joins to test cross-agency education-to-workforce linkage.'
  },
  approximateLinkage: {
    sourceId: 'mdi-ar-report-probabilistic-gap',
    name: 'Arkansas ARData',
    summary: 'Arkansas tested Linkja on synthetic records. Its report warns that rule-based typo handling is not full probabilistic linkage.'
  },
  cleanRoom: {
    sourceId: 'mdi-nysed-clean-room-overview',
    name: 'NYSED',
    summary: 'NYSED and MDI tested a Snowflake clean room for hands-off, multi-agency linkage. The public overview gives no performance results.'
  }
});

export function relatedMdiCase(assessment, message = '') {
  if (!assessment || !['explore', 'review'].includes(assessment.status) || nextQuestion(assessment)) return null;
  const profile = assessment.profile || {};
  if (profile.goal === 'test' && assessment.primary.some(item => item.code === 'synthetic')) {
    return CASES.synthetic;
  }
  if (profile.goal !== 'link' || !['two', 'many'].includes(profile.holders)) return null;
  if (profile.rawMove === 'no' && /\b(?:clean\s*room|nysed)\b/i.test(message)) return CASES.cleanRoom;
  if (profile.match === 'fuzzy') return CASES.approximateLinkage;
  if (profile.match === 'exact' && profile.rawMove === 'no') return CASES.exactLinkage;
  return null;
}
