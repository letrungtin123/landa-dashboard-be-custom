import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import {
  getReportSummary,
  getReportTopCourses,
  getReportUncompletedLearners,
  type ReportSummaryResponse,
} from '@/api/custom-reports';
import { DEFAULT_GROUP_LABELS } from '@/utils/group-labels';

// ── Style Helpers ──

const COLORS = {
  headerBg: 'FF1E293B',
  headerFg: 'FFFFFFFF',
  titleBg: 'FF0F172A',
  titleFg: 'FFFFFFFF',
  subtitleFg: 'FF64748B',
  zebraLight: 'FFF8FAFC',
  zebraWhite: 'FFFFFFFF',
  borderColor: 'FFE2E8F0',
  accentBlue: 'FF2563EB',
  accentGreen: 'FF10B981',
  accentAmber: 'FFF59E0B',
  accentRed: 'FFEF4444',
  summaryBg: 'FFF1F5F9',
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLORS.borderColor } },
  left: { style: 'thin', color: { argb: COLORS.borderColor } },
  bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
  right: { style: 'thin', color: { argb: COLORS.borderColor } },
};

function applyHeader(row: ExcelJS.Row, colCount: number) {
  row.height = 32;
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, size: 11, color: { argb: COLORS.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  }
}

function applyDataRow(row: ExcelJS.Row, colCount: number, isEven: boolean) {
  row.height = 22;
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.alignment = { vertical: 'middle', wrapText: false };
    cell.border = thinBorder;
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: isEven ? COLORS.zebraLight : COLORS.zebraWhite },
    };
    cell.font = { size: 10 };
  }
}

function addSheetTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, colCount: number) {
  // Row 1: Title
  const r1 = ws.addRow([title]);
  ws.mergeCells(r1.number, 1, r1.number, colCount);
  const c1 = r1.getCell(1);
  c1.font = { size: 16, bold: true, color: { argb: COLORS.titleBg } };
  c1.alignment = { vertical: 'middle', horizontal: 'left' };
  r1.height = 36;

  // Row 2: Subtitle
  const r2 = ws.addRow([subtitle]);
  ws.mergeCells(r2.number, 1, r2.number, colCount);
  const c2 = r2.getCell(1);
  c2.font = { size: 10, italic: true, color: { argb: COLORS.subtitleFg } };
  c2.alignment = { vertical: 'middle', horizontal: 'left' };
  r2.height = 20;

  // Row 3: Spacer
  ws.addRow([]);
}

function addSummaryRow(ws: ExcelJS.Worksheet, label: string, value: string | number, colCount: number) {
  const row = ws.addRow([label, value]);
  ws.mergeCells(row.number, 2, row.number, colCount);
  row.height = 24;
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.summaryBg } };
    cell.border = thinBorder;
    cell.font = i === 1 ? { bold: true, size: 10, color: { argb: COLORS.titleBg } } : { size: 10 };
    cell.alignment = { vertical: 'middle' };
  }
}

function freezeAndFilter(ws: ExcelJS.Worksheet, headerRowNum: number, colCount: number) {
  ws.views = [{ state: 'frozen', ySplit: headerRowNum, xSplit: 0 }];
  ws.autoFilter = {
    from: { row: headerRowNum, column: 1 },
    to: { row: headerRowNum, column: colCount },
  };
}

// ── Main Export ──

interface ExportParams {
  selectedYear: number;
  selectedGroupId: string | 'all';
  groupName: string;
  groupLabel?: string;
  exporterName: string;
}

