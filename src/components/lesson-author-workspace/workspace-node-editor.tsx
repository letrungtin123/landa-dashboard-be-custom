import { useMemo, useState, type ReactNode } from 'react';
import { Check, RotateCcw, Save, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { readWorkspacePreview } from './workspace-node-detail';
import { WorkspaceComponentDraftEditor } from './workspace-component-draft-editor';
import type { WorkspaceContent, WorkspaceDetail, WorkspaceLocale } from '../../api/lesson-author-workspace.contract';

const copy = {
  en: {
    heading: 'Edit content', title: 'Title', purpose: 'Purpose', notes: 'Implementation notes',
    componentDraft: 'Complete component draft',
    save: 'Save changes', reset: 'Reset to AI baseline', confirm: 'Confirm reset', cancel: 'Cancel',
    resetWarning: 'Reset replaces this node’s saved revision and local edits with its AI baseline. It does not change the course.',
    notice: 'Changes remain local until the host confirms Save. Saving does not update or publish the course.',
    pending: 'Only nodes with committed content can be edited.', unavailable: 'Content is unavailable until access is confirmed.',
    unsupported: 'This content does not have a supported typed editor.',
    conflict: 'The revision has changed or a conflict is pending. Save and Reset are disabled; your local draft is retained.',
    busy: 'A write is in progress.', invalid: 'Check the required text, answer mapping and content limits before saving.',
    structure: 'The draft changes protected structure or fields. Reload or resolve the draft before saving.',
    fixed: 'Protected identities, types, structure and objective slots are fixed. Only the displayed content fields can change.',
    html: 'Lesson content', htmlNote: 'Edit the complete learner-facing content in one rich text editor.',
    choice: 'Choice', correct: 'Correct answer', question: 'Question', explanation: 'Explanation', answer: 'Answer',
    caseSensitive: 'Case sensitivity is fixed', tolerance: 'Tolerance', item: 'Item', clue: 'Clue', hint: 'Hint',
    diagram: 'Diagram name', node: 'Shape label', edge: 'Connection label', add: 'Add text item', remove: 'Remove text item',
    summary: 'Summary', target_audience: 'Target audience', prerequisites: 'Prerequisites', assessment_strategy: 'Assessment strategy',
    objective: 'Objective', learning_objectives: 'Learning objective', learning_activities: 'Learning activities', assessment: 'Assessment',
    content_points: 'Content points', context_description: 'Context description', media: 'Media brief only; no asset is generated or uploaded.',
    applyUnit: 'Apply content', applyingUnit: 'Applying content…',
    applyHint: 'The server saves this component first when needed, then adds only this content with its required hierarchy.',
    savedHint: 'Save keeps the edit in this AI draft. Apply adds only this content and its required hierarchy to the course.',
  },
  vi: {
    heading: 'Chỉnh sửa nội dung', title: 'Tên', purpose: 'Mục đích', notes: 'Ghi chú triển khai',
    componentDraft: 'Bản nháp component hoàn chỉnh',
    save: 'Lưu chỉnh sửa', reset: 'Đặt lại bản AI gốc', confirm: 'Xác nhận đặt lại', cancel: 'Hủy',
    resetWarning: 'Đặt lại sẽ thay phiên bản đã lưu và bản sửa cục bộ của mục này bằng bản AI gốc. Khóa học không thay đổi.',
    notice: 'Thay đổi chỉ ở bản cục bộ cho đến khi hệ thống xác nhận Lưu. Lưu không cập nhật hoặc xuất bản khóa học.',
    pending: 'Chỉ có thể sửa mục đã có nội dung được ghi nhận.', unavailable: 'Chưa thể xem nội dung khi quyền truy cập chưa được xác nhận.',
    unsupported: 'Nội dung này chưa có biểu mẫu chỉnh sửa theo kiểu được hỗ trợ.',
    conflict: 'Phiên bản đã thay đổi hoặc đang có xung đột. Lưu và Đặt lại bị khóa; bản sửa cục bộ vẫn được giữ.',
    busy: 'Đang xử lý thao tác ghi.', invalid: 'Kiểm tra nội dung bắt buộc, đáp án đúng và giới hạn nội dung trước khi lưu.',
    structure: 'Bản sửa thay đổi cấu trúc hoặc trường được bảo vệ. Tải lại hoặc xử lý bản sửa trước khi lưu.',
    fixed: 'Danh tính, loại, cấu trúc và số mục tiêu được giữ cố định. Chỉ sửa các trường nội dung hiển thị.',
    html: 'Nội dung bài học', htmlNote: 'Chỉnh sửa toàn bộ nội dung người học sẽ thấy trong một trình soạn thảo duy nhất.',
    choice: 'Lựa chọn', correct: 'Đáp án đúng', question: 'Câu hỏi', explanation: 'Giải thích', answer: 'Đáp án',
    caseSensitive: 'Quy tắc chữ hoa / thường được giữ cố định', tolerance: 'Sai số cho phép', item: 'Mục', clue: 'Câu gợi ý', hint: 'Gợi ý',
    diagram: 'Tên sơ đồ', node: 'Nhãn hình', edge: 'Nhãn liên kết', add: 'Thêm ý nội dung', remove: 'Xóa ý nội dung',
    summary: 'Tóm tắt', target_audience: 'Đối tượng học', prerequisites: 'Điều kiện tiên quyết', assessment_strategy: 'Chiến lược đánh giá',
    objective: 'Mục tiêu', learning_objectives: 'Mục tiêu học tập', learning_activities: 'Hoạt động học tập', assessment: 'Đánh giá',
    content_points: 'Các ý nội dung', context_description: 'Mô tả bối cảnh', media: 'Chỉ chỉnh sửa đề xuất; không tạo hoặc tải tài sản lên.',
    applyUnit: 'Áp dụng nội dung', applyingUnit: 'Đang áp dụng nội dung…',
    applyHint: 'Khi cần, hệ thống lưu component trước rồi chỉ đưa đúng nội dung này cùng cây cha bắt buộc vào khóa học.',
    savedHint: 'Lưu chỉ cập nhật bản thiết kế khoá học do AI tạo. Áp dụng chỉ đưa đúng nội dung này cùng cây cha bắt buộc vào khóa học.',
  },
} as const;
type Label = keyof typeof copy.en;
type Path = Array<string | number>;
type Value = string | boolean | string[] | null;
interface Field {
  path: Path; label: Label; number?: string; kind?: 'boolean' | 'lines'; max: number;
  required?: boolean; plain?: boolean; nullable?: boolean; minItems?: number; maxItems?: number;
}
interface Model { fields: Field[] }
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const forbiddenText = /[<>]/;
const invalidXml = /[\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const hasControl = (text: string) => Array.from(text).some(c => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0)));
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function get(value: unknown, path: Path): unknown {
  return path.reduce<unknown>((v, key) => v != null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined, value);
}
function put(content: WorkspaceContent, path: Path, value: Value) {
  const parent = get(content, path.slice(0, -1)) as Record<string, unknown>;
  parent[path[path.length - 1]] = value;
}
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const x = Object.keys(a), y = Object.keys(b);
  return x.length === y.length && x.every(k => own(b, k) && equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Enumerated fields from a committed server discriminator. No shape inference
 * for component/media type, no arbitrary field paths accepted from the host. */
function model(detail: WorkspaceDetail): Model | null {
  if (!detail.content || detail.content_state !== 'content_ready' || !Number.isSafeInteger(detail.current_revision) || detail.current_revision === null || detail.current_revision < 0) return null;
  const fields: Field[] = [{ path: ['title'], label: 'title', max: 500, required: true, plain: detail.kind !== 'component' }];
  // Hierarchy nodes expose their display name only. Objective, outcomes, data,
  // purpose and implementation notes remain protected byte-for-byte.
  if (['chapter', 'lesson', 'unit'].includes(detail.kind)) return { fields };
  const field = (path: Path, label: Label, options: Partial<Field> = {}) => fields.push({ path: ['data', ...path], label, max: 8000, required: true, plain: true, ...options });
  if (detail.kind === 'component') {
    const preview = readWorkspacePreview(detail);
    if (!preview) return null;
    switch (preview.type) {
      case 'html': {
        field([], 'html', { required: false, plain: false, max: 2 * 1024 * 1024 });
        return { fields };
      }
      case 'problem': {
        const p = preview.data;
        field(['question'], 'question', { max: 4000, plain: false });
        field(['explanation'], 'explanation', { required: false, plain: false });
        field(['hints'], 'hint', { kind: 'lines', required: false, minItems: 0, maxItems: 10, max: 4000, plain: false });
        if ('choices' in p) p.choices.forEach((_v, i) => {
          field(['choices', i, 'text'], 'choice', { number: String(i + 1), max: 4000, plain: false });
          field(['choices', i, 'correct'], 'correct', { number: String(i + 1), kind: 'boolean' });
        });
        else p.answers.forEach((_v, i) => field(['answers', i], 'answer', { number: String(i + 1), max: 4000, plain: false }));
        if (p.kind === 'numerical') field(['tolerance'], 'tolerance', { max: 40, plain: false });
        break;
      }
      case 'la_faq': preview.data.items.forEach((_v, i) => {
        field(['items', i, 'question'], 'question', { number: String(i + 1) });
        field(['items', i, 'answer'], 'answer', { number: String(i + 1) });
      }); break;
      case 'la_sortable':
        field(['question_text'], 'question');
        preview.data.items.forEach((_v, i) => field(['items', i, 'text'], 'item', { number: String(i + 1) })); break;
      case 'la_crossword': preview.data.words.forEach((_v, i) => {
        field(['words', i, 'answer'], 'answer', { max: 24, number: String(i + 1) });
        field(['words', i, 'clue'], 'clue', { number: String(i + 1) });
        field(['words', i, 'hint'], 'hint', { required: false, number: String(i + 1) });
      }); break;
      case 'la_diagram': preview.data.diagrams.forEach((diagram, i) => {
        field(['diagrams', i, 'name'], 'diagram', { number: String(i + 1) });
        diagram.nodes.forEach((n, j) => field(['diagrams', i, 'nodes', j, 'data', 'label'], 'node', { number: `${i + 1}.${j + 1}`, required: n.type !== 'junction' }));
        // Missing labels stay missing. No optional field insertion into a
        // protected diagram record and no exposure of IDs/ports/styles.
        diagram.edges.forEach((edge, j) => { if (edge.label !== undefined) field(['diagrams', i, 'edges', j, 'label'], 'edge', { number: `${i + 1}.${j + 1}` }); });
      }); break;
    }
    return { fields };
  }
  // Course analysis and media recommendations remain read-only design
  // evidence. Components and hierarchy display names use typed editors.
  return null;
}

function valueShape(field: Field, value: unknown): value is Value {
  return field.kind === 'boolean' ? typeof value === 'boolean' : field.kind === 'lines' ? strings(value)
    : typeof value === 'string' || field.nullable === true && value === null;
}
function readFields(detail: WorkspaceDetail, draft: WorkspaceContent, m: Model): Value[] | null {
  if (!detail.content || Object.keys(draft).length !== 4 || !['title', 'purpose', 'data', 'implementation_notes'].every(k => own(draft, k))) return null;
  const values = m.fields.map(f => get(draft, f.path));
  if (values.some((v, i) => !valueShape(m.fields[i], v))) return null;
  const protectedCopy = structuredClone(draft);
  for (const f of m.fields) put(protectedCopy, f.path, get(detail.content, f.path) as Value);
  return equal(protectedCopy, detail.content) ? values as Value[] : null;
}

export type WorkspaceEditorIssue = 'unsupported' | 'structure' | 'invalid' | null;
/** Local checks only; the host/server still owns authorization, CAS, security,
 * provenance and chapter acceptance. An empty string remains an editable draft. */
export function validateWorkspaceEditorDraft(detail: WorkspaceDetail, draft: WorkspaceContent): WorkspaceEditorIssue {
  const m = model(detail);
  if (!m) return 'unsupported';
  if (detail.kind === 'component') {
    if (!detail.content || Object.keys(draft).length !== 4
      || !['title', 'purpose', 'data', 'implementation_notes'].every(k => own(draft, k))
      || typeof draft.title !== 'string' || !draft.title.trim() || draft.title.length > 500
      || !equal(draft.purpose, detail.content.purpose)
      || !equal(draft.implementation_notes, detail.content.implementation_notes)) return 'structure';
    if (new TextEncoder().encode(JSON.stringify(draft)).byteLength > 2 * 1024 * 1024) return 'invalid';
    const preview = readWorkspacePreview({ ...detail, content: draft });
    if (!preview) return 'invalid';
    const unique = (items: string[]) => new Set(items).size === items.length;
    const validText = (value: string, required = true, max = 8000) => value.length <= max
      && (!required || !!value.trim()) && !forbiddenText.test(value) && !invalidXml.test(value) && !hasControl(value);
    if (preview.type === 'problem') {
      const p = preview.data;
      if (!validText(p.question, true, 4000) || invalidXml.test(p.explanation) || hasControl(p.explanation)
        || p.hints.some(value => value.length > 4000 || invalidXml.test(value) || hasControl(value))) return 'invalid';
      if ('choices' in p) {
        const correct = p.choices.filter(c => c.correct).length;
        if (!correct || p.kind !== 'multiple_select' && correct !== 1
          || p.choices.some(choice => !validText(choice.text, true, 4000))
          || !unique(p.choices.map(c => c.text.normalize('NFKC').trim().toLocaleLowerCase()))) return 'invalid';
      } else if (p.answers.some(answer => !validText(answer, true, 4000)) || !unique(p.answers.map(answer => answer.normalize('NFKC').trim().toLocaleLowerCase()))
        || p.kind === 'numerical' && (p.answers.some(v => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v) || !Number.isFinite(Number(v)))
        || !/^(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(p.tolerance))) return 'invalid';
    }
    if (preview.type === 'la_faq' && preview.data.items.some(item => !validText(item.question) || !validText(item.answer))) return 'invalid';
    if (preview.type === 'la_sortable' && (!validText(preview.data.question_text)
      || preview.data.items.some(item => !validText(item.text)))) return 'invalid';
    if (preview.type === 'la_crossword' && preview.data.words.some(word => !validText(word.clue)
      || !validText(word.hint, false) || word.col + word.answer.length > 30)) return 'invalid';
    if (preview.type === 'la_diagram' && preview.data.diagrams.some(diagram => !validText(diagram.name)
      || diagram.nodes.some(node => node.type !== 'junction' && !validText(node.data.label)))) return 'invalid';
    const labels = preview.type === 'la_faq' ? preview.data.items.map(i => i.question)
      : preview.type === 'la_sortable' ? preview.data.items.map(i => i.text)
        : preview.type === 'la_crossword' ? preview.data.words.map(i => i.answer) : [];
    return unique(labels.map(v => v.normalize('NFKC').trim().toLowerCase())) ? null : 'invalid';
  }
  const values = readFields(detail, draft, m);
  if (!values) return 'structure';
  for (let i = 0; i < values.length; i++) {
    const f = m.fields[i], value = values[i];
    if (typeof value === 'boolean' || value === null) continue;
    const texts = Array.isArray(value) ? value : [value];
    if (Array.isArray(value) && (value.length < (f.minItems ?? 0) || value.length > (f.maxItems ?? 32))) return 'invalid';
    if (texts.some(v => v.length > f.max || f.required && !v.trim() || f.plain && forbiddenText.test(v) || invalidXml.test(v) || hasControl(v))) return 'invalid';
  }
  if (new TextEncoder().encode(JSON.stringify(draft)).byteLength > 2 * 1024 * 1024) return 'invalid';
  return null;
}

/** Bounded typed-field operation. Returns null on a protected/malformed draft;
 * never emits the detail envelope, binding metadata or normalized payload. */
export function updateWorkspaceEditorField(detail: WorkspaceDetail, draft: WorkspaceContent, index: number, value: Value): WorkspaceContent | null {
  const m = model(detail), field = m?.fields[index];
  if (!m || !field || !valueShape(field, value) || !readFields(detail, draft, m)) return null;
  const next = structuredClone(draft);
  put(next, field.path, value);
  return next;
}

export function workspaceEditorHasChanges(detail: WorkspaceDetail, draft: WorkspaceContent): boolean {
  return !!detail.content && !equal(detail.content, draft);
}

export interface WorkspaceNodeEditorProps {
  detail: WorkspaceDetail | null;
  draft: WorkspaceContent | null;
  /** Revision captured when this local draft was created, never auto-rebased. */
  baseRevision: number | null;
  access: 'unknown' | 'allowed' | 'blocked';
  locale: WorkspaceLocale;
  busy?: boolean;
  conflict?: boolean;
  onChange: (draft: WorkspaceContent) => void;
  /** Host owns serialized writes, pending state, server errors and receipts. */
  onSave: (draft: WorkspaceContent, expectedRevision: number) => void;
  onReset: (expectedRevision: number) => void;
  /** For component/media nodes the host resolves and applies the containing
   * unit. Save must be authoritatively reconciled before this callback applies. */
  onApply?: (draft: WorkspaceContent, expectedRevision: number, changed: boolean) => void;
  applyLabel?: string;
  applyingLabel?: string;
  applyBusy?: boolean;
  applyDisabled?: boolean;
  /** Applied revisions are immutable from this review surface. Keeping the
   * editor mounted avoids a visual modal remount while switching to view-only. */
  readOnly?: boolean;
  /** Hierarchy titles are edited by the modal header. The editor continues to
   * own validation and actions while rendering the normal AI review cards. */
  titleInHeader?: boolean;
  reviewContent?: ReactNode;
}

export function WorkspaceNodeEditor(props: WorkspaceNodeEditorProps) {
  const { detail, draft, access, locale } = props;
  const c = copy[locale];
  if (access !== 'allowed') return <p role="status">{c.unavailable}</p>;
  if (!detail?.content || !draft || detail.content_state !== 'content_ready' || detail.current_revision === null) return <p role="status">{c.pending}</p>;
  // A successful Save advances current_revision. Keep the same form instance so
  // that the detail modal, rich-text editor and scroll position do not remount
  // and visibly jump while the authoritative revision is reconciled.
  return <EditorForm key={`${detail.workspace_id}:${detail.node_id}`} {...props} detail={detail} draft={draft} />;
}

function EditorForm({ detail, draft, baseRevision, locale, busy = false, conflict = false, onChange, onSave, onReset,
  onApply, applyLabel, applyingLabel, applyBusy = false, applyDisabled = false, readOnly = false,
  titleInHeader = false, reviewContent }: WorkspaceNodeEditorProps & { detail: WorkspaceDetail; draft: WorkspaceContent }) {
  const c = copy[locale];
  const m = useMemo(() => model(detail), [detail]);
  const values = useMemo(() => m ? readFields(detail, draft, m) : null, [detail, draft, m]);
  const issue = useMemo(() => validateWorkspaceEditorDraft(detail, draft), [detail, draft]);
  const [confirmReset, setConfirmReset] = useState(false);
  const stale = conflict || baseRevision === null || baseRevision !== detail.current_revision;
  const locked = readOnly || busy || applyBusy || stale;
  const changed = workspaceEditorHasChanges(detail, draft);
  if (!m) return <p role="status">{c.unsupported}</p>;
  const change = (i: number, value: Value) => {
    if (locked) return;
    const next = updateWorkspaceEditorField(detail, draft, i, value);
    if (next) { setConfirmReset(false); onChange(next); }
  };
  const groups = m.fields.reduce<Array<{ key: string; fields: Array<{ field: Field; index: number }> }>>((result, field, index) => {
    const key = field.number ? `number:${field.number}` : `field:${index}`;
    const found = result.at(-1);
    if (found?.key === key) found.fields.push({ field, index });
    else result.push({ key, fields: [{ field, index }] });
    return result;
  }, []);
  const renderField = (f: Field, i: number) => {
    const value = values?.[i], label = `${c[f.label]}${f.number ? ` ${f.number}` : ''}`;
    if (f.kind === 'boolean') return <label key={i} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/40">
      <span className="font-medium">{label}</span><span className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/30 text-transparent'}`}>
        <input className="sr-only" type="checkbox" checked={value as boolean} onChange={e => change(i, e.target.checked)} /><Check className="h-3.5 w-3.5" /></span>
    </label>;
    if (f.kind === 'lines') {
      const items = value as string[];
      return <div key={i} className="space-y-2"><p className="text-sm font-semibold">{label}</p>{items.map((item, j) => <div key={j} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background p-2">
        <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{j + 1}</span>
        <label className="min-w-0 flex-1"><span className="sr-only">{label} {j + 1}</span><Textarea className="min-h-20 resize-y border-0 bg-transparent shadow-none focus-visible:ring-1" value={item} maxLength={f.max} lang={detail.content_locale}
          onChange={e => change(i, items.map((v, k) => k === j ? e.target.value : v))} /></label>
        <Button type="button" size="sm" variant="ghost" disabled={items.length <= (f.minItems ?? 0)} onClick={() => change(i, items.filter((_v, k) => k !== j))}>{c.remove}</Button>
      </div>)}<Button type="button" size="sm" variant="outline" disabled={items.length >= (f.maxItems ?? 32)} onClick={() => change(i, [...items, ''])}>{c.add}</Button></div>;
    }
    return <label key={i} className="block space-y-1.5 text-sm"><span className="font-medium text-foreground">{label}</span>
      {f.label === 'title' ? <Input className="h-10 bg-background" value={value as string} maxLength={f.max} lang={detail.content_locale} onChange={e => change(i, e.target.value)} />
        : <Textarea className="min-h-24 resize-y bg-background" value={value as string ?? ''} maxLength={f.max} lang={detail.content_locale} onChange={e => change(i, f.nullable && e.target.value === '' ? null : e.target.value)} />}
    </label>;
  };
  const diagram = detail.component_type === 'la_diagram';
  return <form className={`flex min-h-0 flex-1 flex-col ${diagram ? '' : 'px-5'}`} aria-busy={busy || applyBusy} onSubmit={event => {
    event.preventDefault();
    if (!locked && baseRevision !== null && !issue && changed) onSave(structuredClone(draft), baseRevision);
  }}>
    {detail.kind !== 'component' && !titleInHeader && <div className="flex shrink-0 flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
        <div className="min-w-0"><h3 className="font-semibold">{c.heading}</h3><p className="mt-0.5 text-xs text-muted-foreground">{c.notice}</p></div></div>
    </div>}
    <div className={`min-h-0 flex-1 ${diagram ? 'overflow-hidden p-0' : 'overflow-y-auto py-4 pr-1'}`}>
      <div className={diagram ? 'h-full min-h-0' : 'space-y-4'}>
        {detail.kind === 'media_brief' && <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-muted-foreground">{c.media}</p>}
        {stale && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300" role="alert">{c.conflict}</p>}
        {busy && <p role="status">{c.busy}</p>}
        {issue && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{c[issue]}</p>}
        {detail.kind === 'component'
          ? <div className={diagram ? 'flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-5' : 'space-y-4'}>
              {reviewContent}
              <div className={diagram ? 'min-h-[34rem] flex-1' : ''}><WorkspaceComponentDraftEditor detail={detail} draft={draft} locale={locale} disabled={locked} onChange={next => { setConfirmReset(false); onChange(next); }} /></div>
            </div>
          : titleInHeader ? <div className="mx-auto max-w-5xl">{reviewContent}</div>
          : <><p className="text-xs text-muted-foreground">{c.fixed}</p><fieldset disabled={locked || !values} className="grid gap-3 md:grid-cols-2">
            {values && groups.map(group => <div key={group.key} className={`relative space-y-3 rounded-xl border border-border/70 bg-muted/15 p-3.5 shadow-sm ${group.fields.length > 1 || group.fields.some(item => item.field.kind === 'lines') ? 'md:col-span-2' : ''}`}>
              {group.fields.map(({ field, index }) => renderField(field, index))}
            </div>)}
          </fieldset></>}
      </div>
    </div>
    {!readOnly && <div className={`sticky bottom-0 flex shrink-0 flex-col gap-3 border-t border-border/70 bg-card/95 py-4 shadow-[0_-12px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between ${diagram ? 'px-5' : '-mx-5 px-5'}`}>
      <p className={`max-w-xl text-xs leading-5 ${confirmReset ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`} role={confirmReset ? 'alert' : undefined}>
        {confirmReset ? c.resetWarning : onApply ? c.savedHint : c.notice}
      </p>
      {confirmReset ? <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" className="h-10 rounded-xl px-4" disabled={locked} onClick={() => {
          if (!locked && baseRevision !== null) { setConfirmReset(false); onReset(baseRevision); }
        }}>{c.confirm}</Button>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-4" disabled={busy || applyBusy}
          onClick={() => setConfirmReset(false)}>{c.cancel}</Button>
      </div> : <div className="flex flex-wrap items-center justify-end gap-2">
          {!changed && detail.user_modified && <Button type="button" variant="ghost" className="h-10 gap-2 rounded-xl px-4" disabled={locked} onClick={() => { if (!locked) setConfirmReset(true); }}><RotateCcw className="h-4 w-4" />{c.reset}</Button>}
          {changed && <Button type="submit" variant="outline" className="h-10 gap-2 rounded-xl px-4 shadow-sm" disabled={locked || !!issue}><Save className="h-4 w-4" />{c.save}</Button>}
          {onApply && <Button type="button" className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20" disabled={locked || !!issue || applyDisabled} onClick={() => {
            if (!locked && !issue && !applyDisabled && baseRevision !== null) onApply(structuredClone(draft), baseRevision, changed);
          }}><Sparkles className="h-4 w-4" />{applyBusy ? applyingLabel ?? c.applyingUnit : applyLabel ?? c.applyUnit}</Button>}
        </div>}
      {onApply && <span className="sr-only">{c.applyHint}</span>}
    </div>}
  </form>;
}
