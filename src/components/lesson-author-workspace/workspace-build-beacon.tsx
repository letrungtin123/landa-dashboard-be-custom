/** Live-build pulse shared by graph cards, the pending skeleton and the
 * planning overview. Decorative only. */
export function WorkspaceBuildBeacon({ active = true }: { active?: boolean }) {
  return <span data-workspace-build-beacon={active ? 'active' : 'idle'}
    className={`workspace-build-beacon ${active ? 'workspace-build-beacon-active' : 'workspace-build-beacon-idle'}`} aria-hidden>
    <span /><span /><span />
  </span>;
}
