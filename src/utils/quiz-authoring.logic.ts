import {
  decodeQuizEntities, problemPlainText, quizCorrectLetters, quizExplanationLines, quizQuestionBlocks, type ProblemPlainTag,
} from './quiz-text.logic';

/**
 * Writing a quiz by hand in the AI ID format (owner decision 22/10): the stem is plain text with "- " list lines and
 * the question last; the explanation is the principle, then "A - Đúng/Sai vì …" per option. Pure rules for the text
 * field: add a list line, build the explanation template, soft checks, and the switches between the standard frame
 * and the rich editor. No React; the conversion uses the browser's DOMParser when there is one.
 */

const LETTERS = 'ABCDEFGH';
/** The standard frame explains options A to H, as the learner screen reads them. */
export const QUIZ_FRAME_MAX_OPTIONS = LETTERS.length;
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

/** "Nguyên tắc: " then one line per choice in order ("A - Đúng vì " / "B - Sai vì "), options A to H; a typed answer
 * (number or text) gets "Đáp án đúng vì ". `choices` null means a typed answer. */
export function quizExplanationTemplate(choices: Choices | null, locale: 'vi' | 'en'): string {
  const words = QUIZ_TEMPLATE_WORDS[locale];
  if (!choices) return `${words.principle}\n${words.answer}`;
  return [words.principle, ...choices.slice(0, LETTERS.length)
    .map((choice, index) => `${letter(index)} - ${choice.correct ? words.correct : words.wrong}`)].join('\n');
}

/** More choices than the standard frame explains: how many, and the positions (1-based) of correct ones it leaves
 * out, so they are named instead of being dropped from the checks. Null when the frame covers every choice. */
export function quizChoiceLimit(choices: Choices | null): { count: number; correctBeyond: number[] } | null {
  if (!choices || choices.length <= LETTERS.length) return null;
  return { count: choices.length, correctBeyond: choices.flatMap((choice, index) => choice.correct && index >= LETTERS.length ? [index + 1] : []) };
}

export type QuizExplanationCheck =
  | { kind: 'extra'; letters: string[] }
  | { kind: 'missing'; letters: string[] }
  | { kind: 'says_correct'; letter: string; correct: string[] }
  | { kind: 'says_wrong'; letter: string }
  | { kind: 'no_reason'; letter: string };

/** An option line, even still empty ("A -"): the letter, then a dash, ".", ")" or ":" and a space. */
const CHECK_LINE = /^([A-H])\s*(?:[-–—]|[.):])(?:\s+(.*))?$/u;
/** "Đúng một phần" / "partly correct" is no verdict; "không đúng" / "chưa đúng" / "not correct" say wrong. */
const PARTLY = /^(?:đúng\s+một\s+phần|(?:partly|partially)\s+(?:correct|right))(?=$|[\s,.:;!–—-])/iu;
const VERDICT = /^(không\s+đúng|chưa\s+đúng|not\s+correct|đúng|sai|correct|incorrect|right|wrong)(?=$|[\s,.:;!–—-])/iu;
const SAYS_CORRECT = new Set(['đúng', 'correct', 'right']);
const CONNECTIVE = /^[\s,.:;–—-]*(?:(?:bởi\s+)?vì|do|because|since)?[\s,.:;–—-]*/iu;

/** Soft checks of an explanation against the choices; they never block saving. Only when the explanation has option
 * lines at all (a free explanation is fine), and only for choice questions. Options beyond H: see `quizChoiceLimit`. */
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
    const partly = PARTLY.exec(option.rest)?.[0];
    const said = partly ? null : VERDICT.exec(option.rest)?.[0] ?? null;
    const verdict = said?.toLowerCase().replace(/\s+/g, ' ') ?? null;
    if (verdict && SAYS_CORRECT.has(verdict) && !choices[index].correct) {
      checks.push({ kind: 'says_correct', letter: option.letter, correct });
    } else if (verdict && !SAYS_CORRECT.has(verdict) && choices[index].correct) {
      checks.push({ kind: 'says_wrong', letter: option.letter });
    }
    const words = partly ?? said ?? '';
    const reason = option.rest.slice(words.length).replace(CONNECTIVE, '').trim();
    if (!reason) checks.push({ kind: 'no_reason', letter: option.letter });
  }
  return checks;
}

/** The starter stems the server (and this editor) put in a new problem, in both languages. The standard frame shows
 * them as an empty box with the example placeholder; left empty, the starter text is kept so the problem stays valid. */
export const QUIZ_STARTER_STEMS: readonly string[] = ['Câu hỏi của bạn', 'Câu hỏi số học của bạn', 'Your question', 'Your numerical question'];

/** How a stored stem or explanation opens: plain text in the standard frame (in its own element), anything with
 * markup or attributes in the rich editor, untouched until the author converts it. `starter`: a starter stem, shown
 * empty. */
