import { createElement, useMemo, useRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { z } from 'zod';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import {
  Activity, Blocks, BookMarked, BookOpenCheck, CheckCircle2, ClipboardCheck, FileText, Image as ImageIcon,
  Lightbulb, ListChecks, ListTree, Sparkles, Target, TriangleAlert, Users, Video,
  type LucideIcon,
} from 'lucide-react';
import DiagramPreviewInteractive from '../course-editor/editors/diagram/DiagramPreviewInteractive';
import type { WorkspaceComponentType, WorkspaceDetail, WorkspaceLocale, WorkspaceNode } from '../../api/lesson-author-workspace.contract';

// Optional during the additive READ rollout. Missing protected binding types
// MUST NOT be inferred from payload shape, title, or validation_contract.
export type WorkspaceTypedDetail = WorkspaceDetail;

export const workspaceCopy = {
  en: {
    title: 'Live Storyboard', overview: 'Overview', mindmap: 'Course mind map', close: 'Close',
    review: 'Review the course AI is building. Open any item to check, edit, or add it to the course.',
    detail: 'Content details', purpose: 'Purpose', notes: 'Implementation notes', content: 'Explain & show',
    unsupported: 'This content has no supported typed preview. It remains available for read-only review when the read contract supports it.',
    waiting: 'No committed content is available for this item yet.', loading: 'Reading committed content…',
    buildingMap: 'Building the course map', buildingMapNote: 'Content will appear and become interactive when ready.',
    stale: 'Showing the last committed snapshot. Refresh is pending; readiness may have changed.',
    detailStale: 'This detail is out of date. Waiting for the current revision before showing its content.',
    modified: 'Author modified',
    planned: 'Waiting to draft', generating: 'Drafting', content_ready: 'Content available', needs_action: 'Needs your review',
    course: 'Course', chapter: 'Chapter', lesson: 'Section', unit: 'Lesson', component: 'Learning content', media_brief: 'Media recommendation',
    summary: 'Summary', audience: 'Target audience', prerequisites: 'Required knowledge', strategy: 'Assessment strategy',
    componentHtml: 'Theory', componentProblem: 'Quiz', componentFaq: 'FAQ', componentSortable: 'Sortable',
    componentCrossword: 'Crossword', componentDiagram: 'Visual diagram',
    mediaVideo: 'Video', mediaInfographic: 'Infographic',
    objective: 'Chapter / lesson objective', objectives: 'Learning objectives', activities: 'Learning activities', assessment: 'Assessment',
    media: 'Suggestion only — applying this item will not create a video or infographic.', video: 'Video brief', static_infographic: 'Infographic brief',
    points: 'Content points', context: 'Context description', noContext: 'No context description was supplied.',
    practice: 'Practice', answer: 'Answer & feedback', correct: 'Correct answer', incorrect: 'Not a correct answer',
    explanation: 'Explanation', tolerance: 'Tolerance', caseSensitive: 'Case sensitive', yes: 'Yes', no: 'No',
    faq: 'Questions & answers', order: 'Correct order', clue: 'Clue', hint: 'Hint', keyword: 'Keyword cells',
    row: 'Row', column: 'Column', connections: 'Connections', htmlNote: 'Text preview. Embedded media and interactive content are omitted.',
    expand: 'Expand', collapse: 'Collapse', expandAll: 'Expand all', collapseAll: 'Collapse all', inspect: 'View details', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit view',
    colorGuide: 'Node color guide', pendingApply: 'Waiting to apply', editedPendingApply: 'Edited — waiting to apply', appliedSuccessfully: 'Added to course', proposal: 'Suggestion',
    legendPending: 'Gray: AI content is ready to review but has not been added to the course.',
    legendEdited: 'Yellow: you edited this item; the latest version has not been added to the course.',
    legendApplied: 'Green: this exact version was successfully added to the course.',
    legendProposal: 'AI only recommends and suggests videos/infographics; the system cannot create videos/infographics directly.',
    empty: 'Waiting for the committed course structure.', chapters: 'Course structure',
    chapterCount: 'Total chapters', sectionCount: 'Total sections', lessonCount: 'Total lessons', interactiveCount: 'Total interactive content', unitProgress: 'Ready units', designStatus: 'Design status',
    overviewCommitted: 'Course overview committed', structureCommitted: 'Course structure committed', contentProgress: 'Unit content progress',
    outcomeHint: 'Open a chapter to read its current objectives. Outcomes are not included in graph metadata.',
    overviewHint: 'Open the course details to read its committed summary and audience.',
    progress: 'Completed', queued: 'AI is preparing your course', designing: 'AI is creating the course plan', drafting: 'AI is writing the lessons',
    ready: 'Course draft is ready to review', failed: 'Course creation stopped with an error', canceled: 'Course creation was canceled',
    available: 'Only items successfully added to the course are shown in gray.', unknown: 'Reading course progress…',
    unavailable: 'Workspace content is unavailable.', emptyOverview: 'Waiting for the committed overview.',
    terminalNeedsAction: 'This draft needs review before more content can be committed.', terminalFailed: 'This draft run ended without committed course content.',
    terminalCanceled: 'This draft run was canceled before course content was committed.', terminalReady: 'The run is complete, but no committed data is available in this view yet.', terminalReload: 'Reload saved state',
    liveUnits: 'Lessons ready live',
    multiple_choice: 'Single choice', multiple_select: 'Multiple selection', dropdown: 'Dropdown', short_text: 'Short text', numerical: 'Numerical',
    reviewPurpose: 'Purpose', reviewExample: 'Example / illustrative situation', reviewVisual: 'Visual / supporting asset',
    reviewBehavior: 'Learner behavior / navigation', notAvailable: 'N/A', outcomes: 'Expected outcomes',
    sectionsInScope: 'Sections', lessonsInScope: 'Lessons', interactionsInScope: 'Interactive content',
    interactionTypes: 'Interactive content types', learnerAchievement: 'What learners will achieve',
    holdPanel: 'Needs SME input (Hold)',
    holdHint: 'These source blocks are not in the lessons yet: the criteria to teach or assess them are missing. Send the questions to the subject-matter expert.',
    holdReason: 'Why it is on hold', holdQuestion: 'Question for the SME', holdBlocked: 'Must Do not taught yet',
    pendingObjectives: 'Objectives waiting for the SME (not shown as course outcomes)',
    niceToKnowPanel: 'Reference content left out (Nice to know)',
    niceToKnowHint: 'Left out of the lessons on purpose: useful, but not needed to perform a Must Do. Add one back by hand if your learners need it.',
  },
  vi: {
    title: 'Bản thiết kế khoá học', overview: 'Tổng quan', mindmap: 'Mindmap toàn khóa', close: 'Đóng',
    review: 'Xem trước khóa học AI đang xây dựng. Mở từng mục để kiểm tra, chỉnh sửa hoặc đưa nội dung vào khóa học.',
    detail: 'Chi tiết nội dung', purpose: 'Mục đích', notes: 'Ghi chú triển khai', content: 'Nội dung giải thích',
    unsupported: 'Nội dung này chưa có bản xem trước theo kiểu được hỗ trợ. Chỉ có thể xem khi hợp đồng đọc hỗ trợ kiểu này.',
    waiting: 'Mục này chưa có nội dung đã ghi nhận.', loading: 'Đang đọc nội dung đã ghi nhận…',
    buildingMap: 'Đang dựng sơ đồ khóa học', buildingMapNote: 'Nội dung sẽ hiển thị và có thể tương tác khi sẵn sàng.',
    stale: 'Đang hiển thị bản đã ghi nhận gần nhất. Chờ cập nhật; trạng thái nội dung có thể đã thay đổi.',
    detailStale: 'Chi tiết này đã cũ. Đang chờ phiên bản hiện tại trước khi hiển thị nội dung.',
    modified: 'Tác giả đã sửa',
    planned: 'Chờ soạn', generating: 'Đang soạn', content_ready: 'Đã có nội dung', needs_action: 'Cần bạn xem lại',
    course: 'Khóa học', chapter: 'Chương', lesson: 'Mục', unit: 'Bài học', component: 'Nội dung học tập', media_brief: 'Đề xuất đa phương tiện',
    summary: 'Tóm tắt', audience: 'Đối tượng học', prerequisites: 'Kiến thức cần đạt được', strategy: 'Chiến lược đánh giá',
    componentHtml: 'Lý thuyết', componentProblem: 'Quiz', componentFaq: 'Hỏi đáp', componentSortable: 'Sắp xếp',
    componentCrossword: 'Ô chữ', componentDiagram: 'Sơ đồ trực quan',
    mediaVideo: 'Video', mediaInfographic: 'Infographic',
    objective: 'Mục tiêu chương / bài học', objectives: 'Mục tiêu học tập', activities: 'Hoạt động học tập', assessment: 'Đánh giá',
    media: 'Chỉ là đề xuất — thông tin gợi ý, chọn áp dụng hệ thống sẽ không thể tạo video/infographic.', video: 'Đề xuất video', static_infographic: 'Đề xuất infographic',
    points: 'Các ý nội dung', context: 'Mô tả bối cảnh', noContext: 'Chưa cung cấp mô tả bối cảnh.',
    practice: 'Bài tập', answer: 'Đáp án và phản hồi', correct: 'Đáp án đúng', incorrect: 'Không phải đáp án đúng',
    explanation: 'Giải thích', tolerance: 'Sai số cho phép', caseSensitive: 'Phân biệt chữ hoa / thường', yes: 'Có', no: 'Không',
    faq: 'Câu hỏi và trả lời', order: 'Thứ tự đúng', clue: 'Gợi ý câu hỏi', hint: 'Gợi ý', keyword: 'Ô từ khóa',
    row: 'Hàng', column: 'Cột', connections: 'Liên kết', htmlNote: 'Bản xem nội dung văn bản. Không hiển thị nội dung nhúng và tương tác.',
    expand: 'Mở rộng', collapse: 'Thu gọn', expandAll: 'Mở tất cả', collapseAll: 'Thu gọn tất cả', inspect: 'Xem chi tiết', zoomIn: 'Phóng to', zoomOut: 'Thu nhỏ', fit: 'Vừa khung',
    colorGuide: 'Ý nghĩa màu của sơ đồ', pendingApply: 'Chờ đưa vào khóa học', editedPendingApply: 'Đã chỉnh sửa — chờ áp dụng', appliedSuccessfully: 'Đã đưa vào khóa học', proposal: 'Đề xuất',
    legendPending: 'Xám: nội dung AI đã sẵn sàng để duyệt nhưng chưa được đưa vào khóa học.',
    legendEdited: 'Vàng: bạn đã chỉnh sửa mục này; phiên bản mới nhất chưa được đưa vào khóa học.',
    legendApplied: 'Xanh lá: đúng phiên bản này đã được đưa vào khóa học thành công.',
    legendProposal: 'Video/infographic AI chỉ đề xuất và gợi ý, không thể tạo trực tiếp video/infographic trên hệ thống!',
    empty: 'Đang chờ cấu trúc khóa học được ghi nhận.', chapters: 'Cấu trúc khoá học',
    chapterCount: 'Tổng chương', sectionCount: 'Tổng mục', lessonCount: 'Tổng bài học', interactiveCount: 'Tổng nội dung tương tác', unitProgress: 'Đơn vị sẵn sàng', designStatus: 'Trạng thái thiết kế',
    overviewCommitted: 'Đã ghi nhận tổng quan khóa học', structureCommitted: 'Đã ghi nhận cấu trúc khóa học', contentProgress: 'Tiến độ nội dung từng đơn vị',
    outcomeHint: 'Mở từng chương để đọc mục tiêu hiện tại. Dữ liệu sơ đồ không chứa mục tiêu.',
    overviewHint: 'Mở chi tiết khóa học để đọc tóm tắt và đối tượng học đã ghi nhận.',
    progress: 'Đã hoàn thành', queued: 'AI đang chuẩn bị khóa học', designing: 'AI đang tạo bản thiết kế khóa học', drafting: 'AI đang soạn nội dung bài học',
    ready: 'Bản thiết kế khoá học đã sẵn sàng để duyệt', failed: 'Quá trình tạo khóa học gặp lỗi', canceled: 'Quá trình tạo khóa học đã dừng',
    available: 'Chỉ những mục đã đưa vào khóa học thành công mới hiển thị màu xám.', unknown: 'Đang đọc tiến độ khóa học…',
    unavailable: 'Không thể xem nội dung bản thiết kế khoá học.', emptyOverview: 'Đang chờ tổng quan được ghi nhận.',
    terminalNeedsAction: 'Bản thiết kế khoá học cần được kiểm tra trước khi có thể ghi nhận thêm nội dung.', terminalFailed: 'Tác vụ thiết kế khoá học đã kết thúc nhưng chưa có nội dung khóa học được ghi nhận.',
    terminalCanceled: 'Tác vụ thiết kế khoá học đã bị hủy trước khi ghi nhận nội dung khóa học.', terminalReady: 'Tác vụ đã hoàn tất nhưng màn hình này chưa có dữ liệu đã ghi nhận.', terminalReload: 'Tải lại trạng thái đã lưu',
    liveUnits: 'Bài học sẵn sàng theo thời gian thực',
    multiple_choice: 'Chọn một đáp án', multiple_select: 'Chọn nhiều đáp án', dropdown: 'Danh sách chọn', short_text: 'Câu trả lời ngắn', numerical: 'Câu trả lời số',
    reviewPurpose: 'Mục đích', reviewExample: 'Ví dụ / Tình huống minh hoạ', reviewVisual: 'Visual / Asset minh hoạ',
    reviewBehavior: 'Hành vi / Điều hướng của người học', notAvailable: 'N/A', outcomes: 'Kết quả đầu ra',
    sectionsInScope: 'Số mục', lessonsInScope: 'Số bài học', interactionsInScope: 'Số nội dung tương tác',
    interactionTypes: 'Các loại nội dung tương tác', learnerAchievement: 'Giúp học viên đạt được gì',
    holdPanel: 'Cần chuyên gia bổ sung (Hold)',
    holdHint: 'Các khối nội dung dưới đây chưa được đưa vào bài học vì thiếu tiêu chí để dạy hoặc đánh giá. Hãy gửi câu hỏi cho chuyên gia (SME).',
    holdReason: 'Lý do tạm giữ', holdQuestion: 'Câu hỏi cho SME', holdBlocked: 'Must Do chưa dạy được',
    pendingObjectives: 'Mục tiêu chờ SME (chưa hiển thị là kết quả đầu ra của khoá học)',
    niceToKnowPanel: 'Nội dung tham khảo đã lược (Nice to know)',
    niceToKnowHint: 'Được lược khỏi bài học theo phương pháp: hữu ích nhưng không cần để thực hiện Must Do. Tác giả có thể bổ sung thủ công nếu người học cần.',
  },
} as const;

/** Provider-facing objective references are stable machine bindings, not
 * useful learner-facing copy. Keep the persisted value untouched and remove
 * only a leading `lo_<number>:` marker at the presentation boundary. */
export function workspaceLearningOutcomeLabel(value: string): string {
  const label = value.replace(/^\s*lo[_\s-]*\d+\s*[:.)-]\s*/i, '').trim();
  return label || value;
}

