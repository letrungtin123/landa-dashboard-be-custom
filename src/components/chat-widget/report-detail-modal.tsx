import { useEffect, useMemo, useState } from 'react';
import { CourseCompletionRankingWidget } from '@/components/reports/course-completion-ranking-widget';
import { ReportLearnerListWidget } from '@/components/reports/report-learner-list-widget';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LearnerDetailModal } from '@/components/users/learner-detail-modal';
import type { ReportChatFilter } from '@/api/custom-chat';
import type { ReportCourseCompletionRanking } from '@/api/custom-reports';
import { useTranslation } from 'react-i18next';

export type ReportDetailView = 'course-ranking' | 'learners';

type Props = {
  filter: ReportChatFilter;
  open: boolean;
  view: ReportDetailView | null;
  initialCourse?: ReportCourseCompletionRanking | null;
  onOpenChange: (open: boolean) => void;
};

function scopeId(value: string | undefined): string | 'all' {
  return value || 'all';
}

export function ReportDetailModal({ filter, open, view, initialCourse = null, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [selectedLearner, setSelectedLearner] = useState<string | null>(null);
  const filterKey = useMemo(
    () => [filter.date_from, filter.date_to, filter.group_id, filter.subgroup_id, filter.team_id, view, initialCourse?.course_id].join(':'),
    [filter.date_from, filter.date_to, filter.group_id, filter.subgroup_id, filter.team_id, view, initialCourse?.course_id],
  );
  const hasDateRange = Boolean(filter.date_from && filter.date_to);

  useEffect(() => {
    if (!open) setSelectedLearner(null);
  }, [open]);

  if (!view || !hasDateRange) return null;

  const groupId = scopeId(filter.group_id);
  const subgroupId = scopeId(filter.subgroup_id);
  const teamId = scopeId(filter.team_id);
  const title = view === 'course-ranking'
    ? t('reports.courseRankingTitle')
    : t('reports.learnerList');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          overlayClassName="z-[10040]"
          className="z-[10050] flex max-h-[calc(100dvh-32px)] w-[calc(100vw-24px)] max-w-[1180px] flex-col gap-0 overflow-hidden border-border/80 bg-background p-0 shadow-2xl sm:w-[min(94vw,1180px)]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t('chatWidget.report.detailDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="w-full max-h-[calc(100dvh-32px)] overflow-y-auto">
            {view === 'course-ranking' ? (
              <CourseCompletionRankingWidget
                key={filterKey}
                dateFrom={filter.date_from!}
                dateTo={filter.date_to!}
                groupId={groupId}
                subgroupId={subgroupId}
                teamId={teamId}
                onSelectLearner={setSelectedLearner}
                disablePageScrollRestore
                scrollableContent
                modalLayer
                initialCourse={initialCourse}
              />
            ) : (
              <ReportLearnerListWidget
                key={filterKey}
                dateFrom={filter.date_from!}
                dateTo={filter.date_to!}
                groupId={groupId}
                subgroupId={subgroupId}
                teamId={teamId}
                onSelectLearner={setSelectedLearner}
                modalLayer
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <LearnerDetailModal
        username={selectedLearner}
        isOpen={Boolean(selectedLearner)}
        onClose={() => setSelectedLearner(null)}
        groupId={groupId}
        subgroupId={subgroupId}
        teamId={teamId}
        reportDateFrom={filter.date_from}
        reportDateTo={filter.date_to}
        lockReportScope
        layerAboveChat
      />
    </>
  );
}
