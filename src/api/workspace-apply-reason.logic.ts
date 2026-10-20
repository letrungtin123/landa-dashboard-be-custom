import type { WorkspaceLocale } from './lesson-author-workspace.contract';

/**
 * Why the server refused an Apply, in words an author can act on. The server
 * sends a category and the location (ordinal numbers and titles only); the
 * sentence is composed here in the UI language, never taken from the server.
 */
export const WORKSPACE_APPLY_REASON_CATEGORIES = [
  'CHAPTER_NOT_COMPLETED', 'UNIT_NOT_GENERATED', 'UNIT_FALLBACK_NOT_APPLICABLE', 'CONTENT_CHANGED',
  'CONTENT_INCOMPLETE', 'CONTENT_EDIT_INVALID', 'CONTENT_CHECK_FAILED', 'STRUCTURE_INVALID',
] as const;
export type WorkspaceApplyReasonCategory = typeof WORKSPACE_APPLY_REASON_CATEGORIES[number];
export interface WorkspaceLocationPart { number: number; title: string | null }
export interface WorkspaceLocation {
  chapter: WorkspaceLocationPart | null;
  lesson: WorkspaceLocationPart | null;
  unit: WorkspaceLocationPart | null;
  component: WorkspaceLocationPart | null;
}
export interface WorkspaceApplyReason { category: WorkspaceApplyReasonCategory; location: WorkspaceLocation | null }

const LEVELS = ['chapter', 'lesson', 'unit', 'component'] as const;
const TITLE_MAX = 200;

function part(value: unknown): WorkspaceLocationPart | null | undefined {
  if (value === null) return null;
  const item = value as Record<string, unknown> | undefined;
  if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.number) || Number(item.number) < 1 || Number(item.number) > 99_999
    || !(item.title === null || (typeof item.title === 'string' && item.title.length <= TITLE_MAX))) return undefined;
  const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null;
  return Object.freeze({ number: Number(item.number), title });
}

/** Strict reader: anything malformed is no location (the plain message still shows). */
export function readWorkspaceLocation(value: unknown): WorkspaceLocation | null {
  const raw = value as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parts = LEVELS.map(level => part(raw[level]));
  if (parts.some(item => item === undefined) || !parts[0]) return null;
  const [chapter, lesson, unit, component] = parts as Array<WorkspaceLocationPart | null>;
  return Object.freeze({ chapter, lesson, unit, component });
}

/** Strict reader of the optional `reason` of an Apply refusal. */
export function readWorkspaceApplyReason(value: unknown): WorkspaceApplyReason | null {
  const reason = value as Record<string, unknown> | null | undefined;
  if (!reason || typeof reason !== 'object' || !(WORKSPACE_APPLY_REASON_CATEGORIES as readonly unknown[]).includes(reason.category)) return null;
  return Object.freeze({ category: reason.category as WorkspaceApplyReasonCategory, location: readWorkspaceLocation(reason.location) });
}

const NAMES = {
  vi: { chapter: 'Chương', lesson: 'mục', unit: 'bài học', component: 'nội dung', in: 'trong' },
  en: { chapter: 'Chapter', lesson: 'section', unit: 'lesson', component: 'content', in: 'in' },
} as const;

