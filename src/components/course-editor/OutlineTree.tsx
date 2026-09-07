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
import { AppTooltip } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { getLocalizedApiError } from '@/utils/localized-error';
import i18n from '@/i18n';

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
  const { t } = useTranslation();
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
      toast.error(t('courseOutline.reorderFailed'));
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
        {t('courseOutline.loadFailed')}
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
        label={t('courseOutline.addChapter')}
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
            label={i18n.t('courseOutline.addSection')}
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
            label={i18n.t('courseOutline.addUnit')}
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
      toast.success(i18n.t('courseOutline.renamed'));
      setIsRenaming(false);
      onStructureChange();
    },
    onError: () => toast.error(i18n.t('courseOutline.renameFailed')),
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
        <span className="flex-1 truncate text-sm">{node.display_name || i18n.t('courseOutline.unnamed')}</span>
      )}

      {/* Status */}
      {!isRenaming && (
        <AppTooltip content={!node.published ? i18n.t('courseOutline.draft') : node.has_changes ? i18n.t('courseOutline.publishedWithChanges') : i18n.t('courseOutline.published')}><span
          className="shrink-0" 

        >
          {!node.published ? (
            <EyeOff className="h-3 w-3 text-slate-400" />
          ) : node.has_changes ? (
            <Globe className="h-3 w-3 text-amber-500" />
          ) : (
            <Globe className="h-3 w-3 text-emerald-500" />
          )}
        </span></AppTooltip>
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
    onSuccess: () => { toast.success(i18n.t('courseOutline.deleted')); },
    onError: (_err, _variables, context) => {
      if (courseId && context?.previousOutline) {
        queryClient.setQueryData(['course-outline-index', courseId], context.previousOutline);
      }
      toast.error(i18n.t('courseOutline.deleteFailed'));
    },
    onSettled: () => {
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course-outline-index', courseId] });
      onStructureChange();
    },
  });

  const publishMut = useMutation({
    mutationFn: () => publishBlock(node.id),
    onSuccess: () => { toast.success(i18n.t('courseOutline.publishedSuccess')); onStructureChange(); },
    onError: () => toast.error(i18n.t('courseOutline.publishFailed')),
  });

  const rollbackMut = useMutation({
    mutationFn: () => discardDraft(node.id),
    onSuccess: () => {
      toast.success(i18n.t('courseOutline.restored'));
      onStructureChange();
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course-outline-index', courseId] });
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
    },
    onError: () => toast.error(i18n.t('courseOutline.restoreFailed')),
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
            <Pencil className="h-3.5 w-3.5 mr-2" /> {i18n.t('courseOutline.rename')}
          </DropdownMenuItem>
          {depth === 0 && (
            <DropdownMenuItem onClick={() => setShowSectionModal(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-2" /> {i18n.t('courseOutline.completionMessage')}
            </DropdownMenuItem>
          )}
          {(!node.published || node.has_changes) && (
            <DropdownMenuItem onClick={() => publishMut.mutate()}>
              <Globe className="h-3.5 w-3.5 mr-2" /> {i18n.t('courseOutline.publish')}
            </DropdownMenuItem>
          )}
          {node.published && node.has_changes && (
            <DropdownMenuItem onClick={() => setShowRollbackDialog(true)}>
              <Undo2 className="h-3.5 w-3.5 mr-2" /> {i18n.t('courseOutline.restore')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> {i18n.t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18n.t('courseOutline.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {i18n.t('courseOutline.deleteNodeDescription', { name: node.display_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n.t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => delMut.mutate()}
            >
              {i18n.t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18n.t('courseOutline.restorePublished')}</AlertDialogTitle>
            <AlertDialogDescription>
              {i18n.t('courseOutline.restorePublishedDescription', { name: node.display_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n.t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => rollbackMut.mutate()}>
              {i18n.t('courseOutline.restore')}
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
  return mode === 'anytime' ? i18n.t('courseOutline.submitAnytime') : i18n.t('courseOutline.submitAfterContent');
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
      toast.success(i18n.t('courseOutline.assignmentUpdated'));
      invalidate();
    },
    onError: () => toast.error(i18n.t('courseOutline.assignmentUpdateFailed')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCourseAssignment(id),
    onSuccess: () => {
      toast.success(i18n.t('courseOutline.assignmentDeleted'));
      setDeleting(null);
      invalidate();
    },
    onError: () => toast.error(i18n.t('courseOutline.assignmentDeleteFailed')),
  });

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <div className="mb-1.5 flex items-center justify-between px-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          <span>{i18n.t('courseOutline.assignment')}</span>
        </div>
        <AppTooltip content={hasAssignment ? i18n.t('courseOutline.onlyOneAssignment') : i18n.t('courseOutline.addAssignment')}><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCreating(true)} disabled={hasAssignment} aria-label={hasAssignment ? i18n.t('courseOutline.onlyOneAssignment') : i18n.t('courseOutline.addAssignment')}>
          <Plus className="h-3.5 w-3.5" />
        </Button></AppTooltip>
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
          {i18n.t('courseOutline.addFirstAssignment')}
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
                  <span className="whitespace-nowrap">{i18n.t('courseOutline.submittedCount', { count: assignment.submitted_count || 0 })}</span>
                  <span className="whitespace-nowrap">{i18n.t('courseOutline.feedbackCount', { count: assignment.feedback_count || 0 })}</span>
                  {assignment.deadline_mode === 'absolute' && assignment.deadline_at && (
                    <span className={`whitespace-nowrap ${isAssignmentExpired(assignment) ? 'font-semibold text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
                      {i18n.t('courseOutline.deadline', { date: formatAssignmentDeadline(assignment.deadline_at) })}
                    </span>
                  )}
                  {assignment.deadline_mode === 'relative_to_enrollment' && assignment.deadline_after_days && (
                    <span className="whitespace-nowrap text-amber-600 dark:text-amber-400">
                      {i18n.t('courseOutline.deadlineAfterDays', { count: assignment.deadline_after_days })}
                    </span>
                  )}
                  {assignment.deadline_mode === 'none' && (
                    <span className="whitespace-nowrap text-muted-foreground">{i18n.t('courseOutline.noDeadline')}</span>
                  )}
                  <span className="whitespace-nowrap">
                    {assignmentUnlockModeLabel(assignment.submission_unlock_mode)}
                  </span>
                  {assignment.grading_enabled && (
                    <span className="whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">{i18n.t('courseOutline.graded')}</span>
                  )}
                  {assignment.attachment_file && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Paperclip className="h-3 w-3" />
                      {i18n.t('courseOutline.attachmentAvailable')}
                    </span>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setEditing(assignment)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> {i18n.t('courseOutline.editAssignment')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateMut.mutate({
                      id: assignment.id,
                      payload: { allow_resubmission: !assignment.allow_resubmission },
                    })}
                  >
                    <Undo2 className="mr-2 h-3.5 w-3.5" />
                    {assignment.allow_resubmission ? i18n.t('courseOutline.disableResubmission') : i18n.t('courseOutline.enableResubmission')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(assignment)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> {i18n.t('common.delete')}
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
            <AlertDialogTitle>{i18n.t('courseOutline.deleteAssignment')}</AlertDialogTitle>
            <AlertDialogDescription>
              {i18n.t('courseOutline.deleteAssignmentDescription', { title: deleting?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n.t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              {i18n.t('common.delete')}
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
      toast.error(i18n.t('courseOutline.attachmentMaxSize'));
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
      allow_resubmission: allowResubmission,
      deadline_enabled: isRelativeDeadline,
      deadline_mode: deadlineMode,
      deadline_after_days: isRelativeDeadline ? deadlineAfterDaysNumber : null,
      submission_unlock_mode: submissionUnlockMode,
      grading_enabled: gradingEnabled,
      attachment_file: attachmentFile,
    }),
    onSuccess: () => {
      toast.success(i18n.t('courseOutline.assignmentCreated'));
      onSaved();
    },
    onError: (err: unknown) => toast.error(getLocalizedApiError(err, i18n.t('courseOutline.assignmentCreateFailed'))),
  });

  const updateMut = useMutation({
    mutationFn: () => updateCourseAssignment(assignment!.id, {
      title,
      question,
      allow_resubmission: allowResubmission,
      submission_unlock_mode: submissionUnlockMode,
      attachment_file: attachmentFile,
      remove_attachment: removeAttachment || undefined,
    }),
    onSuccess: () => {
      toast.success(i18n.t('courseOutline.assignmentSaved'));
      onSaved();
    },
    onError: (err: unknown) => toast.error(getLocalizedApiError(err, i18n.t('courseOutline.assignmentSaveFailed'))),
  });

  const pending = createMut.isPending || updateMut.isPending;
  const deadlineValid = assignment ? true : !isRelativeDeadline || hasValidRelativeDeadline;
  const canSave = title.trim().length > 0 && question.trim().length > 0 && deadlineValid && !pending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden p-0 sm:h-[680px] sm:max-h-[calc(100dvh-3rem)] sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-4 sm:px-6">
          <DialogTitle>{assignment ? i18n.t('courseOutline.editAssignment') : i18n.t('courseOutline.addAssignment')}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{i18n.t('courseOutline.assignmentTitle')}</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={i18n.t('courseOutline.assignmentTitlePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{i18n.t('courseOutline.assignmentQuestion')}</label>
              <textarea
                className="min-h-[132px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={i18n.t('courseOutline.assignmentQuestionPlaceholder')}
              />
            </div>

            <div className="app-liquid-card grid gap-3 rounded-lg border bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">{i18n.t('courseOutline.allowResubmission')}</Label>
                <Switch checked={allowResubmission} onCheckedChange={setAllowResubmission} />
              </div>

              <div className="app-liquid-card rounded-lg border bg-background/60 p-3">
                <div className="mb-2 text-sm font-medium">{i18n.t('courseOutline.submissionCondition')}</div>
                <Select value={submissionUnlockMode} onValueChange={(value) => setSubmissionUnlockMode(value as AssignmentSubmissionUnlockMode)}>
                  <SelectTrigger className="h-10 rounded-lg bg-background font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_content_complete">{i18n.t('courseOutline.submitAfterContent')}</SelectItem>
                    <SelectItem value="anytime">{i18n.t('courseOutline.submitAnytime')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="app-liquid-card rounded-lg border bg-background/60 p-3">
                <Label className="flex items-center gap-2 text-sm">
                  <CalendarClock className="h-4 w-4 text-amber-500" />
                  {i18n.t('courseOutline.submissionDeadline')}
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
                    <SelectItem value="relative_to_enrollment">{i18n.t('courseOutline.deadlineAfterDaysOption')}</SelectItem>
                    <SelectItem value="none">{i18n.t('courseOutline.noDeadline')}</SelectItem>
                  </SelectContent>
                </Select>

                {isRelativeDeadline ? (
                  <div className="app-liquid-card mt-3 rounded-lg border bg-muted/20 p-3">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t('courseOutline.daysFromStart')}</div>
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
                        {i18n.t('courseOutline.deadlineCannotChange')}
                      </div>
                    ) : !hasValidRelativeDeadline ? (
                      <div className="mt-2 text-xs font-medium text-destructive">
                        {i18n.t('courseOutline.daysRangeHint')}
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs font-medium text-muted-foreground">
                      {i18n.t('courseOutline.enrollmentDeadlineHint')}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-xs font-medium text-muted-foreground">
                    {i18n.t('courseOutline.noDeadlineHint')}
                  </div>
                )}
              </div>

              <div className="app-liquid-card rounded-lg border bg-background/60 p-3">
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
                      {i18n.t('courseOutline.attachment')}
                    </Label>
                    <div className="mt-1 text-xs font-medium text-muted-foreground">
                      {i18n.t('courseOutline.attachmentHint')}
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => attachmentInputRef.current?.click()}>
                    {i18n.t('courseOutline.selectFile')}
                  </Button>
                </div>

                <div className="mt-3">
                  {attachmentFile ? (
                    <div className="app-liquid-card flex min-w-0 items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{attachmentFile.name}</div>
                        <div className="text-xs text-muted-foreground">{formatAssignmentFileSize(attachmentFile.size)}</div>
                      </div>
                      <AppTooltip content={i18n.t('courseOutline.deleteFile')}><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={clearAttachment} aria-label={i18n.t('courseOutline.deleteFile')}>
                        <X className="h-4 w-4" />
                      </Button></AppTooltip>
                    </div>
                  ) : existingAttachment ? (
                    <div className="app-liquid-card flex min-w-0 items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{existingAttachment.original_name}</div>
                        <div className="text-xs text-muted-foreground">{formatAssignmentFileSize(existingAttachment.size_bytes)}</div>
                      </div>
                      <AppTooltip content={i18n.t('courseOutline.deleteFile')}><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={clearAttachment} aria-label={i18n.t('courseOutline.deleteFile')}>
                        <X className="h-4 w-4" />
                      </Button></AppTooltip>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed px-3 py-3 text-xs font-medium text-muted-foreground">
                      {i18n.t('courseOutline.noAttachment')}
                    </div>
                  )}
                </div>
              </div>

              {assignment ? (
                <div className="app-liquid-card flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                  <Label className="flex min-w-0 items-center gap-2 text-sm">
                    <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{i18n.t('courseOutline.gradeEachLearner')}</span>
                  </Label>
                  <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {assignment.grading_enabled ? i18n.t('courseOutline.enabled') : i18n.t('courseOutline.disabled')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 p-3">
                  <Label className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-emerald-500" />
                    {i18n.t('courseOutline.gradeEachLearner')}
                  </Label>
                  <Switch checked={gradingEnabled} onCheckedChange={setGradingEnabled} />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-4 pb-5 pt-3 sm:px-6 sm:pb-5">
          <Button variant="outline" onClick={onClose}>{i18n.t('common.cancel')}</Button>
          <Button disabled={!canSave} onClick={() => assignment ? updateMut.mutate() : createMut.mutate()}>
            {pending ? i18n.t('courseOutline.saving') : i18n.t('common.save')}
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
    ? i18n.t('courseOutline.chapter')
    : category === 'sequential'
      ? i18n.t('courseOutline.section')
      : category === 'vertical'
        ? i18n.t('courseOutline.unit')
        : i18n.t('courseOutline.content');

  const addMut = useMutation({
    mutationFn: () => createBlock(parentId, category, name || undefined),
    onSuccess: () => {
      toast.success(i18n.t('courseOutline.added'));
      setIsAdding(false);
      setName('');
      onStructureChange();
    },
    onError: (err: unknown) => {
      const msg = getLocalizedApiError(err, i18n.t('courseOutline.unknownError'));
      toast.error(i18n.t('courseOutline.addFailed', { message: msg }));
    },
  });

  if (isAdding) {
    return (
      <div className="flex items-center gap-1.5 mt-1 px-1">
        <input
          autoFocus
          className="flex h-7 flex-1 rounded border border-input bg-background px-2 text-xs shadow-sm"
          placeholder={i18n.t('courseOutline.namePlaceholder', { type: typeLabel })}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addMut.mutate();
            if (e.key === 'Escape') setIsAdding(false);
          }}
        />
        <Button size="sm" className="h-7 text-xs" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
          {i18n.t('common.save')}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIsAdding(false)}>
          {i18n.t('common.cancel')}
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
      toast.success(i18n.t('courseOutline.completionMessageSaved'));
      queryClient.invalidateQueries({ queryKey: ['section-modal-config', courseId, sectionId] });
      onClose();
    },
    onError: () => toast.error(i18n.t('courseOutline.saveFailed')),
  });

  const updateField = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {i18n.t('courseOutline.completionMessageTitle')}
          </DialogTitle>
          <AppTooltip content={sectionName}><p className="text-xs text-muted-foreground truncate" >{sectionName}</p></AppTooltip>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <div className="h-6 w-48 bg-muted/50 rounded animate-pulse" />
            <div className="h-10 w-full bg-muted/50 rounded animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{i18n.t('courseOutline.showCompletionMessage')}</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => updateField('enabled', v)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                {i18n.t('courseOutline.title')} {form.enabled && <span className="text-red-500">*</span>}
              </label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                placeholder={i18n.t('courseOutline.completionTitlePlaceholder')}
                value={form.title || ''}
                onChange={e => updateField('title', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                {i18n.t('courseOutline.encouragement')} {form.enabled && <span className="text-red-500">*</span>}
              </label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                placeholder={i18n.t('courseOutline.encouragementPlaceholder')}
                value={form.description || ''}
                onChange={e => updateField('description', e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{i18n.t('common.cancel')}</Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={
              saveMut.isPending ||
              (form.enabled && (!form.title?.trim() || !form.description?.trim()))
            }
          >
            {saveMut.isPending ? i18n.t('courseOutline.saving') : i18n.t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
