import { useSyncExternalStore } from 'react';
import { WorkspaceApplyError } from '../../api/workspace-apply';

/** The one Apply of a workspace that is running in this page. */
export interface WorkspaceApplyFlight { readonly workspaceId: string; readonly nodeId: string }
export type WorkspaceApplyFlightResult = 'applied' | 'failed' | 'busy';

/** Running Applies of this page, keyed by workspace id. It lives outside React,
 * so closing and reopening a node dialog or the whole workspace modal never
 * forgets an Apply that is still running: every Apply button of that workspace
 * stays "Applying…" and disabled until it settles. It only stops this page from
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

/** One Apply under the workspace flight. A second Apply of the same workspace
 * is never sent while one runs ('busy'). The flight ends before the outcome is
 * shown; a conflict also reloads the workspace read. A committed Apply reloads
 * through `applied` (completeWorkspaceApplyUi). */
export async function runWorkspaceApplyFlight<T>(input: {
  flights: Pick<WorkspaceApplyFlights, 'begin'>;
  workspaceId: string;
  nodeId: string;
  send: () => Promise<T>;
  applied: (result: T) => void;
  failed: (error: unknown) => void;
  /** Starts the background reload; the caller shows its failure. */
  reload: () => void;
}): Promise<WorkspaceApplyFlightResult> {
  const release = input.flights.begin(input.workspaceId, input.nodeId);
  if (!release) return 'busy';
  let result: T;
  try {
    result = await input.send();
  } catch (error) {
    release();
    input.failed(error);
    if (workspaceApplyFailureNeedsReload(error)) input.reload();
    return 'failed';
  }
  release();
  input.applied(result);
  return 'applied';
}
