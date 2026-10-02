import { ChevronDown, ChevronUp, CircleDot, GripVertical, Hash, Info, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import RichTextEditor from '../course-editor/RichTextEditor';
import { CrosswordPreviewInteractive } from '../course-editor/CrosswordPreview';
import DiagramEditor, { type DiagramChangeIntent, type DiagramXBlockData } from '../course-editor/editors/DiagramEditor';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { readWorkspacePreview } from './workspace-node-detail';
import type { WorkspaceContent, WorkspaceDetail, WorkspaceJson, WorkspaceLocale } from '../../api/lesson-author-workspace.contract';

const copy = {
  en: {
    displayName: 'Display name', lessonContent: 'Lesson content', htmlHelp: 'Edit the complete learner-facing content. Saving updates only this AI draft; pasted image files are not uploaded from this workspace.',
    question: 'Question', explanation: 'Explanation', answer: 'Accepted answer', choice: 'Choice', correct: 'Correct answer', hints: 'Hints', addHint: 'Add hint',
    addItem: 'Add item', removeItem: 'Remove item', moveUp: 'Move up', moveDown: 'Move down', keywordColumn: 'Keyword column',
    tolerance: 'Tolerance', caseSensitive: 'Case sensitivity', yes: 'Yes', no: 'No',
    faq: 'FAQ list', faqIntro: 'Add the questions learners commonly ask and provide clear answers.', faqItem: 'FAQ item', faqNote: 'Questions are displayed as expandable cards to learners.',
    sortable: 'Correct order', sortableItems: 'Sortable items', sortableHelp: 'Learners arrange these steps into the correct order.', sortableNote: 'The order shown here is the correct answer.',
    crossword: 'Crossword entries', clue: 'Clue', hint: 'Hint', position: 'Position', row: 'Row', column: 'Column',
    gridPreview: 'Live grid preview', gridPreviewHint: 'The preview updates as you edit the clue, answer or hint.', cells: 'cells',
    diagram: 'Diagram editor', diagrams: 'Diagrams', activeDiagram: 'Active diagram', shape: 'Shape text', connection: 'Connection label', diagramHelp: 'Edit this diagram with the same tools as Course Outline.',
  },
  vi: {
    displayName: 'Tên hiển thị', lessonContent: 'Nội dung bài học', htmlHelp: 'Chỉnh sửa toàn bộ nội dung người học sẽ thấy. Lưu chỉ cập nhật bản thảo AI; ảnh dán từ máy không được tải lên trong màn hình này.',
    question: 'Câu hỏi', explanation: 'Giải thích', answer: 'Đáp án được chấp nhận', choice: 'Lựa chọn', correct: 'Đáp án đúng', hints: 'Gợi ý', addHint: 'Thêm gợi ý',
    addItem: 'Thêm mục', removeItem: 'Xóa mục', moveUp: 'Đưa lên', moveDown: 'Đưa xuống', keywordColumn: 'Cột từ khóa',
    tolerance: 'Sai số cho phép', caseSensitive: 'Phân biệt chữ hoa / thường', yes: 'Có', no: 'Không',
    faq: 'Danh sách FAQ', faqIntro: 'Thêm các câu hỏi người học thường gặp và cung cấp câu trả lời rõ ràng.', faqItem: 'Mục FAQ', faqNote: 'Câu hỏi được hiển thị thành các thẻ mở rộng cho người học.',
    sortable: 'Thứ tự đúng', sortableItems: 'Các mục sắp xếp', sortableHelp: 'Người học sẽ sắp xếp các bước này theo đúng thứ tự.', sortableNote: 'Thứ tự hiển thị tại đây chính là đáp án đúng.',
    crossword: 'Nội dung ô chữ', clue: 'Câu gợi ý', hint: 'Gợi ý thêm', position: 'Vị trí', row: 'Hàng', column: 'Cột',
    gridPreview: 'Xem trước lưới ô chữ', gridPreviewHint: 'Bản xem trước cập nhật khi chỉnh câu gợi ý, đáp án hoặc gợi ý thêm.', cells: 'ô',
    diagram: 'Trình chỉnh sửa sơ đồ', diagrams: 'Danh sách sơ đồ', activeDiagram: 'Sơ đồ đang chọn', shape: 'Nội dung khối', connection: 'Nhãn liên kết', diagramHelp: 'Chỉnh sửa sơ đồ bằng đúng bộ công cụ của Course Outline.',
  },
} as const;

interface Props {
  detail: WorkspaceDetail;
  draft: WorkspaceContent;
  locale: WorkspaceLocale;
  disabled?: boolean;
  onChange: (draft: WorkspaceContent) => void;
}

const isRecord = (value: unknown): value is Record<string, WorkspaceJson> => !!value && typeof value === 'object' && !Array.isArray(value);

function updateData(draft: WorkspaceContent, updater: (data: Record<string, WorkspaceJson>) => void): WorkspaceContent | null {
  if (!isRecord(draft.data)) return null;
  const next = structuredClone(draft);
  updater(next.data as Record<string, WorkspaceJson>);
  return next;
}

function nextItemId(items: Array<{ id: string | number }>): string | number {
  if (items.every(item => typeof item.id === 'number')) {
    return items.reduce((maximum, item) => Math.max(maximum, Number(item.id)), 0) + 1;
  }
  return `workspace-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${items.length + 1}`}`;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`min-w-0 space-y-2 ${wide ? 'md:col-span-2' : ''}`}>
    <label className="text-sm font-semibold tracking-tight text-foreground/90">{label}</label>{children}
  </div>;
}

export function WorkspaceComponentDraftEditor({ detail, draft, locale, disabled = false, onChange }: Props) {
  const c = copy[locale];
  let preview = readWorkspacePreview({ ...detail, content: draft });
  // Crossword answers are intentionally allowed to be temporarily empty or
  // one character while the author types. Keep the trusted baseline structure
  // visible and overlay text only; the parent validator still blocks Save.
  if (!preview && detail.component_type === 'la_crossword') {
    const baseline = readWorkspacePreview(detail);
    const raw = isRecord(draft.data) && Array.isArray(draft.data.words) ? draft.data.words : null;
    if (baseline?.type === 'la_crossword' && raw?.length === baseline.data.words.length) {
      preview = { type: 'la_crossword', data: { ...baseline.data, words: baseline.data.words.map((word, index) => {
        const changed = isRecord(raw[index]) ? raw[index] : null;
        return { ...word,
          answer: typeof changed?.answer === 'string' ? changed.answer : word.answer,
          clue: typeof changed?.clue === 'string' ? changed.clue : word.clue,
          hint: typeof changed?.hint === 'string' ? changed.hint : word.hint,
        };
      }) } };
    }
  }
  if (!preview) return null;
  const changeTitle = (title: string) => { if (!disabled) onChange({ ...draft, title }); };
  const commit = (next: WorkspaceContent | null) => { if (!disabled && next) onChange(next); };

  return <div className={preview.type === 'la_diagram' ? 'h-full min-h-0' : 'space-y-6'} lang={detail.content_locale}>
    {preview.type !== 'la_diagram' && <Field label={c.displayName}>
      <Input aria-label={c.displayName} value={draft.title} maxLength={500} disabled={disabled} className="h-11 rounded-xl border-input bg-background/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:bg-background focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/10" onChange={event => changeTitle(event.target.value)} />
    </Field>}

    {preview.type === 'html' && <Field label={c.lessonContent}>
      <p className="mb-2 flex items-start gap-2 text-xs font-medium text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{c.htmlHelp}</p>
      <div className={`overflow-hidden rounded-xl border border-input bg-background shadow-sm transition-all duration-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 ${disabled ? 'pointer-events-none opacity-70' : ''}`}>
        <RichTextEditor content={preview.data} minHeight="360px" enableTables enableImageKeyboardDelete
          externalContentVersion={`${detail.node_id}:${detail.current_revision}:html`}
          onUnsupportedImagePaste={() => undefined}
          onChange={content => { if (!disabled) onChange({ ...draft, data: content }); }} />
      </div>
    </Field>}

    {preview.type === 'problem' && <ProblemEditor preview={preview.data} draft={draft} locale={locale}
      disabled={disabled} commit={commit} />}
    {preview.type === 'la_faq' && <section className="space-y-3">
      <div className="flex items-start justify-between gap-3"><div><label className="text-sm font-medium">{c.faq} ({preview.data.items.length})</label><p className="mt-0.5 text-xs text-muted-foreground">{c.faqIntro}</p></div>
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 rounded-lg" disabled={disabled || preview.data.items.length >= 8} onClick={() => commit(updateData(draft, data => {
          const items = data.items as Array<{ id: string | number; question: string; answer: string }>;
          items.push({ id: nextItemId(items), question: '', answer: '' });
        }))}><Plus className="h-3.5 w-3.5" />{c.addItem}</Button>
      </div>
      <div className="space-y-2">{preview.data.items.map((item, index) => <div key={String(item.id)} className="app-liquid-card space-y-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
        <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{c.faqItem} {index + 1}</span><Button type="button" variant="ghost" size="icon" aria-label={c.removeItem} className="h-7 w-7 text-destructive hover:bg-destructive/10" disabled={disabled || preview.data.items.length <= 2} onClick={() => commit(updateData(draft, data => {
          (data.items as WorkspaceJson[]).splice(index, 1);
        }))}><Trash2 className="h-3.5 w-3.5" /></Button></div>
        <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">{c.question}</label>
          <Input aria-label={`${c.question} ${index + 1}`} value={item.question} maxLength={8000} disabled={disabled} className="h-9 border-input bg-background px-3 text-sm" onChange={event => commit(updateData(draft, data => {
            const items = data.items as Array<Record<string, WorkspaceJson>>; items[index].question = event.target.value;
          }))} /></div>
        <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">{c.answer}</label>
          <Textarea aria-label={`${c.answer} ${index + 1}`} rows={3} value={item.answer} maxLength={8000} disabled={disabled} className="resize-y border-input bg-background px-3 py-2 text-sm" onChange={event => commit(updateData(draft, data => {
            const items = data.items as Array<Record<string, WorkspaceJson>>; items[index].answer = event.target.value;
          }))} /></div>
      </div>)}</div>
      <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300">{c.faqNote}</div>
    </section>}

    {preview.type === 'la_sortable' && <section className="space-y-4">
      <Field label={c.question}><Textarea aria-label={c.question} rows={3} value={preview.data.question_text} maxLength={8000} disabled={disabled} className="resize-y border-input bg-background px-3 py-2 text-sm" onChange={event => commit(updateData(draft, data => { data.question_text = event.target.value; }))} /></Field>
      <div className="space-y-3"><div className="flex items-start justify-between gap-3"><div><label className="text-sm font-medium">{c.sortableItems} ({preview.data.items.length})</label><p className="mt-0.5 text-xs text-muted-foreground">{c.sortableHelp}</p></div><Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 rounded-lg" disabled={disabled || preview.data.items.length >= 10} onClick={() => commit(updateData(draft, data => {
        const items = data.items as Array<{ id: string | number; text: string }>;
        items.push({ id: nextItemId(items), text: '' });
      }))}><Plus className="h-3.5 w-3.5" />{c.addItem}</Button></div>
      <div className="space-y-2">{preview.data.items.map((item, index) => <div key={String(item.id)} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-all hover:border-primary/30">
        <div className="shrink-0 text-muted-foreground/40"><GripVertical className="h-4 w-4" /></div>
        <span className="min-w-[32px] shrink-0 rounded bg-muted px-2 py-0.5 text-center text-xs font-bold text-muted-foreground">{index + 1}</span>
        <Input aria-label={`${c.choice} ${index + 1}`} value={item.text} maxLength={8000} disabled={disabled} className="h-9 flex-1 border-input bg-background px-3 text-sm" onChange={event => commit(updateData(draft, data => {
          const items = data.items as Array<Record<string, WorkspaceJson>>; items[index].text = event.target.value;
        }))} /><div className="flex shrink-0 items-center"><Button type="button" variant="ghost" size="icon" aria-label={c.moveUp} className="h-8 w-8" disabled={disabled || index === 0} onClick={() => commit(updateData(draft, data => {
          const items = data.items as WorkspaceJson[]; [items[index - 1], items[index]] = [items[index], items[index - 1]];
        }))}><ChevronUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" aria-label={c.moveDown} className="h-8 w-8" disabled={disabled || index === preview.data.items.length - 1} onClick={() => commit(updateData(draft, data => {
          const items = data.items as WorkspaceJson[]; [items[index + 1], items[index]] = [items[index], items[index + 1]];
        }))}><ChevronDown className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" aria-label={c.removeItem} className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={disabled || preview.data.items.length <= 3} onClick={() => commit(updateData(draft, data => {
          (data.items as WorkspaceJson[]).splice(index, 1);
        }))}><Trash2 className="h-3.5 w-3.5" /></Button></div>
      </div>)}</div></div>
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">{c.sortableNote}</div>
    </section>}

    {preview.type === 'la_crossword' && <section className="flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:gap-8">
      <div className="min-w-0 flex-1 space-y-5 lg:max-w-[500px] lg:shrink-0">
        <div className="flex items-end justify-between gap-3"><div className="min-w-0 flex-1"><label className="text-sm font-medium">{c.crossword} ({preview.data.words.length})</label><div className="mt-2 max-w-40"><label className="text-xs font-medium text-muted-foreground">{c.keywordColumn}</label><Input aria-label={c.keywordColumn} type="number" min={0} max={20} value={preview.data.keyword_coordinates[0]?.col ?? 0} disabled={disabled} className="mt-1 h-9" onChange={event => commit(updateData(draft, data => {
          const nextColumn = Math.min(20, Math.max(0, Number(event.target.value) || 0));
          const words = data.words as Array<Record<string, WorkspaceJson>>;
          data.keyword_coordinates = words.flatMap((word, wordIndex) => {
            const col = Number(word.col); const answer = String(word.answer ?? '');
            return nextColumn >= col && nextColumn < col + answer.length ? [{ row: wordIndex, col: nextColumn }] : [];
          });
        }))} /></div></div><Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 rounded-lg" disabled={disabled || preview.data.words.length >= 10} onClick={() => commit(updateData(draft, data => {
          const words = data.words as Array<{ id: string | number; answer: string; clue: string; hint: string; row: number; col: number; direction: 'across' }>;
          words.push({ id: nextItemId(words), answer: `NEW${words.length + 1}`, clue: '', hint: '', row: words.length, col: 0, direction: 'across' });
        }))}><Plus className="h-3.5 w-3.5" />{c.addItem}</Button></div>
        <div className="space-y-2">{preview.data.words.map((word, index) => <div key={String(word.id)} className="app-liquid-card min-w-0 space-y-3 overflow-hidden rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
          <div className="flex min-w-0 items-start justify-between gap-2"><span className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-muted-foreground">{c.row} {index + 1}{word.answer && <span className="ml-2 inline-flex shrink-0 font-normal normal-case text-primary">{word.answer.length} {c.cells}</span>}</span><Button type="button" variant="ghost" size="icon" aria-label={c.removeItem} className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10" disabled={disabled || preview.data.words.length <= 3} onClick={() => commit(updateData(draft, data => {
            const words = data.words as Array<Record<string, WorkspaceJson>>; words.splice(index, 1); words.forEach((entry, wordIndex) => { entry.row = wordIndex; });
            const coordinates = data.keyword_coordinates as Array<Record<string, WorkspaceJson>>;
            data.keyword_coordinates = coordinates.filter(entry => Number(entry.row) !== index).map(entry => ({ ...entry, row: Number(entry.row) > index ? Number(entry.row) - 1 : Number(entry.row) }));
          }))}><Trash2 className="h-3.5 w-3.5" /></Button></div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1"><label className="text-xs font-medium text-muted-foreground">{c.clue}</label><Input aria-label={`${c.clue} ${index + 1}`} value={word.clue} maxLength={8000} disabled={disabled} className="h-9 min-w-0 border-input bg-background px-3 text-sm" onChange={event => commit(updateData(draft, data => {
              const words = data.words as Array<Record<string, WorkspaceJson>>; words[index].clue = event.target.value;
            }))} /></div>
            <div className="min-w-0 space-y-1"><label className="text-xs font-medium text-muted-foreground">{c.answer}</label><Input aria-label={`${c.answer} ${index + 1}`} value={word.answer} maxLength={24} disabled={disabled} className="h-9 min-w-0 border-input bg-background px-3 font-mono text-sm uppercase" onChange={event => commit(updateData(draft, data => {
              const words = data.words as Array<Record<string, WorkspaceJson>>; words[index].answer = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            }))} /></div>
          </div>
          <div className="min-w-0 space-y-1"><label className="text-xs font-medium text-muted-foreground">{c.hint}</label><Input aria-label={`${c.hint} ${index + 1}`} value={word.hint} maxLength={8000} disabled={disabled} className="h-9 min-w-0 border-input bg-background px-3 text-sm" onChange={event => commit(updateData(draft, data => {
            const words = data.words as Array<Record<string, WorkspaceJson>>; words[index].hint = event.target.value;
          }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="flex h-9 items-center gap-2 text-xs text-muted-foreground"><Hash className="h-3.5 w-3.5" />{c.row} {word.row + 1}</div><div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">{c.column}</label><Input aria-label={`${c.column} ${index + 1}`} type="number" min={0} max={20} value={word.col} disabled={disabled} className="h-9" onChange={event => commit(updateData(draft, data => {
            const words = data.words as Array<Record<string, WorkspaceJson>>; words[index].col = Math.min(20, Math.max(0, Number(event.target.value) || 0));
          }))} /></div></div>
        </div>)}</div>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden lg:sticky lg:top-0 lg:self-start"><div className="mb-4"><h3 className="flex items-center gap-2 text-sm font-bold text-[#0B57D0]"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#0B57D0]" /></span>{c.gridPreview}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{c.gridPreviewHint}</p></div>
        <CrosswordPreviewInteractive parsed={preview.data} showAnswers />
      </div>
    </section>}

    {preview.type === 'la_diagram' && <DiagramDraftEditor preview={preview.data} draft={draft} locale={locale} disabled={disabled} commit={commit} />}
  </div>;
}

type ProblemPreview = Extract<NonNullable<ReturnType<typeof readWorkspacePreview>>, { type: 'problem' }>['data'];
function ProblemEditor({ preview, draft, locale, disabled, commit }: { preview: ProblemPreview; draft: WorkspaceContent;
  locale: WorkspaceLocale; disabled: boolean; commit: (next: WorkspaceContent | null) => void }) {
  const c = copy[locale];
  const set = (key: string, value: WorkspaceJson) => commit(updateData(draft, data => { data[key] = value; }));
  return <section className="flex flex-col gap-8 lg:flex-row">
    <div className="flex-1 space-y-8">
      <div className="space-y-3"><h3 className="text-sm font-bold">{c.question}</h3><Textarea aria-label={c.question} value={preview.question} maxLength={4000} disabled={disabled} className="min-h-[120px] resize-y rounded-xl border-input bg-background/50 px-4 py-3 text-sm leading-6 shadow-sm transition-all duration-200 focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/10" onChange={event => set('question', event.target.value)} /></div>
      <div className="space-y-3"><h3 className="text-sm font-bold">{c.explanation}</h3><Textarea aria-label={c.explanation} value={preview.explanation} maxLength={8000} disabled={disabled} className="min-h-[120px] resize-y rounded-xl border-input bg-background/50 px-4 py-3 text-sm leading-6 shadow-sm transition-all duration-200 focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/10" onChange={event => set('explanation', event.target.value)} /></div>
      <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{c.answer}</h3><Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg" disabled={disabled || ('choices' in preview ? preview.choices.length >= 8 : preview.answers.length >= 5)} onClick={() => commit(updateData(draft, data => {
        if (Array.isArray(data.choices)) data.choices.push({ text: '', correct: false });
        else if (Array.isArray(data.answers)) data.answers.push('');
      }))}><Plus className="h-3.5 w-3.5" />{c.addItem}</Button></div>
        <div className="space-y-3">{'choices' in preview ? preview.choices.map((choice, index) => <div key={index} className="group flex items-start gap-4">
          <div className="pt-[14px]"><input type={preview.kind === 'multiple_select' ? 'checkbox' : 'radio'} name="workspace-correct-answer" checked={choice.correct} disabled={disabled}
            aria-label={`${c.correct} ${index + 1}`} className="h-5 w-5 cursor-pointer accent-primary" onChange={() => commit(updateData(draft, data => {
              const choices = data.choices as Array<Record<string, WorkspaceJson>>;
              if (preview.kind === 'multiple_select') choices[index].correct = !choice.correct;
              else choices.forEach((entry, choiceIndex) => { entry.correct = choiceIndex === index; });
            }))} /></div>
          <div className="w-5 shrink-0 pt-[15px] text-center text-[15px] font-semibold text-muted-foreground">{String.fromCharCode(65 + index)}</div>
          <Textarea aria-label={`${c.choice} ${index + 1}`} value={choice.text} maxLength={4000} disabled={disabled} className="min-h-[44px] flex-1 resize-y rounded-xl border-input bg-background/50 px-3 py-2.5 text-sm leading-5 shadow-sm transition-all duration-200 focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/10" onChange={event => commit(updateData(draft, data => {
            const choices = data.choices as Array<Record<string, WorkspaceJson>>; choices[index].text = event.target.value;
          }))} /><Button type="button" variant="ghost" size="icon" aria-label={c.removeItem} className="mt-1 h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10" disabled={disabled || preview.choices.length <= 2} onClick={() => commit(updateData(draft, data => {
            (data.choices as WorkspaceJson[]).splice(index, 1);
          }))}><Trash2 className="h-4 w-4" /></Button>
        </div>) : preview.answers.map((answer, index) => <div key={index} className="flex items-start gap-4"><div className="pt-2.5"><CircleDot className="h-5 w-5 text-primary" /></div><div className="w-5 shrink-0 pt-2.5 text-center text-[15px] font-semibold text-muted-foreground">{index + 1}</div><Input aria-label={`${c.answer} ${index + 1}`} value={answer} maxLength={4000} disabled={disabled} className="h-10 flex-1 border-input bg-background px-3 text-sm" onChange={event => commit(updateData(draft, data => {
          const answers = data.answers as WorkspaceJson[]; answers[index] = event.target.value;
        }))} /><Button type="button" variant="ghost" size="icon" aria-label={c.removeItem} className="h-10 w-10 shrink-0 text-destructive hover:bg-destructive/10" disabled={disabled || preview.answers.length <= 1} onClick={() => commit(updateData(draft, data => {
          (data.answers as WorkspaceJson[]).splice(index, 1);
        }))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
      </div>
    </div>
    <aside className="w-full shrink-0 space-y-6 lg:w-72">
      <div className="app-liquid-card space-y-3 rounded-xl border border-border bg-muted/10 p-4">
        <div className="flex items-center justify-between"><label className="text-sm font-semibold text-primary">{c.hints}</label><Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5" disabled={disabled || preview.hints.length >= 10} onClick={() => set('hints', [...preview.hints, ''])}><Plus className="h-3.5 w-3.5" />{c.addHint}</Button></div>
        <div className="space-y-2">{preview.hints.map((hint, index) => <div key={index} className="flex items-center gap-2"><Input aria-label={`${c.hint} ${index + 1}`} value={hint} maxLength={4000} disabled={disabled} className="h-9" onChange={event => set('hints', preview.hints.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10" disabled={disabled} onClick={() => set('hints', preview.hints.filter((_value, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
      </div>
      {preview.kind === 'short_text' && <div className="app-liquid-card space-y-2 rounded-xl border border-border bg-muted/10 p-4"><label className="text-sm font-semibold">{c.caseSensitive}</label><button type="button" disabled={disabled} className="flex w-full items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-sm" onClick={() => set('case_sensitive', !preview.case_sensitive)}><CircleDot className="h-4 w-4 text-primary" />{preview.case_sensitive ? c.yes : c.no}</button></div>}
      {preview.kind === 'numerical' && <div className="app-liquid-card rounded-xl border border-border bg-muted/10 p-4"><Field label={c.tolerance}><Input aria-label={c.tolerance} value={preview.tolerance} maxLength={40} disabled={disabled} className="h-9 border-input bg-background" onChange={event => set('tolerance', event.target.value)} /></Field></div>}
    </aside>
  </section>;
}

type DiagramPreview = Extract<NonNullable<ReturnType<typeof readWorkspacePreview>>, { type: 'la_diagram' }>['data'];
function canonicalDiagramData(next: DiagramXBlockData): DiagramXBlockData {
  return {
    start_diagram_id: next.start_diagram_id,
    diagrams: next.diagrams.map(diagram => ({
      id: diagram.id,
      name: diagram.name,
      nodes: diagram.nodes.map(node => ({
        id: node.id,
        type: node.type === 'junction' ? 'junction' : 'customShape',
        position: { x: node.position.x, y: node.position.y },
        data: {
          label: node.data.label,
          shape: node.data.shape,
          bgColor: node.data.bgColor,
          textColor: node.data.textColor,
          ...(node.data.tooltip !== undefined ? { tooltip: node.data.tooltip } : {}),
          ...(node.data.target_diagram_id !== undefined ? { target_diagram_id: node.data.target_diagram_id } : {}),
        },
      })),
      edges: diagram.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(edge.label !== undefined ? { label: String(edge.label) } : {}),
        ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
        ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
        ...(edge.data && typeof edge.data === 'object' ? { data: edge.data } : {}),
      })),
    })),
  };
}

function DiagramDraftEditor({ preview, draft, locale, disabled, commit }: { preview: DiagramPreview; draft: WorkspaceContent; locale: WorkspaceLocale; disabled: boolean; commit: (next: WorkspaceContent | null) => void }) {
  const c = copy[locale];
  const incoming = useMemo(() => canonicalDiagramData(structuredClone(preview) as DiagramXBlockData), [preview]);
  const incomingSignature = useMemo(() => JSON.stringify(incoming), [incoming]);
  const [diagramData, setDiagramData] = useState<DiagramXBlockData>(() => structuredClone(incoming));
  const acceptedSignatureRef = useRef(incomingSignature);
  useEffect(() => {
    if (incomingSignature === acceptedSignatureRef.current) return;
    acceptedSignatureRef.current = incomingSignature;
    setDiagramData(structuredClone(incoming));
  }, [incoming, incomingSignature]);
  const commitDiagram = (next: DiagramXBlockData, intent: DiagramChangeIntent = 'persist') => {
    // React Flow must retain measured dimensions and selection locally. Sending
    // those transient fields through the canonical workspace draft removes
    // them on the next render and prevents the controlled nodes from ever
    // reaching their initialized state.
    setDiagramData(next);
    if (disabled || intent === 'transient') return;
    const clean = canonicalDiagramData(next);
    acceptedSignatureRef.current = JSON.stringify(clean);
    commit({ ...draft, data: clean as unknown as WorkspaceJson });
  };
  return <section className={`h-full min-h-0 w-full overflow-hidden rounded-xl border border-border bg-background ${disabled ? 'pointer-events-none opacity-70' : ''}`} aria-label={c.diagram}>
    <DiagramEditor displayName={draft.title} onDisplayNameChange={title => commit({ ...draft, title })}
      diagramData={diagramData} onDiagramDataChange={commitDiagram} embedded />
  </section>;
}