const text = z.string().max(8000);
const lines = z.array(text).max(32);
const itemId = z.union([z.string().max(120), z.number().int().nonnegative()]);
const commonProblem = { question: text, explanation: text, hints: lines.max(10).default([]) };
const choice = z.array(z.object({ text, correct: z.boolean() }).strict()).min(2).max(8);
const problem = z.discriminatedUnion('kind', [
  z.object({ ...commonProblem, kind: z.literal('multiple_choice'), choices: choice }).strict(),
  z.object({ ...commonProblem, kind: z.literal('multiple_select'), choices: choice }).strict(),
  z.object({ ...commonProblem, kind: z.literal('dropdown'), choices: choice }).strict(),
  z.object({ ...commonProblem, kind: z.literal('short_text'), answers: lines.min(1).max(5), case_sensitive: z.boolean() }).strict(),
  z.object({ ...commonProblem, kind: z.literal('numerical'), answers: lines.min(1).max(5), tolerance: z.string().max(40) }).strict(),
]);
const faq = z.object({ items: z.array(z.object({ id: itemId, question: text, answer: text }).strict()).min(2).max(8) }).strict();
const sortable = z.object({ question_text: text, items: z.array(z.object({ id: itemId, text }).strict()).min(3).max(10) }).strict();
const coordinate = z.object({ row: z.number().int().min(0).max(255), col: z.number().int().min(0).max(255) }).strict();
const crossword = z.object({ words: z.array(z.object({ id: itemId, answer: z.string().regex(/^[A-Z0-9]{2,24}$/),
  clue: text, hint: text, row: coordinate.shape.row, col: z.number().int().min(0).max(20), direction: z.literal('across') }).strict()).min(3).max(10),
  keyword_coordinates: z.array(coordinate).max(256) }).strict();

