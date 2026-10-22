import { problemMediaForSave } from './problemMedia';

/** How the problem editor reads and stores problem content (its `problemXmlUnreadable` and
 * `normalizeProblemXmlForStorage`), passed in so these rules stay free of the DOM. */
export type ProblemContentRules = { unreadable: (xml: string) => boolean; normalize: (xml: string) => string };

/**
 * The content a problem save sends. Readable: the edited problem, normalized for storage. Stored content the editor
 * cannot read: only that original, byte for byte, so renaming the problem (or changing its media) never rebuilds it;
 * anything else for it is refused (null), as is edited content that cannot be read. The default question the editor
 * would show can never replace the real one.
 */
export function problemDataForSave(current: string, original: string, rules: ProblemContentRules): string | null {
  if (rules.unreadable(original)) return current === original ? original : null;
  return rules.unreadable(current) ? null : rules.normalize(current);
}

/** The whole save request of a problem: its name and settings in `metadata`, its content in `data` (see above).
 * Null when the save is refused. */
export function problemSaveRequest(
  draft: { displayName: string; metadata: Record<string, any> | null | undefined; current: string; original: string },
  rules: ProblemContentRules,
): { metadata: Record<string, any>; data: string } | null {
  const data = problemDataForSave(draft.current, draft.original, rules);
  if (data === null) return null;
  const metadata: Record<string, any> = { ...draft.metadata, display_name: draft.displayName };
  const media = problemMediaForSave(draft.metadata?.problem_media);
  if (media) metadata.problem_media = media;
  else delete metadata.problem_media;
  return { metadata, data };
}
