import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { WorkspaceOrgContextConfirm } from './workspace-org-context-dialogs';
import type { WorkspaceSourceDeleteOutcome } from './workspace-source.logic';

/** Delete controls of the "Chọn tài liệu đã sẵn sàng" list. Rendered only for authors with the knowledge base
 * delete permission; the server checks the same permission. One document per delete (owner 24/10: no ticking
 * several documents to delete them together). Presentation only: the source controller deletes. */

/** The row's delete button, after the document. 40px on phones and tablets (touch), as before on desktop. */
export function WorkspaceSourceRowDelete({ name, disabled, onDelete }: { name: string; disabled: boolean; onDelete: () => void }) {
  const { t } = useTranslation();
  return <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-destructive max-lg:size-10" disabled={disabled}
    aria-label={t('aiIdSourceDelete.deleteLabel', { name })} onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden /></Button>;
}

/** "Đang dùng để soạn khoá học" under a document an active AI ID run designs from (it cannot be deleted yet). */
export function WorkspaceSourceInUseNote() {
  const { t } = useTranslation();
  return <span className="mt-0.5 block text-[11px] text-muted-foreground">{t('aiIdSourceDelete.inUse')}</span>;
}

type Translate = ReturnType<typeof useTranslation>['t'];

/** The plain words of a delete that sent nothing or was refused. */
export function workspaceSourceDeleteText(t: Translate, outcome: WorkspaceSourceDeleteOutcome): string {
  return t(`aiIdSourceDelete.errors.${outcome.issue ?? 'failed'}`);
}

/** The confirmation for one document, naming it; the refusal stays inside it so the author can retry or cancel. */
export function WorkspaceSourceDeleteConfirm({ name, busy, error, onConfirm, onClose }: {
  name: string; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return <WorkspaceOrgContextConfirm destructive busy={busy} error={error} onConfirm={onConfirm} onClose={onClose}
    title={t('aiIdSourceDelete.title')} body={t('aiIdSourceDelete.body')} note={`“${name}”`} confirmLabel={t('aiIdSourceDelete.confirm')} />;
}