// Copy only the renderer's inert fields. Never pass arbitrary style, URLs,
// DOM props or data objects from the wire to React Flow / the existing preview.
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const appearance = z.object({ lineStyle: z.enum(['solid', 'dashed']), arrow: z.enum(['none', 'end']), color });
const diagram = z.object({ start_diagram_id: z.string(), diagrams: z.array(z.object({ id: z.string(), name: text,
  nodes: z.array(z.object({ id: z.string(), type: z.enum(['customShape', 'junction']),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    data: z.object({ label: text, shape: z.enum(['rectangle', 'rounded', 'ellipse']).optional(),
      bgColor: color.optional(), textColor: color.optional(), tooltip: text.optional(), target_diagram_id: z.string().optional() }),
  })).min(2).max(200),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), label: text.optional(),
    sourceHandle: z.string().optional(), targetHandle: z.string().optional(),
    data: z.object({ routing: z.enum(['feedback', 'orthogonal']).optional(), appearance: appearance.optional() }).optional(),
  })).max(400),
})).min(1).max(32) });
const aggregateSchemas = {
  course: z.object({ summary: text, target_audience: text, prerequisites: lines, assessment_strategy: text }).strict(),
  chapter: z.object({ objective: text, learning_outcomes: lines.max(24).optional(),
    learning_objectives: lines.max(12).optional() }).strict(),
  lesson: z.object({ objective: text, learning_objectives: lines.max(12), learning_activities: lines, assessment: text }).strict(),
  unit: z.object({}).strict(),
  media_brief: z.object({ content_points: lines.min(1).max(6), context_description: text.nullable() }).strict(),
};
type Preview =
  | { type: 'html'; data: string }
  | { type: 'problem'; data: z.infer<typeof problem> }
  | { type: 'la_faq'; data: z.infer<typeof faq> }
  | { type: 'la_sortable'; data: z.infer<typeof sortable> }
  | { type: 'la_crossword'; data: z.infer<typeof crossword> }
  | { type: 'la_diagram'; data: z.infer<typeof diagram> };

