import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

/** A confirmation above the full-screen AI course design window (the global confirm dialog sits below it).
 * The action's error stays inside the dialog so the author can retry or cancel. */
export function WorkspaceOrgContextConfirm({ title, body, note, confirmLabel, destructive = false, busy, error, onConfirm, onClose }: {
  title: string; body: string; note?: string | null; confirmLabel: string; destructive?: boolean; busy: boolean; error: string | null;
  onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent showCloseButton={false} overlayClassName="z-[10080]" className="z-[10090] max-w-md rounded-2xl p-0">
      <div className="border-b px-6 py-5">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="mt-2 leading-6">{body}</DialogDescription>
        {note && <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">{note}</p>}
      </div>
      {error && <p role="alert" className="mx-6 mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('aiIdOrgContext.cancel')}</Button>
        <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{busy ? t('aiIdOrgContext.working') : confirmLabel}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}

/** A read-only window above the AI course design window. */
export function WorkspaceOrgContextViewer({ title, children, footer, onClose }: {
  title: string; children: ReactNode; footer?: ReactNode; onClose: () => void;
}) {
  const { t } = useTranslation();
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} overlayClassName="z-[10080]"
      className="z-[10090] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 rounded-2xl p-0">
      <div className="shrink-0 border-b px-5 py-4 sm:px-6"><DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
        <Button type="button" variant="outline" onClick={onClose}>{t('aiIdOrgContext.close')}</Button>{footer}
      </div>
    </DialogContent>
  </Dialog>;
}
