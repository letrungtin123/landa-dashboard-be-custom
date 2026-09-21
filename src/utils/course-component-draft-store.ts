/**
 * One-way cleanup for drafts created by the retired browser-recovery feature.
 *
 * Component edits are now intentionally kept only in the open form. Server
 * autosave remains responsible for uploaded and pasted course assets.
 */

const SESSION_PREFIX = 'landa:course-component-draft:v1:';
const DB_NAME = 'landa-course-component-drafts';
let legacyDraftsCleared = false;

export function clearLegacyCourseComponentDrafts(): void {
  if (legacyDraftsCleared || typeof window === 'undefined') return;
  legacyDraftsCleared = true;

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(SESSION_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be disabled by the browser. No draft is read by the editor.
  }

  try {
    window.indexedDB?.deleteDatabase(DB_NAME);
  } catch {
    // Best-effort legacy cleanup only; the application no longer reads this DB.
  }
}