/** Shape checks protect rendering, not Save/Apply acceptance or fidelity. */
export function readWorkspacePreview(detail: WorkspaceTypedDetail): Preview | null {
  if (detail.kind !== 'component' || !detail.content) return null;
  const raw = detail.content.data;
  switch (detail.component_type) {
    case 'html': return typeof raw === 'string' ? { type: 'html', data: raw } : null;
    case 'problem': { const p = problem.safeParse(raw); return p.success ? { type: 'problem', data: p.data } : null; }
    case 'la_faq': { const p = faq.safeParse(raw); return p.success ? { type: 'la_faq', data: p.data } : null; }
    case 'la_sortable': { const p = sortable.safeParse(raw); return p.success ? { type: 'la_sortable', data: p.data } : null; }
    case 'la_crossword': {
      const p = crossword.safeParse(raw);
      if (!p.success || p.data.words.some((w, i) => w.row !== i || w.col + w.answer.length > 30)
        || p.data.keyword_coordinates.some(c => !p.data.words.some(w => w.row === c.row && c.col >= w.col && c.col < w.col + w.answer.length))) return null;
      return { type: 'la_crossword', data: p.data };
    }
    case 'la_diagram': {
      const p = diagram.safeParse(raw);
      if (!p.success) return null;
      const ids = new Set(p.data.diagrams.map(d => d.id));
      if (ids.size !== p.data.diagrams.length || !ids.has(p.data.start_diagram_id)) return null;
      for (const d of p.data.diagrams) {
        const nodes = new Set(d.nodes.map(n => n.id));
        if (nodes.size !== d.nodes.length || new Set(d.edges.map(e => e.id)).size !== d.edges.length
          || d.edges.some(e => e.source === e.target || !nodes.has(e.source) || !nodes.has(e.target))
          || d.nodes.some(n => n.data.target_diagram_id && !ids.has(n.data.target_diagram_id))) return null;
      }
      return { type: 'la_diagram', data: p.data };
    }
    default: return null;
  }
}

const reviewTones = {
  primary: 'border-primary/20 bg-primary/[0.035] text-primary',
  emerald: 'border-emerald-500/20 bg-emerald-500/[0.045] text-emerald-600 dark:text-emerald-400',
  amber: 'border-amber-500/20 bg-amber-500/[0.05] text-amber-600 dark:text-amber-400',
  violet: 'border-violet-500/20 bg-violet-500/[0.045] text-violet-600 dark:text-violet-400',
  slate: 'border-border/80 bg-card text-foreground',
} as const;
type ReviewTone = keyof typeof reviewTones;