/** "Chương 4 «X»", "bài học «Y» (Chương 4)", "nội dung «Z» trong bài học «Y» (Chương 4)". */
export function workspaceLocationText(location: WorkspaceLocation | null, locale: WorkspaceLocale): string | null {
  if (!location?.chapter) return null;
  const n = NAMES[locale];
  const quote = (value: string) => locale === 'vi' ? `«${value}»` : `"${value}"`;
  const chapter = `${n.chapter} ${location.chapter.number}`;
  const named = (name: string, item: WorkspaceLocationPart) => item.title ? `${name} ${quote(item.title)}` : `${name} ${item.number}`;
  if (location.component) {
    return `${named(n.component, location.component)}${location.unit ? ` ${n.in} ${named(n.unit, location.unit)}` : ''} (${chapter})`;
  }
  if (location.unit) return `${named(n.unit, location.unit)} (${chapter})`;
  if (location.lesson) return `${named(n.lesson, location.lesson)} (${chapter})`;
  return location.chapter.title ? `${chapter} ${quote(location.chapter.title)}` : chapter;
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
// 'Viết lại chương' / 'Rewrite chapter' must stay the label of the chapter rewrite action.
const REWRITE = {
  vi: "Bạn có thể dùng 'Viết lại chương' hoặc tự soạn phần này trong khoá học.",
  en: "You can use 'Rewrite chapter' or write this part yourself in the course.",
} as const;

/** Plain VI/EN sentence: what happened, where, and what the author can do. */
export function workspaceApplyReasonMessage(reason: WorkspaceApplyReason, locale: WorkspaceLocale): string {
  const where = workspaceLocationText(reason.location, locale);
  const subject = (fallback: string) => where ? capitalize(where) : fallback;
  if (locale === 'vi') {
    switch (reason.category) {
      case 'CHAPTER_NOT_COMPLETED': return `${subject('Một chương')} chưa hoàn tất bước kiểm tra cuối, nên chưa áp dụng được. ${REWRITE.vi}`;
      case 'UNIT_NOT_GENERATED': return `${subject('Một số bài học')} chưa được AI soạn xong, nên chưa áp dụng được. ${REWRITE.vi}`;
      case 'UNIT_FALLBACK_NOT_APPLICABLE':
        return `${subject('Một số bài học')} chỉ có bản nháp chép từ tài liệu nguồn vì AI chưa soạn được, nên không đưa vào khoá học. ${REWRITE.vi}`;
      case 'CONTENT_CHANGED':
        return `Nội dung của ${where ?? 'một phần bản thiết kế'} không còn khớp với bản đã được kiểm tra. Hãy tải lại bản thiết kế rồi thử lại. Nếu vẫn không được, bạn có thể dùng 'Viết lại chương' hoặc tự soạn phần này trong khoá học.`;
      case 'CONTENT_INCOMPLETE':
        return `${subject('Một phần bản thiết kế')} chưa có nội dung hoàn chỉnh, nên chưa áp dụng được. Hãy chờ AI soạn xong, hoặc dùng 'Viết lại chương'.`;
      case 'CONTENT_EDIT_INVALID':
        return `Phần bạn đã sửa ở ${where ?? 'bản thiết kế'} chưa hợp lệ. Hãy mở mục này, kiểm tra lại các ô bắt buộc rồi lưu lại trước khi áp dụng.`;
      case 'CONTENT_CHECK_FAILED':
        return `${subject('Nội dung này')} chưa đạt bước kiểm tra trước khi áp dụng. Hãy mở mục này để xem và sửa, hoặc tự soạn trong khoá học.`;
      case 'STRUCTURE_INVALID':
        return 'Cấu trúc của bản thiết kế khoá học này không còn hợp lệ để áp dụng. Hãy tạo một bản thiết kế mới cho phần này.';
    }
  }
  switch (reason.category) {
    case 'CHAPTER_NOT_COMPLETED': return `${subject('A chapter')} did not finish its final check, so it cannot be applied yet. ${REWRITE.en}`;
    case 'UNIT_NOT_GENERATED': return where
      ? `${capitalize(where)} was not finished by the AI, so it cannot be applied yet. ${REWRITE.en}`
      : `Some lessons were not finished by the AI, so they cannot be applied yet. ${REWRITE.en}`;
    case 'UNIT_FALLBACK_NOT_APPLICABLE': return where
      ? `${capitalize(where)} only has a draft copied from the source because the AI could not write it, so it is not added to the course. ${REWRITE.en}`
      : `Some lessons only have a draft copied from the source because the AI could not write them, so they are not added to the course. ${REWRITE.en}`;
    case 'CONTENT_CHANGED':
      return `The content of ${where ?? 'part of the design'} no longer matches the checked version. Reload the design and try again. If it still fails, you can use 'Rewrite chapter' or write this part yourself in the course.`;
    case 'CONTENT_INCOMPLETE':
      return `${subject('Part of the design')} does not have complete content yet, so it cannot be applied. Wait for the AI to finish, or use 'Rewrite chapter'.`;
    case 'CONTENT_EDIT_INVALID':
      return `Your changes to ${where ?? 'the design'} are not valid. Open it, check the required fields and save again before applying.`;
    case 'CONTENT_CHECK_FAILED':
      return `${subject('This content')} did not pass the check before applying. Open it to review and fix it, or write it yourself in the course.`;
    case 'STRUCTURE_INVALID':
      return 'The structure of this course design is no longer valid to apply. Create a new course design for this part.';
  }
}
