/**
 * Quiz text layout (QC 21/10, B1/B2, contract K1). The MCQ `question` and `explanation` are plain text: a line feed
 * is a line break and a line that starts with `- ` is a list item. The explanation is the principle, then one line
 * per option ("A - …", "B - …"). Layout only: nothing in the text ever becomes markup. Old single-line quizzes give
 * one question line (bold) or one explanation line. No React, no DOM.
 */

export type QuizQuestionBlock =
  | { kind: 'line'; text: string; question: boolean }
  | { kind: 'list'; items: string[] };
export type QuizExplanationLine =
  | { kind: 'text'; text: string }
  | { kind: 'option'; letter: string; text: string; correct: boolean };

const LIST_ITEM = /^-\s+(\S.*)$/;
const OPTION_LINE = /^([A-H])\s*(?:[-–—]|[.):])\s+(\S.*)$/;

/** Non-empty lines, trimmed (CR LF and CR count as one line feed). */
function textLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
}

/** Context lines, `- ` list items, and the question: the last line, unless it is a list item. */
export function quizQuestionBlocks(text: string): QuizQuestionBlock[] {
  const blocks: QuizQuestionBlock[] = [];
  for (const line of textLines(text)) {
    const item = LIST_ITEM.exec(line), last = blocks[blocks.length - 1];
    if (item && last?.kind === 'list') last.items.push(item[1]);
    else if (item) blocks.push({ kind: 'list', items: [item[1]] });
    else blocks.push({ kind: 'line', text: line, question: false });
  }
  const last = blocks[blocks.length - 1];
  if (last?.kind === 'line') last.question = true;
  return blocks;
}

/** One entry per line; "A - …" (or "A. …", "A) …", "A: …") is the line of option A. */
export function quizExplanationLines(text: string, correctLetters: readonly string[] = []): QuizExplanationLine[] {
  return textLines(text).map(line => {
    const option = OPTION_LINE.exec(line);
    return option ? { kind: 'option', letter: option[1], text: option[2], correct: correctLetters.includes(option[1]) }
      : { kind: 'text', text: line };
  });
}

/** The letters of the correct choices, in the order the choices are shown (A, B, C, …). */
export function quizCorrectLetters(choices: readonly { correct: boolean }[]): string[] {
  return choices.flatMap((choice, index) => choice.correct && index < 26 ? [String.fromCharCode(65 + index)] : []);
}

const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** The few entities stored quiz text uses (named, decimal, hex); unknown named ones stay as written. */
export function decodeQuizEntities(value: string): string {
  return value.replace(/&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi, (all, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
    if (name) return NAMED[name.toLowerCase()] ?? all;
    const code = Number.parseInt(dec ?? hex ?? '', dec ? 10 : 16);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}

export type ProblemPlainTag = 'label' | 'p' | 'div' | 'span';
/** A stem or explanation stored as one element without markup and without attributes (`<label>…</label>` from AI ID,
 * `<p>…</p>`) or as bare text: its text and wrapper. Null when it holds markup or the element has attributes (a style,
 * a class: rich text, which the standard frame would drop on the first keystroke). */
export function problemPlainText(html: string): { tag: ProblemPlainTag | null; text: string } | null {
  const trimmed = html.trim();
  const element = /^<(label|p|div|span)>([^<]*)<\/\1\s*>$/i.exec(trimmed);
  if (element) return { tag: element[1].toLowerCase() as ProblemPlainTag, text: decodeQuizEntities(element[2]) };
  // An empty element read back from the problem XML is self-closing (`<label/>`).
  const empty = /^<(label|p|div|span)\s*\/>$/i.exec(trimmed);
  if (empty) return { tag: empty[1].toLowerCase() as ProblemPlainTag, text: '' };
  return trimmed.includes('<') ? null : { tag: null, text: decodeQuizEntities(trimmed) };
}

/**
 * Text that XML can hold. A paste from PowerPoint brings a vertical tab (U+000B) per line break, which breaks the
 * problem XML: vertical tab and form feed become line feeds, CR LF and CR become LF, and the other control characters
 * (and U+FFFE, U+FFFF, lone surrogates) are dropped. Tab and line feed stay.
 */
export function xmlSafeText(value: string): string {
  // Kept: the characters XML allows (tab, line feed, U+0020 to U+D7FF, U+E000 to U+FFFD, U+10000 and up).
  return value.replace(/\r\n?|[\v\f]/g, '\n').replace(/[^\t\n\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, '');
}

/** The plain text back in its element, cleaned for XML and escaped (the editor keeps every line feed). */
export function plainProblemHtml(tag: ProblemPlainTag, text: string): string {
  return `<${tag}>${xmlSafeText(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</${tag}>`;
}

/** Markup read back from the problem XML carries ` xmlns="…"` on its tags: removed from the tags only, so the same
 * words written in the text stay. */
export function withoutTagNamespaces(html: string): string {
  return html.replace(/<[^<>]*>/g, tag => tag.replace(/ xmlns="[^"]+"/g, ''));
}
