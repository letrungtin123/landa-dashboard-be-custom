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
// (SSR with the real VI/EN copy, and a small hook harness to press their buttons). Only i18n and the rich text editor
// are replaced.
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
const RichTextEditor = ({ content }) => h('div', { 'data-rich-editor': '' }, content);
const mocks = {
  'react-i18next': { useTranslation: () => ({ t, i18n: { language: env.locale } }) },
  '../RichTextEditor': { __esModule: true, default: RichTextEditor },
};

// Hooks for pressing buttons without a DOM: state survives renders of one mounted component; effects run after a
// render when their dependencies changed, as in React.
let slots, cursor, pending;
const hookReact = { ...React,
  useState(initial) {
    const own = slots, index = cursor++;
    if (!(index in own)) own[index] = { value: typeof initial === 'function' ? initial() : initial };
    const slot = own[index];
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  },
  useRef(initial) { const own = slots, index = cursor++; if (!(index in own)) own[index] = { current: initial }; return own[index]; },
  useEffect(effect, deps) {
    const own = slots, index = cursor++, before = own[index];
    own[index] = { deps };
    if (!before || !deps || deps.some((dep, at) => !Object.is(dep, before.deps?.[at]))) pending.push(effect);
  },
  useId: () => 'field',
};
const mount = Component => {
  const own = [];
  return props => { slots = own; cursor = 0; pending = []; const tree = Component(props); const effects = pending; effects.forEach(effect => effect()); return tree; };
};
const HOOKED = ['quiz-text-field.tsx', 'ProblemTextSection.tsx', 'ProblemRichToStandard.tsx'];

function loader(hooked) {
  const loaded = new Map();
  const load = file => {
    if (loaded.has(file)) return loaded.get(file);
    const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    loaded.set(file, module.exports);
    const localRequire = specifier => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier === 'react' && hooked && HOOKED.some(name => file.endsWith(name))) return hookReact;
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
  };
  return load;
}
const load = loader(false);
for (const name of ['vi', 'en']) {
  const exports = load(path.join(src, `i18n/locales/${name}.ts`));
  if (name === 'vi') locales.viModule = exports;
  locales[name] = exports[name];
}
const logic = load(path.join(directory, 'quiz-authoring.logic.ts'));
const textLogic = load(path.join(directory, 'quiz-text.logic.ts'));
const { QuizTextField, quizCheckText } = load(path.join(src, 'components/shared/quiz-text-field.tsx'));
const { ProblemTextSection } = load(path.join(src, 'components/course-editor/editors/ProblemTextSection.tsx'));
const hookedLoad = loader(true);
const hooked = {
  QuizTextField: hookedLoad(path.join(src, 'components/shared/quiz-text-field.tsx')).QuizTextField,
  ProblemTextSection: hookedLoad(path.join(src, 'components/course-editor/editors/ProblemTextSection.tsx')).ProblemTextSection,
  ProblemRichToStandard: hookedLoad(path.join(src, 'components/course-editor/editors/ProblemRichToStandard.tsx')).ProblemRichToStandard,
};
const choices = (...flags) => flags.map(correct => ({ correct }));
const elements = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(elements)] : [];
const textOf = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(textOf).join('') : '';
const press = (tree, label) => {
  const buttons = elements(tree).filter(element => element.props.onClick);
  const button = buttons.find(element => textOf(element) === label) ?? buttons.find(element => textOf(element).includes(label));
  assert.ok(button, `button ${label}`);
  button.props.onClick();
};
const source = file => readFileSync(path.join(src, file), 'utf8').replace(/\r\n/g, '\n');
const dialogText = tree => textOf(elements(tree).find(element => element.props.role === 'alertdialog') ?? '');

// The browser path of the conversion (DOMParser), read by parse5 as a browser would.
let parse5 = null;
try { parse5 = await import('parse5'); } catch { /* not installed: only the reader without a DOM is tested */ }
const toDom = node => node.nodeName === '#text' ? { nodeType: 3, nodeValue: node.value }
  : node.nodeName.startsWith('#') ? { nodeType: 8 }
    : { nodeType: 1, tagName: node.tagName.toUpperCase(), attributes: node.attrs, childNodes: (node.childNodes ?? []).map(toDom) };
