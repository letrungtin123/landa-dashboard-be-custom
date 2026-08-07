import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { downloadReportExcel } from '@/api/custom-reports';
import { DEFAULT_GROUP_LABELS } from '@/utils/group-labels';

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
    groupLabel = DEFAULT_GROUP_LABELS.group,
    subgroupLabel = DEFAULT_GROUP_LABELS.subgroup,
    teamLabel = DEFAULT_GROUP_LABELS.team,
  } = params;

  const toastId = toast.loading('Đang chuẩn bị file Excel báo cáo...');

  try {
    const { blob, fileName } = await downloadReportExcel({
      date_from: dateFrom,
      date_to: dateTo,
      group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
      subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId,
      team_id: selectedTeamId === 'all' ? undefined : selectedTeamId,
      group_label: groupLabel,
      subgroup_label: subgroupLabel,
      team_label: teamLabel,
    });

    saveAs(blob, fileName);
    toast.success('Đã xuất file Excel thành công.', { id: toastId });
  } catch (error) {
    console.error('Lỗi xuất file Excel:', error);
    toast.error('Có lỗi xảy ra khi xuất file Excel.', { id: toastId });
    throw error;
  }
}
