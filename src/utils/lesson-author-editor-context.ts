export type LessonAuthorEditorEntityType =
  | 'course'
  | 'chapter'
  | 'lesson'
  | 'unit'
  | 'component';

export interface LessonAuthorEditorContext {
  course_id: string;
  selected_entity?: {
    id: string;
    type: LessonAuthorEditorEntityType;
    block_type?: string;
  };
  current_chapter_id?: string;
  current_lesson_id?: string;
  current_unit_id?: string;
  current_component_id?: string;
}

const LESSON_AUTHOR_EDITOR_CONTEXT_EVENT = 'landa:lesson-author-editor-context';
const LESSON_AUTHOR_EDITOR_CONTEXT_WINDOW_KEY = '__landaLessonAuthorEditorContext';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COURSE_KEY_REGEX = /^course-v1:[^\s+]+(?:\+[^\s+]+){2,}$/i;

declare global {
  interface Window {
    __landaLessonAuthorEditorContext?: LessonAuthorEditorContext | null;
  }
}

function cloneEditorContext(context: LessonAuthorEditorContext | null): LessonAuthorEditorContext | null {
  if (!context) return null;
  return {
    ...context,
    ...(context.selected_entity ? { selected_entity: { ...context.selected_entity } } : {}),
  };
}

/**
 * Course routes use the same canonical identifier as the backend `courses.id`
 * column. Do not let a stale/malformed route or browser context become an AI
 * target; Node remains the authority for tenant and hierarchy validation.
 */
export function isValidLessonAuthorCourseId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return UUID_REGEX.test(normalized) || COURSE_KEY_REGEX.test(normalized);
}

/**
 * The Course Editor and global chat widget are mounted in separate route/layout
 * branches. Keep the handoff browser-local and ID-only; Node remains the
 * authority that validates every value before it becomes AI target context.
 */
export function publishLessonAuthorEditorContext(context: LessonAuthorEditorContext | null): void {
  if (typeof window === 'undefined') return;
  const next = context && isValidLessonAuthorCourseId(context.course_id)
    ? cloneEditorContext(context)
    : null;
  window[LESSON_AUTHOR_EDITOR_CONTEXT_WINDOW_KEY] = next;
  window.dispatchEvent(new CustomEvent<LessonAuthorEditorContext | null>(
    LESSON_AUTHOR_EDITOR_CONTEXT_EVENT,
    { detail: next },
  ));
}

export function readLessonAuthorEditorContext(courseId?: string): LessonAuthorEditorContext | null {
  if (typeof window === 'undefined') return null;
  if (courseId && !isValidLessonAuthorCourseId(courseId)) return null;
  const context = window[LESSON_AUTHOR_EDITOR_CONTEXT_WINDOW_KEY] ?? null;
  if (!context || !isValidLessonAuthorCourseId(context.course_id) || (courseId && context.course_id !== courseId)) return null;
  return cloneEditorContext(context);
}

export function subscribeLessonAuthorEditorContext(
  listener: (context: LessonAuthorEditorContext | null) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleContext = (event: Event) => {
    const detail = (event as CustomEvent<LessonAuthorEditorContext | null>).detail;
    listener(cloneEditorContext(detail));
  };
  window.addEventListener(LESSON_AUTHOR_EDITOR_CONTEXT_EVENT, handleContext);
  return () => window.removeEventListener(LESSON_AUTHOR_EDITOR_CONTEXT_EVENT, handleContext);
}
