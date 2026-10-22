import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Saving a problem whose stored content the editor cannot read (QC review 22/10, D1): a rename sends the original
// content byte for byte; rebuilt or edited content for it is refused with a plain message.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '..', '..');
const loaded = new Map();
const mocks = { '@/utils/storage-url': { storageUrl: value => value } };
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.join(src, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      return load([`${base}.ts`, `${base}.tsx`].find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile()));
    }
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  loaded.set(file, module.exports);
  return module.exports;
}
const { problemDataForSave, problemSaveRequest } = load(path.join(directory, 'problem-save.logic.ts'));
const source = file => readFileSync(path.join(src, file), 'utf8').replace(/\r\n/g, '\n');

// The editor's own rules need a browser (DOMParser); here: a type it does not edit, or damaged XML, is unreadable.
const normalized = [];
const rules = {
  unreadable: xml => /customresponse|<broken/.test(xml),
  normalize: xml => { normalized.push(xml); return `stored:${xml}`; },
};
const unreadable = '<problem>\r\n  <customresponse cfn="check">\n    <p>Câu&nbsp;gốc <br>dòng hai</p>\v\n  </customresponse>\n</problem>  ';
const defaultQuestion = '<problem>\n  <multiplechoiceresponse>\n    <label>Câu hỏi của bạn</label>\n  </multiplechoiceresponse>\n</problem>';

test('renaming an unreadable problem sends its original content byte for byte, with the new name', () => {
  normalized.length = 0;
  const request = problemSaveRequest({ displayName: 'Tên mới', metadata: { display_name: 'Tên cũ', weight: 1 }, current: unreadable, original: unreadable }, rules);
  assert.deepEqual(request, { metadata: { display_name: 'Tên mới', weight: 1 }, data: unreadable });
  assert.equal(request.data, unreadable, 'the very same text: line endings, entities, tags, spaces and control characters included');
  assert.deepEqual(normalized, [], 'nothing is rebuilt or normalized');
  const withMedia = problemSaveRequest({ displayName: 'Tên mới', metadata: { problem_media: { youtube_id: 'abc12345678' } }, current: unreadable, original: unreadable }, rules);
  assert.equal(withMedia.data, unreadable);
  assert.equal(withMedia.metadata.problem_media.youtube_id, 'abc12345678', 'its media settings are saved as before');
});

test('any other content for an unreadable problem is refused; readable problems save as before', () => {
  normalized.length = 0;
  assert.equal(problemDataForSave(defaultQuestion, unreadable, rules), null, 'the default question never replaces the real one');
  assert.equal(problemDataForSave(`${unreadable}<!-- edited -->`, unreadable, rules), null);
  assert.equal(problemSaveRequest({ displayName: 'x', metadata: {}, current: defaultQuestion, original: unreadable }, rules), null);
  assert.equal(problemDataForSave('<broken><multiplechoiceresponse>', defaultQuestion, rules), null, 'edited content that cannot be read is refused too');
  assert.deepEqual(normalized, []);
  assert.equal(problemDataForSave(defaultQuestion, defaultQuestion.replace('Câu hỏi của bạn', 'Cũ'), rules), `stored:${defaultQuestion}`);
  assert.equal(problemDataForSave(defaultQuestion, '', rules), `stored:${defaultQuestion}`, 'a problem stored empty takes the edited content');
  assert.deepEqual(problemSaveRequest({ displayName: 'Tên', metadata: { problem_media: { images: [] } }, current: defaultQuestion, original: '' }, rules),
    { metadata: { display_name: 'Tên' }, data: `stored:${defaultQuestion}` }, 'empty media is not sent');
});

test('the unit editor sends exactly this request, built from the stored content it opened with', () => {
  const unit = source('components/course-editor/UnitEditor.tsx');
  assert.match(unit, /problemXml: typeof blockInfo\?\.data === 'string' \? blockInfo\.data : '',/, 'the original is the stored text as received');
  assert.match(unit, /const request = problemSaveRequest\(\n\s*\{ displayName, metadata: effectiveMetadata, current: problemXml, original: initialState\.problemXml \},\n\s*\{ unreadable: problemXmlUnreadable, normalize: normalizeProblemXmlForStorage \},\n\s*\);\n\s*if \(!request\) \{\n\s*throw Object\.assign\(new Error\([^)]*\), \{ userMessage: i18n\.t\('courseUnit\.problemUnreadableSave'\) \}\);\n\s*\}\n\s*return updateXBlock\(id, request\);/);
  assert.doesNotMatch(unit, /data: normalizeProblemXmlForStorage\(problemXml\)/, 'no other problem save path rebuilds the content');
  assert.match(unit, /const message = typeof err\?\.userMessage === 'string' \? err\.userMessage : getLocalizedApiError/);
  const editor = source('components/course-editor/editors/ProblemEditor.tsx');
  assert.match(editor, /\{unreadable \? <div role="alert"[\s\S]*?: <div className="flex flex-col lg:flex-row gap-8">/, 'no form, so no content edit');
  assert.match(editor, /value=\{displayName\}\n\s*onChange=\{e => onDisplayNameChange\(e\.target\.value\)\}/, 'the name stays editable');
  for (const [locale, saveFailed, refused, banner] of [
    ['vi', /saveFailed: "Lưu thất bại: \{\{message\}\}"/, /problemUnreadableSave: "không đọc được nội dung câu hỏi này, nên không lưu để câu hỏi gốc không bị ghi đè\."/,
      /problemUnreadable: "[^"]*Bạn vẫn đổi được tên; khi lưu, nội dung gốc được giữ nguyên\."/],
    ['en', /saveFailed: "Could not save: \{\{message\}\}"/, /problemUnreadableSave: "this question's content cannot be read, so it was not saved and the original question is not overwritten\."/,
      /problemUnreadable: "[^"]*You can still rename it; saving keeps the original content unchanged\."/],
  ]) {
    const copy = source(`i18n/locales/${locale}.ts`);
    for (const pattern of [saveFailed, refused, banner]) assert.match(copy, pattern, `${locale}: ${pattern}`);
  }
});