const lineTones: Record<ReviewTone, { soft: string; solid: string }> = {
  primary: { soft: 'bg-primary/10 text-primary', solid: 'bg-primary text-primary-foreground' },
  emerald: {
    soft: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    solid: 'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950',
  },
  amber: {
    soft: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    solid: 'bg-amber-500 text-amber-950 dark:bg-amber-400 dark:text-amber-950',
  },
  violet: {
    soft: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    solid: 'bg-violet-600 text-white dark:bg-violet-400 dark:text-violet-950',
  },
  slate: { soft: 'bg-muted text-muted-foreground', solid: 'bg-foreground text-background' },
};

function ReviewCard({ label, icon: Icon = FileText, tone = 'slate', children, className = '' }: {
  label: string; icon?: LucideIcon; tone?: ReviewTone; children: ReactNode; className?: string;
}) {
  return <section className={`group relative min-w-0 overflow-hidden rounded-2xl border p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.7)] transition-colors sm:p-5 ${reviewTones[tone]} ${className}`}>
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current/35 to-transparent" />
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-current/15 bg-background/80 shadow-sm"><Icon className="h-4 w-4" aria-hidden /></span>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/75">{label}</h3>
    </div>
    <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{children}</div>
  </section>;
}

export interface WorkspaceDetailStats {
  sectionCount: number;
  lessonCount: number;
  interactionCount: number;
  componentTypes: readonly WorkspaceComponentType[];
}

/** Counts are derived only from the authorized committed graph. Canonical
 * paths are server-owned hierarchy identities, so partial title/content text
 * can never change which descendants belong to the selected scope. */
export function workspaceDetailStats(node: WorkspaceNode, nodes: readonly WorkspaceNode[]): WorkspaceDetailStats {
  const prefix = `${node.canonical_path}.`;
  const descendants = nodes.filter(candidate => candidate.canonical_path.startsWith(prefix));
  const components = descendants.filter(candidate => candidate.kind === 'component');
  return {
    sectionCount: descendants.filter(candidate => candidate.kind === 'lesson').length,
    lessonCount: descendants.filter(candidate => candidate.kind === 'unit').length,
    interactionCount: components.length,
    componentTypes: [...new Set(components.map(candidate => candidate.component_type)
      .filter((value): value is WorkspaceComponentType => value !== null))],
  };
}

function componentTypeLabel(type: WorkspaceComponentType, locale: WorkspaceLocale): string {
  const c = workspaceCopy[locale];
  return ({ html: c.componentHtml, problem: c.componentProblem, la_faq: c.componentFaq,
    la_sortable: c.componentSortable, la_crossword: c.componentCrossword,
    la_diagram: c.componentDiagram } as const)[type];
}

function WorkspaceScopeStats({ detail, stats, locale }: {
  detail: WorkspaceTypedDetail; stats?: WorkspaceDetailStats; locale: WorkspaceLocale;
}) {
  if (!stats || !['chapter', 'lesson', 'unit'].includes(detail.kind)) return null;
  const c = workspaceCopy[locale];
  const metrics = detail.kind === 'chapter'
    ? [{ label: c.sectionsInScope, value: stats.sectionCount, icon: ListTree, tone: 'violet' as const },
      { label: c.lessonsInScope, value: stats.lessonCount, icon: BookOpenCheck, tone: 'emerald' as const },
      { label: c.interactionsInScope, value: stats.interactionCount, icon: Blocks, tone: 'amber' as const }]
    : detail.kind === 'lesson'
      ? [{ label: c.lessonsInScope, value: stats.lessonCount, icon: BookOpenCheck, tone: 'emerald' as const },
        { label: c.interactionsInScope, value: stats.interactionCount, icon: Blocks, tone: 'amber' as const }]
      : [{ label: c.interactionsInScope, value: stats.interactionCount, icon: Blocks, tone: 'amber' as const }];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {metrics.map(metric => <ReviewCard key={metric.label} label={metric.label} icon={metric.icon} tone={metric.tone}>
      <strong className="text-2xl tabular-nums">{metric.value}</strong>
    </ReviewCard>)}
    {detail.kind === 'unit' && <ReviewCard label={c.interactionTypes} icon={ListChecks} tone="violet" className="sm:col-span-2">
      {stats.componentTypes.length ? <Lines values={stats.componentTypes.map(type => componentTypeLabel(type, locale))} tone="violet" /> : c.notAvailable}
    </ReviewCard>}
  </div>;
}

export function WorkspaceAuthorReviewCards({ detail, locale }: { detail: WorkspaceTypedDetail; locale: WorkspaceLocale }) {
  if (detail.kind !== 'component') return null;
  const c = workspaceCopy[locale];
  return <div className="grid gap-3 md:grid-cols-2">
    <ReviewCard label={c.reviewPurpose} icon={Target} tone="primary">{detail.author_review?.purpose ?? c.notAvailable}</ReviewCard>
    <ReviewCard label={c.reviewExample} icon={Lightbulb} tone="violet">{detail.author_review?.example_scenario ?? c.notAvailable}</ReviewCard>
    <ReviewCard label={c.reviewVisual} icon={ImageIcon} tone="amber">{detail.author_review?.visual_asset ?? c.notAvailable}</ReviewCard>
    <ReviewCard label={c.reviewBehavior} icon={Activity} tone="emerald">{detail.author_review?.user_behavior_navigation ?? c.notAvailable}</ReviewCard>
  </div>;
}

