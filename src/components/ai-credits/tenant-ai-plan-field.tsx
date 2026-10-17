import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Crown, Infinity as InfinityIcon } from 'lucide-react';
import { useAiTenantUsage } from '@/hooks/queries/use-ai-credits';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Tenant edit form: the tenant's AI plan (AI limits are counted in points by
 * plan) with a link to the AI plans page. Replaces the old monthly token limit.
 */
export function TenantAiPlanField({ tenantId }: { tenantId: string | null }) {
  const { t } = useTranslation();
  const usage = useAiTenantUsage(tenantId, null);
  const plan = usage.data?.plan;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{t('tenantManagement.aiPlan')}</label>
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        {!tenantId ? (
          <p className="text-xs leading-5 text-muted-foreground">{t('tenantManagement.aiPlanNewTenant')}</p>
        ) : usage.isPending ? (
          <Skeleton className="h-7 w-32 rounded-full" aria-label={t('tenantManagement.aiPlanLoading')} />
        ) : usage.isError ? (
          <p className="text-xs text-muted-foreground">{t('tenantManagement.aiPlanUnavailable')}</p>
        ) : (
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
            <Crown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{plan?.name || t('tenantManagement.aiPlanNone')}</span>
            {plan?.is_unlimited && (
              <span className="inline-flex items-center gap-0.5 font-medium text-violet-700 dark:text-violet-300">
                · <InfinityIcon className="h-3 w-3" aria-hidden />{t('tenantManagement.aiPlanUnlimited')}
              </span>
            )}
          </span>
        )}
        <Link to="/ai-credits" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
          {t('tenantManagement.aiPlanManage')}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">{t('tenantManagement.aiPlanHint')}</p>
    </div>
  );
}