class Parse5DomParser {
  parseFromString(html) {
    const document = parse5.parse(html);
    const body = document.childNodes.find(node => node.nodeName === 'html').childNodes.find(node => node.nodeName === 'body');
    return { body: toDom(body) };
  }
}
const paths = parse5 ? ['without a DOM', 'with DOMParser'] : ['without a DOM'];
function convertBothWays(html, kind) {
  const results = paths.map(way => {
    if (way === 'with DOMParser') globalThis.DOMParser = Parse5DomParser;
    try { return logic.richQuizHtmlToText(html, kind); } finally { delete globalThis.DOMParser; }
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0], `the browser reads ${html} the same way`);
  return results[0];
}

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

test('more than 8 choices: a plain note, and a correct option beyond H is named instead of dropped', () => {
  assert.equal(logic.quizChoiceLimit(choices(...Array(8).fill(false))), null);
  assert.equal(logic.quizChoiceLimit(null), null);
  const ten = choices(...Array(10).fill(false).map((_, index) => index === 9 || index === 1));
  assert.deepEqual(logic.quizChoiceLimit(ten), { count: 10, correctBeyond: [10] });
  for (const locale of ['vi', 'en']) {
    env.locale = locale;
    const html = renderToStaticMarkup(h(QuizTextField, { kind: 'explanation', value: '', label: 'Giải thích', choices: ten, onChange() {} }));
    assert.ok(html.includes(locale === 'vi'
      ? 'Khung chuẩn chỉ giải thích được tối đa 8 lựa chọn (A đến H); câu này có 10 lựa chọn. Đáp án đúng ở lựa chọn thứ 10 nằm ngoài 8 lựa chọn đầu'
      : 'The standard frame explains up to 8 options (A to H); this question has 10. The correct answer in option 10 is beyond the first 8'));
    assert.match(html, /aria-describedby="field-hint field-limit"|aria-describedby="[^"]+-hint [^"]+-limit"/);
    const eight = renderToStaticMarkup(h(QuizTextField, { kind: 'explanation', value: '', label: 'Giải thích', choices: choices(true, false), onChange() {} }));
    assert.doesNotMatch(eight, /tối đa 8|up to 8/);
  }
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
  // "Đúng một phần" is no verdict; "Không đúng" / "chưa đúng" say wrong.
  assert.deepEqual(logic.quizExplanationChecks('A - Đúng một phần vì a.\nB - Đúng vì b.', choices(false, true)), []);
  assert.deepEqual(logic.quizExplanationChecks('A - Không đúng vì a.\nB - Chưa đúng\nC - Đúng vì c.', three),
    [{ kind: 'no_reason', letter: 'B' }]);
  assert.deepEqual(logic.quizExplanationChecks('A - Sai vì a.\nB - Sai vì b.\nC - Không đúng vì c.', three), [{ kind: 'says_wrong', letter: 'C' }]);
  assert.deepEqual(logic.quizExplanationChecks('Giải thích tự do, không theo từng phương án.', three), [], 'a free explanation is fine');
  assert.deepEqual(logic.quizExplanationChecks('A - Đúng vì a.', null), [], 'typed answers have no options to check');
  env.locale = 'vi';
  assert.equal(quizCheckText(t, { kind: 'says_correct', letter: 'B', correct: ['D'] }), 'Dòng B ghi Đúng nhưng đáp án đúng là D.');
  assert.equal(quizCheckText(t, { kind: 'missing', letters: ['C', 'D'] }), 'Chưa có dòng giải thích cho lựa chọn C, D.');
  env.locale = 'en';
  assert.equal(quizCheckText(t, { kind: 'no_reason', letter: 'A' }), 'Line A has no reason yet.');
});