export type QuizFieldMode = { mode: 'plain'; tag: ProblemPlainTag; text: string; starter?: string } | { mode: 'rich' };
export function quizFieldFromHtml(html: string, fallback: ProblemPlainTag, kind: 'question' | 'explanation' = 'question'): QuizFieldMode {
  const plain = problemPlainText(html);
  if (!plain) return { mode: 'rich' };
  const tag = plain.tag ?? fallback;
  if (kind === 'question' && QUIZ_STARTER_STEMS.includes(plain.text.trim())) return { mode: 'plain', tag, text: '', starter: plain.text.trim() };
  return { mode: 'plain', tag, text: plain.text };
}

/** Free editing would change how the text looks: a stem's list lines and bold question line, or an explanation's
 * option lines (letter badges, the correct one highlighted), all become plain paragraphs. */
export function quizRichSwitchChangesLook(kind: 'question' | 'explanation', text: string): boolean {
  return kind === 'question'
    ? quizQuestionBlocks(text).some(block => block.kind === 'list' || block.question)
    : quizExplanationLines(text).some(line => line.kind === 'option');
}

const VIETNAMESE = /[ăâêôơưđẠ-ỹ]/iu;
/** The language a quiz is written in, from its own text (stem, choices, explanation; markup ignored): Vietnamese
 * letters mean Vietnamese, two or more plain Latin words without them mean English. Null when there is no telling. */
export function quizContentLocale(texts: readonly string[]): 'vi' | 'en' | null {
  const text = decodeQuizEntities(texts.join(' ').replace(/<[^>]*>/g, ' ')).normalize('NFC');
  if (VIETNAMESE.test(text)) return 'vi';
  return (text.match(/\b[a-z]{2,}\b/gi) ?? []).length >= 2 ? 'en' : null;
}

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Standard frame -> free editing: every non-empty line becomes a paragraph, the text is kept. */
export function plainQuizTextToRichHtml(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean).map(line => `<p>${escapeText(line)}</p>`).join('');
}

export type QuizConversionLoss = 'images' | 'formulas' | 'links' | 'formatting' | 'tables' | 'numbering';
type HtmlNode = { kind: 'text'; text: string } | { kind: 'element'; name: string; attrs: Readonly<Record<string, string>>; children: HtmlNode[] };

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'label', 'section',
  'article', 'header', 'footer', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'hr']);
const MEDIA_TAGS = new Set(['img', 'picture', 'svg', 'video', 'audio', 'iframe', 'embed', 'object', 'canvas', 'source']);
const FORMAT_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark', 'sub', 'sup', 'code', 'small', 'big',
  'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']);
const TABLE_TAGS = new Set(['table', 'tr', 'td', 'th']);
/** Never shown as text. */
const SKIP_TAGS = new Set(['script', 'style', 'template', 'title', 'noscript', 'head', 'meta', 'link']);
/** Their content is text up to the closing tag. */
const RAW_TAGS = ['script', 'style', 'template', 'title', 'textarea'];
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const FORMULA_TEXT = /\\\(|\\\[|\$\$|\[mathjax/i;
/** One clear "A. …" / "A) …" / "A: …" / "A – …" option line. */
const LETTER_LINE = /^([A-H])\s*(?:[.):]|[-–—])\s+(\S.*)$/u;
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;

/** An opening <script> (or style, title …) that is never closed would hide everything after it: it is dropped, so
 * that text is kept. */
function dropUnclosedRawTags(html: string): string {
  const lower = html.toLowerCase();
  return html.replace(TAG, (tag, closing: string, name: string, _attributes: string, offset: number) =>
    !closing && RAW_TAGS.includes(name.toLowerCase()) && !lower.includes(`</${name.toLowerCase()}`, offset + tag.length) ? '' : tag);
}

function attributesOf(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, double, single, bare] of text.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attrs[name.toLowerCase()] = decodeQuizEntities(double ?? single ?? bare ?? '');
  }
  return attrs;
}

/** A small HTML reader for places without a DOM (tests, server rendering): elements, attributes (a ">" inside a
 * quoted value included), void elements, raw-text elements, and an <li> closing the open one. */
