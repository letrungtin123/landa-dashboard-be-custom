import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./lesson-author-blueprint-media.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildBlueprintMediaPresentation: select, getBlueprintMediaReviewCopy: copy } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
);

function fixture(statuses) {
  const units = statuses.map((status, i) => ({
    title: `Unit ${i + 1}`, component_plan: [],
    ...(status === 'PROPOSED' ? { media_plan: {
      type: i % 2 ? 'static_infographic' : 'video', title: `Media ${i + 1}`,
      content_outline: 'Synthetic approved evidence', rationale: 'Supported learner action',
    } } : {}),
  }));
  return {
    chapters: [{ title: 'Chapter', lessons: [{ title: 'Lesson', units }] }],
    review: { version: 'media-review-v1', decisions: statuses.map((status, i) => ({
      unit_path: `chapter_1.lesson_1.unit_${i + 1}`, status, reason_code: 'SYNTHETIC_REASON',
    })) },
  };
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return value;
}

test('five proposals and nine NOT_NEEDED decisions produce only five cards without mutating audit data', () => {
  const input = deepFreeze(fixture([...Array(5).fill('PROPOSED'), ...Array(9).fill('NOT_NEEDED')]));
  const before = JSON.stringify(input);
  const view = select(input.chapters, input.review);
  assert.equal(view.proposals.length, 5);
  assert.equal(view.decisions.length, 0);
  assert.equal(view.state, 'complete');
  assert.deepEqual(view.proposals.map(p => p.unitIndex), [0, 1, 2, 3, 4]);
  assert.deepEqual(new Set(view.proposals.map(p => p.media.type)), new Set(['video', 'static_infographic']));
  assert.equal(JSON.stringify(input), before);
  assert.equal(input.review.decisions.length, 14);
});

test('filtering uses status rather than the localized reason text', () => {
  const input = fixture(['NOT_NEEDED', 'FAILED']);
  input.review.decisions[0].reason_code = 'Any reason in any language';
  input.review.decisions[1].reason_code = 'NO_SOURCE_BACKED_VISUAL_CANDIDATE';
  const view = select(input.chapters, input.review);
  assert.equal(view.decisions.length, 1);
  assert.equal(view.decisions[0].mediaStatus, 'FAILED');
  assert.equal(view.state, 'attention');
});

test('a completed all-not-needed review produces one clear localized empty state', () => {
  const input = fixture(['NOT_NEEDED', 'NOT_NEEDED']);
  const view = select(input.chapters, input.review);
  assert.equal(view.state, 'complete');
  assert.equal(view.proposals.length + view.decisions.length, 0);
  assert.equal(copy(view.state, 'en').emptyTitle, 'No video or infographic recommendations');
  assert.equal(copy(view.state, 'vi').emptyTitle, 'Không có đề xuất video hoặc infographic');
  assert.match(copy(view.state, 'en').emptyDescription, /completed evaluation/);
  assert.match(copy(view.state, 'vi').emptyDescription, /đã hoàn tất/);
});

test('source gaps, failures and explicit unevaluated units remain visible', () => {
  const input = fixture(['NOT_NEEDED', 'SOURCE_GAP', 'FAILED', 'NOT_EVALUATED', 'PROPOSED']);
  const view = select(input.chapters, input.review);
  assert.equal(view.proposals.length, 1);
  assert.deepEqual(view.decisions.map(d => d.mediaStatus), ['SOURCE_GAP', 'FAILED', 'NOT_EVALUATED']);
  assert.equal(view.state, 'attention');
  for (const locale of ['vi', 'en']) {
    assert.notEqual(copy(view.state, locale).emptyTitle, copy('complete', locale).emptyTitle);
  }
});

test('legacy proposals without review metadata stay visible and are not marked evaluated', () => {
  const input = fixture(['PROPOSED']);
  const view = select(input.chapters);
  assert.equal(view.proposals.length, 1);
  assert.equal(view.proposals[0].media, input.chapters[0].lessons[0].units[0].media_plan);
  assert.equal(view.proposals[0].mediaStatus, 'NOT_EVALUATED');
  assert.equal(view.state, 'not_evaluated');
  assert.equal(view.decisions.length, 0);
});

test('missing, empty and partial evaluation cannot claim no media needed', () => {
  const input = fixture(['NOT_NEEDED', 'NOT_NEEDED']);
  assert.equal(select(input.chapters).state, 'not_evaluated');
  assert.equal(select(input.chapters, { version: 'media-review-v1', decisions: [] }).state, 'incomplete');
  input.review.decisions.pop();
  assert.equal(select(input.chapters, input.review).state, 'incomplete');
  assert.equal(select([], { version: 'media-review-v1', decisions: [] }).state, 'incomplete');
  for (const locale of ['vi', 'en']) {
    const titles = ['not_evaluated', 'incomplete', 'attention', 'complete'].map(state => copy(state, locale).emptyTitle);
    assert.equal(new Set(titles).size, 4);
  }
});

test('a PROPOSED decision without a brief surfaces an incomplete-data warning, not an empty success', () => {
  const input = fixture(['PROPOSED']);
  delete input.chapters[0].lessons[0].units[0].media_plan;
  const view = select(input.chapters, input.review);
  assert.equal(view.state, 'attention');
  assert.equal(view.proposals.length, 0);
  assert.equal(view.decisions[0].reasonCode, 'MEDIA_PLAN_MISSING');
  assert.equal(view.decisions[0].mediaStatus, 'NOT_EVALUATED');
  assert.equal(input.review.decisions[0].status, 'PROPOSED');
});

test('an inconsistent NOT_NEEDED decision does not silently delete an existing brief', () => {
  const input = fixture(['PROPOSED']);
  input.review.decisions[0].status = 'NOT_NEEDED';
  const view = select(input.chapters, input.review);
  assert.equal(view.proposals.length, 1);
  assert.equal(view.decisions.length, 0);
  assert.equal(view.state, 'attention');
});

test('duplicate and foreign decision paths cannot produce a complete evaluation', () => {
  const input = fixture(['NOT_NEEDED']);
  input.review.decisions.push({ ...input.review.decisions[0] });
  assert.equal(select(input.chapters, input.review).state, 'attention');
  input.review.decisions[1].unit_path = 'chapter_2.lesson_1.unit_1';
  assert.equal(select(input.chapters, input.review).state, 'attention');
});

test('dialog uses the tested presentation selector and localized empty-state copy', () => {
  const dialog = readFileSync(new URL('./lesson-author-blueprint-dialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /buildBlueprintMediaPresentation\(chapters \?\? \[\], blueprintEvent\?\.blueprint\.media_review\)/);
  assert.match(dialog, /proposals: mediaPlacements, decisions: mediaDecisionPlacements/);
  assert.match(dialog, /\{mediaCopy\.notice\}/);
  assert.match(dialog, /\{mediaCopy\.emptyTitle\}/);
  assert.match(dialog, /\{mediaCopy\.emptyDescription\}/);
  assert.doesNotMatch(dialog, /mediaReviewNotice/);
});
