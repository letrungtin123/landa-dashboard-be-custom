import { customApiClient } from './custom-client';
import { readCourseAuthorNotesView, type CourseAuthorNotesView } from './course-author-notes.logic';

/** Editors-only (`courses.can_edit`) read of the AI ID author notes of one
 * course. Learner and generic block reads never contain these notes. */
export async function getCourseAuthorNotes(courseId: string): Promise<CourseAuthorNotesView> {
  const { data } = await customApiClient.get(`/api/course-authoring/author-notes/${encodeURIComponent(courseId)}`);
  if (data?.success !== true) throw new Error('COURSE_AUTHOR_NOTES_INVALID');
  return readCourseAuthorNotesView(data.data, courseId);
}

export const courseAuthorNotesQueryKey = (courseId: string) => ['course-author-notes', courseId] as const;
