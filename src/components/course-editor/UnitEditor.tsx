/**
 * UnitEditor.tsx — Hiển thị và chỉnh sửa components trong một Unit
 * Hỗ trợ: video, html, problem (5 dạng), la_crossword, la_sortable
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getUnitChildren, createXBlock, updateXBlock, deleteXBlock, studioSubmit, getBlockInfo, publishBlock, reorderChildren,
} from '@/api/custom-course-authoring';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { customApiClient } from '@/api/custom-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Trash2, GripVertical, Plus, Video, Type, HelpCircle,
  Save, Edit2, ChevronDown, Puzzle, List, Check, X, Network, MessageSquareText
} from 'lucide-react';
import { toast } from 'sonner';
import VideoEditor from './editors/VideoEditor';
import HtmlEditor from './editors/HtmlEditor';
import ProblemEditor, { PROBLEM_TYPES, parseProblemXml } from './editors/ProblemEditor';
import CrosswordEditor, { CrosswordWord } from './editors/CrosswordEditor';
import SortableEditor, { SortableItem } from './editors/SortableEditor';
import FaqEditor, { FaqItem } from './editors/FaqEditor';
import PdfEditor from './editors/PdfEditor';
import { CrosswordPreviewInteractive } from './CrosswordPreview';
import DiagramPreviewInteractive from './editors/diagram/DiagramPreviewInteractive';
import DiagramEditor, { DiagramXBlockData } from './editors/DiagramEditor';
import ImageCarousel from './ImageCarousel';

import { config } from '@/config/env';

// Luôn dùng relative URL để asset loading flexible trên mọi domain/IP
const LMS_BASE = '';

function rewriteHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/src="(\/asset-v1:[^"]+)"/g, `src="${LMS_BASE}$1"`)
    .replace(/src="(\/c4x\/[^"]+)"/g, `src="${LMS_BASE}$1"`)
    .replace(/src="(\/static\/[^"]+)"/g, `src="${LMS_BASE}$1"`)
    .replace(/src="(\/assets\/[^"]+)"/g, `src="${LMS_BASE}$1"`);
}

// ─── Component type registry ──────────────────────────────────────────────────

interface ComponentType {
  id: string;
  category: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  colorClass: string;
  subTypes?: { id: string; label: string; boilerplate: string }[];
}

const COMPONENT_TYPES: ComponentType[] = [
  {
    id: 'video', category: 'video', label: 'Video', desc: 'YouTube / edX video',
    icon: <Video className="h-6 w-6" />,
    colorClass: 'border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300',
  },
  {
    id: 'html', category: 'html', label: 'Text', desc: 'Văn bản + hình ảnh',
    icon: <Type className="h-6 w-6" />,
    colorClass: 'border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  },
  {
    id: 'problem', category: 'problem', label: 'Problem', desc: '5 dạng câu hỏi',
    icon: <HelpCircle className="h-6 w-6" />,
    colorClass: 'border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    subTypes: PROBLEM_TYPES.map(p => ({ id: p.id, label: p.label, boilerplate: p.boilerplate })),
  },
  {
    id: 'la_crossword', category: 'la_crossword', label: 'Ô chữ', desc: 'Crossword tương tác',
    icon: <Puzzle className="h-6 w-6" />,
    colorClass: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'la_sortable', category: 'la_sortable', label: 'Sắp xếp', desc: 'Kéo thả thứ tự',
    icon: <List className="h-6 w-6" />,
    colorClass: 'border-violet-200 bg-violet-50 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-300',
  },
  {
    id: 'la_diagram', category: 'la_diagram', label: 'Biểu đồ', desc: 'Sơ đồ tổ chức, Mindmap...',
    icon: <Network className="h-6 w-6" />,
    colorClass: 'border-orange-200 bg-orange-50 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  },
  {
    id: 'la_faq', category: 'la_faq', label: 'FAQ', desc: 'Câu hỏi thường gặp',
    icon: <MessageSquareText className="h-6 w-6" />,
    colorClass: 'border-teal-200 bg-teal-50 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/30 dark:hover:bg-teal-900/40 text-teal-700 dark:text-teal-300',
  },
  {
    id: 'la_pdf', category: 'la_pdf', label: 'PDF', desc: 'Nhúng tài liệu PDF',
    icon: <Type className="h-6 w-6" />,
    colorClass: 'border-rose-200 bg-rose-50 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300',
  },
];

// ─── ChildBlock type ──────────────────────────────────────────────────────────

interface ChildBlock {
  id: string;
  block_id: string;
  display_name: string;
  block_type: string;
  has_changes: boolean;
  published: boolean;
}

// ─── Fetch block detail helper ────────────────────────────────────────────────

async function fetchBlockDetail(block: ChildBlock): Promise<any> {
  const blockId = block.id || block.block_id;
  try {
    const data = await getBlockInfo(blockId);
    return {
      ...data,
      id: blockId,
      category: data.category || (data as any).block_type || block.block_type,
      block_type: block.block_type,
      display_name: data.display_name || block.display_name,
    };
  } catch {
    return {
      id: blockId,
      category: block.block_type,
      block_type: block.block_type,
      display_name: block.display_name,
      metadata: {},
      data: '',
    };
  }
}

// ─── UnitEditor (main) ────────────────────────────────────────────────────────

export default function UnitEditor({ unitId, courseId, onContentChange }: {
  unitId: string;
  courseId?: string;
  onContentChange: () => void;
}) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [subTypeSelector, setSubTypeSelector] = useState<ComponentType | null>(null);

  const { data: unitChildren, isLoading, refetch } = useQuery({
    queryKey: ['unit-children', unitId],
    queryFn: () => getUnitChildren(unitId),
    staleTime: 10_000,
  });

  const children: ChildBlock[] = unitChildren?.children || [];

  // ── Drag-and-drop state cho component ordering ──
  const [localChildren, setLocalChildren] = useState<ChildBlock[]>(children);
  useEffect(() => { setLocalChildren(children); }, [children]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const reorderMut = useMutation({
    mutationFn: (childIds: string[]) => reorderChildren(unitId, childIds),
    onSuccess: () => { refetch(); onContentChange(); },
    onError: () => {
      toast.error('Thay đổi thứ tự thất bại');
      setLocalChildren(children); // revert
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localChildren.findIndex((c) => (c.id || c.block_id) === active.id);
      const newIndex = localChildren.findIndex((c) => (c.id || c.block_id) === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newArray = arrayMove(localChildren, oldIndex, newIndex);
        setLocalChildren(newArray);
        reorderMut.mutate(newArray.map((c) => c.id || c.block_id));
      }
    }
  }

  const addMut = useMutation({
    mutationFn: ({ category, boilerplate }: { category: string; boilerplate?: string }) =>
      createXBlock({ type: category, category, parent_locator: unitId, boilerplate }),
    onSuccess: () => {
      toast.success('Đã thêm component');
      setShowAddDialog(false);
      setSubTypeSelector(null);
      refetch();
      onContentChange();
    },
    onError: (err: any) => {
      toast.error(`Thêm thất bại: ${err?.response?.data?.error || err?.message || 'Lỗi không rõ'}`);
    },
  });

  const handleSelectType = useCallback((type: ComponentType) => {
    if (type.subTypes?.length) {
      setSubTypeSelector(type);
    } else {
      addMut.mutate({ category: type.category });
    }
  }, [addMut]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-20">
      {children.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
            <Plus className="h-8 w-8 opacity-20" />
          </div>
          <p className="text-sm">Unit chưa có nội dung. Thêm component đầu tiên!</p>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={localChildren.map(c => c.id || c.block_id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {localChildren.map(child => (
              <ComponentCard
                key={child.id || child.block_id}
                block={child}
                courseId={courseId}
                onDelete={() => { refetch(); onContentChange(); }}
                onSaved={() => { refetch(); onContentChange(); }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="pt-2">
        <Button
          variant="outline"
          className="w-full h-12 border-dashed border-2 rounded-xl hover:border-primary/60 hover:text-primary hover:bg-primary/5"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="h-5 w-5 mr-2" /> Thêm Component
        </Button>
      </div>

      {/* Add Component Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => { setShowAddDialog(o); if (!o) setSubTypeSelector(null); }}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-7 pt-6 pb-4">
            <DialogTitle className="text-xl font-bold text-center">
              {subTypeSelector ? `Chọn dạng ${subTypeSelector.label}` : 'Thêm component mới'}
            </DialogTitle>
          </DialogHeader>
          <div className="px-7 pb-7">
            {subTypeSelector ? (
              <div className="space-y-2">
                {subTypeSelector.subTypes!.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => addMut.mutate({ category: subTypeSelector.category, boilerplate: sub.boilerplate })}
                    disabled={addMut.isPending}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border bg-background hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all text-left disabled:opacity-50"
                  >
                    <HelpCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    <span className="font-semibold text-sm">{sub.label}</span>
                  </button>
                ))}
                <Button variant="ghost" className="w-full mt-1 text-sm" onClick={() => setSubTypeSelector(null)}>
                  ← Quay lại
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {COMPONENT_TYPES.map(type => (
                  <button
                    key={type.id}
                    onClick={() => handleSelectType(type)}
                    disabled={addMut.isPending}
                    className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all disabled:opacity-50 ${type.colorClass}`}
                  >
                    {type.icon}
                    <div className="text-center">
                      <div className="font-bold text-sm">{type.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{type.desc}</div>
                    </div>
                    {type.subTypes && <ChevronDown className="h-3 w-3 opacity-50" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ComponentCard ────────────────────────────────────────────────────────────

function ComponentCard({ block, courseId, onDelete, onSaved }: {
  block: ChildBlock;
  courseId?: string;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const blockId = block.id || block.block_id;
  const [isEditing, setIsEditing] = useState(false);
  const [blockData, setBlockData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // ── dnd-kit sortable hook ──
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: blockId });
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 50, position: 'relative' as const, opacity: 0.6 } : {})
  };

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    const detail = await fetchBlockDetail(block);
    setBlockData(detail);
    setLoadingDetail(false);
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch ngay khi mount
  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const delMut = useMutation({
    mutationFn: () => deleteXBlock(blockId),
    onSuccess: () => { toast.success('Đã xóa'); onDelete(); },
    onError: () => toast.error('Xóa thất bại'),
  });

  const handleSaved = useCallback(async () => {
    setIsEditing(false);
    await loadDetail(); // Refresh preview sau save
    onSaved();
  }, [loadDetail, onSaved]);

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      className={`border border-border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow group ${isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            {...attributes}
            {...listeners}
            className="shrink-0 flex justify-center cursor-grab hover:text-foreground text-muted-foreground/30 hover:bg-muted-foreground/10 rounded px-0.5 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <span className="px-2 py-0.5 rounded bg-background border text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
            {block.block_type}
          </span>
          <span className="text-sm font-semibold truncate">
            {blockData?.display_name || block.display_name}
          </span>
          {block.has_changes && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 font-medium shrink-0">
              draft
            </span>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditing(true)}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xóa component này?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hành động này không thể hoàn tác. Component sẽ bị xóa vĩnh viễn khỏi hệ thống.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => delMut.mutate()}
                >
                  Xóa
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Preview */}
      <div className="p-4 bg-background min-h-[52px]">
        {loadingDetail ? (
          <div className="flex gap-2 items-center animate-pulse">
            <div className="h-3 w-3 rounded-full bg-muted" />
            <div className="h-3 w-36 rounded bg-muted" />
          </div>
        ) : (
          <ComponentPreview blockType={block.block_type} blockData={blockData} />
        )}
      </div>

      {/* Fullscreen Editor for Diagram */}
      {isEditing && block.block_type === 'la_diagram' && (
        <div className="fixed inset-0 z-[9999] bg-background w-screen h-screen overflow-hidden flex flex-col">
          <ComponentEditForm
            key={blockId}
            blockInfo={blockData}
            courseId={courseId}
            onSaved={handleSaved}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      )}

      {/* Edit Dialog for Normal Components */}
      <Dialog open={isEditing && block.block_type !== 'la_diagram'} onOpenChange={setIsEditing}>
        <DialogContent className="w-[95vw] sm:max-w-7xl max-h-[92vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 py-4 border-b bg-muted/20 shrink-0">
            <DialogTitle className="text-lg font-bold">
              Chỉnh sửa: <span className="text-primary">{blockData?.display_name || block.display_name}</span>
              <span className="ml-2 text-xs font-normal text-muted-foreground uppercase tracking-wider">
                [{block.block_type}]
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loadingDetail ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <ComponentEditForm
                key={blockId}
                blockInfo={blockData}
                courseId={courseId}
                onSaved={handleSaved}
                onCancel={() => setIsEditing(false)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Custom Interactive Previews ───────────────────────────────────────────────

function SortablePreviewInteractive({ parsed, questionText }: { parsed: any, questionText: string }) {
  const correctItems = parsed?.items || [];
  const [items, setItems] = useState<any[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    setItems([...correctItems].sort(() => Math.random() - 0.5));
  }, [correctItems]);

  const moveItem = (from: number, to: number) => {
    if (submitted) return;
    const arr = [...items];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setItems(arr);
  };

  const handleDragStart = (idx: number) => {
    if (submitted) return;
    setDragging(idx);
  }
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragging !== null && dragging !== idx && !submitted) {
      moveItem(dragging, idx);
      setDragging(idx);
    }
  };
  const handleDragEnd = () => setDragging(null);

  const isCorrect = items.every((item, i) => item.id === correctItems[i]?.id);

  if (correctItems.length === 0) {
    return <div className="text-muted-foreground p-4 border rounded-xl text-center">Chưa có danh sách sắp xếp</div>;
  }

  return (
    <div className="border border-border rounded-xl p-5 bg-card space-y-5">
      {questionText && <p className="text-[15px] prose dark:prose-invert max-w-none">{questionText}</p>}

      <div className="space-y-2 mt-4">
        {items.map((item, idx) => {
          const isItemCorrect = item.id === correctItems[idx]?.id;
          let borderClass = "border-border";
          if (submitted) {
            borderClass = isItemCorrect ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10";
          }

          return (
            <div
              key={item.id}
              draggable={!submitted}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 p-3 rounded-md border bg-background transition-all ${dragging === idx ? 'opacity-50 scale-[0.99] border-primary' : borderClass} ${submitted ? 'cursor-default' : 'cursor-grab hover:bg-muted/50'}`}
            >
              <div className="text-muted-foreground/40 shrink-0">
                <GripVertical className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0 min-w-[32px] text-center">
                {idx + 1}
              </span>
              <div className="flex-1 text-[15px] prose dark:prose-invert max-w-none [&_p]:m-0 leading-tight">
                {item.text}
              </div>
              {submitted && (
                <div className="shrink-0">
                  {isItemCorrect ? <Check className="w-5 h-5 text-green-500 stroke-[3]" /> : <X className="w-5 h-5 text-red-500 stroke-[3]" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-2 flex items-center justify-between border-t border-border/50">
        <Button
          variant={submitted ? "outline" : "default"}
          className="min-w-[120px] font-semibold"
          onClick={() => {
            if (submitted) {
              setSubmitted(false);
              setItems([...correctItems].sort(() => Math.random() - 0.5));
            } else {
              setSubmitted(true);
            }
          }}
        >
          {submitted ? 'Retry' : 'Submit'}
        </Button>
      </div>
    </div>
  );
}


// ─── ComponentPreview ─────────────────────────────────────────────────────────

function parseMaybeJson(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

function ComponentPreview({ blockType, blockData }: { blockType: string; blockData: any }) {
  switch (blockType) {
    case 'video': {
      let ytId = blockData?.metadata?.youtube_id_1_0 || blockData?.data?.youtube_id_1_0;

      // Fallback extraction from XML data if it's stored in XML block
      if (!ytId && typeof blockData?.data === 'string') {
        const xmlMatch = blockData.data.match(/youtube_id_1_0="([^"]+)"/);
        if (xmlMatch) ytId = xmlMatch[1];
      }

      // Open edX default video ID if no ID is found
      if (!ytId) ytId = '3_yD_cEKoCk';

      return ytId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-500/10 text-red-500">
              <Video className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">YouTube Video</span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
              <code className="text-[11px] font-mono font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">{ytId}</code>
            </div>
          </div>
          <div className="p-1 rounded-xl bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/5 border border-primary/10 shadow-lg shadow-primary/5">
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-black shadow-inner">
              <iframe
                key={ytId}
                width="100%" height="100%"
                src={`https://www.youtube.com/embed/${ytId}?rel=0`}
                title="YouTube Preview"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground gap-3">
          <div className="p-3 bg-background rounded-full shadow-sm">
            <Video className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <span className="text-sm font-medium">Video — hover để Edit cấu hình YouTube ID</span>
        </div>
      );
    }

    case 'html': {
      const htmlRaw = blockData?.data;
      const html = typeof htmlRaw === 'string' ? htmlRaw : '';
      
      if (!html.trim()) {
        return (
          <div className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground gap-3">
            <div className="p-3 bg-background rounded-full shadow-sm">
              <Type className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <span className="text-sm font-medium">Text/HTML — hover để nhập nội dung & hình ảnh</span>
          </div>
        );
      }

      const rewrittenHtml = rewriteHtml(html);
      let images: { src: string; alt: string }[] = [];
      let finalHtml = rewrittenHtml;

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rewrittenHtml, 'text/html');
        const imgEls = doc.querySelectorAll('img');
        
        if (imgEls.length >= 2) {
          images = Array.from(imgEls).map(img => ({
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || ''
          }));
          
          imgEls.forEach(img => img.remove());
          
          // Xóa các thẻ p bị rỗng
          doc.querySelectorAll('p').forEach(p => {
            if (!p.textContent?.trim() && p.children.length === 0) {
              p.remove();
            }
          });
          finalHtml = doc.body.innerHTML;
        }
      } catch (e) {
        console.error("Failed to parse HTML for carousel", e);
      }

      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500">
              <Type className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">Văn bản & Hình ảnh</span>
          </div>
          <div className="p-4 rounded-xl bg-background border border-border shadow-sm">
            {images.length >= 2 && <ImageCarousel images={images} />}
            {finalHtml.trim() && (
              <div
                dangerouslySetInnerHTML={{ __html: finalHtml }}
                className="prose dark:prose-invert max-w-none text-sm max-h-[300px] overflow-y-auto relative custom-scrollbar
                  [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6
                  [&_img]:max-h-48 [&_img]:object-contain [&_img]:rounded-lg [&_img]:shadow-sm [&_img]:border [&_img]:border-border [&_img]:my-2
                  [&_p]:leading-relaxed [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm"
              />
            )}
          </div>
        </div>
      );
    }

    case 'problem': {
      const rawData = blockData?.data;
      // data can be: string (OLX XML), object (JSONB from DB), or null
      const xml = typeof rawData === 'string' ? rawData : '';
      const parsed = parseProblemXml(xml);

      if (!parsed) {
        const trimmed = xml.trim().replace(/<\/?problem>/g, '').trim();
        return trimmed ? (
          <div className="flex items-start gap-2">
            <HelpCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <pre className="text-xs text-muted-foreground font-mono max-h-24 overflow-hidden line-clamp-4 whitespace-pre-wrap">
              {trimmed.slice(0, 300)}{trimmed.length > 300 ? '...' : ''}
            </pre>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            <span>Problem — hover để Edit câu hỏi</span>
          </div>
        );
      }

      return <ProblemPreviewInteractive parsed={parsed} weight={blockData?.metadata?.weight ?? 1.0} />;
    }

    case 'la_crossword': {
      // Support both formats: metadata.crossword_data.words OR metadata.words
      const cd = parseMaybeJson(blockData?.metadata?.crossword_data || blockData?.crossword_data);
      const words = cd?.words || blockData?.metadata?.words || [];
      return <CrosswordPreviewInteractive parsed={{ words, keyword_coordinates: cd?.keyword_coordinates || blockData?.metadata?.keyword_coordinates || [], grid_size: cd?.grid_size || blockData?.metadata?.grid_size || 10 }} />;
    }

    case 'la_sortable': {
      // Support both formats: metadata.sortable_data.items OR metadata.items
      const sd = parseMaybeJson(blockData?.metadata?.sortable_data || blockData?.sortable_data);
      const items = sd?.items || blockData?.metadata?.items || [];
      const qt = blockData?.metadata?.question_text || blockData?.question_text || sd?.question_text || '';
      return <SortablePreviewInteractive parsed={{ items }} questionText={qt} />;
    }
    case 'la_diagram': {
      const parsed = parseMaybeJson(blockData?.metadata?.diagram_data || blockData?.diagram_data);
      
      if (!parsed || !parsed.diagrams || parsed.diagrams.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground gap-3">
            <div className="p-3 bg-background rounded-full shadow-sm">
              <Network className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <span className="text-sm font-medium">Diagram — hover để Edit sơ đồ</span>
          </div>
        );
      }
      return <DiagramPreviewInteractive data={parsed} />;
    }

    case 'la_faq': {
      // Support both formats: metadata.faq_data.items OR metadata.items
      const fd = parseMaybeJson(blockData?.metadata?.faq_data || blockData?.faq_data);
      const faqItems = fd?.items || blockData?.metadata?.items || [];

      if (faqItems.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground gap-3">
            <div className="p-3 bg-background rounded-full shadow-sm">
              <MessageSquareText className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <span className="text-sm font-medium">FAQ — hover để thêm câu hỏi thường gặp</span>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-md bg-teal-500/10 text-teal-600">
              <MessageSquareText className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">FAQ — {faqItems.length} câu hỏi</span>
          </div>
          {faqItems.map((item: any, idx: number) => (
            <details key={item.id || idx} className="group border border-border rounded-lg overflow-hidden bg-card">
              <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-muted/50 transition-colors text-sm font-medium list-none">
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-180" />
                <span>{item.question || `Câu hỏi #${idx + 1}`}</span>
              </summary>
              <div className="px-4 pb-3 pt-1 text-sm text-muted-foreground border-t border-border/50 whitespace-pre-wrap">
                {item.answer || 'Chưa có câu trả lời'}
              </div>
            </details>
          ))}
        </div>
      );
    }

    case 'la_pdf': {
      const pdfUrl = blockData?.metadata?.pdf_url || blockData?.pdf_url || '';
      if (!pdfUrl) {
        return (
          <div className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground gap-3">
            <div className="p-3 bg-background rounded-full shadow-sm">
              <Type className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <span className="text-sm font-medium">PDF — hover để nhập link tài liệu</span>
          </div>
        );
      }
      // Chuyển Google Drive share link → embed preview
      let embedUrl = pdfUrl;
      const driveMatch = pdfUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      if (driveMatch) {
        embedUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
      } else {
        // Ẩn toolbar mặc định của browser PDF viewer
        embedUrl = pdfUrl + '#toolbar=0&navpanes=0';
      }
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-500">
              <Type className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">PDF Embed</span>
            <code className="ml-auto text-[11px] font-mono font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 truncate max-w-[300px]">{pdfUrl}</code>
          </div>
          <div className="border border-border rounded-xl overflow-hidden bg-muted/30">
            <iframe src={embedUrl} title="PDF Preview" className="w-full h-[300px]" allow="autoplay" />
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="text-sm text-muted-foreground">[{blockType}] — hover để Edit cấu hình</div>
      );
  }
}

