// Pure presentation rules of Stop / Continue / Rewrite. No React, no network:
// node tests load this file directly. The server decides; the UI only shows
// what the last authorized GET …/recovery offered.
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import type { WorkspaceRecoveryOption, WorkspaceRecoveryView } from '../../api/workspace-recovery';

export const WORKSPACE_RECOVERY_DRAIN_POLL_MS = 4_000;
/** About ten minutes of draining checks per open; a longer drain is picked up by the next read. */
export const WORKSPACE_RECOVERY_DRAIN_POLL_LIMIT = 150;
export const WORKSPACE_RECOVERY_STOPPED_BY_AUTHOR = 'RUN_STOPPED_BY_AUTHOR';

/** Plain words only: never a code, a status name or an internal term. */
export const workspaceRecoveryCopy = {
  vi: {
    stop: 'Dừng', stopping: 'Đang dừng…', resume: 'Chạy tiếp', rewrite: 'Viết lại', rewriteChapter: 'Viết lại chương',
    rewriteLesson: 'Viết lại bài này', cancel: 'Hủy', close: 'Đóng', retry: 'Thử lại', working: 'Đang gửi…',
    stoppedByYou: 'Bạn đã dừng việc tạo nội dung. Các phần đã tạo xong vẫn được giữ.',
    stoppedEarly: 'Việc tạo nội dung đã dừng giữa chừng. Các phần đã tạo xong vẫn được giữ.',
    missing: (n: number) => `Còn ${n} bài học chưa có nội dung.`,
    draining: 'Đang dừng… Bài đang được viết sẽ hoàn tất trước khi dừng hẳn.',
    runtimeChanged: 'Cài đặt AI đã thay đổi sau khi tạo bản thiết kế này nên không thể chạy tiếp. Hãy tạo bản thiết kế mới.',
    rewriteAllLabel: (n: number) => `Viết lại ${n} bài học còn thiếu`,
    lessonLimit: 'Bài này đã được viết lại 3 lần.',
    chapterLimit: 'Các bài còn thiếu của chương này đã được viết lại 3 lần.',
    lessonRewrites: (used: number, max: number) => `Đã viết lại ${used}/${max} lần.`,
    stopTitle: 'Dừng tạo nội dung?',
    stopBody: 'Các bài đã tạo xong vẫn được giữ. Bài đang được viết sẽ hoàn tất rồi mới dừng hẳn. Sau đó bạn có thể chạy tiếp hoặc viết lại các bài còn thiếu.',
    resumeTitle: 'Chạy tiếp?',
    resumeBody: 'Hệ thống sẽ làm tiếp các bước kiểm tra còn dang dở. Bước này không dùng điểm AI.',
    rewriteTitle: (n: number) => n === 1 ? 'Viết lại 1 bài học?' : `Viết lại ${n} bài học?`,
    rewriteLessonTitle: 'Viết lại bài này?',
    rewriteBody: (n: number) => `AI sẽ viết lại ${n} bài học chưa có nội dung. Việc này dùng điểm AI của đơn vị. Các bài đã có nội dung không bị thay đổi.`,
    rewriteLimit: (max: number) => `Mỗi bài học được viết lại tối đa ${max} lần.`,
    started: 'Đã gửi yêu cầu. Nội dung sẽ xuất hiện khi sẵn sàng.',
    stopped: 'Đã gửi yêu cầu dừng.',
  },
  en: {
    stop: 'Stop', stopping: 'Stopping…', resume: 'Continue', rewrite: 'Rewrite', rewriteChapter: 'Rewrite chapter',
    rewriteLesson: 'Rewrite this lesson', cancel: 'Cancel', close: 'Close', retry: 'Try again', working: 'Sending…',
    stoppedByYou: 'You stopped creating content. Everything that was finished is kept.',
    stoppedEarly: 'Creating content stopped before the end. Everything that was finished is kept.',
    missing: (n: number) => n === 1 ? '1 lesson has no content yet.' : `${n} lessons have no content yet.`,
    draining: 'Stopping… The lesson that is being written will finish first.',
    runtimeChanged: 'The AI settings changed after this design was created, so it cannot continue. Please start a new design.',
    rewriteAllLabel: (n: number) => n === 1 ? 'Rewrite the missing lesson' : `Rewrite the ${n} missing lessons`,
    lessonLimit: 'This lesson has already been rewritten 3 times.',
    chapterLimit: 'The missing lessons of this chapter have already been rewritten 3 times.',
    lessonRewrites: (used: number, max: number) => `Rewritten ${used} of ${max} times.`,
    stopTitle: 'Stop creating content?',
    stopBody: 'Finished lessons are kept. The lesson that is being written will finish before everything stops. You can then continue or rewrite the missing lessons.',
    resumeTitle: 'Continue?',
    resumeBody: 'The remaining checks will run again. This does not use AI points.',
    rewriteTitle: (n: number) => n === 1 ? 'Rewrite 1 lesson?' : `Rewrite ${n} lessons?`,
    rewriteLessonTitle: 'Rewrite this lesson?',
    rewriteBody: (n: number) => n === 1
      ? 'The AI will rewrite 1 lesson that has no content. This uses your organization\'s AI points. Lessons that already have content are not changed.'
      : `The AI will rewrite ${n} lessons that have no content. This uses your organization's AI points. Lessons that already have content are not changed.`,
    rewriteLimit: (max: number) => `Each lesson can be rewritten up to ${max} times.`,
    started: 'Request sent. The content will appear when it is ready.',
    stopped: 'Stop request sent.',
  },
} as const;

