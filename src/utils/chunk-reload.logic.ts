// A release replaces the hashed chunks under /admin/assets/. A tab opened
// before the release then fails to load a page it has not opened yet (pages
// are separate chunks), and without an error boundary the screen would go
// blank. Vite reports that failure as "vite:preloadError": reload once so the
// tab gets the new build, but never in a loop. No imports: node tests load
// this file directly.

export const CHUNK_RELOAD_STORAGE_KEY = 'landa-admin-chunk-reload-at';
/** A second failure within this time is shown as an error instead of reloading again. */
export const CHUNK_RELOAD_MIN_INTERVAL_MS = 30_000;

export function shouldReloadAfterChunkError(lastReloadAt: string | null, now: number): boolean {
  const last = Number(lastReloadAt);
  return !lastReloadAt || !Number.isFinite(last) || now - last > CHUNK_RELOAD_MIN_INTERVAL_MS;
}

type ChunkReloadTarget = Pick<Window, 'addEventListener' | 'sessionStorage'> & { location: Pick<Location, 'reload'> };

export function installChunkReloadGuard(target: ChunkReloadTarget, now: () => number = Date.now): void {
  target.addEventListener('vite:preloadError', (event) => {
    try {
      const lastReloadAt = target.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY);
      if (!shouldReloadAfterChunkError(lastReloadAt, now())) return;
      target.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now()));
    } catch {
      // Without session storage a reload could repeat forever: let the error show.
      return;
    }
    event.preventDefault();
    target.location.reload();
  });
}
