import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Real availability logic, hook and hint component with inert auth/network
// boundaries. SSR proves the copy and the gate; it does not claim browser
// layout or live backend coverage. The courses page itself is checked at
// source level (it is too large to render with its full dependency tree).
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const h = React.createElement;
const TENANT = '10000000-0000-4000-8000-000000000001';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000002';

const env = { flag: 'true', locale: 'vi', user: null, authenticated: true, canEdit: true, activeTenantId: null, data: undefined, queries: [] };
const locales = {};

function t(key) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales[env.locale]);
  assert.equal(typeof value, 'string', `missing ${env.locale} translation ${key}`);
  return value;
}

const mocks = {
  './custom-client': { customApiClient: {} },
  '@/api/custom-chat': { fetchLessonAuthorChatSettings: async () => env.data },
  '@/utils/store': { useAuthStore: select => select({ user: env.user, isAuthenticated: env.authenticated, isLoggingOut: false,
    hasPermission: (module, action) => module === 'courses' && action === 'can_edit' && env.canEdit }) },
  '@/utils/tenant-store': { useTenantStore: select => select({ activeTenantId: env.activeTenantId }) },
  '@tanstack/react-query': { useQuery: options => { env.queries.push(options); return { data: options.enabled ? env.data : undefined }; } },
  'react-i18next': { useTranslation: () => ({ t }) },
  'lucide-react': new Proxy({}, { get: () => () => h('i') }),
  __test_env: env,
};

const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const source = readFileSync(file, 'utf8')
    .replaceAll('import.meta.env.VITE_LESSON_AUTHOR_WORKSPACE_ENABLED', "require('__test_env').flag");
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier === './vi') return locales.viModule;
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.join(src, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile());
      return load(target);
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
const logic = load(path.join(src, 'api/lesson-author-availability.logic.ts'));
const { useLessonAuthorAvailable, lessonAuthorAvailabilityKeys } = load(path.join(src, 'hooks/queries/use-lesson-author-availability.ts'));
const { CourseAiIdDescriptionHint } = load(path.join(directory, 'CourseAiIdDescriptionHint.tsx'));

const settings = (overrides = {}) => ({ active_kb: null, active_persona: null, active_bot: { id: 'a', tenant_id: TENANT, target: 'lesson_author',
  bot_id: 'b', bot_name: 'AI ID', bot_avatar_url: null, bot_kb_id: null, bot_kb_name: null, ai_active_engine: 'self_built_rag', ...overrides } });
const staff = { id: 'u1', role: 'staff', tenant_id: TENANT };
function reset(overrides = {}) {
  Object.assign(env, { flag: 'true', locale: 'vi', user: staff, authenticated: true, canEdit: true, activeTenantId: null, data: settings(), queries: [] }, overrides);
}

test('AI ID hint copy exists in Vietnamese and English', () => {
  for (const locale of ['vi', 'en']) {
    const courses = locales[locale].courses;
    for (const key of ['aiIdDescriptionHintTitle', 'aiIdDescriptionHintBody', 'aiIdDescriptionPlaceholder']) {
      assert.equal(typeof courses[key], 'string', `${locale}.courses.${key}`);
      assert.ok(courses[key].trim().length > 20, `${locale}.courses.${key} is too short`);
    }
    assert.match(courses.aiIdDescriptionHintTitle, /AI ID/);
  }
  assert.match(locales.vi.courses.aiIdDescriptionHintBody, /dành cho ai/);
  assert.match(locales.en.courses.aiIdDescriptionHintBody, /who it is for/);
});

test('deployment means a lesson_author bot of this tenant on the AI ID engine', () => {
  assert.equal(logic.isLessonAuthorDeployedForTenant(settings(), TENANT), true);
  assert.equal(logic.isLessonAuthorDeployedForTenant(settings(), OTHER_TENANT), false);
  assert.equal(logic.isLessonAuthorDeployedForTenant(settings(), null), false);
  assert.equal(logic.isLessonAuthorDeployedForTenant(settings({ ai_active_engine: 'gemini_file_search' }), TENANT), false);
  assert.equal(logic.isLessonAuthorDeployedForTenant(settings({ target: 'admin' }), TENANT), false);
  assert.equal(logic.isLessonAuthorDeployedForTenant({ active_bot: null, active_kb: null, active_persona: null }, TENANT), false);
  assert.equal(logic.isLessonAuthorDeployedForTenant(undefined, TENANT), false);
});