export async function exportReportExcel(params: ExportParams) {
  const { selectedYear, selectedGroupId, groupName, groupLabel = DEFAULT_GROUP_LABELS.group, exporterName } = params;
  const toastId = toast.loading(`Đang tổng hợp dữ liệu chi tiết năm ${selectedYear}...`);

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Landa Admin';
    workbook.created = new Date();

    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const summaries: (ReportSummaryResponse | null)[] = [];
    const topCoursesData: Array<{ month: number; rank: number; id: string; name: string; enrollments: number }> = [];
    const learnersData: Array<{ month: number; stt: number; username: string; email: string; lastCompletionAt: string; progress: number; courseName: string; status: string }> = [];
    const yearlyCourseMap: Record<string, { id: string; name: string; enrollments: number }> = {};

    const now = new Date();
    const currentRealMonth = now.getMonth() + 1;
    const currentRealYear = now.getFullYear();
    const gid = selectedGroupId === 'all' ? undefined : selectedGroupId;

    for (const m of months) {
      toast.loading(`Đang tổng hợp dữ liệu tháng ${m}/12...`, { id: toastId });

      if (selectedYear > currentRealYear || (selectedYear === currentRealYear && m > currentRealMonth)) {
        summaries.push(null);
        continue;
      }

      try {
        const summary = await getReportSummary({ month: m, year: selectedYear, group_id: gid });
        summaries.push(summary);

        const topRes = await getReportTopCourses({ month: m, year: selectedYear, group_id: gid, page_size: 100 });
        if (topRes?.results) {
          topRes.results.forEach((c, i) => {
            topCoursesData.push({ month: m, rank: i + 1, id: c.course_id, name: c.name, enrollments: c.enrollments });
            if (!yearlyCourseMap[c.course_id]) {
              yearlyCourseMap[c.course_id] = { id: c.course_id, name: c.name, enrollments: c.enrollments };
            } else {
              yearlyCourseMap[c.course_id].enrollments += c.enrollments;
            }
          });
        }

        // Uncompleted learners logic has been moved outside the loop to avoid duplication
        // since the API now returns cumulative data up to the requested month.
      } catch {
        summaries.push(null);
      }
    }

    // --- FETCH ALL UNCOMPLETED LEARNERS FOR THE LATEST MONTH ---
    const targetMonth = selectedYear === currentRealYear ? currentRealMonth : 12;
    toast.loading(`Đang tải danh sách học viên chưa hoàn thành (Tháng ${targetMonth})...`, { id: toastId });
    
    let page = 1;
    let totalPages = 1;
    let sttCounter = 1;
    do {
      try {
        const uncRes = await getReportUncompletedLearners({ 
          month: targetMonth, 
          year: selectedYear, 
          group_id: gid, 
          page, 
          page_size: 100 
        });
        
        if (uncRes?.results) {
          totalPages = uncRes.total_pages || 1;
          uncRes.results.forEach((u) => {
            learnersData.push({
              month: targetMonth, 
              stt: sttCounter++, 
              username: u.username, 
              email: u.email,
              lastCompletionAt: u.last_completion_at
                ? new Date(u.last_completion_at).toLocaleDateString('vi-VN')
                : 'Chưa học',
              progress: u.progress ?? 0,
              courseName: u.course_name ?? '',
              status: u.status === 'completed' ? 'Đã học' : u.status === 'learning' ? 'Đang học' : 'Chưa học',
            });
          });
        } else {
          break;
        }
      } catch (err) {
        console.error("Error fetching uncompleted learners page", page, err);
        break;
      }
      page++;
    } while (page <= totalPages);

    toast.loading('Đang tạo và định dạng file Excel...', { id: toastId });
    const exportDate = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const metaSubtitle = `${groupLabel}: ${groupName} | Người xuất: ${exporterName} | Ngày xuất: ${exportDate}`;

    // ═══ SHEET 1: TỔNG QUAN THEO THÁNG ═══
    const COL1 = 6;
    const ws1 = workbook.addWorksheet('📊 Tổng quan');
    ws1.columns = [
      { key: 'month', width: 14 },
      { key: 'total_learners', width: 18 },
      { key: 'active_learners', width: 22 },
      { key: 'total_enrollments', width: 20 },
      { key: 'completion_rate', width: 22 },
      { key: 'status', width: 14 },
    ];

    addSheetTitle(ws1, `BÁO CÁO TỔNG QUAN NĂM ${selectedYear}`, metaSubtitle, COL1);

    const hdr1 = ws1.addRow(['Tháng', 'Tổng học viên', 'HV hoạt động', 'Lượt đăng ký', 'Tỉ lệ hoàn thành (%)', 'Trạng thái']);
    applyHeader(hdr1, COL1);
    freezeAndFilter(ws1, hdr1.number, COL1);

    let totalLearners = 0, totalActive = 0, totalEnroll = 0, rateSum = 0, rateCount = 0;

    summaries.forEach((d, idx) => {
      const isFuture = !d;
      const row = ws1.addRow([
        `Tháng ${idx + 1}`,
        d?.overview?.total_learners ?? '',
        d?.overview?.active_learners ?? '',
        d?.overview?.total_enrollments ?? '',
        d?.overview?.completion_rate != null ? d.overview.completion_rate : '',
        isFuture ? 'Chưa đến' : 'Đã có',
      ]);
      applyDataRow(row, COL1, idx % 2 === 0);
      row.getCell(1).font = { bold: true, size: 10 };

      if (d?.overview) {
        totalLearners = Math.max(totalLearners, d.overview.total_learners);
        totalActive = Math.max(totalActive, d.overview.active_learners);
        totalEnroll += d.overview.total_enrollments;
        rateSum += d.overview.completion_rate;
        rateCount++;
      }

      // Completion rate coloring
      if (d?.overview?.completion_rate != null) {
        const rate = d.overview.completion_rate;
        const cell = row.getCell(5);
        cell.font = { size: 10, bold: true, color: { argb: rate >= 70 ? COLORS.accentGreen : rate >= 40 ? COLORS.accentAmber : COLORS.accentRed } };
      }

      if (isFuture) {
        row.getCell(6).font = { size: 9, italic: true, color: { argb: COLORS.subtitleFg } };
      }
    });

    // Summary row
    ws1.addRow([]);
    addSummaryRow(ws1, 'Cao nhất - Tổng học viên', totalLearners.toLocaleString('en-US'), COL1);
    addSummaryRow(ws1, 'Cao nhất - HV hoạt động', totalActive.toLocaleString('en-US'), COL1);
    addSummaryRow(ws1, 'Tổng lượt đăng ký cả năm', totalEnroll.toLocaleString('en-US'), COL1);
    addSummaryRow(ws1, 'TB tỉ lệ hoàn thành', rateCount > 0 ? `${(rateSum / rateCount).toFixed(1)}%` : 'N/A', COL1);

    // ═══ SHEET 2: XẾP HẠNG CẢ NĂM ═══
    const COL2 = 5;
    const ws2 = workbook.addWorksheet('🏆 Xếp hạng Năm');
    ws2.columns = [
      { key: 'rank', width: 10 },
      { key: 'name', width: 50 },
      { key: 'id', width: 38 },
      { key: 'enrollments', width: 18 },
      { key: 'medal', width: 12 },
    ];

    addSheetTitle(ws2, `BẢNG XẾP HẠNG KHÓA HỌC NĂM ${selectedYear}`, metaSubtitle, COL2);

    const hdr2 = ws2.addRow(['Hạng', 'Tên khóa học', 'ID khóa học', 'Lượt đăng ký', 'Huy hiệu']);
    applyHeader(hdr2, COL2);
    freezeAndFilter(ws2, hdr2.number, COL2);

    const yearlyList = Object.values(yearlyCourseMap).sort((a, b) => b.enrollments - a.enrollments);
    yearlyList.forEach((c, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const row = ws2.addRow([i + 1, c.name, c.id, c.enrollments, medal]);
      applyDataRow(row, COL2, i % 2 === 0);
      if (i < 3) {
        row.getCell(1).font = { bold: true, size: 11 };
        row.getCell(2).font = { bold: true, size: 10 };
      }
    });

    ws2.addRow([]);
    addSummaryRow(ws2, 'Tổng số khóa học', yearlyList.length.toString(), COL2);
    const totalEnrollYear = yearlyList.reduce((s, c) => s + c.enrollments, 0);
    addSummaryRow(ws2, 'Tổng lượt đăng ký', totalEnrollYear.toLocaleString('en-US'), COL2);

    // ═══ SHEET 3: CHI TIẾT THEO THÁNG ═══
    const COL3 = 5;
    const ws3 = workbook.addWorksheet('📅 Chi tiết tháng');
    ws3.columns = [
      { key: 'month', width: 14 },
      { key: 'rank', width: 10 },
      { key: 'name', width: 50 },
      { key: 'id', width: 38 },
      { key: 'enrollments', width: 18 },
    ];

    addSheetTitle(ws3, `CHI TIẾT KHÓA HỌC THEO THÁNG — NĂM ${selectedYear}`, metaSubtitle, COL3);

    const hdr3 = ws3.addRow(['Tháng', 'Hạng', 'Tên khóa học', 'ID khóa học', 'Lượt đăng ký']);
    applyHeader(hdr3, COL3);
    freezeAndFilter(ws3, hdr3.number, COL3);

    const sorted3 = [...topCoursesData].sort((a, b) => a.month - b.month || a.rank - b.rank);
    sorted3.forEach((c, i) => {
      const row = ws3.addRow([`Tháng ${c.month}`, c.rank, c.name, c.id, c.enrollments]);
      applyDataRow(row, COL3, i % 2 === 0);
      row.getCell(1).font = { bold: true, size: 10 };
    });

    // ═══ SHEET 4: HỌC VIÊN CHƯA HOÀN THÀNH ═══
    const COL4 = 7;
    const ws4 = workbook.addWorksheet('⚠️ Chưa hoàn thành');
    ws4.columns = [
      { key: 'month', width: 14 },
      { key: 'stt', width: 8 },
      { key: 'username', width: 28 },
      { key: 'email', width: 38 },
      { key: 'courseName', width: 40 },
      { key: 'status', width: 16 },
      { key: 'lastCompletionAt', width: 22 },
    ];

    addSheetTitle(ws4, `HỌC VIÊN CHƯA HOÀN THÀNH — NĂM ${selectedYear}`, metaSubtitle, COL4);

    const hdr4 = ws4.addRow(['Tháng', 'STT', 'Tài khoản', 'Email', 'Khóa học', 'Trạng thái', 'Lần cuối học']);
    applyHeader(hdr4, COL4);
    freezeAndFilter(ws4, hdr4.number, COL4);

    const sorted4 = [...learnersData].sort((a, b) => a.month - b.month || a.stt - b.stt);
    sorted4.forEach((l, i) => {
      const statusText = l.status;
      const row = ws4.addRow([`Tháng ${l.month}`, l.stt, l.username, l.email, l.courseName, statusText, l.lastCompletionAt]);
      applyDataRow(row, COL4, i % 2 === 0);
      row.getCell(1).font = { bold: true, size: 10 };
      // Status coloring
      const sCell = row.getCell(6);
      const statusColor = l.status === 'Đã học' ? COLORS.accentGreen : l.status === 'Đang học' ? COLORS.accentAmber : COLORS.subtitleFg;
      sCell.font = { size: 10, bold: true, color: { argb: statusColor } };
    });

    ws4.addRow([]);
    const uniqueLearners = new Set(learnersData.map(l => l.username)).size;
    const completedCount = new Set(learnersData.filter(l => l.status === 'Đã học').map(l => l.username)).size;
    const notStartedCount = new Set(learnersData.filter(l => l.status === 'Chưa học').map(l => l.username)).size;
    addSummaryRow(ws4, 'Tổng lượt ghi nhận', learnersData.length.toString(), COL4);
    addSummaryRow(ws4, 'Số học viên (duy nhất)', uniqueLearners.toString(), COL4);
    addSummaryRow(ws4, 'Số HV đã hoàn thành', completedCount.toString(), COL4);
    addSummaryRow(ws4, 'Số HV chưa học', notStartedCount.toString(), COL4);

    // ═══ SAVE ═══
    const safeName = groupName.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    const fileName = `Bao_Cao_${safeName}_Nam_${selectedYear}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, fileName);

    toast.success('Đã xuất file Excel thành công!', { id: toastId });
  } catch (error) {
    console.error('Lỗi xuất file Excel:', error);
    toast.error('Có lỗi xảy ra khi xuất file.', { id: toastId });
    throw error;
  }
}