export type WorkspaceRecoveryIntent =
  | { kind: 'stop' }
  | { kind: 'resume'; taskCount: number }
  | { kind: 'regenerate'; scope: 'course' | 'chapter' | 'unit'; nodeId: string; unitCount: number; rewritesUsed: number | null };

/** Header Stop: only while the run is active and the server offers it. */
export function workspaceRecoveryCanStop(view: WorkspaceRecoveryView | null): boolean {
  return !!view && view.stop.available;
}

/** A stopped run the author may act on (not an assessment review: that has its own review panel). */
function stoppedRun(view: WorkspaceRecoveryView | null): view is WorkspaceRecoveryView {
  return !!view && view.run_status === 'needs_action'
    && view.resume.reason !== 'RECOVERY_REVIEW_REQUIRED' && view.regenerate.reason !== 'RECOVERY_REVIEW_REQUIRED';
}
const runtimeChanged = (option: WorkspaceRecoveryOption) => option.reason === 'RECOVERY_RUNTIME_CHANGED';

export interface WorkspaceRecoveryBanner {
  message: string;
  note: string | null;
  draining: boolean;
  resume: WorkspaceRecoveryIntent | null;
  rewriteAll: WorkspaceRecoveryIntent | null;
  rewriteAllLabel: string | null;
}

/** What the stopped-run banner shows, or null when there is nothing to say or do. */
export function workspaceRecoveryBanner(view: WorkspaceRecoveryView | null, locale: WorkspaceLocale): WorkspaceRecoveryBanner | null {
  if (!stoppedRun(view)) return null;
  const c = workspaceRecoveryCopy[locale];
  const resume: WorkspaceRecoveryIntent | null = view.resume.available && view.resume.task_count > 0
    ? { kind: 'resume', taskCount: view.resume.task_count } : null;
  const course = view.regenerate.course;
  const rewriteAll: WorkspaceRecoveryIntent | null = course?.available && course.unit_count > 0
    ? { kind: 'regenerate', scope: 'course', nodeId: course.node_id, unitCount: course.unit_count, rewritesUsed: null } : null;
  const changed = runtimeChanged(view.resume) || runtimeChanged(view.regenerate);
  if (!view.draining && !resume && !rewriteAll && !changed) return null;
  const missing = view.regenerate.missing_unit_count;
  const message = view.draining ? c.draining
    : `${view.failure_code === WORKSPACE_RECOVERY_STOPPED_BY_AUTHOR ? c.stoppedByYou : c.stoppedEarly}${missing > 0 ? ` ${c.missing(missing)}` : ''}`;
  return { message, note: !view.draining && changed ? c.runtimeChanged : null, draining: view.draining,
    resume, rewriteAll, rewriteAllLabel: rewriteAll ? c.rewriteAllLabel(course!.unit_count) : null };
}

