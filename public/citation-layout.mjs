import { answerParagraphs } from './inline-format.mjs';

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

/** Keep the model's paragraph groups while placing a citation after each sentence. */
export function citationUnits(segments) {
  return segments.flatMap((segment, index) => answerParagraphs(segment.text).flatMap((part, partIndex) => {
    const paragraph = Number.isInteger(segment.paragraph) && segment.paragraph >= 1 && segment.paragraph <= 7
      ? segment.paragraph : index + 1;
    const group = `${paragraph}:${partIndex}`;
    return [...sentenceSegmenter.segment(part)].map(item => item.segment.trim()).filter(Boolean)
      .map(text => ({ group, text, docs: segment.docs || [] }));
  }));
}
