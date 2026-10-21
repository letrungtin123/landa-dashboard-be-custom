import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Quiz text layout (QC 21/10, B1/B2, contract K1): the pure rules and the real React components (SSR).
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '..');
const h = React.createElement;
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => specifier.startsWith('.')
    ? load([`${path.resolve(path.dirname(file), specifier)}.ts`, `${path.resolve(path.dirname(file), specifier)}.tsx`]
      .find(candidate => { try { readFileSync(candidate); return true; } catch { return false; } }))
    : require(specifier);
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  loaded.set(file, module.exports);
  return module.exports;
}
const logic = load(path.join(directory, 'quiz-text.logic.ts'));
const { QuizQuestionText, QuizExplanationText, ProblemQuestionPreview, ProblemExplanationPreview } = load(path.join(src, 'components/shared/quiz-text.tsx'));
const { ProblemPlainTextField } = load(path.join(src, 'components/course-editor/editors/ProblemPlainTextField.tsx'));

const stem = 'Chị Lan quản lý một cửa hàng có hai việc gấp:\n- Khách chờ đổi hàng\n- Kho báo thiếu hàng\nChị nên làm gì trước?';
const explanation = 'Nguyên tắc: việc chạm tới khách hàng được xử lý trước.\nA - Sai vì kho có thể chờ.\nB - Đúng vì khách đang chờ tại quầy.\nC - Sai vì chưa rõ thiếu hàng nào.';

test('stem: context lines, one list item per "- " line, and the last line is the question', () => {
  assert.deepEqual(logic.quizQuestionBlocks(stem), [
    { kind: 'line', text: 'Chị Lan quản lý một cửa hàng có hai việc gấp:', question: false },
    { kind: 'list', items: ['Khách chờ đổi hàng', 'Kho báo thiếu hàng'] },
    { kind: 'line', text: 'Chị nên làm gì trước?', question: true },
  ]);
  assert.deepEqual(logic.quizQuestionBlocks('Câu hỏi cũ một dòng?'), [{ kind: 'line', text: 'Câu hỏi cũ một dòng?', question: true }],
    'an old single-line quiz is one bold question line');
  assert.deepEqual(logic.quizQuestionBlocks('Bối cảnh\r\n\r\n  - a  \r- b\n-5 độ là lạnh?'), [
    { kind: 'line', text: 'Bối cảnh', question: false }, { kind: 'list', items: ['a', 'b'] }, { kind: 'line', text: '-5 độ là lạnh?', question: true }],
    'CR LF and CR are line feeds, blank lines and edge spaces go, "-5" is not a list item');
  assert.deepEqual(logic.quizQuestionBlocks('Chọn các ý đúng:\n- A\n- B'), [
    { kind: 'line', text: 'Chọn các ý đúng:', question: false }, { kind: 'list', items: ['A', 'B'] }],
    'a stem that ends with a list has no bold line');
  assert.deepEqual(logic.quizQuestionBlocks(' \n \n'), []);
});

test('explanation: the principle, then one line per option; the correct option is marked', () => {
  const lines = logic.quizExplanationLines(explanation, ['B']);
  assert.deepEqual(lines, [
    { kind: 'text', text: 'Nguyên tắc: việc chạm tới khách hàng được xử lý trước.' },
    { kind: 'option', letter: 'A', text: 'Sai vì kho có thể chờ.', correct: false },
    { kind: 'option', letter: 'B', text: 'Đúng vì khách đang chờ tại quầy.', correct: true },
    { kind: 'option', letter: 'C', text: 'Sai vì chưa rõ thiếu hàng nào.', correct: false },
  ]);
  for (const line of ['A. Đúng', 'A) Đúng', 'A: Đúng', 'A – Đúng']) assert.equal(logic.quizExplanationLines(line, ['A'])[0].kind, 'option', line);
  for (const line of ['Apple là công ty', 'A-Z là bảng chữ cái', 'a - thường']) assert.equal(logic.quizExplanationLines(line)[0].kind, 'text', line);
  assert.deepEqual(logic.quizExplanationLines('Giải thích cũ một dòng, A - Sai vì x. B - Đúng vì y.'),
    [{ kind: 'text', text: 'Giải thích cũ một dòng, A - Sai vì x. B - Đúng vì y.' }], 'an old one-line explanation stays as it was');
  assert.deepEqual(logic.quizCorrectLetters([{ correct: false }, { correct: true }, { correct: true }]), ['B', 'C']);
});

