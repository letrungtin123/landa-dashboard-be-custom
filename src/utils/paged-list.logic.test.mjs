import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const output = ts.transpileModule(read('./paged-list.logic.ts'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { MAX_API_PAGE_SIZE, nextPageNumber } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('asks for the next page until every row of the total is loaded', () => {
  assert.equal(MAX_API_PAGE_SIZE, 100);
  assert.equal(nextPageNumber([{ rows: 100 }], 250), 2);
  assert.equal(nextPageNumber([{ rows: 100 }, { rows: 100 }], 250), 3);
  assert.equal(nextPageNumber([{ rows: 100 }, { rows: 100 }, { rows: 50 }], 250), undefined);
  assert.equal(nextPageNumber([{ rows: 40 }], 40), undefined);
});

test('stops on an empty page or no pages, even when the total says more', () => {
  assert.equal(nextPageNumber([], 10), undefined);
  assert.equal(nextPageNumber([{ rows: 100 }, { rows: 0 }], 300), undefined);
});

test('groups and library category pickers page through the backend limit instead of truncating', () => {
  const groups = read('../components/groups/OrgGroupPanel.tsx');
  assert.match(groups, /useInfiniteQuery\(/);
  assert.match(groups, /getOrgGroups\(\{ page: pageParam, page_size: MAX_API_PAGE_SIZE \}\)/);
  assert.match(groups, /t\('common\.loadMoreShown'/);
  assert.doesNotMatch(groups, /page_size: 100/);

  const hook = read('../hooks/queries/use-library-category-options.ts');
  assert.match(hook, /getCategories\(\{ page: pageParam, page_size: MAX_API_PAGE_SIZE \}\)/);
  const library = read('../api/custom-library.ts');
  assert.doesNotMatch(library, /page_size: 200/);
  const documents = read('../components/library/documents-tab.tsx');
  assert.match(documents, /footer: categoryLoadMore/);
  assert.match(documents, /\{categoryLoadMore\}\s*<\/SelectContent>/);

  for (const locale of ['vi', 'en']) {
    assert.match(read(`../i18n/locales/${locale}.ts`), /loadMoreShown: ".*\{\{shown\}\}.*\{\{total\}\}.*"/, locale);
  }
});
