import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import type { LessonAuthorActiveRun, LessonAuthorSessionSummary } from '../../api/workspace-sessions';
import type { WorkspaceApplyConflictKind } from '../../api/workspace-apply';

/** Shared AI course design sessions: copy for the session list, the read-only
 * notice, the running-session banner and the "course was edited" dialog.
 * Plain words for non-technical authors; {name}/{count}/{names} are filled in. */
export const workspaceSharingCopy = {
  vi: {
    filterLabel: 'Hiển thị phiên thiết kế',
    filterAll: 'Tất cả',
    filterMine: 'Của tôi',
    sharedNote: 'Các phiên thiết kế được chia sẻ với mọi người có quyền chỉnh sửa khoá học này. Bạn có thể xem và đưa nội dung của người khác vào khoá học, nhưng chỉ người tạo mới tiếp tục soạn được.',
    createdByYou: 'Bạn tạo',
    createdBy: 'Người tạo: {name}',
    unknownCreator: 'Không rõ người tạo',
    viewOnly: 'Chỉ xem',
    openViewOnly: 'Xem bản thiết kế khoá học',
    nothingToView: 'Phiên này chưa có nội dung để xem.',
    emptyMine: 'Bạn chưa tạo bản thiết kế khoá học nào cho khoá này.',
    readOnlyNotice: '{name} đã tạo phiên này. Bạn có thể xem và đưa nội dung vào khoá học, nhưng chỉ người tạo mới tiếp tục soạn được.',
    someone: 'Một người khác',
    activeRunOne: 'Khoá học này đang có phiên thiết kế của {name} đang chạy. Bạn nên đợi phiên đó xong rồi mới đưa nội dung vào khoá học.',
    activeRunMany: 'Khoá học này đang có {count} phiên thiết kế của người khác đang chạy ({names}). Bạn nên đợi các phiên đó xong rồi mới đưa nội dung vào khoá học.',
    conflictTitle: 'Khoá học đã được chỉnh sửa',
    conflictLead: 'Khoá học đã được chỉnh sửa sau khi trợ lý AI soạn nội dung. Bạn có muốn thay các phần này bằng nội dung mới không?',
    conflictWarning: 'Những chỉnh sửa trên các phần dưới đây sẽ được thay bằng nội dung mới. Các phần khác của khoá học giữ nguyên.',
    conflictConfirm: 'Thay bằng nội dung mới',
    conflictCancel: 'Giữ nguyên khoá học',
    structureTitle: 'Chưa thể đưa nội dung vào khoá học',
    affectedParts: 'Các phần bị ảnh hưởng',
    moreParts: 'và {count} phần khác',
    untitledPart: 'Phần chưa có tên',
    close: 'Đóng',
    kinds: { chapter: 'Chương', lesson: 'Mục', unit: 'Bài học', component: 'Nội dung' },
  },
  en: {
    filterLabel: 'Show design sessions',
    filterAll: 'All',
    filterMine: 'Mine',
    sharedNote: 'Design sessions are shared with everyone who can edit this course. You can view other people\'s sessions and add their content to the course, but only the person who started a session can continue it.',
    createdByYou: 'Started by you',
    createdBy: 'Started by {name}',
    unknownCreator: 'Unknown author',
    viewOnly: 'View only',
    openViewOnly: 'View course design',
    nothingToView: 'This session has no content to view yet.',
    emptyMine: 'You have not started a course design for this course yet.',
    readOnlyNotice: '{name} started this session. You can view it and add its content to the course, but only the person who started it can continue it.',
    someone: 'Someone else',
    activeRunOne: '{name} has a course design session running for this course. Wait for it to finish before adding content to the course.',
    activeRunMany: '{count} course design sessions by other people are running for this course ({names}). Wait for them to finish before adding content to the course.',
    conflictTitle: 'The course was edited',
    conflictLead: 'The course was edited after the AI assistant drafted this content. Do you want to replace these parts with the new content?',
    conflictWarning: 'The edits made to the parts below will be replaced by the new content. The rest of the course stays as it is.',
    conflictConfirm: 'Replace with new content',
    conflictCancel: 'Keep the course as it is',
    structureTitle: 'The content cannot be added yet',
    affectedParts: 'Affected parts',
    moreParts: 'and {count} more',
    untitledPart: 'Untitled part',
    close: 'Close',
    kinds: { chapter: 'Chapter', lesson: 'Section', unit: 'Lesson', component: 'Content' },
  },
} as const;

export type WorkspaceSharingCopy = typeof workspaceSharingCopy[WorkspaceLocale];

export function fillWorkspaceCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? String(values[key]) : match);
}

export interface WorkspaceSessionCardModel {
  ownerLabel: string;
  readOnly: boolean;
  /** Own sessions open (workspace or continue); others only when there is a workspace to view. */
  canOpen: boolean;
  canRename: boolean;
  canDelete: boolean;
}

export function workspaceSessionCardModel(item: LessonAuthorSessionSummary, locale: WorkspaceLocale): WorkspaceSessionCardModel {
  const c = workspaceSharingCopy[locale];
  const name = item.owner.display_name.trim();
  return {
    ownerLabel: item.is_mine ? c.createdByYou : name ? fillWorkspaceCopy(c.createdBy, { name }) : c.unknownCreator,
    readOnly: !item.permissions.can_continue,
    canOpen: item.permissions.can_continue || !!item.workspace,
    canRename: item.permissions.can_rename,
    canDelete: item.permissions.can_delete,
  };
}

/** Banner text for sessions of OTHER people running on this course, excluding the open one. */
export function workspaceActiveRunNotice(runs: readonly LessonAuthorActiveRun[], openConversationId: string | null, locale: WorkspaceLocale): string | null {
  const c = workspaceSharingCopy[locale];
  const others = runs.filter(run => !run.is_mine && run.conversation_id !== openConversationId);
  if (!others.length) return null;
  const names = [...new Set(others.map(run => run.owner.display_name.trim() || c.someone))];
  return others.length === 1
    ? fillWorkspaceCopy(c.activeRunOne, { name: names[0]! })
    : fillWorkspaceCopy(c.activeRunMany, { count: others.length, names: names.join(', ') });
}

export function workspaceReadOnlyNotice(ownerName: string | null, locale: WorkspaceLocale): string {
  const c = workspaceSharingCopy[locale];
  return fillWorkspaceCopy(c.readOnlyNotice, { name: ownerName?.trim() || c.someone });
}

export function workspaceConflictItemLabel(kind: WorkspaceApplyConflictKind, title: string, locale: WorkspaceLocale): string {
  const c = workspaceSharingCopy[locale];
  return `${c.kinds[kind]}: ${title.trim() || c.untitledPart}`;
}