test('rich editor -> standard frame: paragraphs and list items become lines; what plain text cannot keep is named', () => {
  assert.deepEqual(convertBothWays('<p>Cửa hàng có hai việc:</p><ul><li><p>Khách chờ</p></li><li><p>Kho &amp; hàng</p></li></ul><p>Việc nào trước?</p>', 'question'),
    { text: 'Cửa hàng có hai việc:\n- Khách chờ\n- Kho & hàng\nViệc nào trước?', losses: [] });
  assert.deepEqual(convertBothWays('<label>Một\n  dòng   dài</label><p>Hai<br>Ba</p><ul><li>x</li></ul>', 'question'),
    { text: 'Một dòng dài\nHai\nBa\n- x', losses: [] });
  const lossy = convertBothWays('<p>Xem <strong>đậm</strong> <a href="https://x.test">nguồn</a></p><p><img src="/a.png"></p><table><tr><td>ô</td></tr></table><p>\\(x^2\\)</p><script>alert(1)</script>', 'question');
  assert.equal(lossy.text, 'Xem đậm nguồn\nô\n\\(x^2\\)');
  assert.deepEqual([...lossy.losses].sort(), ['formatting', 'formulas', 'images', 'links', 'tables']);
  assert.deepEqual(convertBothWays('<p><span style="color:red">Đỏ</span> <math><mi>x</mi></math></p>', 'question').losses.sort(), ['formatting', 'formulas']);
  // "A …" becomes "A - …" only in an explanation and only when the lines clearly are the options A, B, … in order.
  assert.equal(convertBothWays('<p>Nguyên tắc: khách trước.</p><p>A. Sai vì a.</p><p>B) Đúng vì b.</p><p>C: Sai vì c.</p>', 'explanation').text,
    'Nguyên tắc: khách trước.\nA - Sai vì a.\nB - Đúng vì b.\nC - Sai vì c.');
  assert.equal(convertBothWays('<p>A. Một dòng duy nhất.</p>', 'explanation').text, 'A. Một dòng duy nhất.');
  assert.equal(convertBothWays('<p>B. Thứ hai</p><p>A. Thứ nhất</p>', 'explanation').text, 'B. Thứ hai\nA. Thứ nhất');
  assert.equal(convertBothWays('<p>A. Một</p><p>B. Hai</p>', 'question').text, 'A. Một\nB. Hai', 'a stem is never rewritten');
});

test('numbered lists keep their numbers as normal lines and the warning says so; one item stays one line', () => {
  assert.deepEqual(convertBothWays('<p>Sắp xếp các bước:</p><ol><li>Chào khách</li><li>Hỏi nhu cầu</li></ol><p>Bước nào sai?</p>', 'question'),
    { text: 'Sắp xếp các bước:\n1. Chào khách\n2. Hỏi nhu cầu\nBước nào sai?', losses: ['numbering'] });
  assert.equal(convertBothWays('<ol start="3"><li>c</li><li>d</li></ol>', 'question').text, '3. c\n4. d');
  assert.equal(convertBothWays('<p>Nguyên tắc.</p><ol type="A"><li>Sai vì a.</li><li>Đúng vì b.</li></ol>', 'explanation').text,
    'Nguyên tắc.\nA - Sai vì a.\nB - Đúng vì b.', 'lettered items read as the option lines');
  assert.deepEqual(convertBothWays('<ul><li>a<br>b</li></ul><p>Hỏi?</p>', 'question'), { text: '- a b\nHỏi?', losses: [] });
  assert.equal(convertBothWays('<ul><li><p>a</p><p>b</p></li><li><p>c</p></li></ul>', 'question').text, '- a b\n- c');
  assert.equal(convertBothWays('<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul><p>Hỏi?</p>', 'question').text, '- a\n- a1\n- b\nHỏi?');
  env.locale = 'vi';
  assert.equal(t('quizText.loseAsk', { items: t('quizText.lose.numbering') }),
    'Khi chuyển sang khung chuẩn, phần này sẽ mất: kiểu danh sách đánh số (số thứ tự sẽ thành chữ ở đầu mỗi dòng). Nếu muốn giữ lại, hãy đóng cửa sổ mà không lưu.');
});

test('no text is lost to a ">" inside an attribute, an unclosed <script>, or a comment; hidden elements stay hidden', () => {
  assert.deepEqual(convertBothWays('<p>Xem <img alt="a > b" src="/x.png"> hình</p>', 'question'), { text: 'Xem hình', losses: ['images'] });
  assert.equal(convertBothWays('<p>Đầu</p><script>x<p>Hỏi?</p>', 'question').text, 'Đầu\nx\nHỏi?');
  assert.equal(convertBothWays('<p>A<!-- B --></p><style>p{}</style><p>C</p><script>1<2</script><title>T</title>', 'question').text, 'A\nC');
  assert.equal(convertBothWays('<p>a &amp; b &lt;c&gt;&nbsp;d</p>', 'question').text, 'a & b <c> d');
  assert.deepEqual(convertBothWays('<pre>x\n  y</pre>', 'question'), { text: 'x\ny', losses: ['formatting'] });
});

