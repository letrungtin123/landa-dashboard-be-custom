/** Shared classes that keep the AI ID window usable on phones and tablets (owner 24/10). Everything is scoped below
 * the desktop width (`max-lg:` = under 1024px), so the desktop layout stays exactly as before. */

/** A small dialog (confirmation, delete): 16px from the screen edges, scrolls inside when taller than the screen. */
export const WORKSPACE_SMALL_DIALOG = 'max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto';

/** A dialog button: 40px high for touch. */
export const WORKSPACE_TOUCH_BUTTON = 'max-lg:h-10 max-lg:px-4';