test('stored fields: plain text in one element (or bare) is read with its line feeds; markup is not plain', () => {
  assert.deepEqual(logic.problemPlainText('<label>Bối cảnh &amp; số liệu\n- 5 &lt; 7\nHỏi?</label>'), { tag: 'label', text: 'Bối cảnh & số liệu\n- 5 < 7\nHỏi?' });
  assert.deepEqual(logic.problemPlainText('\n<p>A &#39;x&#39; &#x41; &quot;y&quot; &apos;z&apos; &copy;</p>\n'), { tag: 'p', text: 'A \'x\' A "y" \'z\' &copy;' });
  assert.deepEqual(logic.problemPlainText('Câu hỏi trần?'), { tag: null, text: 'Câu hỏi trần?' });
  for (const rich of ['<p>Một</p><p>Hai</p>', '<p>Câu <strong>đậm</strong></p>', '<label>a</label><img src=x>']) assert.equal(logic.problemPlainText(rich), null, rich);
  assert.equal(logic.problemPlainEditTag('<label>Bối cảnh\nHỏi?</label>', 'label'), 'label');
  assert.equal(logic.problemPlainEditTag('Bối cảnh\nHỏi?', 'p'), 'p');
  for (const html of ['<label>Một dòng?</label>', '<p>Một</p><p>Hai</p>', '']) assert.equal(logic.problemPlainEditTag(html, 'label'), null, html);
  const text = 'Dòng 1 & <b>không phải thẻ</b>\n- ý\n\nHỏi?\n';
  assert.equal(logic.plainProblemHtml('label', text), '<label>Dòng 1 &amp; &lt;b&gt;không phải thẻ&lt;/b&gt;\n- ý\n\nHỏi?\n</label>');
  assert.deepEqual(logic.problemPlainText(logic.plainProblemHtml('p', text)), { tag: 'p', text }, 'every line feed survives a save');
});

const render = element => renderToStaticMarkup(element);
const words = html => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