/** Structural overview is already authoritative before its review payloads
 * finish hydrating. Keep the familiar card headers visible and skeleton only
 * the body so authors can understand what is being loaded. */
export function WorkspaceCourseOverviewSkeleton({ locale }: { locale: WorkspaceLocale }) {
  const c = workspaceCopy[locale];
  const body = <div className="animate-pulse space-y-2" aria-hidden><div className="h-3 w-11/12 rounded bg-current/10" /><div className="h-3 w-4/5 rounded bg-current/10" /></div>;
  return <div className="grid gap-3.5 md:grid-cols-2" aria-label={c.loading} role="status">
    <ReviewCard label={c.summary} icon={Sparkles} tone="primary" className="md:col-span-2">{body}</ReviewCard>
    <ReviewCard label={c.audience} icon={Users} tone="violet">{body}</ReviewCard>
    <ReviewCard label={c.strategy} icon={ClipboardCheck} tone="emerald">{body}</ReviewCard>
    <ReviewCard label={c.prerequisites} icon={ListChecks} tone="amber" className="md:col-span-2">{body}</ReviewCard>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <ReviewCard label={label}>{children}</ReviewCard>;
}
function Lines({ values, ordered = false, tone = 'slate' }: { values: string[]; ordered?: boolean; tone?: ReviewTone }) {
  return <ul className="space-y-2.5">{values.map((v, i) => <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2.5">
    <span className="mt-0.5 flex h-5 w-8 shrink-0 items-center justify-center">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${ordered ? lineTones[tone].solid : lineTones[tone].soft}`}>
        {ordered ? i + 1 : <CheckCircle2 className="h-3 w-3" aria-hidden />}
      </span>
    </span>
    <span className="min-w-0 flex-1 leading-6">{v}</span>
  </li>)}</ul>;
}

// Parse HTML to a tree, allow only inert text/structure tags, and construct
// fresh React elements with NO source attributes. No raw HTML sink, images,
// links, styles, scripts, embeds or network-loading elements reach the DOM.
const inertTags = ['p', 'div', 'span', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'u', 's', 'br', 'hr', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'pre', 'code', 'a', 'figure', 'figcaption', 'sup', 'sub'];
const inertComponents = Object.fromEntries(inertTags.map(tag => [tag,
  ({ children }: { children?: ReactNode }) => createElement(tag === 'a' ? 'span' : tag, null, children),
])) as Components;

export function WorkspaceNodeStatus({ node, locale }: { node: Pick<WorkspaceNode, 'content_state' | 'user_modified'>; locale: WorkspaceLocale }) {
  const c = workspaceCopy[locale];
  return <span className="flex flex-wrap gap-2 text-xs">
    <span className="rounded border px-2 py-1">{c[node.content_state]}</span>
    {node.user_modified && <span className="rounded border border-yellow-500 bg-yellow-100 px-2 py-1 text-yellow-950">✎ {c.modified}</span>}
  </span>;
}

function ComponentContent({ preview, locale }: { preview: Preview; locale: WorkspaceLocale }) {
  const c = workspaceCopy[locale];
  switch (preview.type) {
    case 'html': return <Field label={c.content}><p className="mb-3 text-xs text-muted-foreground">{c.htmlNote}</p>
      <div className="prose prose-sm max-w-none overflow-x-auto dark:prose-invert">
        <ReactMarkdown rehypePlugins={[rehypeRaw]} allowedElements={inertTags} components={inertComponents}>{preview.data}</ReactMarkdown>
      </div></Field>;
    case 'problem': {
      const p = preview.data;
      return <><Field label={`${c.practice} · ${c[p.kind]}`}>{p.question}</Field>
        <Field label={c.answer}>{'choices' in p
          ? <ol className="list-decimal space-y-2 pl-5">{p.choices.map((item, i) => <li key={i}>{item.text}<span className="ml-2 rounded border px-2 text-xs">{item.correct ? c.correct : c.incorrect}</span></li>)}</ol>
          : <Lines values={p.answers} />}</Field>
        {p.kind === 'short_text' && <Field label={c.caseSensitive}>{p.case_sensitive ? c.yes : c.no}</Field>}
        {p.kind === 'numerical' && <Field label={c.tolerance}>{p.tolerance}</Field>}
        {p.hints.length > 0 && <Field label={c.hint}><Lines values={p.hints} /></Field>}
        {p.explanation && <Field label={c.explanation}>{p.explanation}</Field>}</>;
    }
    case 'la_faq': return <Field label={c.faq}><dl className="space-y-4">{preview.data.items.map((item, i) => <div key={i}><dt className="font-medium">{item.question}</dt><dd className="mt-1">{item.answer}</dd></div>)}</dl></Field>;
    case 'la_sortable': return <><Field label={c.practice}>{preview.data.question_text}</Field><Field label={c.order}><Lines ordered values={preview.data.items.map(item => item.text)} /></Field></>;
    case 'la_crossword': return <><Field label={c.answer}><ol className="list-decimal space-y-3 pl-5">{preview.data.words.map((w, i) => <li key={i}>
      <p>{c.clue}: {w.clue}</p><p className="font-medium">{w.answer}</p>{w.hint && <p>{c.hint}: {w.hint}</p>}
      <p className="text-xs">{c.row} {w.row + 1}, {c.column} {w.col + 1}</p>
    </li>)}</ol></Field>{preview.data.keyword_coordinates.length > 0 && <Field label={c.keyword}><Lines values={preview.data.keyword_coordinates.map(v => `${c.row} ${v.row + 1}, ${c.column} ${v.col + 1}`)} /></Field>}</>;
    case 'la_diagram': {
      const data = { ...preview.data, diagrams: preview.data.diagrams.map(d => ({ ...d, nodes: d.nodes.map(n => ({ ...n,
        data: { ...n.data, shape: n.data.shape ?? 'rectangle' as const, bgColor: n.data.bgColor ?? '#ffffff', textColor: n.data.textColor ?? '#000000' },
      })) })) };
      return <><DiagramPreviewInteractive data={data} />
        {data.diagrams.map(d => <Field key={d.id} label={`${d.name} · ${c.connections}`}><Lines values={d.edges.map(e => {
          const source = d.nodes.find(n => n.id === e.source)!.data.label;
          const target = d.nodes.find(n => n.id === e.target)!.data.label;
          return `${source} → ${target}${e.label ? `: ${e.label}` : ''}`;
        })} /></Field>)}</>;
    }
  }
}

/** IDM runs only (course node): what the methodology kept out of the lessons and why. */
export function WorkspaceIdmGuidanceCards({ detail, locale }: { detail: WorkspaceTypedDetail; locale: WorkspaceLocale }) {
  const guidance = detail.kind === 'course' ? detail.idm_guidance : null;
  if (!guidance) return null;
  const c = workspaceCopy[locale];
  const holds = guidance.hold_items.length > 0 || guidance.pending_objectives.length > 0;
  return <>
    {holds && <ReviewCard label={c.holdPanel} icon={TriangleAlert} tone="amber" className="md:col-span-2">
      <p className="mb-3 text-muted-foreground">{c.holdHint}</p>
      {guidance.hold_items.length > 0 && <ol className="space-y-3">{guidance.hold_items.map((item, index) =>
        <li key={index} className="rounded-xl border border-amber-500/20 bg-background/70 p-3">
          <p className="font-semibold">{index + 1}. {item.name}</p>
          {item.reason && <p className="mt-1"><span className="font-medium text-foreground/70">{c.holdReason}: </span>{item.reason}</p>}
          {item.sme_question && <p className="mt-1"><span className="font-medium text-foreground/70">{c.holdQuestion}: </span>{item.sme_question}</p>}
          {item.blocked_must_dos.length > 0 && <div className="mt-2"><p className="font-medium text-foreground/70">{c.holdBlocked}:</p>
            <Lines values={item.blocked_must_dos} tone="amber" /></div>}
        </li>)}</ol>}
      {guidance.pending_objectives.length > 0 && <div className="mt-3"><p className="mb-2 font-medium text-foreground/70">{c.pendingObjectives}:</p>
        <Lines values={guidance.pending_objectives} tone="amber" /></div>}
    </ReviewCard>}
    {guidance.nice_to_know.length > 0 && <ReviewCard label={c.niceToKnowPanel} icon={BookMarked} tone="slate" className="md:col-span-2">
      <p className="mb-3 text-muted-foreground">{c.niceToKnowHint}</p>
      <ul className="space-y-2.5">{guidance.nice_to_know.map((item, index) => <li key={index}>
        <span className="font-semibold">{item.name}</span>{item.summary && <span className="text-muted-foreground"> — {item.summary}</span>}
      </li>)}</ul>
    </ReviewCard>}
  </>;
}

/** Only known aggregate fields are exposed; no raw JSON/provenance IDs. */
export function WorkspaceAggregateContent({ detail, locale }: { detail: WorkspaceTypedDetail; locale: WorkspaceLocale }) {
  const c = workspaceCopy[locale];
  if (!detail.content || detail.kind === 'component') return null;
  const raw = detail.content.data;
  switch (detail.kind) {
    case 'course': {
      const p = aggregateSchemas.course.safeParse(raw);
      if (!p.success) break;
      return <div className="grid gap-3.5 md:grid-cols-2">
        <ReviewCard label={c.summary} icon={Sparkles} tone="primary" className="md:col-span-2">{p.data.summary}</ReviewCard>
        <ReviewCard label={c.audience} icon={Users} tone="violet">{p.data.target_audience}</ReviewCard>
        {p.data.assessment_strategy && <ReviewCard label={c.strategy} icon={ClipboardCheck} tone="emerald">{p.data.assessment_strategy}</ReviewCard>}
        {!!p.data.prerequisites.length && <ReviewCard label={c.prerequisites} icon={ListChecks} tone="amber" className="md:col-span-2"><Lines values={p.data.prerequisites} tone="amber" /></ReviewCard>}
        <WorkspaceIdmGuidanceCards detail={detail} locale={locale} />
      </div>;
    }
    case 'chapter': case 'lesson': {
      const lesson = detail.kind === 'lesson' ? aggregateSchemas.lesson.safeParse(raw) : null;
      const p = lesson ?? aggregateSchemas.chapter.safeParse(raw);
      if (!p.success) break;
      const outcomes = 'learning_outcomes' in p.data
        ? p.data.learning_outcomes ?? p.data.learning_objectives ?? []
        : p.data.learning_objectives ?? [];
      return <div className="grid gap-3.5 md:grid-cols-2">
        <ReviewCard label={c.objective} icon={Target} tone="primary" className="md:col-span-2">{p.data.objective}</ReviewCard>
        {!!outcomes.length
          && <ReviewCard label={detail.kind === 'chapter' ? c.outcomes : c.objectives} icon={BookOpenCheck} tone="violet" className="md:col-span-2"><Lines values={outcomes.map(workspaceLearningOutcomeLabel)} tone="violet" /></ReviewCard>}
        {lesson?.success && !!lesson.data.learning_activities.length && <ReviewCard label={c.activities} icon={Activity} tone="amber" className="md:col-span-2"><Lines values={lesson.data.learning_activities} tone="amber" /></ReviewCard>}
        {lesson?.success && lesson.data.assessment && <ReviewCard label={c.assessment} icon={ClipboardCheck} tone="emerald" className="md:col-span-2">{lesson.data.assessment}</ReviewCard>}
      </div>;
    }
    case 'unit': if (aggregateSchemas.unit.safeParse(raw).success) return null; break;
    case 'media_brief': {
      if (detail.media_type !== 'video' && detail.media_type !== 'static_infographic') break;
      const p = aggregateSchemas.media_brief.safeParse(raw);
      if (!p.success) break;
      const MediaIcon = detail.media_type === 'video' ? Video : ImageIcon;
      return <div className="grid gap-3.5 md:grid-cols-2">
        <ReviewCard label={c[detail.media_type]} icon={MediaIcon} tone="primary" className="md:col-span-2"><p className="text-muted-foreground">{c.media}</p></ReviewCard>
        <ReviewCard label={c.points} icon={ListChecks} tone="violet"><Lines values={p.data.content_points} tone="violet" /></ReviewCard>
        <ReviewCard label={c.context} icon={Lightbulb} tone="amber">{p.data.context_description ?? c.noContext}</ReviewCard>
      </div>;
    }
  }
  return <p role="status">{c.unsupported}</p>;
}

export function WorkspaceDetailContent({ detail, locale, stats }: { detail: WorkspaceTypedDetail; locale: WorkspaceLocale; stats?: WorkspaceDetailStats }) {
  const c = workspaceCopy[locale];
  const preview = useMemo(() => readWorkspacePreview(detail), [detail]);
  if (!detail.content) return <DetailSkeleton label={c.waiting} />;
  return <div className="space-y-4" lang={detail.content_locale}>
    {detail.content.purpose && <ReviewCard label={detail.kind === 'unit' ? c.learnerAchievement : c.purpose} icon={Target} tone="primary">{detail.content.purpose}</ReviewCard>}
    <WorkspaceAuthorReviewCards detail={detail} locale={locale} />
    {detail.kind === 'component' ? preview ? <ComponentContent preview={preview} locale={locale} /> : <p role="status">{c.unsupported}</p>
      : <WorkspaceAggregateContent detail={detail} locale={locale} />}
    <WorkspaceScopeStats detail={detail} stats={stats} locale={locale} />
    {detail.content.implementation_notes && <ReviewCard label={c.notes} icon={Lightbulb} tone="amber">{detail.content.implementation_notes}</ReviewCard>}
  </div>;
}

export interface WorkspaceNodeDetailProps {
  node: WorkspaceNode | null;
  detail: WorkspaceTypedDetail | null;
  locale: WorkspaceLocale;
  stale?: boolean;
  onClose: () => void;
}
export function workspaceDetailMatches(node: WorkspaceNode, detail: WorkspaceTypedDetail | null): detail is WorkspaceTypedDetail {
  return !!detail && detail.node_id === node.node_id && detail.parent_id === node.parent_id && detail.kind === node.kind
    && detail.current_revision === node.current_revision && detail.content_state === node.content_state;
}

function DetailSkeleton({ label }: { label: string }) {
  return <div className="animate-pulse space-y-3 p-1" role="status" aria-label={label}>
    <div className="grid gap-3 md:grid-cols-2"><div className="h-24 rounded-xl border bg-muted/35" /><div className="h-24 rounded-xl border bg-muted/35" /></div>
    <div className="h-36 rounded-xl border bg-muted/30" /><span className="sr-only">{label}</span>
  </div>;
}

export function WorkspaceNodeDetail({ node, detail, locale, stale = false, onClose }: WorkspaceNodeDetailProps) {
  const c = workspaceCopy[locale];
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const current = node && workspaceDetailMatches(node, detail) && !stale ? detail : null;
  return <Dialog open={!!node} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} overlayClassName="z-[10060]"
      className="z-[10070] flex max-h-[92dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-4 overflow-hidden shadow-2xl"
      onOpenAutoFocus={event => { event.preventDefault(); returnFocus.current = document.activeElement as HTMLElement; closeButton.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0 space-y-2"><DialogTitle className="break-words">{current?.content?.title ?? node?.title ?? c.detail}</DialogTitle>
          <DialogDescription>{c.review}</DialogDescription></div>
        <DialogClose asChild><Button ref={closeButton} variant="outline" size="sm">{c.close}</Button></DialogClose>
      </div>
      {node && <WorkspaceNodeStatus node={node} locale={locale} />}
      <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
        {current ? <WorkspaceDetailContent detail={current} locale={locale} />
          : <DetailSkeleton label={stale && detail ? c.detailStale : node?.current_revision === null ? c.waiting : c.loading} />}
      </div>
    </DialogContent>
  </Dialog>;
}
