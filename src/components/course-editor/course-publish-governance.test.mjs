import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const api = read('../../api/course-publish-governance.ts');
const authoringApi = read('../../api/custom-course-authoring.ts');
const dialog = read('./CoursePublishGovernanceDialog.tsx');
const outline = read('./OutlineTree.tsx');
const editor = read('../../pages/course-editor.tsx');
const localizedError = read('../../utils/localized-error.ts');
const vi = read('../../i18n/locales/vi.ts');
const en = read('../../i18n/locales/en.ts');

test('publish governance uses only the authenticated custom backend API', () => {
  assert.match(api, /import \{ customApiClient \} from '\.\/custom-client'/);
  assert.match(api, /const BASE = '\/api\/course-authoring\/publish-governance'/);
  assert.doesNotMatch(api, /fetch\(|axios|supabase|cmsApiClient/);
  for (const operation of [
    'getCoursePublishGovernanceState',
    'setCoursePublishPolicy',
    'listCoursePublishReviewerOptions',
    'assignCoursePublishReviewer',
    'revokeCoursePublishReviewer',
    'createCoursePublishCandidate',
    'getCoursePublishCandidateEligibility',
    'approveCoursePublishCandidate',
  ]) assert.match(api, new RegExp(`export async function ${operation}`));
});

test('ordinary publish stays backward compatible and exact candidates are opt-in', () => {
  assert.match(authoringApi,
    /publishBlock\(blockId: string, candidateId\?: string\)[\s\S]*candidateId \? \{ candidate_id: candidateId \} : \{\}/);
  assert.match(outline, /governance\.status === 'disabled'/);
  assert.match(outline, /governance\.status === 'enabled' && !governance\.state\?\.policy/);
  assert.match(outline, /governance\.status !== 'enabled'[\s\S]*COURSE_PUBLISH_STATE_UNAVAILABLE/);
  assert.match(outline, /getCoursePublishCandidateEligibility\(candidate\.id\)/);
  assert.match(outline, /if \(!eligibility \|\| !eligibility\.eligible\)/);
  assert.match(outline, /publishBlock\(node\.id, candidate\.id\)/);
});

test('reviewer and publisher UI is not exposed in the existing course editor', () => {
  assert.doesNotMatch(editor, /CoursePublishGovernanceDialog/);
  assert.match(dialog, /COURSE_PUBLISH_GOVERNANCE_UNAVAILABLE|isCoursePublishGovernanceUnavailable/);
  assert.match(dialog, /getCoursePublishCandidateEligibility/);
  assert.match(dialog, /approveCoursePublishCandidate/);
  assert.match(dialog, /publishBlock\(eligibility!\.target_block_id, eligibility!\.candidate_id\)/);
  assert.doesNotMatch(dialog, /lesson-author-workspace|workspace-course-host|Mindmap|Tổng quan/);
});

test('review and conflict states are presented as localized business messages', () => {
  for (const key of [
    'POLICY_CHANGED',
    'CANDIDATE_EXPIRED',
    'CANDIDATE_STALE',
    'APPROVAL_REQUIRED',
    'QUALITY_RECEIPT_MISSING',
    'CRITICAL_FINDINGS_UNRESOLVED',
    'ASSESSMENT_OBLIGATIONS_OPEN',
  ]) {
    assert.match(api, new RegExp(`'${key}'`));
  }
  for (const code of [
    'COURSE_PUBLISH_CANDIDATE_STALE',
    'COURSE_PUBLISH_POLICY_CHANGED',
    'COURSE_PUBLISH_APPROVAL_REQUIRED',
    'COURSE_PUBLISH_COMMIT_INVALID',
  ]) assert.match(localizedError, new RegExp(`${code}:`));
  assert.match(vi, /coursePublish:\s*\{/);
  assert.match(en, /coursePublish:\s*\{/);
  assert.match(vi, /publishConflict:/);
  assert.match(en, /publishConflict:/);
});
