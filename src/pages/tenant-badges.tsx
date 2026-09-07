import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  ChevronLeft,
  Loader2,
  Search,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  tenantBadgesApi,
  type TenantBadgeConfiguration,
  type TenantBadgeCourseMapping,
} from '@/api/tenant-badges';
import { BADGE_ICONS } from '@/data/badgeImages';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/utils';
import { storageUrl } from '@/utils/storage-url';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import { getLocalizedApiError } from '@/utils/localized-error';

const BADGE_QUERY_ROOT = 'tenant-badge-management';

function badgeQueryKey(tenantScope: string | null) {
  return [BADGE_QUERY_ROOT, tenantScope] as const;
}

function errorMessage(error: unknown, fallback: string): string {
  return getLocalizedApiError(error, fallback);
}

function useDebouncedValue(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function uniqueValidCourses(courses: TenantBadgeCourseMapping[]): TenantBadgeCourseMapping[] {
  const seen = new Set<string>();
  return courses.filter((course) => {
    if (!course.course_id || course.is_deleted) return false;
    if (seen.has(course.course_id)) return false;
    seen.add(course.course_id);
    return true;
  });
}

function countDeletedCourses(courses: TenantBadgeCourseMapping[]): number {
  return courses.filter((course) => !course.course_id || course.is_deleted).length;
}

export default function TenantBadgesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const activeTenantId = useTenantStore((state) => state.activeTenantId);
  const tenantScope = user?.role === 'superadmin' ? activeTenantId : user?.tenant_id || null;
  const requestTenantId = user?.role === 'superadmin' ? activeTenantId : null;
  const queryKey = badgeQueryKey(tenantScope);
  const canEdit = user?.role === 'superadmin'
    || user?.role === 'superuser'
    || hasPermission('badge_management', 'can_edit');
  const [editingBadge, setEditingBadge] = useState<TenantBadgeConfiguration | null>(null);

  const badgeQuery = useQuery({
    queryKey,
    queryFn: () => tenantBadgesApi.list(requestTenantId),
    enabled: Boolean(tenantScope),
    staleTime: 30_000,
  });

  useEffect(() => {
    setEditingBadge(null);
  }, [tenantScope]);

  const updateMutation = useMutation({
    mutationFn: ({
      badgeId,
      isEnabled,
      requestTenant,
    }: {
      badgeId: string;
      isEnabled: boolean;
      tenantScope: string;
      requestTenant: string | null;
    }) => tenantBadgesApi.update(badgeId, { is_enabled: isEnabled }, requestTenant),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData<TenantBadgeConfiguration[]>(badgeQueryKey(variables.tenantScope), (current = []) =>
        current.map((badge) => badge.id === updated.id ? updated : badge),
      );
      toast.success(updated.is_enabled ? t('tenantBadges.enabled') : t('tenantBadges.disabled'));
    },
    onError: (error: unknown) => toast.error(errorMessage(error, t('tenantBadges.updateFailed'))),
  });

  const handleToggle = (badge: TenantBadgeConfiguration, checked: boolean) => {
    if (!canEdit || !tenantScope) return;
    if (checked && badge.requires_courses && !badge.is_config_valid) {
      toast.warning(t('tenantBadges.courseRequirement', { count: badge.minimum_required_courses }));
      setEditingBadge(badge);
      return;
    }
    updateMutation.mutate({
      badgeId: badge.id,
      isEnabled: checked,
      tenantScope,
      requestTenant: requestTenantId,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader icon={Award} title={t('tenantBadges.title')} />

      {badgeQuery.data?.[0]?.module_enabled === false && (
        <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {t('tenantBadges.moduleDisabled')}
          </p>
        </div>
      )}

      {badgeQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : badgeQuery.isError ? (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 border border-dashed p-6 text-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
          <p className="text-sm text-muted-foreground">{t('tenantBadges.loadFailed')}</p>
          <Button variant="outline" onClick={() => badgeQuery.refetch()}>{t('tenantBadges.reload')}</Button>
        </div>
      ) : (badgeQuery.data?.length || 0) === 0 ? (
        <div className="flex min-h-52 items-center justify-center border border-dashed text-sm text-muted-foreground">
          {t('tenantBadges.empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          {badgeQuery.data?.map((badge, index) => {
            const iconUrl = badge.icon_image_url ? storageUrl(badge.icon_image_url) : BADGE_ICONS[badge.id];
            const validCourses = uniqueValidCourses(badge.courses);
            const deletedCount = countDeletedCourses(badge.courses);
            const requiredCourseCount = badge.minimum_required_courses;
            const courseCountLabel = t('tenantBadges.selectedCourses', { selected: validCourses.length, required: requiredCourseCount });
            const isUpdating = updateMutation.isPending && updateMutation.variables?.badgeId === badge.id;

            return (
              <div
                key={badge.id}
                className={cn(
                  'grid gap-4 px-4 py-4 md:grid-cols-[56px_minmax(280px,1fr)_minmax(280px,0.85fr)_156px] md:items-start',
                  index > 0 && 'border-t',
                )}
              >
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                  {iconUrl ? <img src={iconUrl} alt="" className="h-10 w-10 object-contain" /> : <Award className="h-5 w-5 text-muted-foreground" />}
                </div>

                <div className="min-w-0 md:pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold">{badge.name}</h2>
                    {!badge.is_config_valid && (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                        {t('tenantBadges.invalidConfiguration')}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{badge.rule_summary}</p>
                </div>

                <div className="min-w-0 md:pt-1">
                  {badge.requires_courses ? (
                    <div className="min-h-12 space-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {validCourses.slice(0, 3).map((course) => (
                          <Badge key={course.course_id} variant="secondary" className="max-w-full truncate font-normal md:max-w-48">
                            {course.display_name}
                          </Badge>
                        ))}
                        {validCourses.length > 3 && <Badge variant="outline">+{validCourses.length - 3}</Badge>}
                        {validCourses.length === 0 && <span className="text-xs text-muted-foreground">{t('tenantBadges.noCourseSelected')}</span>}
                      </div>
                      {deletedCount > 0 && (
                        <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5" /> {t('tenantBadges.deletedCourses', { count: deletedCount })}
                        </p>
                      )}
                      <p className={cn(
                        'text-xs',
                        badge.is_config_valid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300',
                      )}>
                        {courseCountLabel}
                      </p>
                    </div>
                  ) : (
                    <div className="flex min-h-12 items-start">
                      <span className="text-xs leading-5 text-muted-foreground">{t('tenantBadges.automatic')}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 md:min-h-12 md:justify-end md:self-start">
                  {badge.requires_courses && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={!canEdit}
                      onClick={() => setEditingBadge(badge)}
                    >
                      <Settings2 className="h-4 w-4" /> {t('tenantBadges.courses')}
                    </Button>
                  )}
                  {isUpdating ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={badge.is_enabled}
                      disabled={!canEdit || updateMutation.isPending}
                      onCheckedChange={(checked) => handleToggle(badge, checked)}
                      aria-label={`${badge.is_enabled ? t('tenantBadges.disable') : t('tenantBadges.enable')} ${badge.name}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CoursePickerDialog
        badge={editingBadge}
        canEdit={canEdit}
        tenantScope={tenantScope}
        requestTenantId={requestTenantId}
        onClose={() => setEditingBadge(null)}
      />
    </div>
  );
}

function CoursePickerDialog({
  badge,
  canEdit,
  tenantScope,
  requestTenantId,
  onClose,
}: {
  badge: TenantBadgeConfiguration | null;
  canEdit: boolean;
  tenantScope: string | null;
  requestTenantId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setSelectedIds(new Set(
      badge?.courses
        .map((course) => course.course_id)
        .filter((courseId): courseId is string => Boolean(courseId)) || [],
    ));
    setSearch('');
    setPage(1);
  }, [badge]);

  const coursesQuery = useQuery({
    queryKey: ['tenant-badge-courses', tenantScope, debouncedSearch, page],
    queryFn: () => tenantBadgesApi.listCourses(
      { search: debouncedSearch, page, page_size: 20 },
      requestTenantId,
    ),
    enabled: Boolean(badge && tenantScope),
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: ({
      badgeId,
      isEnabled,
      courseIds,
      requestTenant,
    }: {
      badgeId: string;
      isEnabled: boolean;
      courseIds: string[];
      tenantScope: string;
      requestTenant: string | null;
    }) => tenantBadgesApi.update(badgeId, {
      is_enabled: isEnabled,
      course_ids: courseIds,
    }, requestTenant),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData<TenantBadgeConfiguration[]>(badgeQueryKey(variables.tenantScope), (current = []) =>
        current.map((item) => item.id === updated.id ? updated : item),
      );
      toast.success(t('tenantBadges.savedCourses'));
      onClose();
    },
    onError: (error: unknown) => toast.error(errorMessage(error, t('tenantBadges.saveCoursesFailed'))),
  });

  const selectedCount = selectedIds.size;
  const requiredCourseCount = badge?.minimum_required_courses || 0;
  const isAboveRequiredCourseCount = selectedCount > requiredCourseCount;
  const isExactRequiredCourseCount = selectedCount === requiredCourseCount;
  const isAtCourseLimit = Boolean(badge?.requires_courses && requiredCourseCount > 0 && selectedCount >= requiredCourseCount);
  const totalPages = coursesQuery.data?.total_pages || 1;
  const courses = coursesQuery.data?.data || [];
  const toggleCourse = (courseId: string) => {
    if (!selectedIds.has(courseId) && isAtCourseLimit) {
      toast.warning(t('tenantBadges.courseLimit', { count: requiredCourseCount }));
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  return (
    <Dialog open={Boolean(badge)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-primary" /> {badge?.name}
          </DialogTitle>
          <DialogDescription>{badge?.rule_summary}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder={t('tenantBadges.searchCourses')}
              className="pl-9"
            />
          </div>

          <div className="h-[360px] overflow-y-auto rounded-lg border">
            {coursesQuery.isLoading ? (
              <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : courses.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('tenantBadges.noMatchingCourses')}</div>
            ) : courses.map((course) => {
              const selected = selectedIds.has(course.id);
              const disabledByLimit = !selected && isAtCourseLimit;
              return (
                <label
                  key={course.id}
                  className={cn(
                    'flex items-center gap-3 border-b px-4 py-3 last:border-b-0',
                    disabledByLimit || !canEdit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40',
                    selected && 'bg-primary/5',
                  )}
                >
                  <Checkbox checked={selected} onCheckedChange={() => toggleCourse(course.id)} disabled={!canEdit || disabledByLimit} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{course.display_name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{course.id}</p>
                  </div>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <span className={cn(
              'text-xs',
              isExactRequiredCourseCount ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
              isAboveRequiredCourseCount && 'text-amber-700 dark:text-amber-300',
            )}>
              {requiredCourseCount > 0
                ? t('tenantBadges.selectedCoursesExact', { selected: selectedCount, required: requiredCourseCount })
                : t('tenantBadges.selectedCourses', { selected: selectedCount, required: requiredCourseCount })}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-20 text-center text-xs text-muted-foreground">{page}/{totalPages}</span>
              <Button variant="ghost" size="icon" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={() => {
              if (!badge || !tenantScope) return;
              saveMutation.mutate({
                badgeId: badge.id,
                isEnabled: badge.is_enabled,
                courseIds: Array.from(selectedIds),
                tenantScope,
                requestTenant: requestTenantId,
              });
            }}
            disabled={!canEdit
              || !tenantScope
              || saveMutation.isPending
              || isAboveRequiredCourseCount
              || (Boolean(badge?.is_enabled) && !isExactRequiredCourseCount)}
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