test('hook asks the server only when the AI ID entry point would show, keyed by tenant', () => {
  reset();
  assert.equal(useLessonAuthorAvailable(true), true);
  assert.equal(env.queries.at(-1).enabled, true);
  assert.deepEqual(env.queries.at(-1).queryKey, lessonAuthorAvailabilityKeys.tenant(TENANT));

  reset();
  assert.equal(useLessonAuthorAvailable(false), false, 'closed dialog never reads');
  assert.equal(env.queries.at(-1).enabled, false);

  for (const overrides of [{ flag: undefined }, { flag: 'false' }, { canEdit: false }, { authenticated: false },
    { user: { ...staff, role: 'learner_plus' } }, { user: { ...staff, tenant_id: null } }, { data: settings({ tenant_id: OTHER_TENANT }) }]) {
    reset(overrides);
    assert.equal(useLessonAuthorAvailable(true), false, JSON.stringify(overrides));
  }

  reset({ data: { active_bot: null, active_kb: null, active_persona: null } });
  assert.equal(useLessonAuthorAvailable(true), false, 'tenant without AI ID deployed');
});

test('superadmin follows the tenant chosen in the tenant switcher', () => {
  reset({ user: { id: 'sa', role: 'superadmin', tenant_id: OTHER_TENANT }, activeTenantId: TENANT });
  assert.equal(useLessonAuthorAvailable(true), true);
  assert.deepEqual(env.queries.at(-1).queryKey, lessonAuthorAvailabilityKeys.tenant(TENANT));

  reset({ user: { id: 'sa', role: 'superadmin', tenant_id: TENANT }, activeTenantId: null });
  assert.equal(useLessonAuthorAvailable(true), false, 'no active tenant chosen');
  assert.equal(env.queries.at(-1).enabled, false);
});

test('hint renders the localized warning only when AI ID is available', () => {
  reset();
  assert.equal(renderToStaticMarkup(h(CourseAiIdDescriptionHint, { show: false })), '');
  for (const locale of ['vi', 'en']) {
    env.locale = locale;
    const html = renderToStaticMarkup(h(CourseAiIdDescriptionHint, { show: true }));
    assert.match(html, /role="note"/);
    assert.ok(html.includes(locales[locale].courses.aiIdDescriptionHintTitle));
    assert.ok(html.includes(locales[locale].courses.aiIdDescriptionHintBody));
  }
});

test('create and edit course dialogs place the hint at the description field', () => {
  const page = readFileSync(path.join(src, 'pages/courses.tsx'), 'utf8');
  assert.match(page, /const createAiIdAvailable = useLessonAuthorAvailable\(showCreate\);/);
  assert.match(page, /const aiIdAvailable = useLessonAuthorAvailable\(open\);/);
  const create = page.slice(page.indexOf("t('courses.createTitle')"), page.indexOf("t('courses.organization')"));
  assert.match(create, /courses\.descriptionLabel[\s\S]*<CourseAiIdDescriptionHint show=\{createAiIdAvailable\} \/>\s*<textarea/);
  assert.match(create, /createAiIdAvailable \? 'courses\.aiIdDescriptionPlaceholder' : 'courses\.descriptionPlaceholder'/);
  const edit = page.slice(page.indexOf('function CourseInfoDialog'), page.indexOf('function CourseMentorDialog'));
  assert.match(edit, /courses\.descriptionLabel[\s\S]*<CourseAiIdDescriptionHint show=\{aiIdAvailable\} \/>\s*<textarea/);
  assert.match(edit, /aiIdAvailable \? 'courses\.aiIdDescriptionPlaceholder' : 'courses\.descriptionInputPlaceholder'/);
  // Validation is unchanged: whitespace-only descriptions still cannot be submitted.
  assert.match(page, /canSubmitCreateCourse = Boolean\(newName\.trim\(\) && newDescription\.trim\(\)/);
  assert.match(edit, /canSave = Boolean\(displayName\.trim\(\) && description\.trim\(\)\)/);
});
