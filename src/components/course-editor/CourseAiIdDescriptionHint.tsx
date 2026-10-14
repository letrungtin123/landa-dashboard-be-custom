import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';

/** Shown next to the course description when the tenant uses AI ID: AI ID
 * reads the course name and description as the author's intent. */
export function CourseAiIdDescriptionHint({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <div role="note" className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{t('courses.aiIdDescriptionHintTitle')}</p>
        <p className="leading-snug text-muted-foreground">{t('courses.aiIdDescriptionHintBody')}</p>
      </div>
    </div>
  );
}
