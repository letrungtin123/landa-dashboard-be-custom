import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { WorkspaceOrgContextConfirm } from './workspace-org-context-dialogs';
import { workspaceSourceNameList, type WorkspaceSourceDeleteOutcome } from './workspace-source.logic';

/** Delete controls of the "Chọn tài liệu đã sẵn sàng" list. Rendered only for authors with the knowledge base
 * delete permission; the server checks the same permission. Presentation only: the source controller deletes. */

/** "Select all" for the deletable documents and "Delete N selected". */
export function WorkspaceSourceDeleteBar({ deletableIds, checkedIds, disabled, onCheckAll, onDelete }: {
  deletableIds: readonly string[]; checkedIds: readonly string[]; disabled: boolean;
  onCheckAll: (checked: boolean) => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  if (deletableIds.length === 0) return null;
  const all = checkedIds.length === deletableIds.length;
  return <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Checkbox checked={all ? true : checkedIds.length > 0 ? 'indeterminate' : false} disabled={disabled}
        onCheckedChange={value => onCheckAll(value === true)} />{t('aiIdSourceDelete.selectAll')}
    </label>
    {checkedIds.length > 0 && <Button type="button" variant="outline" size="sm" disabled={disabled}
      className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
      <Trash2 className="h-3.5 w-3.5" aria-hidden />{t('aiIdSourceDelete.deleteChecked', { count: checkedIds.length })}
    </Button>}
  </div>;
}

/** The row's checkbox, before the document. */
export function WorkspaceSourceRowCheck({ name, checked, disabled, onCheck }: {
  name: string; checked: boolean; disabled: boolean; onCheck: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  return <Checkbox className="ml-1" aria-label={t('aiIdSourceDelete.checkLabel', { name })} checked={checked} disabled={disabled}
    onCheckedChange={value => onCheck(value === true)} />;
}

/** The row's delete button, after the document. */
export function WorkspaceSourceRowDelete({ name, disabled, onDelete }: { name: string; disabled: boolean; onDelete: () => void }) {
  const { t } = useTranslation();
  return <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-destructive" disabled={disabled}
    aria-label={t('aiIdSourceDelete.deleteLabel', { name })} onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden /></Button>;
}

/** "Đang dùng để soạn khoá học" under a document an active AI ID run designs from (it cannot be deleted yet). */
export function WorkspaceSourceInUseNote() {
  const { t } = useTranslation();
  return <span className="mt-0.5 block text-[11px] text-muted-foreground">{t('aiIdSourceDelete.inUse')}</span>;
}

type Translate = ReturnType<typeof useTranslation>['t'];
const nameList = (t: Translate, names: readonly string[]) => {
  const { shown, more } = workspaceSourceNameList(names);
  return more ? t('aiIdSourceDelete.namesMore', { names: shown, count: more }) : shown;
};

/** The plain words of a delete that sent nothing or was refused: the in-use documents by name when known. */
export function workspaceSourceDeleteText(t: Translate, outcome: WorkspaceSourceDeleteOutcome): string {
  if (outcome.issue === 'in_use' && outcome.names.length) return t('aiIdSourceDelete.errors.inUseNamed', { names: nameList(t, outcome.names) });
  if (outcome.issue === 'in_use' && outcome.serverMessage) return outcome.serverMessage;
  return t(`aiIdSourceDelete.errors.${outcome.issue ?? 'failed'}`);
}

/** One confirmation for one or several documents; the refusal stays inside it so the author can retry or cancel. */
export function WorkspaceSourceDeleteConfirm({ names, busy, error, onConfirm, onClose }: {
  names: readonly string[]; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const count = names.length, listed = nameList(t, names);
  return <WorkspaceOrgContextConfirm destructive busy={busy} error={error} onConfirm={onConfirm} onClose={onClose}
    title={count === 1 ? t('aiIdSourceDelete.titleOne') : t('aiIdSourceDelete.titleMany', { count })}
    body={t('aiIdSourceDelete.body')} note={listed}
    confirmLabel={count === 1 ? t('aiIdSourceDelete.confirmOne') : t('aiIdSourceDelete.confirmMany', { count })} />;
}
