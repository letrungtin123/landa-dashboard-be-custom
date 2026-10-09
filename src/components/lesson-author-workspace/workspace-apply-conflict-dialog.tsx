import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { workspaceApplyMessage, type WorkspaceApplyCode, type WorkspaceApplyConflict } from '../../api/workspace-apply';
import { fillWorkspaceCopy, workspaceConflictItemLabel, workspaceSharingCopy } from './workspace-sharing';

/** Course parts changed after an earlier Apply. Edited parts may be replaced
 * only after this explicit confirmation; deleted/moved parts can only be read. */
export function WorkspaceApplyConflictDialog({ code, conflict, locale, busy, onConfirm, onClose }: {
  code: WorkspaceApplyCode;
  conflict: WorkspaceApplyConflict;
  locale: WorkspaceLocale;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const c = workspaceSharingCopy[locale];
  const replaceable = code === 'WORKSPACE_APPLY_COURSE_EDITED' && !!conflict.overwrite_confirmation;
  const hidden = conflict.total - conflict.items.length;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent showCloseButton={false} overlayClassName="z-[10080]" className="z-[10090] max-w-lg rounded-2xl p-0">
      <div className="border-b px-6 py-5">
        <DialogTitle>{replaceable ? c.conflictTitle : c.structureTitle}</DialogTitle>
        <DialogDescription className="mt-2">{replaceable ? c.conflictLead : workspaceApplyMessage(code, locale)}</DialogDescription>
      </div>
      <div className="space-y-3 px-6 py-5">
        {replaceable && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">{c.conflictWarning}</p>}
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{c.affectedParts}</p>
        <ul className="max-h-60 space-y-1.5 overflow-y-auto text-sm">
          {conflict.items.map(item => <li key={item.node_id} className="rounded-lg bg-muted px-3 py-2">{workspaceConflictItemLabel(item.kind, item.title, locale)}</li>)}
        </ul>
        {hidden > 0 && <p className="text-xs text-muted-foreground">{fillWorkspaceCopy(c.moreParts, { count: hidden })}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t px-6 py-4">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{replaceable ? c.conflictCancel : c.close}</Button>
        {replaceable && <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{c.conflictConfirm}
        </Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
