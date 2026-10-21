import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { KbUsageConflict } from '@/api/ai-chatbot-kb-usage';
import { joinKbUsagePlaces } from './deploy-kb-usage.logic';

/** One warning per knowledge base that is already shared, naming the places, so the administrator chooses again.
 * Nothing while the list is loading, empty or could not be read: assigning still works and the server checks. */
export function DeployKbConflicts({ conflicts }: { conflicts: readonly KbUsageConflict[] | undefined }) {
  const { t } = useTranslation();
  if (!conflicts?.length) return null;
  const places = (conflict: KbUsageConflict) => joinKbUsagePlaces(conflict.used_by,
    place => t(`aiChatbotKbUsage.places.${place}`), t('aiChatbotKbUsage.and'));
  return <div role="alert" data-testid="deploy-kb-conflicts"
    className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
    <p className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />{t('aiChatbotKbUsage.conflictsTitle')}
    </p>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('aiChatbotKbUsage.conflictsHint')}</p>
    <ul className="mt-2 list-disc space-y-1 pl-5">{conflicts.map(conflict => <li key={conflict.kb_id} className="break-words">
      {conflict.kb_name ? t('aiChatbotKbUsage.conflict', { name: conflict.kb_name, places: places(conflict) })
        : t('aiChatbotKbUsage.conflictUnnamed', { places: places(conflict) })}
    </li>)}</ul>
  </div>;
}
