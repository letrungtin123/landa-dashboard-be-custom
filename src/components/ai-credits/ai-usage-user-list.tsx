import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownWideNarrow, ChevronDown, Cpu, Search, UsersRound } from 'lucide-react';
import type { AiUsageUser } from '@/api/ai-credits';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppTooltip } from '@/components/ui/tooltip';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { formatCount, formatPoints } from './ai-credits-format.logic';
import {
  aiFeatureColor, aiFeatureLabelKey, aiUserDisplayName, aiUserInitials, filterAndSortUsers, userFeatureSegments,
  type AiUserLabels, type AiUserSort,
} from './ai-credits-usage.logic';
import { AI_EASE } from './ai-credits-ui';

const AVATAR_GRADIENTS = [
  'from-sky-500 to-indigo-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500', 'from-fuchsia-500 to-pink-500',
  'from-violet-500 to-purple-500', 'from-cyan-500 to-blue-500', 'from-rose-500 to-red-500', 'from-lime-500 to-green-600',
];

function avatarGradient(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

const COLLAPSED_COUNT = 10;

/** Name with the "(deleted)" mark, used by the list and the chart legend. */
export function AiUserName({ user, labels, className }: { user: AiUsageUser; labels: AiUserLabels & { deleted: string }; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span className="truncate">{aiUserDisplayName(user, labels)}</span>
      {/* Very old rows of a deleted person have no name: the fallback already says "deleted user". */}
      {user.deleted && !user.system && Boolean(user.name?.trim() || user.email?.trim()) && (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">{labels.deleted}</span>
      )}
    </span>
  );
}

export function AiUserAvatar({ user, labels }: { user: AiUsageUser; labels: AiUserLabels }) {
  if (user.system) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-500/15 text-slate-600 ring-1 ring-slate-500/20 dark:text-slate-300" aria-hidden>
        <Cpu className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[11px] font-bold text-white shadow-sm ring-1 ring-white/20',
      avatarGradient(user.user_key), user.deleted && 'opacity-60 grayscale')} aria-hidden>
      {aiUserInitials(aiUserDisplayName(user, labels))}
    </span>
  );
}

/** Points split by feature for one person (2px gaps between segments). */
function FeatureMiniBar({ user }: { user: AiUsageUser }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const segments = userFeatureSegments(user);
  if (segments.length === 0) return <div className="h-2 w-full rounded-full bg-muted" />;
  return (
    <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
      {segments.map(segment => (
        <AppTooltip key={segment.group} content={`${t(aiFeatureLabelKey(segment.group))}: ${t('aiCredits.common.pointsValue', { value: formatPoints(segment.points, locale) })}`}>
          <span className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full" style={{ width: `${segment.share}%`, backgroundColor: aiFeatureColor(segment.group) }} />
        </AppTooltip>
      ))}
    </div>
  );
}

/** Everyone who used AI this month: search by name or email, sort, avatar, points and feature split (never a count of uses). */
export function AiUsageUserList({ users }: { users: readonly AiUsageUser[] }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AiUserSort>('points');
  const [expanded, setExpanded] = useState(false);
  const labels = useMemo(() => ({
    system: t('aiCredits.usage.users.system'), deletedUser: t('aiCredits.usage.users.deletedUser'), deleted: t('aiCredits.usage.users.deleted'),
  }), [t]);
  const visible = useMemo(() => filterAndSortUsers(users, query, sort, labels), [users, query, sort, labels]);
  const shown = expanded || query ? visible : visible.slice(0, COLLAPSED_COUNT);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-foreground">
          <UsersRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('aiCredits.usage.users.listTitle')}
          <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t('aiCredits.usage.users.listCount', { count: formatCount(users.length, locale) })}
          </span>
        </p>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('aiCredits.usage.users.searchPlaceholder')}
              aria-label={t('aiCredits.usage.users.searchPlaceholder')}
              className="h-9 rounded-xl pl-8"
            />
          </div>
          <Select value={sort} onValueChange={value => setSort(value as AiUserSort)}>
            <SelectTrigger className="h-9 rounded-xl sm:w-48" aria-label={t('aiCredits.usage.users.sortLabel')}>
              <div className="flex min-w-0 items-center gap-2">
                <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">{t('aiCredits.usage.users.sortPoints')}</SelectItem>
              <SelectItem value="name">{t('aiCredits.usage.users.sortName')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_120px_minmax(160px,1fr)] gap-4 border-b border-border/60 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid">
          <span>{t('aiCredits.usage.users.columnUser')}</span>
          <span className="text-right">{t('aiCredits.usage.users.columnPoints')}</span>
          <span>{t('aiCredits.usage.users.columnFeatures')}</span>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('aiCredits.usage.users.noMatch')}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            <AnimatePresence initial={false}>
              {shown.map(user => (
                <motion.li
                  key={user.user_key}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: AI_EASE }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1.6fr)_120px_minmax(160px,1fr)] md:items-center md:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AiUserAvatar user={user} labels={labels} />
                    <div className="min-w-0">
                      <AiUserName user={user} labels={labels} className="max-w-full text-sm font-medium text-foreground" />
                      <p className="truncate text-xs text-muted-foreground">
                        {user.system ? t('aiCredits.usage.users.systemHint') : user.email || '\u00a0'}
                      </p>
                    </div>
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums text-foreground">{formatPoints(user.points, locale)}</p>
                  <div className="col-span-2 md:col-span-1"><FeatureMiniBar user={user} /></div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      {!query && visible.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="mx-auto flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? t('aiCredits.usage.users.showLess') : t('aiCredits.usage.users.showAll', { count: formatCount(visible.length, locale) })}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
      )}
    </div>
  );
}
