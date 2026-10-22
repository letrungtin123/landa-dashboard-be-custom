import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Writing a quiz by hand in the AI ID format (owner decision 22/10): the pure rules and the real field components
// (SSR, real VI/EN copy). Only i18n and the rich text editor are replaced.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '..');
const h = React.createElement;
const env = { locale: 'vi' };
const locales = {};
function t(key, values = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales[env.locale]);
  assert.equal(typeof value, 'string', `missing ${env.locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}
const mocks = {
  'react-i18next': { useTranslation: () => ({ t, i18n: { language: env.locale } }) },
  '../RichTextEditor': { __esModule: true, default: ({ content }) => h('div', { 'data-rich-editor': '' }, content) },
};
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier === './vi') return locales.viModule;
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.join(src, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      return load([`${base}.ts`, `${base}.tsx`, base].find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile()));
    }
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  loaded.set(file, module.exports);
  return module.exports;
}
for (const name of ['vi', 'en']) {
  const exports = load(path.join(src, `i18n/locales/${name}.ts`));
  if (name === 'vi') locales.viModule = exports;
  locales[name] = exports[name];
}
const logic = load(path.join(directory, 'quiz-authoring.logic.ts'));
const textLogic = load(path.join(directory, 'quiz-text.logic.ts'));
const { QuizTextField, quizCheckText } = load(path.join(src, 'components/shared/quiz-text-field.tsx'));
const { ProblemTextSection } = load(path.join(src, 'components/course-editor/editors/ProblemTextSection.tsx'));
const choices = (...flags) => flags.map(correct => ({ correct }));

test('+ Thêm ý: after the last list line, else before the question line; the caret lands on the new item', () => {
  const at = (text, expected, typedAfter) => {
    const next = logic.insertQuizListItem(text);
    assert.equal(next.text, expected, JSON.stringify(text));
    assert.equal(next.text.slice(0, next.caret).endsWith('- '), true);
    assert.equal(next.text.slice(next.caret).startsWith(typedAfter), true, 'the caret is right after the new "- "');
  };
  assert.deepEqual(logic.insertQuizListItem(''), { text: '- ', caret: 2 });
  at('Việc nào trước?', '- \nViệc nào trước?', '\nViệc');
  at('Bối cảnh:\nViệc nào trước?', 'Bối cảnh:\n- \nViệc nào trước?', '\nViệc');
  at('Bối cảnh:\n- a\n- b\nViệc nào trước?', 'Bối cảnh:\n- a\n- b\n- \nViệc nào trước?', '\nViệc');
  at('Chọn các ý đúng:\n- a', 'Chọn các ý đúng:\n- a\n- ', '');
  at('Việc nào trước?\n\n', '- \nViệc nào trước?\n\n', '\nViệc');
  at('Bối cảnh\r\n- a\r\nHỏi?', 'Bối cảnh\n- a\n- \nHỏi?', '\nHỏi');
  at('Bối cảnh:\n- \nHỏi?', 'Bối cảnh:\n- \n- \nHỏi?', '\nHỏi');
});

test('Chèn mẫu: the principle, then one line per choice from the correct answers; typed answers get one line', () => {
  assert.equal(logic.quizExplanationTemplate(choices(false, true, false), 'vi'), 'Nguyên tắc: \nA - Sai vì \nB - Đúng vì \nC - Sai vì ');
  assert.equal(logic.quizExplanationTemplate(choices(true, false, true, false), 'en'),
    'Principle: \nA - Correct because \nB - Wrong because \nC - Correct because \nD - Wrong because ');
  assert.equal(logic.quizExplanationTemplate(null, 'vi'), 'Nguyên tắc: \nĐáp án đúng vì ');
  assert.equal(logic.quizExplanationTemplate(null, 'en'), 'Principle: \nThe correct answer is right because ');
  // The choices changed (one added, the correct answer moved): a new template follows them.
  assert.equal(logic.quizExplanationTemplate(choices(false, false, false, true), 'vi'), 'Nguyên tắc: \nA - Sai vì \nB - Sai vì \nC - Sai vì \nD - Đúng vì ');
  assert.equal(logic.quizExplanationTemplate(choices(...Array(10).fill(false)), 'vi').split('\n').length, 9, 'letters A to H at most');
  assert.deepEqual(logic.quizExplanationChecks(logic.quizExplanationTemplate(choices(false, true), 'vi'), choices(false, true)),
    [{ kind: 'no_reason', letter: 'A' }, { kind: 'no_reason', letter: 'B' }], 'a fresh template only asks for the reasons');
});

test('soft checks: lines against the choices, Đúng/Sai against the correct answers, a missing reason; never on a free explanation', () => {
  const three = choices(false, false, true);
  assert.deepEqual(logic.quizExplanationChecks('Nguyên tắc: x.\nA - Sai vì a.\nB - Sai vì b.\nC - Đúng vì c.', three), []);
  assert.deepEqual(logic.quizExplanationChecks('Nguyên tắc.\nA - Sai vì a.\nB - Đúng vì b.\nC - Sai vì c.', choices(false, false, false, true)), [
    { kind: 'missing', letters: ['D'] },
    { kind: 'says_correct', letter: 'B', correct: ['D'] },
  ]);
  assert.deepEqual(logic.quizExplanationChecks('A - Sai vì a.\nB - Sai vì b.\nD - Sai vì d.', three), [
    { kind: 'extra', letters: ['D'] }, { kind: 'missing', letters: ['C'] }]);
  assert.deepEqual(logic.quizExplanationChecks('A - Sai vì a.\nB - Sai vì b.\nC - Sai vì c.', three), [{ kind: 'says_wrong', letter: 'C' }]);
  assert.deepEqual(logic.quizExplanationChecks('A - Sai vì\nB - Sai, bởi vì  \nC -', three), [
    { kind: 'no_reason', letter: 'A' }, { kind: 'no_reason', letter: 'B' }, { kind: 'no_reason', letter: 'C' }]);
  assert.deepEqual(logic.quizExplanationChecks('A - Correct because a.\nB - Wrong because b.', choices(false, true)), [
    { kind: 'says_correct', letter: 'A', correct: ['B'] }, { kind: 'says_wrong', letter: 'B' }], 'English verdicts too');
  assert.deepEqual(logic.quizExplanationChecks('A - Đúng vì a.\nB - Sai vì b.', choices(false, false)),
    [{ kind: 'says_correct', letter: 'A', correct: [] }]);
  assert.deepEqual(logic.quizExplanationChecks('Giải thích tự do, không theo từng phương án.', three), [], 'a free explanation is fine');
  assert.deepEqual(logic.quizExplanationChecks('A - Đúng vì a.', null), [], 'typed answers have no options to check');
  env.locale = 'vi';
  assert.equal(quizCheckText(t, { kind: 'says_correct', letter: 'B', correct: ['D'] }), 'Dòng B ghi Đúng nhưng đáp án đúng là D.');
  assert.equal(quizCheckText(t, { kind: 'missing', letters: ['C', 'D'] }), 'Chưa có dòng giải thích cho lựa chọn C, D.');
  env.locale = 'en';
  assert.equal(quizCheckText(t, { kind: 'no_reason', letter: 'A' }), 'Line A has no reason yet.');
});

test('rich editor -> standard frame: paragraphs and list items become lines; what plain text cannot keep is named', () => {
  assert.deepEqual(logic.richQuizHtmlToText('<p>Cửa hàng có hai việc:</p><ul><li><p>Khách chờ</p></li><li><p>Kho &amp; hàng</p></li></ul><p>Việc nào trước?</p>', 'question'),
    { text: 'Cửa hàng có hai việc:\n- Khách chờ\n- Kho & hàng\nViệc nào trước?', losses: [] });
  assert.deepEqual(logic.richQuizHtmlToText('<label>Một\n  dòng   dài</label><p>Hai<br>Ba</p><ol><li>x</li></ol>', 'question'),
    { text: 'Một dòng dài\nHai\nBa\n- x', losses: [] });
  const lossy = logic.richQuizHtmlToText('<p>Xem <strong>đậm</strong> <a href="https://x.test">nguồn</a></p><p><img src="/a.png"></p><table><tr><td>ô</td></tr></table><p>\\(x^2\\)</p><script>alert(1)</script>', 'question');
  assert.equal(lossy.text, 'Xem đậm nguồn\nô\n\\(x^2\\)');
  assert.deepEqual([...lossy.losses].sort(), ['formatting', 'formulas', 'images', 'links', 'tables']);
  assert.deepEqual(logic.richQuizHtmlToText('<p><span style="color:red">Đỏ</span> <math><mi>x</mi></math></p>', 'question').losses.sort(), ['formatting', 'formulas']);
  // "A …" becomes "A - …" only in an explanation and only when the lines clearly are the options A, B, … in order.
  assert.equal(logic.richQuizHtmlToText('<p>Nguyên tắc: khách trước.</p><p>A. Sai vì a.</p><p>B) Đúng vì b.</p><p>C: Sai vì c.</p>', 'explanation').text,
    'Nguyên tắc: khách trước.\nA - Sai vì a.\nB - Đúng vì b.\nC - Sai vì c.');
  assert.equal(logic.richQuizHtmlToText('<p>A. Một dòng duy nhất.</p>', 'explanation').text, 'A. Một dòng duy nhất.');
  assert.equal(logic.richQuizHtmlToText('<p>B. Thứ hai</p><p>A. Thứ nhất</p>', 'explanation').text, 'B. Thứ hai\nA. Thứ nhất');
  assert.equal(logic.richQuizHtmlToText('<p>A. Một</p><p>B. Hai</p>', 'question').text, 'A. Một\nB. Hai', 'a stem is never rewritten');
});

test('save round trip: the standard frame stores K1 plain text; an old rich field is untouched until converted', () => {
  for (const html of ['<label>Bối cảnh &amp; số &lt;5&gt;\n- ý một\nHỏi?</label>', '<p>Nguyên tắc.\nA - Đúng vì a.</p>', '<label></label>']) {
    const field = logic.quizFieldFromHtml(html, 'label');
    assert.equal(field.mode, 'plain', html);
    assert.equal(textLogic.plainProblemHtml(field.tag, field.text), html, 'opening and storing again changes nothing');
  }
  assert.deepEqual(logic.quizFieldFromHtml('Câu hỏi trần?', 'label'), { mode: 'plain', tag: 'label', text: 'Câu hỏi trần?' });
  assert.deepEqual(logic.quizFieldFromHtml('', 'p'), { mode: 'plain', tag: 'p', text: '' }, 'a new, empty explanation opens in the standard frame');
  for (const empty of ['<label/>', '<label />']) assert.deepEqual(logic.quizFieldFromHtml(empty, 'p'), { mode: 'plain', tag: 'label', text: '' },
    'an empty stem saved and read back from the problem XML stays in the standard frame');
  for (const rich of ['<p>Một</p><p>Hai</p>', '<p>Câu <strong>đậm</strong></p>', '<p>Xem hình</p><img src="/a.png">']) {
    assert.deepEqual(logic.quizFieldFromHtml(rich, 'label'), { mode: 'rich' }, rich);
  }
  assert.equal(logic.plainQuizTextToRichHtml('Bối cảnh & <b>\n\n- ý\nHỏi?'), '<p>Bối cảnh &amp; &lt;b&gt;</p><p>- ý</p><p>Hỏi?</p>', 'free editing keeps the text, lines become paragraphs');
  const converted = logic.richQuizHtmlToText('<p>Bối cảnh</p><ul><li><p>ý</p></li></ul><p>Hỏi?</p>', 'question').text;
  assert.equal(textLogic.plainProblemHtml('label', converted), '<label>Bối cảnh\n- ý\nHỏi?</label>');
});

for (const locale of ['vi', 'en']) test(`${locale}: the standard frame: one box, its button, hint, soft checks and the live preview`, () => {
  env.locale = locale;
  const vi = locale === 'vi';
  const stem = renderToStaticMarkup(h(QuizTextField, { kind: 'question', value: 'Bối cảnh:\n- Khách chờ\nViệc nào trước?', label: 'Câu hỏi', onChange() {}, onSwitchToRich() {} }));
  assert.match(stem, new RegExp(`<button[^>]*>.*?${vi ? '\\+ Thêm ý' : '\\+ Add item'}</button>`));
  assert.match(stem, new RegExp(vi ? 'Soạn tự do \\(chèn hình, định dạng chữ\\)' : 'Free editing \\(images, text formatting\\)'));
  assert.match(stem, /<textarea aria-label="Câu hỏi" aria-describedby="[^"]+-hint" placeholder="[^"]*"/);
  assert.ok(stem.includes(vi ? 'Học viên sẽ thấy' : 'What learners see'));
  assert.match(stem, /<ul class="list-disc[^"]*"><li>Khách chờ<\/li><\/ul><p class="font-semibold">Việc nào trước\?<\/p>/);
  const empty = renderToStaticMarkup(h(QuizTextField, { kind: 'question', value: '', label: 'Câu hỏi', onChange() {} }));
  assert.doesNotMatch(empty, /Học viên sẽ thấy|What learners see|Soạn tự do|Free editing/, 'no preview while empty; no switch without a rich editor');
  assert.ok(empty.includes(vi ? 'Ví dụ:\nCửa hàng đang có hai việc gấp:' : 'For example:\nThe shop has two urgent tasks:'), 'the placeholder shows a short example');
  const why = renderToStaticMarkup(h(QuizTextField, { kind: 'explanation', label: 'Giải thích', choices: choices(false, false, false, true), onChange() {},
    value: 'Nguyên tắc: x.\nA - Sai vì a.\nB - Đúng vì b.\nC - Sai vì c.\nD - Sai vì d.' }));
  assert.match(why, new RegExp(`<button[^>]*aria-expanded="false"[^>]*>.*?${vi ? 'Chèn mẫu' : 'Insert template'}</button>`));
  assert.ok(why.includes(vi ? 'Dòng B ghi Đúng nhưng đáp án đúng là D.' : 'Line B says correct, but the correct answer is D.'));
  assert.ok(why.includes(vi ? 'Dòng D ghi Sai nhưng D đang là đáp án đúng.' : 'Line D says wrong, but D is marked as a correct answer.'));
  assert.match(why, /aria-describedby="[^"]+-hint [^"]+-checks"/, 'the checks describe the box');
  assert.equal((why.match(/data-correct="true"/g) ?? []).length, 1, 'the preview highlights the ticked answer');
});

test('course editor sections: plain text opens in the standard frame, rich content in the rich editor with the switch back', () => {
  env.locale = 'vi';
  const plain = renderToStaticMarkup(h(ProblemTextSection, { kind: 'question', html: '<label>Bối cảnh\nHỏi?</label>', label: 'Câu hỏi', onHtmlChange() {} }));
  assert.match(plain, /data-quiz-field="question"/);
  assert.ok(plain.includes('Soạn tự do (chèn hình, định dạng chữ)'));
  assert.doesNotMatch(plain, /data-rich-editor/);
  const rich = '<p>Câu <strong>đậm</strong></p><p><img src="/a.png"></p>';
  const old = renderToStaticMarkup(h(ProblemTextSection, { kind: 'explanation', html: rich, label: 'Giải thích', onHtmlChange() {} }));
  assert.ok(old.includes('Chuyển sang khung chuẩn'));
  assert.doesNotMatch(old, /data-quiz-field/);
  assert.ok(old.includes(`<div data-rich-editor="">${rich.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</div>`), 'the stored HTML reaches the rich editor unchanged');
  const editor = readFileSync(path.join(src, 'components/course-editor/editors/ProblemEditor.tsx'), 'utf8');
  assert.match(editor, /<ProblemTextSection key=\{`question:\$\{textSectionKey\}`\} kind="question" html=\{state\.questionHtml\}/);
  assert.match(editor, /choices=\{state\.type === 'numericalresponse' \|\| state\.type === 'stringresponse' \? null : state\.choices\}/);
  assert.match(editor, /questionHtml: '<label><\/label>',/, 'a new type starts empty in the standard frame');
  assert.doesNotMatch(editor, /useEffect\([^)]*questionHtml/, 'nothing rewrites a stored field on open');
  const section = readFileSync(path.join(src, 'components/course-editor/editors/ProblemTextSection.tsx'), 'utf8');
  assert.match(section, /useState<QuizFieldMode>\(\(\) => quizFieldFromHtml\(html, fallback\)\)/);
  const toStandard = readFileSync(path.join(src, 'components/course-editor/editors/ProblemRichToStandard.tsx'), 'utf8');
  assert.match(toStandard, /if \(result\.losses\.length\) setLosses\(result\.losses\); else onConvert\(result\.text\);/, 'a loss always asks first');
  for (const locale of ['vi', 'en']) {
    const copy = locales[locale].quizText;
    for (const loss of ['images', 'formulas', 'links', 'formatting', 'tables']) assert.equal(typeof copy.lose[loss], 'string');
    const strings = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(strings);
    for (const value of strings(copy)) assert.doesNotMatch(value, /_|\b(?:K1|HTML|KB|API)\b/, value);
  }
  const shape = value => typeof value === 'string' ? 'string' : Object.fromEntries(Object.keys(value).sort().map(key => [key, shape(value[key])]));
  assert.deepEqual(shape(locales.en.quizText), shape(locales.vi.quizText));
});
