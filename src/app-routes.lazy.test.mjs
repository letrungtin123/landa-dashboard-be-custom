import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// A lazy page that suspends without its own boundary suspends the shared root
// one and the whole layout (sidebar, header) goes blank. Every lazy component
// in App.tsx and the dashboard layout must render inside <LazyPage> or <Suspense>.
function lazyOutsideBoundary(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const lazy = new Set();
  ts.forEachChild(file, function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const text = node.initializer.getText(file);
      if (/^(import\.meta\.env\.DEV \? )?lazy\(/.test(text)) lazy.add(node.name.text);
    }
    ts.forEachChild(node, collect);
  });
  const outside = [];
  (function visit(node, inside) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(file);
      if (tag === 'Suspense' || tag === 'LazyPage') inside = true;
    }
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && lazy.has(node.tagName.getText(file)) && !inside) {
      outside.push(node.tagName.getText(file));
    }
    ts.forEachChild(node, (child) => visit(child, inside));
  })(file, false);
  return { lazy, outside };
}

test('every signed-in page is a lazy chunk rendered inside its own LazyPage boundary', () => {
  const { lazy, outside } = lazyOutsideBoundary('./App.tsx');
  for (const page of ['DashboardPage', 'CourseEditorPage', 'ReportSummaryPage', 'AiChatbotPage', 'NewsManagementPage', 'HelpDocsPage']) {
    assert.ok(lazy.has(page), `${page} is lazy`);
  }
  assert.ok(lazy.size >= 24, String(lazy.size));
  assert.deepEqual(outside, []);
});

test('the chat widget is lazy and has its own boundary in the dashboard layout', () => {
  const { lazy, outside } = lazyOutsideBoundary('./layout/dashboard-layout.tsx');
  assert.ok(lazy.has('ChatWidget'));
  assert.deepEqual(outside, []);
});

test('the sign-in page stays in the main chunk; charts are not grouped into the preloaded ui chunk', () => {
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(app, /^import LoginPage from '@\/pages\/login';$/m);
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /assetsInlineLimit: 4 \* 1024/);
  assert.doesNotMatch(config, /node_modules\/recharts'\) \|\|/);
});
