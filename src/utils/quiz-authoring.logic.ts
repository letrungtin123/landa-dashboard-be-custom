import { decodeQuizEntities, problemPlainText, quizCorrectLetters, type ProblemPlainTag } from './quiz-text.logic';

/**
 * Writing a quiz by hand in the AI ID format (owner decision 22/10): the stem is plain text with "- " list lines and
 * the question last; the explanation is the principle, then "A - Đúng/Sai vì …" per option. Pure rules for the text
 * field: add a list line, build the explanation template, soft checks, and the switches between the standard frame
 * and the rich editor. No React, no DOM.
 */

const LETTERS = 'ABCDEFGH';
const letter = (index: number) => LETTERS[index] ?? '';
type Choices = readonly { correct: boolean }[];

/** A new "- " line after the last list line, or before the question (the last line) when there is no list yet.
 * `caret` is where the author types next: the end of the new "- ". */
export function insertQuizListItem(text: string): { text: string; caret: number } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let at = -1;
  for (let i = lines.length - 1; i >= 0 && at < 0; i--) if (/^\s*-(\s|$)/.test(lines[i])) at = i + 1;
  if (at < 0) for (let i = lines.length - 1; i >= 0 && at < 0; i--) if (lines[i].trim()) at = i;
  if (at < 0) return { text: '- ', caret: 2 };
  lines.splice(at, 0, '- ');
  return { text: lines.join('\n'), caret: lines.slice(0, at + 1).join('\n').length };
}

/** The words of the template, in the language the quiz is written in. */
export const QUIZ_TEMPLATE_WORDS = {
  vi: { principle: 'Nguyên tắc: ', correct: 'Đúng vì ', wrong: 'Sai vì ', answer: 'Đáp án đúng vì ' },
  en: { principle: 'Principle: ', correct: 'Correct because ', wrong: 'Wrong because ', answer: 'The correct answer is right because ' },
} as const;

/** "Nguyên tắc: " then one line per choice in order ("A - Đúng vì " / "B - Sai vì "); a typed answer
 * (number or text) gets "Đáp án đúng vì ". `choices` null means a typed answer. */
export function quizExplanationTemplate(choices: Choices | null, locale: 'vi' | 'en'): string {
  const words = QUIZ_TEMPLATE_WORDS[locale];
  if (!choices) return `${words.principle}\n${words.answer}`;
  return [words.principle, ...choices.slice(0, LETTERS.length)
    .map((choice, index) => `${letter(index)} - ${choice.correct ? words.correct : words.wrong}`)].join('\n');
}

export type QuizExplanationCheck =
  | { kind: 'extra'; letters: string[] }
  | { kind: 'missing'; letters: string[] }
  | { kind: 'says_correct'; letter: string; correct: string[] }
  | { kind: 'says_wrong'; letter: string }
  | { kind: 'no_reason'; letter: string };

/** An option line, even still empty ("A -"): the letter, then a dash, ".", ")" or ":" and a space. */
const CHECK_LINE = /^([A-H])\s*(?:[-–—]|[.):])(?:\s+(.*))?$/u;
const VERDICT = /^(đúng|sai|correct|incorrect|right|wrong)(?=$|[\s,.:;!–—-])/iu;
const CONNECTIVE = /^[\s,.:;–—-]*(?:(?:bởi\s+)?vì|do|because|since)?[\s,.:;–—-]*/iu;

/** Soft checks of an explanation against the choices; they never block saving. Only when the explanation has option
 * lines at all (a free explanation is fine), and only for choice questions. */
export function quizExplanationChecks(text: string, choices: Choices | null): QuizExplanationCheck[] {
  if (!choices) return [];
  const options = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n').map(line => CHECK_LINE.exec(line.trim()))
    .filter((match): match is RegExpExecArray => !!match).map(match => ({ letter: match[1], rest: (match[2] ?? '').trim() }));
  if (!options.length) return [];
  const expected = choices.slice(0, LETTERS.length).map((_, index) => letter(index));
  const seen = [...new Set(options.map(option => option.letter))];
  const checks: QuizExplanationCheck[] = [];
  const extra = seen.filter(value => !expected.includes(value)).sort();
  const missing = expected.filter(value => !seen.includes(value));
  if (extra.length) checks.push({ kind: 'extra', letters: extra });
  if (missing.length) checks.push({ kind: 'missing', letters: missing });
  const correct = quizCorrectLetters(choices);
  for (const option of options) {
    const index = expected.indexOf(option.letter);
    if (index < 0) continue;
    const verdict = VERDICT.exec(option.rest)?.[1].toLowerCase() ?? null;
    if ((verdict === 'đúng' || verdict === 'correct' || verdict === 'right') && !choices[index].correct) {
      checks.push({ kind: 'says_correct', letter: option.letter, correct });
    } else if ((verdict === 'sai' || verdict === 'incorrect' || verdict === 'wrong') && choices[index].correct) {
      checks.push({ kind: 'says_wrong', letter: option.letter });
    }
    const reason = (verdict ? option.rest.slice(verdict.length) : option.rest).replace(CONNECTIVE, '').trim();
    if (!reason) checks.push({ kind: 'no_reason', letter: option.letter });
  }
  return checks;
}

