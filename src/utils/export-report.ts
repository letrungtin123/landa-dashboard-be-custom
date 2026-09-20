import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { downloadReportExcel } from '@/api/custom-reports';
import i18n from '@/i18n';
import { getLocalizedDefaultGroupLabel } from '@/utils/group-labels';

interface ExportParams {
  dateFrom: string;
  dateTo: string;
  selectedGroupId: string | 'all';
  selectedSubGroupId?: string | 'all';
  selectedTeamId?: string | 'all';
  groupLabel?: string;
  subgroupLabel?: string;
  teamLabel?: string;
}

export async function exportReportExcel(params: ExportParams) {
  const {
    dateFrom,
    dateTo,
    selectedGroupId,
    selectedSubGroupId = 'all',
    selectedTeamId = 'all',
    groupLabel,
    subgroupLabel,
    teamLabel,
  } = params;
  const locale = i18n.resolvedLanguage?.toLowerCase().startsWith('en') ? 'en' : 'vi';

  const toastId = toast.loading(i18n.t('reports.exportPreparing'));

  try {
    const { blob, fileName } = await downloadReportExcel({
      date_from: dateFrom,
      date_to: dateTo,
      group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
      subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId,
      team_id: selectedTeamId === 'all' ? undefined : selectedTeamId,
      group_label: groupLabel || getLocalizedDefaultGroupLabel('group'),
      subgroup_label: subgroupLabel || getLocalizedDefaultGroupLabel('subgroup'),
      team_label: teamLabel || getLocalizedDefaultGroupLabel('team'),
      locale,
    });

    saveAs(blob, fileName);
    toast.success(i18n.t('reports.exportSuccess'), { id: toastId });
  } catch (error) {
    console.error('Lỗi xuất file Excel:', error);
    toast.error(i18n.t('reports.exportFailed'), { id: toastId });
    throw error;
  }
}