// ─── Interactive Problem Preview (styled to match FE-5173 QuizContent) ───────

function ProblemPreviewDropdown({
  choices,
  value,
  onChange,
  disabled,
  submitted,
  isCorrect,
}: {
  choices: any[];
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
  submitted: boolean;
  isCorrect: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const selectedChoice = choices.find((c: any) => c.html === value);

  // Tính position tuyệt đối (fixed) dựa theo vị trí nút button để thoát khỏi overflow-hidden
  const openDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setIsOpen(!isOpen);
  };

  // Đóng dropdown khi click ra ngoài
  React.useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [isOpen]);

  return (
    <div className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className={`flex w-full items-center justify-between rounded-xl border-2 px-5 py-4 text-left transition-all ${
          disabled
            ? 'cursor-not-allowed border-border bg-muted/50 opacity-70'
            : submitted
              ? (isCorrect ? 'border-green-500 bg-green-500/5' : 'border-red-500 bg-red-500/5')
              : (isOpen || value)
                ? 'border-primary bg-primary/5 ring-1 ring-primary text-foreground'
                : 'border-border bg-background hover:bg-muted/20 text-foreground'
        }`}
      >
        <span className={`text-[15px] font-medium leading-relaxed ${value ? 'text-primary' : 'text-muted-foreground'}`}>
          {selectedChoice ? selectedChoice.html : '-- Chọn đáp án --'}
        </span>
        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''} ${value && !isOpen ? 'text-primary' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div
          style={dropdownStyle}
          className="max-h-60 overflow-y-auto rounded-xl border border-border bg-background p-2 shadow-xl ring-1 ring-black/10"
          onClick={(e) => e.stopPropagation()}
        >
          {choices.map((c: any) => (
            <button
              key={c.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(c.html); setIsOpen(false); }}
              className={`flex w-full cursor-pointer items-center rounded-lg px-4 py-3 text-left transition-colors ${
                value === c.html
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-foreground hover:bg-muted/80 font-medium'
              }`}
            >
              <span className="text-[14px]">{c.html}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProblemPreviewInteractive({ parsed, weight }: { parsed: any; weight: number }) {
  const isMulti = parsed.type === 'choiceresponse';
  const isInput = parsed.type === 'numericalresponse' || parsed.type === 'stringresponse';
  const isDropdown = parsed.type === 'optionresponse';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inputValue, setInputValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const toggleChoice = (id: string) => {
    if (submitted || isInput || isDropdown) return;
    const next = new Set(selected);
    if (!isMulti) {
      next.clear();
      next.add(id);
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
  };

  const handleSubmit = () => {
    setSubmitted(true);
  };

  let isCorrect = false;
  if (submitted) {
    if (isInput) {
      const correctAnswers = parsed.choices.map((c: any) => c.html);
      if (parsed.type === 'numericalresponse') {
        isCorrect = correctAnswers.some((ans: string) => Math.abs(parseFloat(ans) - parseFloat(inputValue)) <= 0.0001);
      } else {
        isCorrect = correctAnswers.some((ans: string) => ans.toLowerCase().trim() === inputValue.toLowerCase().trim());
      }
    } else if (isDropdown) {
      const correctChoice = parsed.choices.find((c: any) => c.correct);
      isCorrect = inputValue === correctChoice?.html;
    } else {
      const correctIds = new Set(parsed.choices.filter((c: any) => c.correct).map((c: any) => c.id));
      if (isMulti) {
        isCorrect = selected.size === correctIds.size && [...selected].every(id => correctIds.has(id));
      } else {
        isCorrect = selected.size === 1 && correctIds.has([...selected][0]);
      }
    }
  }

  // Quiz type info text
  const typeInfoText = isMulti
    ? 'Được phép chọn nhiều đáp án.'
    : isDropdown
      ? 'Chọn đáp án từ danh sách xổ xuống.'
      : isInput
        ? 'Nhập đáp án vào ô trống.'
        : 'Chỉ chọn 1 đáp án.';

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">

        {/* Question */}
        <div
          className="text-[20px] font-bold leading-snug text-foreground"
          dangerouslySetInnerHTML={{ __html: rewriteHtml(parsed.questionHtml) }}
        />

        {/* Type info badge */}
        <div className="flex items-center gap-2 text-[14px] font-medium text-muted-foreground bg-muted/30 w-fit px-3 py-1.5 rounded-md border border-border/50">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          <span>{typeInfoText}</span>
        </div>

        {/* Choices */}
        {isInput ? (
          <div className="space-y-3">
            <input
              type="text"
              disabled={submitted}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className={`w-full rounded-xl border-2 bg-background text-foreground p-4 text-[15px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-100 ${
                submitted
                  ? (isCorrect ? 'border-green-500 bg-green-500/5' : 'border-red-500 bg-red-500/5')
                  : 'border-border'
              }`}
              placeholder="Nhập câu trả lời của bạn..."
              onClick={(e) => e.stopPropagation()}
            />
            {submitted && (
              <div className={`flex items-center gap-3 rounded-xl p-4 ${isCorrect ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                {isCorrect ? <Check className="w-5 h-5 text-green-500 stroke-[3] shrink-0" /> : <X className="w-5 h-5 text-red-500 stroke-[3] shrink-0" />}
                <span className="text-sm font-medium">{isCorrect ? 'Chính xác!' : 'Chưa đúng, hãy thử lại.'}</span>
              </div>
            )}
          </div>
        ) : isDropdown ? (
          <div className="space-y-3">
            <ProblemPreviewDropdown
              choices={parsed.choices}
              value={inputValue}
              onChange={setInputValue}
              disabled={submitted}
              submitted={submitted}
              isCorrect={isCorrect}
            />
            {submitted && (
              <div className={`flex items-center gap-3 rounded-xl p-4 ${isCorrect ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                {isCorrect ? <Check className="w-5 h-5 text-green-500 stroke-[3] shrink-0" /> : <X className="w-5 h-5 text-red-500 stroke-[3] shrink-0" />}
                <span className="text-sm font-medium">{isCorrect ? 'Chính xác!' : 'Chưa đúng, hãy thử lại.'}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {parsed.choices.map((choice: any, index: number) => {
              const isSelected = selected.has(choice.id);
              const showCorrectness = submitted && isSelected;
              const isChoiceCorrect = isMulti ? isCorrect : choice.correct;
              const labelLetter = String.fromCharCode(65 + index);

              return (
                <div
                  key={choice.id}
                  className={`group flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all cursor-pointer ${
                    submitted && showCorrectness
                      ? (isChoiceCorrect ? 'bg-green-500/5 ring-1 ring-green-500' : 'bg-red-500/5 ring-1 ring-red-500')
                      : isSelected
                        ? 'bg-primary/5 ring-1 ring-primary'
                        : 'bg-muted/40 hover:bg-muted/80'
                  } ${submitted ? 'cursor-default' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleChoice(choice.id); }}
                >
                  {/* A, B, C, D Box */}
                  <div
                    className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-[16px] font-bold transition-colors ${
                      submitted && showCorrectness
                        ? (isChoiceCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white')
                        : isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-foreground shadow-sm'
                    }`}
                  >
                    {labelLetter}
                  </div>

                  <div
                    className="flex-1 text-[15px] font-medium leading-relaxed text-foreground [&_p]:m-0"
                    dangerouslySetInnerHTML={{ __html: rewriteHtml(choice.html) }}
                  />

                  {/* Checkmark / Result icon */}
                  {submitted && showCorrectness ? (
                    <div className="shrink-0 pl-2">
                      {isChoiceCorrect
                        ? <Check className="h-6 w-6 text-green-500 stroke-[3]" />
                        : <X className="h-6 w-6 text-red-500 stroke-[3]" />
                      }
                    </div>
                  ) : isSelected ? (
                    <div className="shrink-0 pl-2">
                      <Check className="h-6 w-6 text-primary stroke-[2.5]" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Explanation — chỉ hiển thị khi trả lời ĐÚNG */}
        {submitted && isCorrect && parsed.explanationHtml && (
          <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-5">
            <div className="flex items-center gap-2 mb-3 text-green-600 dark:text-green-400">
              <HelpCircle className="h-5 w-5" />
              <span className="font-bold text-sm tracking-wide uppercase">Giải thích</span>
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed text-foreground/90 [&_p]:m-0"
              dangerouslySetInnerHTML={{ __html: rewriteHtml(parsed.explanationHtml) }}
            />
          </div>
        )}

        {/* Hints */}
        {showHint && parsed.hints.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-5">
            <div className="flex items-center gap-2 mb-3 text-amber-600 dark:text-amber-400">
              <HelpCircle className="h-5 w-5" />
              <span className="font-bold text-sm tracking-wide uppercase">Gợi ý</span>
            </div>
            <div className="space-y-2">
              {parsed.hints.map((hint: string, i: number) => (
                <div key={i} className="text-[14px] leading-relaxed text-foreground/90">
                  <span className="font-semibold mr-1">Gợi ý {i + 1}:</span> {hint}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result banner */}
        {submitted && !isInput && !isDropdown && (
          <div className={`flex items-center gap-3 rounded-xl p-4 ${isCorrect ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            {isCorrect ? <Check className="h-5 w-5 text-green-500 stroke-[3] shrink-0" /> : <X className="h-5 w-5 text-red-500 stroke-[3] shrink-0" />}
            <p className="text-sm font-medium text-foreground">{isCorrect ? 'Chính xác!' : 'Chưa đúng, hãy thử lại.'}</p>
          </div>
        )}

        {/* Submit / Retry + Hint buttons */}
        <div className="flex items-center justify-between pt-2">
          {/* Hint button (left) */}
          <div>
            {parsed.hints.length > 0 && !showHint && (
              <button
                className="flex items-center gap-2 rounded-full border-2 border-amber-500/30 bg-amber-500/5 px-5 py-2.5 text-[13px] font-semibold text-amber-600 dark:text-amber-400 transition-all hover:bg-amber-500/10 active:scale-[0.97]"
                onClick={(e) => { e.stopPropagation(); setShowHint(true); }}
              >
                <HelpCircle className="h-4 w-4" />
                Xem gợi ý
              </button>
            )}
          </div>

          {/* Submit / Retry button (right) */}
          <div>
            {!submitted ? (
              <button
                disabled={(isInput || isDropdown ? inputValue.trim().length === 0 : selected.size === 0)}
                onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
                className="rounded-full bg-primary px-8 py-3 text-[14px] font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Xác nhận
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSubmitted(false);
                  setSelected(new Set());
                  setInputValue('');
                  setShowHint(false);
                }}
                className="rounded-full bg-secondary text-secondary-foreground px-8 py-3 text-[14px] font-bold shadow-sm transition-all hover:bg-secondary/80 active:scale-[0.97]"
              >
                Thử lại
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ComponentEditForm ────────────────────────────────────────────────────────

function ComponentEditForm({ blockInfo, courseId, onSaved, onCancel }: {
  blockInfo: any;
  courseId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const category = blockInfo?.category || blockInfo?.block_type || '';

  const [displayName, setDisplayName] = useState(blockInfo?.display_name || '');
  const [htmlContent, setHtmlContent] = useState(typeof blockInfo?.data === 'string' ? blockInfo.data : '');
  const [problemXml, setProblemXml] = useState(typeof blockInfo?.data === 'string' ? blockInfo.data : '');

  const [metadata, setMetadata] = useState<any>(() => {
    const meta = { ...(blockInfo?.metadata || {}) };
    if (category === 'video') {
      let ytId = meta.youtube_id_1_0 || meta.youtube_id;
      if (!ytId && typeof blockInfo?.data === 'string') {
        const xmlMatch = blockInfo.data.match(/youtube_id_1_0="([^"]+)"/);
        if (xmlMatch) ytId = xmlMatch[1];
      }
      if (!ytId) ytId = '3_yD_cEKoCk';
      meta.youtube_id_1_0 = ytId;
    }
    return meta;
  });

  const [cwWords, setCwWords] = useState<CrosswordWord[]>(() => {
    const raw = blockInfo?.metadata?.crossword_data || blockInfo?.crossword_data;
    const parsed = parseMaybeJson(raw);
    // Support both: parsed.words (nested) OR metadata.words (root-level)
    const words = Array.isArray(parsed?.words) ? parsed.words : (Array.isArray(blockInfo?.metadata?.words) ? blockInfo.metadata.words : []);
    return words;
  });

  const [cwKeywordCol, setCwKeywordCol] = useState<number>(() => {
    const raw = blockInfo?.metadata?.crossword_data || blockInfo?.crossword_data;
    const parsed = parseMaybeJson(raw);
    const kc = parsed?.keyword_coordinates || blockInfo?.metadata?.keyword_coordinates;
    if (Array.isArray(kc) && kc.length > 0) {
      return kc[0].col ?? 0;
    }
    return 0;
  });

  const [soQuestionText, setSoQuestionText] = useState(
    blockInfo?.metadata?.question_text || blockInfo?.question_text || ''
  );
  const [soItems, setSoItems] = useState<SortableItem[]>(() => {
    const raw = blockInfo?.metadata?.sortable_data || blockInfo?.sortable_data;
    const parsed = parseMaybeJson(raw);
    // Support both: parsed.items (nested) OR metadata.items (root-level)
    const items = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(blockInfo?.metadata?.items) ? blockInfo.metadata.items : []);
    return items;
  });

  const [diagramData, setDiagramData] = useState<DiagramXBlockData>(() => {
    const raw = blockInfo?.metadata?.diagram_data || blockInfo?.diagram_data;
    const parsed = parseMaybeJson(raw);
    return parsed || { diagrams: [], start_diagram_id: '' };
  });

  const [faqItems, setFaqItems] = useState<FaqItem[]>(() => {
    const raw = blockInfo?.metadata?.faq_data || blockInfo?.faq_data;
    const parsed = parseMaybeJson(raw);
    // Support both: parsed.items (nested) OR metadata.items (root-level)
    const items = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(blockInfo?.metadata?.items) ? blockInfo.metadata.items : []);
    return items;
  });

  const [pdfUrl, setPdfUrl] = useState(
    blockInfo?.metadata?.pdf_url || blockInfo?.pdf_url || ''
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const id = blockInfo?.id;
      if (!id) throw new Error('Block ID không hợp lệ');

      if (category === 'video') {
        const payloadMetadata = { display_name: displayName, ...metadata };
        if (payloadMetadata.start_time === "00:00:00" || payloadMetadata.start_time === "") delete payloadMetadata.start_time;
        if (payloadMetadata.end_time === "00:00:00" || payloadMetadata.end_time === "") delete payloadMetadata.end_time;
        
        const ytId = payloadMetadata.youtube_id_1_0 || '';
        const ytUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : '';
        const payloadData = {
          url: ytUrl,
          video_url: ytUrl,
          encoded_videos: {
            youtube: { url: ytUrl }
          }
        };
        
        return updateXBlock(id, {
          metadata: payloadMetadata,
          data: payloadData as any,
        });
      }
      if (category === 'html') {
        return updateXBlock(id, {
          metadata: { display_name: displayName },
          data: htmlContent,
        });
      }
      if (category === 'problem') {
        return updateXBlock(id, {
          metadata: { display_name: displayName },
          data: problemXml,
        });
      }
      if (category === 'la_crossword') {
        const kwCoords = cwWords.map((_, idx) => ({ row: idx, col: cwKeywordCol }));
        return studioSubmit(id, {
          display_name: displayName,
          crossword_data: JSON.stringify({ words: cwWords, keyword_coordinates: kwCoords }),
        });
      }
      if (category === 'la_sortable') {
        return studioSubmit(id, {
          display_name: displayName,
          question_text: soQuestionText,
          sortable_data: JSON.stringify({ items: soItems }),
        });
      }
      if (category === 'la_diagram') {
        return studioSubmit(id, {
          display_name: displayName,
          diagram_data: JSON.stringify(diagramData),
        });
      }
      if (category === 'la_faq') {
        return studioSubmit(id, {
          display_name: displayName,
          faq_data: JSON.stringify({ items: faqItems }),
        });
      }
      if (category === 'la_pdf') {
        return studioSubmit(id, {
          display_name: displayName,
          pdf_url: pdfUrl,
        });
      }
      return updateXBlock(id, { metadata: { display_name: displayName } });
    },
    onSuccess: () => { toast.success('Đã lưu thành công!'); onSaved(); },
    onError: (err: any) => toast.error('Lưu thất bại: ' + (err?.message || 'Unknown')),
  });

  const renderEditor = () => {
    switch (category) {
      case 'video':
        return (
          <VideoEditor
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            metadata={metadata}
            onMetadataChange={setMetadata}
          />
        );
      case 'html':
        return (
          <HtmlEditor
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            htmlContent={htmlContent}
            onHtmlChange={setHtmlContent}
            courseId={courseId || ''}
          />
        );
      case 'problem':
        return (
          <ProblemEditor
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            problemXml={problemXml}
            onXmlChange={setProblemXml}
          />
        );
      case 'la_crossword':
        return (
          <CrosswordEditor
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            words={cwWords}
            onWordsChange={setCwWords}
            keywordCol={cwKeywordCol}
            onKeywordColChange={setCwKeywordCol}
          />
        );
      case 'la_sortable':
        return (
          <SortableEditor
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            questionText={soQuestionText}
            onQuestionChange={setSoQuestionText}
            items={soItems}
            onItemsChange={setSoItems}
          />
        );
      case 'la_diagram':
        return (
          <DiagramEditor
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            diagramData={diagramData}
            onDiagramDataChange={setDiagramData}
            onSave={() => saveMut.mutate()}
            onCancel={onCancel}
            isSaving={saveMut.isPending}
          />
        );
      case 'la_faq':
        return (
          <FaqEditor
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            items={faqItems}
            onItemsChange={setFaqItems}
          />
        );
      case 'la_pdf':
        return (
          <PdfEditor
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            pdfUrl={pdfUrl}
            onPdfUrlChange={setPdfUrl}
            courseId={courseId}
          />
        );
      default:
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">Tên hiển thị</label>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
            <p className="text-sm text-muted-foreground italic">
              Chưa có editor cho [{category}].
            </p>
          </div>
        );
    }
  };

  if (category === 'la_diagram') {
    return renderEditor();
  }

  return (
    <div className="space-y-5">
      {renderEditor()}
      <DialogFooter className="pt-5 border-t border-border">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="gap-2 min-w-[130px]"
        >
          <Save className="h-4 w-4" />
          {saveMut.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
        </Button>
      </DialogFooter>
    </div>
  );
}