test('stem rendering: normal-weight context, a real list, only the question in bold, moderate size, text only', () => {
  const html = render(h(QuizQuestionText, { text: stem }));
  assert.match(html, /^<div data-quiz-question="" class="[^"]*text-\[15px\][^"]*sm:text-base[^"]*">/);
  assert.doesNotMatch(html, /text-\[20px\]|text-\[24px\]|font-bold/, 'no huge bold stem any more');
  assert.match(html, /<p class="font-normal[^"]*">Chị Lan quản lý một cửa hàng có hai việc gấp:<\/p>/);
  assert.match(html, /<ul class="list-disc[^"]*"><li>Khách chờ đổi hàng<\/li><li>Kho báo thiếu hàng<\/li><\/ul>/);
  assert.match(html, /<p class="font-semibold">Chị nên làm gì trước\?<\/p>/);
  const hostile = render(h(QuizQuestionText, { text: 'Xem <img src=x onerror=alert(1)>\n<script>alert(2)</script>?' }));
  assert.doesNotMatch(hostile, /<img|<script/);
  assert.match(hostile, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(render(h(QuizQuestionText, { text: '  ' })), '');
});

test('explanation rendering: one line per option with its letter; the correct one stands out and says so', () => {
  const html = render(h(QuizExplanationText, { text: explanation, correctLetters: ['B'], correctLabel: 'Đáp án đúng' }));
  assert.equal((html.match(/<p[ >]/g) ?? []).length, 4);
  assert.equal((html.match(/data-correct="true"/g) ?? []).length, 1);
  assert.match(html, /data-correct="true" class="[^"]*bg-emerald-500\/10 font-semibold[^"]*"><span[^>]*>B<\/span><span[^>]*>Đúng vì khách đang chờ tại quầy\.<\/span>.*<span class="sr-only">Đáp án đúng<\/span><\/p>/);
  assert.match(html, /<span[^>]*>A<\/span><span class="min-w-0 flex-1">Sai vì kho có thể chờ\.<\/span><\/p>/);
  assert.doesNotMatch(words(html), /\|A - |\|B - /, 'the letter is shown once, as a badge');
});

test('course editor preview: plain stems get the layout, rich stems keep their sanitized markup at the same size', () => {
  const sanitize = html => `[sanitized]${html}`;
  const plain = render(h(ProblemQuestionPreview, { html: `<label>${stem.replace(/&/g, '&amp;')}</label>`, renderHtml: sanitize }));
  assert.match(plain, /<ul class="list-disc/);
  assert.doesNotMatch(plain, /\[sanitized\]/, 'plain text never goes through innerHTML');
  const rich = render(h(ProblemQuestionPreview, { html: '<p>Một</p><p>Hai <strong>đậm</strong></p>', renderHtml: sanitize }));
  assert.match(rich, /^<div class="text-\[15px\] font-semibold leading-7 text-foreground sm:text-base \[&amp;_p\]:m-0">\[sanitized\]<p>Một<\/p>/);
  const why = render(h(ProblemExplanationPreview, { html: `<p>${explanation}</p>`, renderHtml: sanitize, correctLetters: ['B'], correctLabel: 'Correct answer' }));
  assert.equal((why.match(/data-correct="true"/g) ?? []).length, 1);
  const oldWhy = render(h(ProblemExplanationPreview, { html: '<p>Giải thích</p><ul><li>x</li></ul>', renderHtml: sanitize, correctLetters: [], correctLabel: 'x' }));
  assert.match(oldWhy, /prose[^"]*">\[sanitized\]<p>Giải thích<\/p><ul>/);
});

test('course editor: a multi-line AI ID stem or explanation is edited as plain text that keeps every line', () => {
  const html = render(h(ProblemPlainTextField, { initial: 'Bối cảnh\n- ý\nHỏi?', label: 'Câu hỏi', hint: 'Mỗi dòng hiển thị riêng.', onChange() {} }));
  assert.match(html, /<textarea aria-label="Câu hỏi" rows="4"[^>]*>Bối cảnh\n- ý\nHỏi\?<\/textarea>/);
  assert.match(html, /<p class="text-xs text-muted-foreground">Mỗi dòng hiển thị riêng\.<\/p>/);
  const editor = readFileSync(path.join(src, 'components/course-editor/editors/ProblemEditor.tsx'), 'utf8');
  assert.match(editor, /question: problemPlainEditTag\(state\.questionHtml, 'label'\), explanation: problemPlainEditTag\(state\.explanationHtml, 'p'\)/);
  assert.match(editor, /questionHtml: plainProblemHtml\(plainTags\.question!, text\)/);
  assert.match(editor, /explanationHtml: text\.trim\(\) \? plainProblemHtml\(plainTags\.explanation!, text\) : ''/);
  assert.match(editor, /setPlainTags\(\{ question: null, explanation: null \}\);/, 'a new quiz type starts in the rich editor');
  const unit = readFileSync(path.join(src, 'components/course-editor/UnitEditor.tsx'), 'utf8');
  assert.match(unit, /<ProblemQuestionPreview html=\{parsed\.questionHtml\} renderHtml=\{rewriteHtml\} \/>/);
  assert.match(unit, /<ProblemExplanationPreview html=\{parsed\.explanationHtml\} renderHtml=\{rewriteHtml\}/);
  assert.doesNotMatch(unit, /text-\[20px\] font-bold leading-snug text-foreground"\s+dangerouslySetInnerHTML=\{\{ __html: rewriteHtml\(parsed\.questionHtml\)/);
  for (const locale of ['vi', 'en']) {
    const copy = readFileSync(path.join(src, `i18n/locales/${locale}.ts`), 'utf8');
    for (const key of ['quizCorrectOption', 'quizQuestionPlainHint', 'quizExplanationPlainHint']) assert.match(copy, new RegExp(`\\b${key}: "`), `${locale} ${key}`);
  }
});