test('characters XML cannot hold (a PowerPoint paste) never reach the saved problem', () => {
  assert.equal(textLogic.xmlSafeText('Dòng 1\u000bDòng 2\u000cDòng 3\r\nDòng 4\rDòng 5'), 'Dòng 1\nDòng 2\nDòng 3\nDòng 4\nDòng 5');
  assert.equal(textLogic.xmlSafeText('a\u0000b\u0007c\u001fd\te\ud800f\ufffeg😀'), 'abcd\tefg😀', 'other controls, U+FFFE and lone halves dropped; tab and emoji kept');
  assert.equal(textLogic.plainProblemHtml('label', 'Bối cảnh\u000b- ý\u0003\nHỏi?'), '<label>Bối cảnh\n- ý\nHỏi?</label>');
  const changes = [];
  const render = mount(hooked.QuizTextField);
  const tree = render({ kind: 'question', value: '', label: 'Câu hỏi', onChange: text => changes.push(text) });
  elements(tree).find(element => element.type === 'textarea').props.onChange({ target: { value: 'Một\u000bHai\u0007' } });
  assert.deepEqual(changes, ['Một\nHai'], 'what is typed or pasted is cleaned before it is stored');
  const editor = source('components/course-editor/editors/ProblemEditor.tsx');
  assert.match(editor, /return normalizeXmlVoidTags\(normalizeXmlEntities\(xmlSafeText\(xmlStr\)\)\);/, 'the whole problem is cleaned on open and on save');
});

