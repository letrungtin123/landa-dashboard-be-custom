import { useSyncExternalStore } from 'react';
import { WorkspaceApplyError } from '../../api/workspace-apply';

/** The one Apply of a workspace that is running in this page. */
export interface WorkspaceApplyFlight { readonly workspaceId: string; readonly nodeId: string }
export type WorkspaceApplyFlightResult = 'applied' | 'failed' | 'busy';

/** Running Applies of this page, keyed by workspace id. It lives outside React,
 * so closing and reopening a node dialog or the whole workspace modal never
 * forgets an Apply that is still running: every Apply button of that workspace
 * stays "Applying…" and disabled until it and the workspace reload after it
 * have settled. It only stops this page from
 * sending a second Apply with an event head the running one is about to
 * advance; the server still runs one Apply per course at a time. */
export function createWorkspaceApplyFlights() {
  const running = new Map<string, WorkspaceApplyFlight>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  return {
    get(workspaceId: string): WorkspaceApplyFlight | null { return running.get(workspaceId) ?? null; },
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Claims the workspace, or null while another Apply of it is running.
     * The returned release ends exactly this flight, once. */
    begin(workspaceId: string, nodeId: string): (() => void) | null {
      if (running.has(workspaceId)) return null;
      const flight: WorkspaceApplyFlight = Object.freeze({ workspaceId, nodeId });
      running.set(workspaceId, flight); notify();
      return () => {
        if (running.get(workspaceId) !== flight) return;
        running.delete(workspaceId); notify();
      };
    },
  };
}
export type WorkspaceApplyFlights = ReturnType<typeof createWorkspaceApplyFlights>;
/** The page-wide registry every course host and node dialog reads. */
export const workspaceApplyFlights = createWorkspaceApplyFlights();

/** The running Apply of this workspace (same object while it runs), or null. */
export function useWorkspaceApplyFlight(workspaceId: string | null, flights: WorkspaceApplyFlights = workspaceApplyFlights): WorkspaceApplyFlight | null {
  const read = () => workspaceId ? flights.get(workspaceId) : null;
  return useSyncExternalStore(flights.subscribe, read, read);
}

/** Answers after which the workspace read is reloaded, so the next Apply sends
 * the fresh event head: the draft or course changed since it was read. */
export function workspaceApplyFailureNeedsReload(error: unknown): boolean {
  return error instanceof WorkspaceApplyError && error.code === 'WORKSPACE_APPLY_CONFLICT';
}

/** Longest wait for the workspace reload after an Apply. A hung reload must
 * never leave every Apply button of the workspace disabled. */
export const WORKSPACE_APPLY_RELOAD_WAIT_MS = 15_000;
/** Starts a one-shot timer and returns its cancel (injectable for tests). */
export interface WorkspaceApplyTimer { start(ms: number, expired: () => void): () => void }
const pageTimer: WorkspaceApplyTimer = {
  start(ms, expired) { const handle = setTimeout(expired, ms); return () => clearTimeout(handle); },
};

/** Resolves when the reload settles or the bound expires, whichever is first.
 * A failure is reported to `failed`, also when it comes after the bound. */
function settleReload(start: () => Promise<void>, failed: (error: unknown) => void, timer: WorkspaceApplyTimer): Promise<void> {
  return new Promise<void>(resolve => {
    const cancel = timer.start(WORKSPACE_APPLY_RELOAD_WAIT_MS, resolve);
    const done = () => { cancel(); resolve(); };
    let reload: Promise<void>;
    try { reload = Promise.resolve(start()); } catch (error) { failed(error); done(); return; }
    void reload.then(done, error => { failed(error); done(); });
  });
}

/** One Apply under the workspace flight. A second Apply of the same workspace
 * is never sent while one runs ('busy'). The flight is held until the
 * workspace reload after the answer has settled (bounded), so the next Apply
 * reads the head this one advanced: after success (`applied` shows the result
 * at once and returns the reload) and after a conflict (`reload`). */
export async function runWorkspaceApplyFlight<T>(input: {
  flights: Pick<WorkspaceApplyFlights, 'begin'>;
  workspaceId: string;
  nodeId: string;
  send: () => Promise<T>;
  applied: (result: T) => Promise<void>;
  failed: (error: unknown) => void;
  reload: () => Promise<void>;
  /** A reload that failed; the flight is released all the same. */
  reloadFailed: (error: unknown) => void;
  timer?: WorkspaceApplyTimer;
}): Promise<WorkspaceApplyFlightResult> {
  const release = input.flights.begin(input.workspaceId, input.nodeId);
  if (!release) return 'busy';
  const timer = input.timer ?? pageTimer;
  try {
    let result: T;
    try {
      result = await input.send();
    } catch (error) {
      input.failed(error);
      if (workspaceApplyFailureNeedsReload(error)) await settleReload(input.reload, input.reloadFailed, timer);
      return 'failed';
    }
    await settleReload(() => input.applied(result), input.reloadFailed, timer);
    return 'applied';
  } finally {
    release();
  }
}