/** How a stored stem or explanation opens: plain text in the standard frame (in its own element), anything with
 * markup in the rich editor, untouched until the author converts it. */
export type QuizFieldMode = { mode: 'plain'; tag: ProblemPlainTag; text: string } | { mode: 'rich' };
export function quizFieldFromHtml(html: string, fallback: ProblemPlainTag): QuizFieldMode {
  const plain = problemPlainText(html);
  return plain ? { mode: 'plain', tag: plain.tag ?? fallback, text: plain.text } : { mode: 'rich' };
}

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Standard frame -> free editing: every non-empty line becomes a paragraph, the text is kept. */
export function plainQuizTextToRichHtml(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean).map(line => `<p>${escapeText(line)}</p>`).join('');
}

export type QuizConversionLoss = 'images' | 'formulas' | 'links' | 'formatting' | 'tables';
const BLOCK_TAGS = new Set(['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'label', 'section',
  'article', 'header', 'footer', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'hr']);
const MEDIA_TAGS = new Set(['img', 'picture', 'svg', 'video', 'audio', 'iframe', 'embed', 'object', 'canvas', 'source']);
const FORMAT_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark', 'sub', 'sup', 'code', 'small', 'big',
  'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']);
const TABLE_TAGS = new Set(['table', 'tr', 'td', 'th']);
const SKIP_TAGS = new Set(['script', 'style', 'template']);
const FORMULA_TEXT = /\\\(|\\\[|\$\$|\[mathjax/i;
/** One clear "A. …" / "A) …" / "A: …" / "A – …" option line. */
const LETTER_LINE = /^([A-H])\s*(?:[.):]|[-–—])\s+(\S.*)$/u;

/**
 * Rich editor -> standard frame: paragraphs, headings and line breaks become lines, list items become "- " lines,
 * and text is kept as text. In an explanation, "A. …" lines become "A - …" only when they clearly are the options
 * (two or more, lettered A, B, C … in order). `losses` says what the plain text cannot keep, for the warning.
 */
export function richQuizHtmlToText(html: string, kind: 'question' | 'explanation'): { text: string; losses: QuizConversionLoss[] } {
  const losses = new Set<QuizConversionLoss>();
  const lines: string[] = [];
  let content = '', prefix = '', preDepth = 0, skip: string | null = null;
  const flush = () => {
    const line = content.replace(/\s+/g, ' ').trim();
    if (line) { lines.push(prefix + line); prefix = ''; }
    content = '';
  };
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const token of source.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^<>]*)>|([^<]+)|(<)/g)) {
    const [, closing, rawName, attributes, text, stray] = token;
    if (skip) { if (closing && rawName?.toLowerCase() === skip) skip = null; continue; }
    if (text !== undefined || stray !== undefined) {
      const value = decodeQuizEntities(text ?? stray!);
      if (FORMULA_TEXT.test(value)) losses.add('formulas');
      if (preDepth > 0) {
        const parts = value.replace(/\r\n?/g, '\n').split('\n');
        parts.forEach((part, index) => { if (index) flush(); content += part; });
      } else content += value;
      continue;
    }
    const name = rawName.toLowerCase();
    if (!closing && SKIP_TAGS.has(name) && !/\/\s*$/.test(attributes)) { skip = name; continue; }
    if (MEDIA_TAGS.has(name)) losses.add('images');
    if (name === 'math' || name.startsWith('m:')) losses.add('formulas');
    if (name === 'a' && /\bhref\s*=/i.test(attributes)) losses.add('links');
    if (FORMAT_TAGS.has(name) || /\bstyle\s*=/i.test(attributes)) losses.add('formatting');
    if (TABLE_TAGS.has(name)) losses.add('tables');
    if (name === 'pre') preDepth = Math.max(0, preDepth + (closing ? -1 : 1));
    if (name === 'br') { flush(); continue; }
    if (name === 'li' && !closing) { flush(); prefix = '- '; continue; }
    if (BLOCK_TAGS.has(name)) { flush(); if (closing && name === 'li') prefix = ''; }
  }
  flush();
  let result = lines;
  if (kind === 'explanation') {
    const options = lines.map(line => LETTER_LINE.exec(line));
    const found = options.filter((match): match is RegExpExecArray => !!match);
    if (found.length >= 2 && found.every((match, index) => match[1] === letter(index))) {
      result = lines.map((line, index) => options[index] ? `${options[index]![1]} - ${options[index]![2]}` : line);
    }
  }
  return { text: result.join('\n'), losses: [...losses] };
}
