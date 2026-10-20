import type { Dispatch, SetStateAction } from 'react';
import { BookOpenCheck, Eye, Network, Pencil, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { secureRandomUuid } from '../../utils/random-uuid';
import { createWorkspaceApplyClient, workspaceApplyErrorMessage, WorkspaceApplyError } from '../../api/workspace-apply';
import type { WorkspaceLocale, WorkspaceNode } from '../../api/lesson-author-workspace.contract';
import { WorkspaceApplyConflictDialog } from './workspace-apply-conflict-dialog';
import { workspaceAppliedNote } from './workspace-sharing';
import { WorkspaceNodeTypePill } from './workspace-graph-node';
import { WorkspaceAuthorReviewCards, WorkspaceDetailContent, WorkspaceNotGeneratedNotice, workspaceDetailStats, workspaceNodeNotGenerated, workspaceRunEnded } from './workspace-node-detail';
import { WorkspaceNodeEditor, updateWorkspaceEditorField } from './workspace-node-editor';
import type { createWorkspaceCourseHost } from './workspace-host.logic';
import type { WorkspaceRecoveryUi } from './workspace-recovery-controls';
import {
  completeWorkspaceApplyUi, saveThenApplyWorkspaceScope, workspaceAppliedScopeRevisions, workspaceApplyScope, workspaceCourseHostCopy,
  workspaceNodeSupportsEditor, workspaceNodeUsesHeaderTitleEditor, workspaceScopeApplyLabel,
  type WorkspaceAppliedRevisionOverlay, type WorkspaceApplyConflictState, type WorkspaceApplyUiState,
} from './workspace-course-host.logic';

type Host = ReturnType<typeof createWorkspaceCourseHost>;
type Session = NonNullable<ReturnType<Host['getSession']>>;
type Workspace = NonNullable<ReturnType<Host['getState']>['workspace']>;

/** The open workspace and the overlay state this dialog reads and updates.
 * The overlay owns every value; the dialog keeps no state of its own. */
export interface WorkspaceCourseNodeDialogProps {
  node: WorkspaceNode;
  host: Host;
  session: Session;
  workspace: Workspace;
  state: ReturnType<Host['getState']>;
  /** Server read with the confirmed Apply overlay (what the dialog shows). */
  presentationRead: Workspace['read'] | null;
  locale: WorkspaceLocale;
  recovery: Pick<WorkspaceRecoveryUi, 'unitAction'>;
  onCourseApplied?: () => Promise<void> | void;
  /** Read/write failure text of the open workspace, shown with Reload. */
  message: string | null;
  actionError: boolean;
  setActionError: (value: boolean) => void;
  act: (work: () => unknown) => void;
  refreshWorkspace: () => unknown;
  applyState: WorkspaceApplyUiState;
  setApplyState: (value: WorkspaceApplyUiState) => void;
  applyError: WorkspaceApplyError | null;
  setApplyError: (value: WorkspaceApplyError | null) => void;
  applyConflict: WorkspaceApplyConflictState | null;
  setApplyConflict: (value: WorkspaceApplyConflictState | null) => void;
  setAppliedOverlay: Dispatch<SetStateAction<WorkspaceAppliedRevisionOverlay | null>>;
  editingTitleNodeId: string | null;
  setEditingTitleNodeId: (value: string | null) => void;
}

/** Detail, edit and Apply dialog of one committed node in the course host. */
export function WorkspaceCourseNodeDialog({ node, host, session, workspace, state, presentationRead, locale, recovery, onCourseApplied,
  message, actionError, setActionError, act, refreshWorkspace, applyState, setApplyState, applyError, setApplyError,
  applyConflict, setApplyConflict, setAppliedOverlay, editingTitleNodeId, setEditingTitleNodeId }: WorkspaceCourseNodeDialogProps) {
  const c = workspaceCourseHostCopy[locale];
  const editor = session.editorProps(node.node_id), write = workspace.writes[node.node_id];
  const detail = editor.access === 'allowed' ? editor.detail : null;
  // A planned node of a finished run will never be drafted: say so instead of a loading skeleton.
  const notGenerated = !detail && workspaceNodeNotGenerated(node, workspaceRunEnded(workspace.read.status?.status));
  const stats = presentationRead?.graph ? workspaceDetailStats(node, presentationRead.graph.nodes) : undefined;
  const editorCapable = host.canWrite() && !!detail && workspaceNodeSupportsEditor(detail.kind)
    && detail.content_state === 'content_ready' && detail.current_revision !== null;
  const hierarchyTitle = !!detail && workspaceNodeUsesHeaderTitleEditor(detail.kind);
  // The graph marks an exact revision/hash as applied. The local done state
  // closes the write window immediately, before the background read catches up.
  const appliedReadOnly = node.applied || applyState === 'done';
  const appliedNote = workspaceAppliedNote(detail?.applied_info, locale);
  const applyScope = workspaceApplyScope(presentationRead?.graph?.nodes ?? [], node.node_id);
  const canApply = host.canApply() && !!detail && !!applyScope && applyScope.content_state === 'content_ready'
    && !appliedReadOnly && !!state.launch && !!workspace.read.status && !workspace.read.stale && !workspace.writeBusy;
  const apply = async (draft?: NonNullable<typeof editor.draft>, expectedRevision?: number, changed = false, overwriteConfirmation?: string) => {
    if (!canApply || !state.launch || !workspace.read.status || !applyScope) return;
    setActionError(false); setApplyError(null); setApplyState('busy');
    try {
      const client = createWorkspaceApplyClient({ courseId: state.launch.course_id, conversationId: state.launch.conversation_id, workspaceId: state.launch.workspace_id });
      const confirmedScope = await saveThenApplyWorkspaceScope({ session, selectedNodeId: node.node_id, draft, expectedRevision, changed,
        assertCanWrite: () => host.assertCanApply(),
        apply: async (scopeNodeId, sequence) => { await client(scopeNodeId, secureRandomUuid(), sequence, locale, overwriteConfirmation); } });
      const confirmedGraph = session.getState().read.graph;
      const confirmedRevisions = workspaceAppliedScopeRevisions(confirmedGraph?.nodes ?? [], confirmedScope.node_id);
      completeWorkspaceApplyUi({ markApplied: () => {
        setAppliedOverlay(current => ({ workspaceId: state.launch!.workspace_id,
          revisions: { ...(current?.workspaceId === state.launch!.workspace_id ? current.revisions : {}), ...confirmedRevisions } }));
        setApplyState('done');
      },
        refreshWorkspace: () => session.refreshForApply(), refreshCourse: onCourseApplied });
    } catch (error) {
      // Edited/moved course parts: list them in a dialog (replace only after confirmation).
      if (error instanceof WorkspaceApplyError && error.conflict) { setApplyConflict({ nodeId: node.node_id, code: error.code, conflict: error.conflict }); setApplyState('idle'); }
      else if (error instanceof WorkspaceApplyError) { setApplyError(error); setApplyState('failed'); }
      else { setActionError(true); setApplyState('failed'); }
    }
  };
  const unitRecovery = node.kind === 'unit' ? recovery.unitAction(node.node_id, 'detail') : null;
  const readOnlyDetail = !!detail && !workspaceNodeSupportsEditor(detail.kind);
  const DetailIcon = detail?.component_type === 'la_diagram' ? Network : readOnlyDetail ? Eye : BookOpenCheck;
  const editingTitle = hierarchyTitle && editingTitleNodeId === node.node_id && !appliedReadOnly && !!editor.draft;
  const visibleTitle = hierarchyTitle && editor.draft?.title ? editor.draft.title : detail?.content?.title ?? node.title ?? c.detail;
  return <Dialog open onOpenChange={open => { if (!open) { setApplyState('idle'); setEditingTitleNodeId(null); act(() => session.selectNode(null)); } }}>
    <DialogContent showCloseButton={false} overlayClassName="z-[10060]"
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
      className={`z-[10070] flex h-[calc(100dvh-2rem)] max-h-none flex-col overflow-hidden rounded-2xl border-border/70 bg-background p-0 shadow-[0_30px_100px_-24px_rgba(2,6,23,0.75)] duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none ${detail?.component_type === 'la_diagram' ? 'w-[calc(100vw-2rem)] max-w-none' : detail?.kind === 'component' ? 'w-[calc(100vw-1rem)] max-w-[min(96vw,90rem)]' : 'w-[calc(100vw-1rem)] max-w-5xl'}`}>
      <div className="relative flex shrink-0 items-start justify-between gap-4 overflow-hidden border-b border-border/70 bg-gradient-to-r from-primary/[0.08] via-card to-card px-5 py-4 sm:px-6 sm:py-5">
        <div className="pointer-events-none absolute -left-12 -top-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex min-w-0 items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm"><DetailIcon className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2">
            {editingTitle ? <><DialogTitle className="sr-only">{visibleTitle}</DialogTitle><Input autoFocus aria-label={c.editTitle}
              className="h-9 min-w-[16rem] flex-1 bg-background/90 text-base font-bold sm:min-w-[24rem] sm:text-lg" value={editor.draft!.title}
              maxLength={500} lang={detail!.content_locale} onChange={event => {
                const next = updateWorkspaceEditorField(detail!, editor.draft!, 0, event.target.value);
                if (next) { setApplyState('idle'); act(() => { host.assertCanWrite(); editor.onChange(next); }); }
              }} /></> : <DialogTitle className="max-w-full truncate text-base font-bold tracking-tight sm:text-lg">{visibleTitle}</DialogTitle>}
            {hierarchyTitle && !appliedReadOnly && editor.draft && !editingTitle && <Button type="button" variant="ghost" size="icon"
              className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-primary" aria-label={c.editTitle}
              onClick={() => setEditingTitleNodeId(node.node_id)}><Pencil className="h-3.5 w-3.5" aria-hidden /></Button>}
            <WorkspaceNodeTypePill node={node} locale={locale} />
          </div><DialogDescription className="mt-1.5 max-w-3xl text-xs leading-5 sm:text-sm">{appliedReadOnly ? c.appliedReview : readOnlyDetail ? c.readOnlyReview : c.review}{appliedReadOnly && appliedNote ? ` ${appliedNote}` : ''}</DialogDescription></div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="relative h-9 w-9 shrink-0 rounded-xl border border-border/70 bg-background/70 shadow-sm backdrop-blur transition-transform hover:scale-105" aria-label={c.close}
          onClick={() => { setApplyState('idle'); setEditingTitleNodeId(null); act(() => session.selectNode(null)); }}><X className="h-4 w-4" /><span className="sr-only">{c.close}</span></Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {notGenerated && <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-muted/30 to-background px-4 py-5 sm:px-6"><div className="mx-auto max-w-5xl"><WorkspaceNotGeneratedNotice locale={locale} /></div></div>}
        {!detail && !notGenerated && <div className="min-h-0 flex-1 overflow-hidden bg-gradient-to-b from-muted/30 to-background px-4 py-5 sm:px-6" role="status" aria-label={c.waiting}>
          <div className="mx-auto max-w-5xl animate-pulse space-y-4" aria-hidden>
            <div className="grid gap-3 md:grid-cols-2"><div className="h-28 rounded-2xl border border-border/60 bg-card/80" /><div className="h-28 rounded-2xl border border-border/60 bg-card/80" /></div>
            <div className="h-48 rounded-2xl border border-border/60 bg-card/80 p-5"><div className="h-3 w-1/4 rounded bg-muted" /><div className="mt-5 h-3 w-full rounded bg-muted/80" /><div className="mt-3 h-3 w-11/12 rounded bg-muted/70" /><div className="mt-3 h-3 w-3/4 rounded bg-muted/60" /></div>
          </div><span className="sr-only">{c.waiting}</span>
        </div>}
        {detail && !editorCapable && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
          className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-muted/30 to-background px-4 py-4 sm:px-6 sm:py-6"><div className="mx-auto max-w-5xl"><WorkspaceDetailContent detail={detail} locale={locale} stats={stats} /></div></motion.div>}
        {detail && !editorCapable && canApply && <div className="flex shrink-0 justify-end border-t border-border/70 bg-card/95 px-5 py-4 shadow-[0_-12px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <Button type="button" className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20" disabled={applyState === 'busy'} onClick={() => { void apply(); }}>
            <Sparkles className="h-4 w-4" />{workspaceScopeApplyLabel(node.kind, locale, applyState === 'busy')}
          </Button>
        </div>}
        {unitRecovery && <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border/70 bg-card/95 px-5 py-4">{unitRecovery}</div>}
        {editorCapable && <WorkspaceNodeEditor {...editor}
          onChange={value => { setApplyState('idle'); act(() => { host.assertCanWrite(); editor.onChange(value); }); }}
          onSave={(value, revision) => { setApplyState('idle'); setEditingTitleNodeId(null); act(() => { host.assertCanWrite(); editor.onSave(value, revision); }); }}
          onReset={revision => { setApplyState('idle'); setEditingTitleNodeId(null); act(() => { host.assertCanWrite(); editor.onReset(revision); }); }}
          onApply={applyScope ? (value, revision, changed) => { setEditingTitleNodeId(null); void apply(value, revision, changed); } : undefined}
          applyLabel={workspaceScopeApplyLabel(node.kind, locale)} applyingLabel={workspaceScopeApplyLabel(node.kind, locale, true)}
          applyBusy={applyState === 'busy'} applyDisabled={!canApply} readOnly={appliedReadOnly}
          titleInHeader={hierarchyTitle} reviewContent={hierarchyTitle
            ? <WorkspaceDetailContent detail={detail!} locale={locale} stats={stats} />
            : detail?.kind === 'component' ? <WorkspaceAuthorReviewCards detail={detail} locale={locale} /> : undefined} />}
        {editorCapable && !appliedReadOnly && editor.conflict && write?.phase !== 'unknown' && !workspace.writeBusy && !write?.readRequired && detail.current_revision !== null && <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p>{c.compare}</p><Button type="button" variant="outline" onClick={() => act(() => session.rebaseDraft(node.node_id, detail.current_revision!))}>{c.rebase}</Button>
          <Button type="button" variant="outline" onClick={() => act(() => session.discardDraft(node.node_id))}>{c.discard}</Button></div>}
        {editorCapable && !appliedReadOnly && write?.phase === 'unknown' && <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><p>{c.replayHint}</p>
          <Button type="button" disabled={write.readRequired || workspace.writeBusy} onClick={() => act(() => session.replay(node.node_id))}>{c.replay}</Button></div>}
        {(write?.phase === 'committed' || applyState === 'done' || applyState === 'failed') && <div
          className={`pointer-events-none absolute right-5 top-[5.25rem] z-30 max-w-md rounded-xl border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-xl ${applyState === 'failed' ? 'border-destructive/35 text-destructive' : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'}`}
          role={applyState === 'failed' ? 'alert' : 'status'}>
          {applyState === 'failed' ? (applyError ? workspaceApplyErrorMessage(applyError, locale) : c.error)
            : applyState === 'done' ? c.applied : c.saved}
        </div>}
        {(message || actionError) && <div className="mx-5 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><p role="alert">{message ?? c.error}</p><Button type="button" variant="outline" size="sm" disabled={workspace.read.busy || workspace.writeBusy} onClick={() => act(refreshWorkspace)}>{c.refresh}</Button></div>}
      </div>
    </DialogContent>
    {applyConflict?.nodeId === node.node_id && <WorkspaceApplyConflictDialog code={applyConflict.code} conflict={applyConflict.conflict} locale={locale}
      busy={applyState === 'busy'} onClose={() => setApplyConflict(null)} onConfirm={() => {
        const token = applyConflict.conflict.overwrite_confirmation; setApplyConflict(null);
        if (token) void apply(undefined, undefined, false, token);
      }} />}
  </Dialog>;
}
