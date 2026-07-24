/**
 * OutlineTree.tsx
 * Hiển thị cây Outline (Sections → Subsections → Units)
 * Dùng đúng Studio API: POST /xblock/ để tạo, DELETE /xblock/{id} để xóa
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type CourseIndexSection,
  type CourseIndexResponse,
  getCourseOutlineIndex,
  createBlock,
  deleteBlock,
  publishBlock,
  discardDraft,
  renameBlock,
  reorderChildren,
} from '@/api/custom-course-authoring';
import {
  createCourseAssignment,
  deleteCourseAssignment,
  getCourseAssignments,
  updateCourseAssignment,
  type AssignmentSubmissionUnlockMode,
  type CourseAssignment,
} from '@/api/custom-assignments';
import {
  ChevronRight, ChevronDown, Plus, Trash2, Globe, EyeOff,
  MoreVertical, Folder, Layout, FileText, Pencil, Check, X, GripVertical, BookOpen, Undo2, ClipboardList,
  CalendarClock, Trophy, Lock, Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles } from 'lucide-react';
import { getSectionModalConfig, updateSectionModalConfig, type SectionModalConfig } from '@/api/custom-courses';

interface OutlineTreeProps {
  courseId: string;
  onSelectUnit: (unitId: string) => void;
  selectedUnitId: string | null;
  focusedBlockId?: string | null;
  onStructureChange?: () => void;
}

function removeNodeFromOutline(node: CourseIndexSection, targetId: string): CourseIndexSection | null {
  if (node.id === targetId) return null;

  const nextChildren = node.children
    ?.map((child) => removeNodeFromOutline(child, targetId))
    .filter((child): child is CourseIndexSection => Boolean(child));
  const nextChildInfo = node.child_info
    ? {
        ...node.child_info,
        children: node.child_info.children
          .map((child) => removeNodeFromOutline(child, targetId))
          .filter((child): child is CourseIndexSection => Boolean(child)),
      }
    : undefined;

  return {
    ...node,
    ...(nextChildren ? { children: nextChildren } : {}),
    ...(nextChildInfo ? { child_info: nextChildInfo } : {}),
  };
}

function nodeContainsId(node: CourseIndexSection, targetId: string): boolean {
  if (node.id === targetId) return true;
  const children = node.children || node.child_info?.children || [];
  return children.some(child => nodeContainsId(child, targetId));
}

export default function OutlineTree({ courseId, onSelectUnit, selectedUnitId, focusedBlockId, onStructureChange }: OutlineTreeProps) {
  const { data: outline, isLoading, isError, refetch } = useQuery({
    queryKey: ['course-outline-index', courseId],
    queryFn: () => getCourseOutlineIndex(courseId),
    staleTime: 30_000,
  });

  const notifyStructureChange = React.useCallback(() => {
    void refetch();
    onStructureChange?.();
  }, [onStructureChange, refetch]);

  const reorderMut = useMutation({
    mutationFn: ({ parentId, childIds }: { parentId: string; childIds: string[] }) => reorderChildren(parentId, childIds),
    onSuccess: () => refetch(),
    onError: () => {
      toast.error('Thay đổi vị trí thất bại');
      refetch();
    },
  });

  const handleReorder = (parentId: string, childIds: string[]) => {
    reorderMut.mutate({ parentId, childIds });
  };

  const structure = outline?.course_structure;

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 bg-muted/50 rounded animate-pulse" style={{ width: `${80 - i * 10}%` }} />
        ))}
      </div>
    );
  }

  if (isError || !structure) {
    return (
      <div className="p-3 text-xs text-destructive bg-destructive/10 rounded-md m-2">
        Lỗi tải mục lục. Kiểm tra lại kết nối hệ thống.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <SortableList
        items={structure.children || []}
        parentId={structure.id}
        onReorder={handleReorder}
      >
        {(items) => items.map((section) => (
          <SectionNode
            key={section.id}
            node={section}
            courseId={courseId}
            onSelectUnit={onSelectUnit}
            selectedUnitId={selectedUnitId}
            focusedBlockId={focusedBlockId}
            onStructureChange={notifyStructureChange}
            onReorder={handleReorder}
          />
        ))}
      </SortableList>
      <AddNodeButton
        parentId={structure.id}
        category="chapter"
        label="Thêm chương"
        onStructureChange={notifyStructureChange}
      />
      <AssignmentOutlineSection courseId={courseId} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Sortable List Wrapper
// ─────────────────────────────────────────────

function SortableList({
  items,
  parentId,
  onReorder,
  children
}: {
  items: CourseIndexSection[];
  parentId: string;
  onReorder: (parentId: string, childIds: string[]) => void;
  children: (items: CourseIndexSection[]) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [localItems, setLocalItems] = useState(items);
  React.useEffect(() => setLocalItems(items), [items]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localItems.findIndex((i) => i.id === active.id);
      const newIndex = localItems.findIndex((i) => i.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newArray = arrayMove(localItems, oldIndex, newIndex);
        setLocalItems(newArray);
        onReorder(parentId, newArray.map((i) => i.id));
      }
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={localItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {children(localItems)}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─────────────────────────────────────────────
// Section Node
// ─────────────────────────────────────────────

function SectionNode({ node, courseId, onSelectUnit, selectedUnitId, focusedBlockId, onStructureChange, onReorder }: {
  node: CourseIndexSection;
  courseId: string;
  onSelectUnit: (id: string) => void;
  selectedUnitId: string | null;
  focusedBlockId?: string | null;
  onStructureChange: () => void;
  onReorder: (parentId: string, childIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  React.useEffect(() => {
    if (focusedBlockId && nodeContainsId(node, focusedBlockId)) setExpanded(true);
  }, [focusedBlockId, node]);

  return (
    <div>
      <NodeRow
        node={node}
        courseId={courseId}
        depth={0}
        icon={<Folder className="h-4 w-4 text-amber-500" />}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        isSelectable={false}
        isSelected={focusedBlockId === node.id}
        onStructureChange={onStructureChange}
        isFocused={focusedBlockId === node.id}
      />
      {expanded && (
        <div className="ml-5 pl-2 border-l border-border/40 mt-0.5 space-y-0.5">
          <SortableList
            items={node.children || []}
            parentId={node.id}
            onReorder={onReorder}
          >
            {(items) => items.map((sub) => (
              <SubsectionNode
                key={sub.id}
                node={sub}
                onSelectUnit={onSelectUnit}
                selectedUnitId={selectedUnitId}
                focusedBlockId={focusedBlockId}
                onStructureChange={onStructureChange}
                onReorder={onReorder}
              />
            ))}
          </SortableList>
          <AddNodeButton
            parentId={node.id}
            category="sequential"
            label="Thêm mục"
            onStructureChange={onStructureChange}
            small
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Subsection Node
// ─────────────────────────────────────────────

function SubsectionNode({ node, onSelectUnit, selectedUnitId, focusedBlockId, onStructureChange, onReorder }: {
  node: CourseIndexSection;
  onSelectUnit: (id: string) => void;
  selectedUnitId: string | null;
  focusedBlockId?: string | null;
  onStructureChange: () => void;
  onReorder: (parentId: string, childIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  React.useEffect(() => {
    if (focusedBlockId && nodeContainsId(node, focusedBlockId)) setExpanded(true);
  }, [focusedBlockId, node]);

  return (
    <div>
      <NodeRow
        node={node}
        depth={1}
        icon={<Layout className="h-4 w-4 text-sky-500" />}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        isSelectable={false}
        isSelected={focusedBlockId === node.id}
        onStructureChange={onStructureChange}
        isFocused={focusedBlockId === node.id}
      />
      {expanded && (
        <div className="ml-5 pl-2 border-l border-border/40 mt-0.5 space-y-0.5">
          <SortableList
            items={node.children || []}
            parentId={node.id}
            onReorder={onReorder}
          >
            {(items) => items.map((unit) => (
              <UnitNode
                key={unit.id}
                node={unit}
                isSelected={selectedUnitId === unit.id || focusedBlockId === unit.id}
                isFocused={focusedBlockId === unit.id}
                onSelect={() => onSelectUnit(unit.id)}
                onStructureChange={onStructureChange}
              />
            ))}
          </SortableList>
          <AddNodeButton
            parentId={node.id}
            category="vertical"
            label="Thêm bài học"
            onStructureChange={onStructureChange}
            small
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Unit Node (leaf)
// ─────────────────────────────────────────────

function UnitNode({ node, isSelected, isFocused, onSelect, onStructureChange }: {
  node: CourseIndexSection;
  isSelected: boolean;
  isFocused?: boolean;
  onSelect: () => void;
  onStructureChange: () => void;
}) {
  return (
    <NodeRow
      node={node}
      depth={2}
      icon={<FileText className="h-4 w-4 text-blue-500" />}
      expanded={false}
      onToggle={onSelect}
      isSelectable
      isSelected={isSelected}
      onStructureChange={onStructureChange}
      isFocused={isFocused}
    />
  );
}

// ─────────────────────────────────────────────
// Generic Node Row
// ─────────────────────────────────────────────

function NodeRow({ node, courseId, depth, icon, expanded, onToggle, isSelectable, isSelected, isFocused, onStructureChange }: {
  node: CourseIndexSection;
  courseId?: string;
  depth: number;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  isSelectable: boolean;
  isSelected: boolean;
  isFocused?: boolean;
  onStructureChange: () => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.display_name);

  // dnd-kit hook
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 50, position: 'relative' as const, opacity: 0.6 } : {})
  };

  const renameMut = useMutation({
    mutationFn: () => renameBlock(node.id, renameValue),
    onSuccess: () => {
      toast.success('Đã đổi tên');
      setIsRenaming(false);
      onStructureChange();
    },
    onError: () => toast.error('Đổi tên thất bại'),
  });

  const hasChildren = !isSelectable && !!node.children?.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center group gap-1 py-1.5 px-2 rounded-md cursor-pointer text-sm transition-colors select-none
        ${isSelected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50 text-foreground/80'}
        ${isFocused ? 'ring-2 ring-primary/40 bg-primary/10' : ''}
        ${isDragging ? 'shadow-lg bg-background border border-border/50 ring-2 ring-primary/20' : ''}`}
      onClick={isRenaming ? undefined : onToggle}
    >
      {/* Drag handle */}
      <div 
        {...attributes} 
        {...listeners} 
        className="shrink-0 flex justify-center cursor-grab hover:text-foreground text-muted-foreground/30 hover:bg-muted-foreground/10 rounded px-0.5 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      {/* Expand chevron (only for non-unit) */}
      <div className="w-4 shrink-0 flex justify-center">
        {hasChildren ? (
          expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : !isSelectable ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />
        ) : null}
      </div>

      {icon}

      {/* Name / Rename */}
      {isRenaming ? (
        <input
          autoFocus
          className="flex-1 h-6 text-sm px-1 rounded border border-input bg-background"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && renameValue) renameMut.mutate();
            if (e.key === 'Escape') setIsRenaming(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate text-sm">{node.display_name || 'Không tên'}</span>
      )}

      {/* Status */}
      {!isRenaming && (
        <span 
          className="shrink-0" 
          title={!node.published ? 'Bản đang sửa' : node.has_changes ? 'Đã công khai, có thay đổi chưa công khai' : 'Đã công khai'}
        >
          {!node.published ? (
            <EyeOff className="h-3 w-3 text-slate-400" />
          ) : node.has_changes ? (
            <Globe className="h-3 w-3 text-amber-500" />
          ) : (
            <Globe className="h-3 w-3 text-emerald-500" />
          )}
        </span>
      )}

      {/* Rename confirm/cancel */}
      {isRenaming && (
        <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => renameMut.mutate()}>
            <Check className="h-3 w-3 text-emerald-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsRenaming(false)}>
            <X className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      )}

      {/* Actions dropdown */}
      {!isRenaming && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
          <NodeActions
            node={node}
            courseId={courseId}
            depth={depth}
            onRename={() => { setIsRenaming(true); setRenameValue(node.display_name); }}
            onStructureChange={onStructureChange}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Node Actions Dropdown
// ─────────────────────────────────────────────

function NodeActions({ node, courseId, depth, onRename, onStructureChange }: {
  node: CourseIndexSection;
  courseId?: string;
  depth?: number;
  onRename: () => void;
  onStructureChange: () => void;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const queryClient = useQueryClient();

  const delMut = useMutation({
    mutationFn: () => deleteBlock(node.id),
    onMutate: async () => {
      setShowDeleteDialog(false);
      if (!courseId) return { previousOutline: undefined };

      const queryKey = ['course-outline-index', courseId];
      await queryClient.cancelQueries({ queryKey });
      const previousOutline = queryClient.getQueryData<CourseIndexResponse>(queryKey);

      queryClient.setQueryData<CourseIndexResponse>(queryKey, (old) => {
        if (!old) return old;
        const nextStructure = removeNodeFromOutline(old.course_structure, node.id);
        if (!nextStructure) return old;
        return { ...old, course_structure: nextStructure };
      });

      return { previousOutline };
    },
    onSuccess: () => { toast.success('Đã xóa'); },
    onError: (_err, _variables, context) => {
      if (courseId && context?.previousOutline) {
        queryClient.setQueryData(['course-outline-index', courseId], context.previousOutline);
      }
      toast.error('Xóa thất bại');
    },
    onSettled: () => {
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course-outline-index', courseId] });
      onStructureChange();
    },
  });

  const publishMut = useMutation({
    mutationFn: () => publishBlock(node.id),
    onSuccess: () => { toast.success('Đã công khai'); onStructureChange(); },
    onError: () => toast.error('Công khai thất bại'),
  });

  const rollbackMut = useMutation({
    mutationFn: () => discardDraft(node.id),
    onSuccess: () => {
      toast.success('Đã khôi phục về bản đã công khai');
      onStructureChange();
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course-outline-index', courseId] });
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
    },
    onError: () => toast.error('Khôi phục thất bại'),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> Đổi tên
          </DropdownMenuItem>
          {depth === 0 && (
            <DropdownMenuItem onClick={() => setShowSectionModal(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-2" /> Lời chúc hoàn thành
            </DropdownMenuItem>
          )}
          {(!node.published || node.has_changes) && (
            <DropdownMenuItem onClick={() => publishMut.mutate()}>
              <Globe className="h-3.5 w-3.5 mr-2" /> Công khai
            </DropdownMenuItem>
          )}
          {node.published && node.has_changes && (
            <DropdownMenuItem onClick={() => setShowRollbackDialog(true)}>
              <Undo2 className="h-3.5 w-3.5 mr-2" /> Khôi phục
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa <span className="font-semibold text-foreground">"{node.display_name}"</span>? Hành động này không thể hoàn tác.
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

      <AlertDialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Khôi phục về bản đã công khai</AlertDialogTitle>
            <AlertDialogDescription>
              Nội dung đang sửa của <span className="font-semibold text-foreground">"{node.display_name}"</span> sẽ được đưa về bản đã công khai gần nhất. Các thay đổi chưa công khai sẽ bị mất.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => rollbackMut.mutate()}>
              Khôi phục
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showSectionModal && courseId && (
        <SectionModalConfigDialog
          courseId={courseId}
          sectionId={node.id}
          sectionName={node.display_name}
          open={showSectionModal}
          onClose={() => setShowSectionModal(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Add Node Button (inline)
// ─────────────────────────────────────────────

function isAssignmentExpired(assignment: CourseAssignment): boolean {
  if (assignment.deadline_mode !== 'absolute' || !assignment.deadline_at) return false;
  return new Date(assignment.deadline_at).getTime() <= Date.now();
}

function formatAssignmentDeadline(value?: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function assignmentUnlockModeLabel(mode?: AssignmentSubmissionUnlockMode): string {
  return mode === 'anytime' ? 'Được nộp khi chưa học xong' : 'Học xong nội dung mới được nộp';
}

const MAX_ASSIGNMENT_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
type AssignmentUpdatePayload = Parameters<typeof updateCourseAssignment>[1];

function formatAssignmentFileSize(value?: number): string {
  if (!value) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

function AssignmentOutlineSection({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CourseAssignment | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<CourseAssignment | null>(null);

  const queryKey = ['course-assignments', courseId];
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => getCourseAssignments(courseId),
    staleTime: 30_000,
  });
  const hasAssignment = data.length > 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AssignmentUpdatePayload }) =>
      updateCourseAssignment(id, payload),
    onSuccess: () => {
      toast.success('Đã cập nhật bài tập');
      invalidate();
    },
    onError: () => toast.error('Cập nhật bài tập thất bại'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCourseAssignment(id),
    onSuccess: () => {
      toast.success('Đã xóa bài tập');
      setDeleting(null);
      invalidate();
    },
    onError: () => toast.error('Xóa bài tập thất bại'),
  });

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <div className="mb-1.5 flex items-center justify-between px-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          <span>Bài tập</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCreating(true)} disabled={hasAssignment} title={hasAssignment ? 'Mỗi khóa học chỉ có 1 bài tập' : 'Thêm bài tập'}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-1 px-2">
          <div className="h-7 rounded-md bg-muted/50 animate-pulse" />
          <div className="h-7 w-4/5 rounded-md bg-muted/40 animate-pulse" />
        </div>
      ) : data.length === 0 ? (
        <button
          onClick={() => setIsCreating(true)}
          className="mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm bài tập đầu tiên
        </button>
      ) : (
        <div className="space-y-0.5">
          {data.map((assignment) => (
            <div
              key={assignment.id}
              className="group mx-1 flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted/50"
            >
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">{assignment.title}</div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-muted-foreground">
                  <span className="whitespace-nowrap">{assignment.submitted_count || 0} đã nộp</span>
                  <span className="whitespace-nowrap">{assignment.feedback_count || 0} phản hồi</span>
                  {assignment.deadline_mode === 'absolute' && assignment.deadline_at && (
                    <span className={`whitespace-nowrap ${isAssignmentExpired(assignment) ? 'font-semibold text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
                      Hạn {formatAssignmentDeadline(assignment.deadline_at)}
                    </span>
                  )}
                  {assignment.deadline_mode === 'relative_to_enrollment' && assignment.deadline_after_days && (
                    <span className="whitespace-nowrap text-amber-600 dark:text-amber-400">
                      Hạn sau {assignment.deadline_after_days} ngày
                    </span>
                  )}
                  {assignment.deadline_mode === 'none' && (
                    <span className="whitespace-nowrap text-muted-foreground">Không có thời hạn</span>
                  )}
                  <span className="whitespace-nowrap">
                    {assignmentUnlockModeLabel(assignment.submission_unlock_mode)}
                  </span>
                  {assignment.grading_enabled && (
                    <span className="whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">Có điểm</span>
                  )}
                  {assignment.attachment_file && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Paperclip className="h-3 w-3" />
                      Có tệp đính kèm
                    </span>
                  )}
                </div>
              </div>
              <span className="mt-1 shrink-0" title={assignment.is_published ? 'Đang hiển thị' : 'Đang ẩn'}>
                {assignment.is_published ? (
                  <Globe className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                )}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setEditing(assignment)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Sửa bài tập
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateMut.mutate({
                      id: assignment.id,
                      payload: { is_published: !assignment.is_published },
                    })}
                  >
                    {assignment.is_published ? <EyeOff className="mr-2 h-3.5 w-3.5" /> : <Globe className="mr-2 h-3.5 w-3.5" />}
                    {assignment.is_published ? 'Ẩn bài tập' : 'Hiển thị bài tập'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateMut.mutate({
                      id: assignment.id,
                      payload: { allow_resubmission: !assignment.allow_resubmission },
                    })}
                  >
                    <Undo2 className="mr-2 h-3.5 w-3.5" />
                    {assignment.allow_resubmission ? 'Tắt nộp lại' : 'Cho phép nộp lại'}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(assignment)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Xóa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <AssignmentDialog
        courseId={courseId}
        assignment={editing}
        open={isCreating || !!editing}
        onClose={() => { setIsCreating(false); setEditing(null); }}
        onSaved={() => {
          setIsCreating(false);
          setEditing(null);
          invalidate();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa bài tập</AlertDialogTitle>
            <AlertDialogDescription>
              Bài tập "{deleting?.title}" sẽ bị ẩn khỏi mục lục và học viên.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type AssignmentFormDeadlineMode = 'none' | 'relative_to_enrollment';

function AssignmentDialog({
  courseId,
  assignment,
  open,
  onClose,
  onSaved,
}: {
  courseId: string;
  assignment: CourseAssignment | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [allowResubmission, setAllowResubmission] = useState(false);
  const [deadlineMode, setDeadlineMode] = useState<AssignmentFormDeadlineMode>('relative_to_enrollment');
  const [deadlineAfterDays, setDeadlineAfterDays] = useState('7');
  const [submissionUnlockMode, setSubmissionUnlockMode] = useState<AssignmentSubmissionUnlockMode>('after_content_complete');
  const [gradingEnabled, setGradingEnabled] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const attachmentInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const nextDeadlineMode: AssignmentFormDeadlineMode = assignment?.deadline_mode === 'none'
      ? 'none'
      : 'relative_to_enrollment';
    setTitle(assignment?.title || '');
    setQuestion(assignment?.question || '');
    setIsPublished(assignment?.is_published ?? true);
    setAllowResubmission(assignment?.allow_resubmission ?? false);
    setDeadlineMode(nextDeadlineMode);
    setDeadlineAfterDays(String(assignment?.deadline_after_days || 7));
    setSubmissionUnlockMode(assignment?.submission_unlock_mode || 'after_content_complete');
    setGradingEnabled(assignment?.grading_enabled ?? false);
    setAttachmentFile(null);
    setRemoveAttachment(false);
  }, [assignment, open]);

  const deadlineAfterDaysNumber = Number(deadlineAfterDays);
  const hasValidRelativeDeadline = Number.isInteger(deadlineAfterDaysNumber)
    && deadlineAfterDaysNumber >= 1
    && deadlineAfterDaysNumber <= 3650;
  const existingAttachment = !removeAttachment ? assignment?.attachment_file : null;
  const isRelativeDeadline = deadlineMode === 'relative_to_enrollment';

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_ASSIGNMENT_ATTACHMENT_SIZE_BYTES) {
      toast.error('Tệp đính kèm không được vượt quá 25MB');
      return;
    }
    setAttachmentFile(file);
    setRemoveAttachment(false);
  }

  function clearAttachment() {
    setAttachmentFile(null);
    if (assignment?.attachment_file) setRemoveAttachment(true);
  }

  const createMut = useMutation({
    mutationFn: () => createCourseAssignment(courseId, {
      title,
      question,
      is_published: isPublished,
      allow_resubmission: allowResubmission,
      deadline_enabled: isRelativeDeadline,
      deadline_mode: deadlineMode,
      deadline_after_days: isRelativeDeadline ? deadlineAfterDaysNumber : null,
      submission_unlock_mode: submissionUnlockMode,
      grading_enabled: gradingEnabled,
      attachment_file: attachmentFile,
    }),
    onSuccess: () => {
      toast.success('Đã tạo bài tập');
      onSaved();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Tạo bài tập thất bại'),
  });

  const updateMut = useMutation({
    mutationFn: () => updateCourseAssignment(assignment!.id, {
      title,
      question,
      is_published: isPublished,
      allow_resubmission: allowResubmission,
      submission_unlock_mode: submissionUnlockMode,
      attachment_file: attachmentFile,
      remove_attachment: removeAttachment || undefined,
    }),
    onSuccess: () => {
      toast.success('Đã lưu bài tập');
      onSaved();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Lưu bài tập thất bại'),
  });

  const pending = createMut.isPending || updateMut.isPending;
  const deadlineValid = assignment ? true : !isRelativeDeadline || hasValidRelativeDeadline;
  const canSave = title.trim().length > 0 && question.trim().length > 0 && deadlineValid && !pending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden p-0 sm:h-[680px] sm:max-h-[calc(100dvh-3rem)] sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-4 sm:px-6">
          <DialogTitle>{assignment ? 'Sửa bài tập' : 'Thêm bài tập'}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tiêu đề</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Bài tập cuối khóa"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Câu hỏi</label>
              <textarea
                className="min-h-[132px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Nhập yêu cầu bài tập cho học viên..."
              />
            </div>

            <div className="grid gap-3 rounded-lg border bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">Hiển thị cho học viên</Label>
                <Switch checked={isPublished} onCheckedChange={setIsPublished} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">Cho phép nộp lại</Label>
                <Switch checked={allowResubmission} onCheckedChange={setAllowResubmission} />
              </div>

              <div className="rounded-lg border bg-background/60 p-3">
                <div className="mb-2 text-sm font-medium">Điều kiện nộp bài</div>
                <Select value={submissionUnlockMode} onValueChange={(value) => setSubmissionUnlockMode(value as AssignmentSubmissionUnlockMode)}>
                  <SelectTrigger className="h-10 rounded-lg bg-background font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_content_complete">Học xong nội dung mới được nộp</SelectItem>
                    <SelectItem value="anytime">Được nộp khi chưa học xong</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border bg-background/60 p-3">
                <Label className="flex items-center gap-2 text-sm">
                  <CalendarClock className="h-4 w-4 text-amber-500" />
                  Thời hạn nộp bài
                </Label>
                <Select
                  value={deadlineMode}
                  onValueChange={(value) => setDeadlineMode(value as AssignmentFormDeadlineMode)}
                  disabled={!!assignment}
                >
                  <SelectTrigger className="mt-3 h-10 w-full rounded-lg bg-background font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relative_to_enrollment">Hạn sau X ngày</SelectItem>
                    <SelectItem value="none">Không có thời hạn</SelectItem>
                  </SelectContent>
                </Select>

                {isRelativeDeadline ? (
                  <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Số ngày tính từ mốc bắt đầu</div>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={deadlineAfterDays}
                      onChange={(event) => setDeadlineAfterDays(event.target.value)}
                      disabled={!!assignment}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                    />
                    {assignment ? (
                      <div className="mt-2 text-xs font-medium text-muted-foreground">
                        Không thể đổi thời hạn sau khi bài tập đã được tạo.
                      </div>
                    ) : !hasValidRelativeDeadline ? (
                      <div className="mt-2 text-xs font-medium text-destructive">
                        Vui lòng nhập số ngày từ 1 đến 3650.
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs font-medium text-muted-foreground">
                      Học viên đã ghi danh trước sẽ được tính từ lúc bài tập được tạo; học viên ghi danh sau sẽ được tính từ lúc ghi danh.
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-xs font-medium text-muted-foreground">
                    Bài tập không có thời hạn nộp.
                  </div>
                )}
              </div>

              <div className="rounded-lg border bg-background/60 p-3">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="sr-only"
                  onChange={handleAttachmentChange}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Label className="flex items-center gap-2 text-sm">
                      <Paperclip className="h-4 w-4 text-primary" />
                      Tệp đính kèm
                    </Label>
                    <div className="mt-1 text-xs font-medium text-muted-foreground">
                      Chỉ 1 tệp, tối đa 25MB, hỗ trợ mọi loại tệp.
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => attachmentInputRef.current?.click()}>
                    Chọn tệp
                  </Button>
                </div>

                <div className="mt-3">
                  {attachmentFile ? (
                    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{attachmentFile.name}</div>
                        <div className="text-xs text-muted-foreground">{formatAssignmentFileSize(attachmentFile.size)}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={clearAttachment} title="Xóa tệp">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : existingAttachment ? (
                    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{existingAttachment.original_name}</div>
                        <div className="text-xs text-muted-foreground">{formatAssignmentFileSize(existingAttachment.size_bytes)}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={clearAttachment} title="Xóa tệp">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed px-3 py-3 text-xs font-medium text-muted-foreground">
                      Chưa có tệp đính kèm.
                    </div>
                  )}
                </div>
              </div>

              {assignment ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                  <Label className="flex min-w-0 items-center gap-2 text-sm">
                    <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">Chấm điểm từng học viên</span>
                  </Label>
                  <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {assignment.grading_enabled ? 'Đang bật' : 'Đang tắt'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 p-3">
                  <Label className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-emerald-500" />
                    Chấm điểm từng học viên
                  </Label>
                  <Switch checked={gradingEnabled} onCheckedChange={setGradingEnabled} />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-4 pb-5 pt-3 sm:px-6 sm:pb-5">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={!canSave} onClick={() => assignment ? updateMut.mutate() : createMut.mutate()}>
            {pending ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddNodeButton({ parentId, category, label, onStructureChange, small = false }: {
  parentId: string;
  category: string;
  label: string;
  onStructureChange: () => void;
  small?: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const typeLabel = category === 'chapter'
    ? 'chương'
    : category === 'sequential'
      ? 'mục'
      : category === 'vertical'
        ? 'bài học'
        : 'nội dung';

  const addMut = useMutation({
    mutationFn: () => createBlock(parentId, category, name || undefined),
    onSuccess: () => {
      toast.success('Đã thêm thành công');
      setIsAdding(false);
      setName('');
      onStructureChange();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Lỗi không xác định';
      toast.error(`Thêm thất bại: ${msg}`);
    },
  });

  if (isAdding) {
    return (
      <div className="flex items-center gap-1.5 mt-1 px-1">
        <input
          autoFocus
          className="flex h-7 flex-1 rounded border border-input bg-background px-2 text-xs shadow-sm"
          placeholder={`Tên ${typeLabel}...`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addMut.mutate();
            if (e.key === 'Escape') setIsAdding(false);
          }}
        />
        <Button size="sm" className="h-7 text-xs" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
          Lưu
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIsAdding(false)}>
          Hủy
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      className={`flex items-center gap-1.5 w-full text-left px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors ${small ? 'py-1 text-xs' : 'py-1.5 text-sm'}`}
    >
      <Plus className="h-3 w-3" />
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// Section Modal Config Dialog
// ─────────────────────────────────────────────

function SectionModalConfigDialog({ courseId, sectionId, sectionName, open, onClose }: {
  courseId: string;
  sectionId: string;
  sectionName: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<SectionModalConfig>>({
    enabled: false,
    title: '',
    description: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['section-modal-config', courseId, sectionId],
    queryFn: () => getSectionModalConfig(courseId, sectionId),
    enabled: open && !!courseId && !!sectionId,
  });

  React.useEffect(() => {
    if (data) {
      setForm({
        enabled: data.enabled,
        title: data.title,
        description: data.description,
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => updateSectionModalConfig(courseId, {
      section_id: sectionId,
      enabled: form.enabled ?? false,
      title: form.title ?? '',
      description: form.description ?? '',
    }),
    onSuccess: () => {
      toast.success('Đã lưu lời chúc hoàn thành');
      queryClient.invalidateQueries({ queryKey: ['section-modal-config', courseId, sectionId] });
      onClose();
    },
    onError: () => toast.error('Lưu thất bại'),
  });

  const updateField = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Lời chúc hoàn thành chương
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate" title={sectionName}>{sectionName}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <div className="h-6 w-48 bg-muted/50 rounded animate-pulse" />
            <div className="h-10 w-full bg-muted/50 rounded animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Hiện lời chúc khi hoàn thành</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => updateField('enabled', v)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Tiêu đề {form.enabled && <span className="text-red-500">*</span>}
              </label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder="Chúc mừng bạn đã hoàn thành!"
                value={form.title || ''}
                onChange={e => updateField('title', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Nội dung khích lệ {form.enabled && <span className="text-red-500">*</span>}
              </label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                placeholder="Bạn đã nỗ lực tuyệt vời để hoàn thành phần này..."
                value={form.description || ''}
                onChange={e => updateField('description', e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={
              saveMut.isPending ||
              (form.enabled && (!form.title?.trim() || !form.description?.trim()))
            }
          >
            {saveMut.isPending ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