test('a problem the editor cannot read shows a plain error and is never saved over', () => {
  const editor = source('components/course-editor/editors/ProblemEditor.tsx');
  assert.match(editor, /export function problemXmlUnreadable\(xmlStr: string\): boolean \{[\s\S]*?return parseProblemXml\(xmlStr\) === null;\n\}/);
  assert.match(editor, /\{unreadable \? <div role="alert"[\s\S]*?t\('courseEditorForms\.problemUnreadable'\)[\s\S]*?: <div className="flex flex-col lg:flex-row gap-8">/,
    'the form with the default question is not shown');
  const unit = source('components/course-editor/UnitEditor.tsx');
  assert.match(unit, /if \(category === 'problem'\) \{\s*\/\/[^\n]*\n\s*if \(problemXmlUnreadable\(problemXml\)\) \{\s*throw Object\.assign\(new Error\([^)]*\), \{ userMessage: i18n\.t\('courseUnit\.problemUnreadableSave'\) \}\);/);
  assert.match(unit, /typeof err\?\.userMessage === 'string' \? err\.userMessage : getLocalizedApiError/);
  for (const locale of ['vi', 'en']) {
    env.locale = locale;
    assert.match(t('courseUnit.saveFailed', { message: t('courseUnit.problemUnreadableSave') }), locale === 'vi'
      ? /^Lưu thất bại: không đọc được nội dung câu hỏi này, nên không lưu để câu hỏi gốc không bị ghi đè\.$/
      : /^Could not save: this question's content cannot be read, so it was not saved/);
    assert.doesNotMatch(t('courseEditorForms.problemUnreadable'), /XML|parse/i);
  }
  // The explanation read back from the XML loses xmlns on its tags only.
  assert.equal(textLogic.withoutTagNamespaces('<p xmlns="http://www.w3.org/1999/xhtml">Thuộc tính xmlns="http://x" giữ nguyên</p>'),
    '<p>Thuộc tính xmlns="http://x" giữ nguyên</p>');
  assert.match(editor, /explanationHtml = withoutTagNamespaces\(explanationHtml\);/);
});

test('save round trip: the standard frame stores K1 plain text; rich or styled fields are untouched until converted', () => {
  for (const html of ['<label>Bối cảnh &amp; số &lt;5&gt;\n- ý một\nHỏi?</label>', '<p>Nguyên tắc.\nA - Đúng vì a.</p>', '<label></label>']) {
    const field = logic.quizFieldFromHtml(html, 'label');
    assert.equal(field.mode, 'plain', html);
    assert.equal(textLogic.plainProblemHtml(field.tag, field.text), html, 'opening and storing again changes nothing');
  }
  assert.deepEqual(logic.quizFieldFromHtml('Câu hỏi trần?', 'label'), { mode: 'plain', tag: 'label', text: 'Câu hỏi trần?' });
  assert.deepEqual(logic.quizFieldFromHtml('', 'p', 'explanation'), { mode: 'plain', tag: 'p', text: '' }, 'a new, empty explanation opens in the standard frame');
  for (const empty of ['<label/>', '<label />']) assert.deepEqual(logic.quizFieldFromHtml(empty, 'p'), { mode: 'plain', tag: 'label', text: '' },
    'an empty stem saved and read back from the problem XML stays in the standard frame');
  for (const rich of ['<p>Một</p><p>Hai</p>', '<p>Câu <strong>đậm</strong></p>', '<p>Xem hình</p><img src="/a.png">',
    '<p style="text-align:center;color:red">Câu hỏi</p>', '<label for="q1" class="sr">Câu hỏi</label>', '<p class="x"/>']) {
    assert.deepEqual(logic.quizFieldFromHtml(rich, 'label'), { mode: 'rich' }, `${rich}: attributes or markup keep the rich editor`);
  }
  assert.equal(textLogic.problemPlainText('<p dir="auto">x</p>'), null, 'the preview keeps a styled paragraph as it is too');
  assert.equal(logic.plainQuizTextToRichHtml('Bối cảnh & <b>\n\n- ý\nHỏi?'), '<p>Bối cảnh &amp; &lt;b&gt;</p><p>- ý</p><p>Hỏi?</p>', 'free editing keeps the text, lines become paragraphs');
  const converted = logic.richQuizHtmlToText('<p>Bối cảnh</p><ul><li><p>ý</p></li></ul><p>Hỏi?</p>', 'question').text;
  assert.equal(textLogic.plainProblemHtml('label', converted), '<label>Bối cảnh\n- ý\nHỏi?</label>');
});

test('a starter stem ("Câu hỏi của bạn") opens empty with the example; left empty, it is kept so the problem stays valid', () => {
  for (const starter of ['Câu hỏi của bạn', 'Câu hỏi số học của bạn', 'Your question', 'Your numerical question']) {
    assert.deepEqual(logic.quizFieldFromHtml(`<label>${starter}</label>`, 'label', 'question'), { mode: 'plain', tag: 'label', text: '', starter });
    assert.deepEqual(logic.quizFieldFromHtml(`<p>${starter}</p>`, 'p', 'explanation'), { mode: 'plain', tag: 'p', text: starter }, 'only a stem is a starter');
  }
  env.locale = 'vi';
  const stored = [];
  const render = mount(hooked.ProblemTextSection);
  const props = { kind: 'question', html: '<label>Câu hỏi của bạn</label>', label: 'Câu hỏi', onHtmlChange: html => stored.push(html) };
  let field = render(props);
  assert.equal(field.props.value, '');
  assert.equal(field.props.starter, 'Câu hỏi của bạn');
  assert.deepEqual(stored, [], 'opening stores nothing: an untouched new problem saves its starter text');
  field.props.onChange('Câu của tôi?');
  field = render(props);
  field.props.onChange('');
  assert.deepEqual(stored, ['<label>Câu của tôi?</label>', '<label>Câu hỏi của bạn</label>'], 'emptied again: the starter text comes back');
  field = render(props);
  field.props.onSwitchToRich();
  assert.deepEqual(stored.at(-1), '<p>Câu hỏi của bạn</p>', 'free editing from the empty box keeps the starter text');
  const html = renderToStaticMarkup(h(QuizTextField, { kind: 'question', value: '', label: 'Câu hỏi', starter: 'Câu hỏi của bạn', onChange() {} }));
  assert.ok(html.includes('Nếu để trống, câu hỏi giữ câu mẫu “Câu hỏi của bạn”.'));
  assert.ok(html.includes('placeholder="Ví dụ:'));
  const editor = source('components/course-editor/editors/ProblemEditor.tsx');
  assert.match(editor, /questionHtml: `<p>\$\{t\('courseComponentDefaults\.problem\.question'\)\}<\/p>`,/, 'the editor default is a starter too');
  for (const key of ['question', 'numericalQuestion']) for (const locale of ['vi', 'en']) {
    assert.ok(logic.QUIZ_STARTER_STEMS.includes(locales[locale].courseComponentDefaults.problem[key]), `${locale} ${key}`);
  }
  const backend = path.resolve(src, '../../landa-backend/src/modules/course-authoring/course-authoring-problem-defaults.logic.ts');
  if (statSync(backend, { throwIfNoEntry: false })) {
    for (const [, label] of readFileSync(backend, 'utf8').matchAll(/<label>([^<]*)<\/label>/g)) assert.ok(logic.QUIZ_STARTER_STEMS.includes(label), label);
  }
});

test('the template is written in the quiz\'s language: from its own text, else the screen language', () => {
  assert.equal(logic.quizContentLocale(['<label>Your question</label>', 'Correct answer']), 'en');
  assert.equal(logic.quizContentLocale(['<label>Câu hỏi của bạn</label>', 'Đáp án đúng']), 'vi');
  assert.equal(logic.quizContentLocale(['<p>Which task first?</p>', '<p>Đúng</p>']), 'vi', 'any Vietnamese letter');
  assert.equal(logic.quizContentLocale(['100', '<p></p>', '&nbsp;']), null);
  assert.equal(logic.quizContentLocale(['Sai']), null, 'one short word tells nothing');
  env.locale = 'vi';
  const changes = [];
  const render = mount(hooked.QuizTextField);
  const tree = render({ kind: 'explanation', value: '', label: 'Explanation', choices: choices(true, false), templateLocale: 'en', onChange: text => changes.push(text) });
  press(tree, 'Chèn mẫu');
  assert.deepEqual(changes, ['Principle: \nA - Correct because \nB - Wrong because '], 'an English quiz on a Vietnamese screen');
  const editor = source('components/course-editor/editors/ProblemEditor.tsx');
  assert.match(editor, /const contentLocale = quizContentLocale\(\[state\.questionHtml, \.\.\.state\.choices\.map\(choice => choice\.html\), state\.explanationHtml\]\) \?\? undefined;/);
  assert.match(editor, /state\.choices\} templateLocale=\{contentLocale\}/);
});

test('Chèn mẫu twice on unchanged text leaves no pending cursor jump; + Thêm ý puts the cursor on the new item', () => {
  env.locale = 'vi';
  const template = 'Nguyên tắc: \nA - Đúng vì \nB - Sai vì ';
  const selections = [];
  const box = { value: template, focus() {}, setSelectionRange(start, end) { selections.push([start, end]); } };
  const render = mount(hooked.QuizTextField);
  const props = { kind: 'explanation', value: template, label: 'Giải thích', choices: choices(true, false), onChange: () => assert.fail('nothing changes') };
  let tree = render(props);
  elements(tree).find(element => element.type === 'textarea').props.ref.current = box;
  press(tree, 'Chèn mẫu');
  tree = render(props);
  assert.match(dialogText(tree), /Thay toàn bộ phần giải thích đang có bằng mẫu\?/);
  press(tree, 'Thay bằng mẫu');
  assert.deepEqual(selections, [[12, 12]], 'the cursor goes to the principle at once');
  render(props);
  box.value = `${template}x`;
  render({ ...props, value: box.value });
  assert.deepEqual(selections, [[12, 12]], 'the next keystroke does not move the cursor');
  // + Thêm ý: the parent stores the text, then the cursor lands right after the new "- ".
  const stemSelections = [];
  const stemBox = { value: 'Bối cảnh:\nHỏi?', focus() {}, setSelectionRange(start) { stemSelections.push(start); } };
  const stem = mount(hooked.QuizTextField);
  let stored = null;
  const stemProps = { kind: 'question', value: stemBox.value, label: 'Câu hỏi', onChange: text => { stored = text; } };
  tree = stem(stemProps);
  elements(tree).find(element => element.type === 'textarea').props.ref.current = stemBox;
  press(tree, '+ Thêm ý');
  assert.equal(stored, 'Bối cảnh:\n- \nHỏi?');
  stemBox.value = stored;
  stem({ ...stemProps, value: stored });
  assert.deepEqual(stemSelections, ['Bối cảnh:\n- '.length]);
});

test('Soạn tự do asks first when the look would change; cancelling keeps the text as it is', () => {
  for (const [kind, text, asks] of [['question', 'Bối cảnh\n- ý\nHỏi?', true], ['question', 'Hỏi?', true], ['explanation', 'Nguyên tắc.\nA - Đúng vì a.', true],
    ['explanation', 'Giải thích tự do.\nDòng hai.', false], ['question', '', false]]) {
    assert.equal(logic.quizRichSwitchChangesLook(kind, text), asks, `${kind}: ${text}`);
  }
  for (const locale of ['vi', 'en']) {
    env.locale = locale;
    const vi = locale === 'vi';
    let switched = 0;
    const render = mount(hooked.QuizTextField);
    const props = { kind: 'question', value: 'Bối cảnh\n- ý\nHỏi?', label: 'Câu hỏi', onChange: () => assert.fail('the text stays'), onSwitchToRich: () => { switched += 1; } };
    let tree = render(props);
    press(tree, vi ? 'Soạn tự do' : 'Free editing');
    tree = render(props);
    assert.equal(switched, 0);
    assert.equal(dialogText(tree).startsWith(vi ? 'Khi soạn tự do, các dòng gạch đầu dòng sẽ thành đoạn văn thường và dòng câu hỏi không còn in đậm.'
      : 'In free editing, list lines become normal paragraphs and the question line is no longer bold.'), true);
    press(tree, vi ? 'Giữ khung chuẩn' : 'Keep the standard frame');
    tree = render(props);
    assert.equal(dialogText(tree), '');
    assert.equal(switched, 0, 'cancelled: nothing changes');
    press(tree, vi ? 'Soạn tự do' : 'Free editing');
    press(render(props), vi ? 'Vẫn soạn tự do' : 'Switch anyway');
    assert.equal(switched, 1);
    const why = mount(hooked.QuizTextField);
    const whyTree = why({ kind: 'explanation', value: 'Nguyên tắc.\nA - Đúng vì a.', label: 'x', choices: choices(true), onChange() {}, onSwitchToRich() {} });
    press(whyTree, vi ? 'Soạn tự do' : 'Free editing');
  }
  let direct = 0;
  const free = mount(hooked.QuizTextField);
  press(free({ kind: 'explanation', value: 'Giải thích tự do.', label: 'x', onChange() {}, onSwitchToRich: () => { direct += 1; } }), 'Free editing');
  assert.equal(direct, 1, 'nothing would change: no question asked');
});

test('Chuyển sang khung chuẩn names what would be lost as the content is now, and converts that content', () => {
  env.locale = 'vi';
  const converted = [];
  const render = mount(hooked.ProblemRichToStandard);
  const props = { html: '<p>Xem hình</p><p><img src="/a.png"></p><p>Hỏi?</p>', kind: 'question', onConvert: text => converted.push(text) };
  let tree = render(props);
  press(tree, 'Chuyển sang khung chuẩn');
  tree = render(props);
  assert.match(dialogText(tree), /sẽ mất: hình ảnh hoặc video\./);
  assert.deepEqual(converted, [], 'never converted before the author confirms');
  const changed = { ...props, html: '<p>Xem hình</p><p><img src="/a.png"></p><p><a href="https://x.test">nguồn</a></p><p>Hỏi mới?</p>' };
  tree = render(changed);
  assert.match(dialogText(tree), /sẽ mất: hình ảnh hoặc video, liên kết\./, 'edited while the warning was open: the warning follows');
  press(tree, 'Chuyển');
  assert.deepEqual(converted, ['Xem hình\nnguồn\nHỏi mới?']);
  const plain = mount(hooked.ProblemRichToStandard);
  press(plain({ html: '<p>Một</p><p>Hai?</p>', kind: 'question', onConvert: text => converted.push(text) }), 'Chuyển sang khung chuẩn');
  assert.equal(converted.at(-1), 'Một\nHai?', 'nothing lost: converted at once');
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
  const editor = source('components/course-editor/editors/ProblemEditor.tsx');
  assert.match(editor, /<ProblemTextSection key=\{`question:\$\{textSectionKey\}`\} kind="question" html=\{state\.questionHtml\}/);
  assert.match(editor, /choices=\{state\.type === 'numericalresponse' \|\| state\.type === 'stringresponse' \? null : state\.choices\}/);
  assert.doesNotMatch(editor, /useEffect\([^)]*questionHtml/, 'nothing rewrites a stored field on open');
  const section = source('components/course-editor/editors/ProblemTextSection.tsx');
  assert.match(section, /useState<QuizFieldMode>\(\(\) => quizFieldFromHtml\(html, fallback, kind\)\)/);
  for (const locale of ['vi', 'en']) {
    const copy = locales[locale].quizText;
    for (const loss of ['images', 'formulas', 'links', 'formatting', 'tables', 'numbering']) assert.equal(typeof copy.lose[loss], 'string');
    const strings = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(strings);
    for (const value of strings(copy)) assert.doesNotMatch(value, /_|\b(?:K1|HTML|XML|KB|API)\b/, value);
  }
  const shape = value => typeof value === 'string' ? 'string' : Object.fromEntries(Object.keys(value).sort().map(key => [key, shape(value[key])]));
  assert.deepEqual(shape(locales.en.quizText), shape(locales.vi.quizText));
});