function readHtml(html: string): HtmlNode[] {
  const root: HtmlNode & { kind: 'element' } = { kind: 'element', name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  let at = 0;
  const text = (value: string) => { if (value) stack[stack.length - 1].children.push({ kind: 'text', text: decodeQuizEntities(value) }); };
  TAG.lastIndex = 0;
  for (let match = TAG.exec(source); match; match = TAG.exec(source)) {
    text(source.slice(at, match.index));
    at = TAG.lastIndex;
    const [all, closing, rawName, attributes] = match;
    const name = rawName.toLowerCase();
    if (closing) {
      const open = stack.map(node => node.name).lastIndexOf(name);
      if (open > 0) stack.length = open;
      continue;
    }
    if (name === 'li') {
      const names = stack.map(node => node.name);
      const openItem = names.lastIndexOf('li');
      if (openItem > Math.max(names.lastIndexOf('ul'), names.lastIndexOf('ol'))) stack.length = openItem;
    }
    const element: HtmlNode & { kind: 'element' } = { kind: 'element', name, attrs: attributesOf(attributes), children: [] };
    stack[stack.length - 1].children.push(element);
    if (VOID_TAGS.has(name) || /\/\s*>$/.test(all)) continue;
    if (RAW_TAGS.includes(name)) {
      // Never closed (its closing tag was inside a comment): nothing is hidden behind it.
      const end = source.toLowerCase().indexOf(`</${name}`, at);
      if (end < 0) continue;
      element.children.push({ kind: 'text', text: source.slice(at, end) });
      const close = source.indexOf('>', end);
      at = TAG.lastIndex = close < 0 ? source.length : close + 1;
      continue;
    }
    stack.push(element);
  }
  text(source.slice(at));
  return root.children;
}

function fromDom(node: Node): HtmlNode | null {
  if (node.nodeType === 3) return { kind: 'text', text: node.nodeValue ?? '' };
  if (node.nodeType !== 1) return null;
  const element = node as Element;
  return {
    kind: 'element', name: element.tagName.toLowerCase(),
    attrs: Object.fromEntries(Array.from(element.attributes, attribute => [attribute.name.toLowerCase(), attribute.value])),
    children: Array.from(element.childNodes, fromDom).filter((child): child is HtmlNode => !!child),
  };
}

/** The rich content as the browser reads it (DOMParser), or with the small reader where there is no DOM. */
function htmlNodes(html: string): HtmlNode[] {
  const source = dropUnclosedRawTags(html);
  if (typeof DOMParser === 'undefined') return readHtml(source);
  const body = new DOMParser().parseFromString(source, 'text/html').body;
  return Array.from(body.childNodes, fromDom).filter((node): node is HtmlNode => !!node);
}

function listMarker(type: string | undefined, value: number): string {
  if (type === 'A' || type === 'a') {
    const marker = value >= 1 && value <= 26 ? String.fromCharCode(64 + value) : String(value);
    return type === 'a' ? marker.toLowerCase() : marker;
  }
  return String(value);
}

/**
 * Rich editor -> standard frame: paragraphs, headings and line breaks become lines; bullet items become "- " lines and
 * numbered items keep their number as a normal line ("1. …"); one item stays one line (its line breaks and paragraphs
 * are joined with a space). Text is kept as text. In an explanation, "A. …" lines become "A - …" only when they
 * clearly are the options (two or more, lettered A, B, C … in order). `losses` says what the plain text cannot keep.
 */
export function richQuizHtmlToText(html: string, kind: 'question' | 'explanation'): { text: string; losses: QuizConversionLoss[] } {
  const losses = new Set<QuizConversionLoss>();
  const lines: string[] = [];
  const lists: { ordered: boolean; type?: string; next: number }[] = [];
  let content = '', prefix = '', pre = 0, inItem = 0;
  const flush = () => {
    const line = content.replace(/\s+/g, ' ').trim();
    if (line) { lines.push(prefix + line); prefix = ''; }
    content = '';
  };
  const visit = (node: HtmlNode) => {
    if (node.kind === 'text') {
      if (FORMULA_TEXT.test(node.text)) losses.add('formulas');
      if (pre && !inItem) node.text.replace(/\r\n?/g, '\n').split('\n').forEach((part, index) => { if (index) flush(); content += part; });
      else content += node.text;
      return;
    }
    const { name, attrs, children } = node;
    if (SKIP_TAGS.has(name)) return;
    if (MEDIA_TAGS.has(name)) losses.add('images');
    if (name === 'math' || name.startsWith('m:')) losses.add('formulas');
    if (name === 'a' && 'href' in attrs) losses.add('links');
    if (FORMAT_TAGS.has(name) || 'style' in attrs) losses.add('formatting');
    if (TABLE_TAGS.has(name)) losses.add('tables');
    if (name === 'br') { if (inItem) content += ' '; else flush(); return; }
    if (name === 'ul' || name === 'ol') {
      flush();
      const start = Number.parseInt(attrs.start ?? '', 10);
      if (name === 'ol') losses.add('numbering');
      lists.push({ ordered: name === 'ol', type: attrs.type, next: Number.isFinite(start) ? start : 1 });
      const outer = inItem;
      inItem = 0;
      children.forEach(visit);
      flush();
      inItem = outer;
      lists.pop();
      return;
    }
    if (name === 'li') {
      flush();
      const list = lists[lists.length - 1];
      prefix = list?.ordered ? `${listMarker(list.type, list.next++)}. ` : '- ';
      inItem += 1;
      children.forEach(visit);
      flush();
      inItem -= 1;
      prefix = '';
      return;
    }
    const block = BLOCK_TAGS.has(name);
    if (name === 'pre') pre += 1;
    if (block) { if (inItem) content += ' '; else flush(); }
    children.forEach(visit);
    if (block) { if (inItem) content += ' '; else flush(); }
    if (name === 'pre') pre -= 1;
  };
  htmlNodes(html).forEach(visit);
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