export interface WorkspaceRecoveryScopeAction {
  intent: WorkspaceRecoveryIntent | null;
  /** Plain reason shown instead of the button (rewrite limit only). */
  note: string | null;
}

/** "Viết lại chương" on a chapter card: only chapters that still miss lessons. */
export function workspaceRecoveryChapterAction(view: WorkspaceRecoveryView | null, nodeId: string,
  locale: WorkspaceLocale): WorkspaceRecoveryScopeAction | null {
  if (!stoppedRun(view) || view.draining) return null;
  const chapter = view.regenerate.chapters.find(item => item.node_id.toLowerCase() === nodeId.toLowerCase());
  if (!chapter) return null;
  if (chapter.available && chapter.unit_count > 0) {
    return { intent: { kind: 'regenerate', scope: 'chapter', nodeId: chapter.node_id, unitCount: chapter.unit_count, rewritesUsed: null }, note: null };
  }
  return chapter.reason === 'RECOVERY_LIMIT_REACHED' ? { intent: null, note: workspaceRecoveryCopy[locale].chapterLimit } : null;
}

/** "Viết lại bài này" on a lesson without content. */
export function workspaceRecoveryUnitAction(view: WorkspaceRecoveryView | null, nodeId: string,
  locale: WorkspaceLocale): WorkspaceRecoveryScopeAction | null {
  if (!stoppedRun(view) || view.draining) return null;
  const unit = view.regenerate.units.find(item => item.node_id.toLowerCase() === nodeId.toLowerCase());
  if (!unit) return null;
  if (unit.available) {
    return { intent: { kind: 'regenerate', scope: 'unit', nodeId: unit.node_id, unitCount: 1, rewritesUsed: unit.rewrites_used }, note: null };
  }
  return unit.reason === 'RECOVERY_LIMIT_REACHED' ? { intent: null, note: workspaceRecoveryCopy[locale].lessonLimit } : null;
}

export interface WorkspaceRecoveryConfirmText { title: string; body: string; note: string | null; confirm: string }
export function workspaceRecoveryConfirmText(intent: WorkspaceRecoveryIntent, maxRewrites: number,
  locale: WorkspaceLocale): WorkspaceRecoveryConfirmText {
  const c = workspaceRecoveryCopy[locale];
  if (intent.kind === 'stop') return { title: c.stopTitle, body: c.stopBody, note: null, confirm: c.stop };
  if (intent.kind === 'resume') return { title: c.resumeTitle, body: c.resumeBody, note: null, confirm: c.resume };
  const limit = maxRewrites > 0 ? maxRewrites : 3;
  return {
    title: intent.scope === 'unit' ? c.rewriteLessonTitle : c.rewriteTitle(intent.unitCount),
    body: c.rewriteBody(intent.unitCount),
    note: intent.scope === 'unit' && intent.rewritesUsed !== null ? c.lessonRewrites(intent.rewritesUsed, limit) : c.rewriteLimit(limit),
    confirm: intent.scope === 'chapter' ? c.rewriteChapter : intent.scope === 'unit' ? c.rewriteLesson : c.rewrite,
  };
}

/** Re-read the options when the run starts/ends and, while stopped, on every new
 * committed event. A running draft whose Stop is already offered is not re-read
 * per event (a lesson finishing does not change what can be done). */
export function workspaceRecoveryFetchKey(input: {
  enabled: boolean; workspaceId: string | null; status: string | null; head: number | null; tick: number;
  /** The last read already offers Stop for this running draft. */
  stopKnown: boolean;
}): string | null {
  if (!input.enabled || !input.workspaceId || !input.status) return null;
  const active = input.status === 'queued' || input.status === 'designing' || input.status === 'drafting';
  return `${input.workspaceId}:${input.status}:${active && input.stopKnown ? '' : input.head ?? ''}:${input.tick}`;
}
