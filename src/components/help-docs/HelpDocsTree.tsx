/**
 * HelpDocsTree.tsx
 * Cây folder cho Help Docs — Folder → Pages
 * Superuser: thêm/sửa/xóa folder + page
 * Staff: chỉ xem, không có nút action
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, ChevronDown, Plus, Trash2, Folder, FileText,
  MoreVertical, Pencil, Check, X, BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { HelpFolder, HelpPageSummary } from '@/api/custom-help-docs';
import {
  createHelpFolder, updateHelpFolder, deleteHelpFolder,
  createHelpPage, deleteHelpPage,
} from '@/api/custom-help-docs';
import { useAuthStore } from '@/utils/store';

interface HelpDocsTreeProps {
  folders: HelpFolder[];
  pages: HelpPageSummary[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  isSuperuser: boolean;
}

export default function HelpDocsTree({
  folders, pages, selectedPageId, onSelectPage, isSuperuser,
}: HelpDocsTreeProps) {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAdd = hasPermission('help_docs', 'can_add');
  const canEdit = hasPermission('help_docs', 'can_edit');
  const canDelete = hasPermission('help_docs', 'can_delete');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['help-folders'] });
    queryClient.invalidateQueries({ queryKey: ['help-pages'] });
  };

  return (
    <div className="space-y-1">
      {folders.map((folder) => {
        const folderPages = pages.filter((p) => p.folder_id === folder.id);
        return (
          <FolderNode
            key={folder.id}
            folder={folder}
            pages={folderPages}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
            isSuperuser={isSuperuser}
            onStructureChange={invalidate}
          />
        );
      })}
      {canAdd && (
        <AddFolderButton onStructureChange={invalidate} />
      )}
      {folders.length === 0 && !canAdd && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
          <BookOpen className="h-10 w-10 opacity-30" />
          <p className="text-sm">Chưa có tài liệu nào</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Folder Node
// ─────────────────────────────────────────────

function FolderNode({ folder, pages, selectedPageId, onSelectPage, isSuperuser, onStructureChange }: {
  folder: HelpFolder;
  pages: HelpPageSummary[];
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  isSuperuser: boolean;
  onStructureChange: () => void;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAdd = hasPermission('help_docs', 'can_add');
  const canEdit = hasPermission('help_docs', 'can_edit');
  const canDelete = hasPermission('help_docs', 'can_delete');
  const [expanded, setExpanded] = useState(pages.some((p) => p.id === selectedPageId));
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.title);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const renameMut = useMutation({
    mutationFn: () => updateHelpFolder(folder.id, { title: renameValue }),
    onSuccess: () => { toast.success('Đã đổi tên folder'); setIsRenaming(false); onStructureChange(); },
    onError: () => toast.error('Đổi tên thất bại'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteHelpFolder(folder.id),
    onSuccess: () => { toast.success('Đã xóa folder'); onStructureChange(); },
    onError: () => toast.error('Xóa thất bại'),
  });

  return (
    <div>
      {/* Folder row */}
      <div
        className="flex items-center group gap-1.5 py-2 px-2.5 rounded-lg cursor-pointer text-sm transition-all select-none hover:bg-muted/50"
        onClick={isRenaming ? undefined : () => setExpanded(!expanded)}
      >
        <div className="w-4 shrink-0 flex justify-center">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </div>

        <Folder className="h-4 w-4 text-amber-500 shrink-0" />

        {isRenaming ? (
          <input
            autoFocus
            className="flex-1 h-6 text-sm px-1.5 rounded border border-input bg-background"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue) renameMut.mutate();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate text-sm font-medium">{folder.title}</span>
        )}

        {/* Page count badge */}
        {!isRenaming && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
            {pages.length}
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

        {/* Actions */}
        {!isRenaming && (canEdit || canDelete) && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => { setIsRenaming(true); setRenameValue(folder.title); }}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Đổi tên
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Xóa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Children */}
      {expanded && (
        <div className="ml-5 pl-2 border-l border-border/40 mt-0.5 space-y-0.5">
          {pages.map((page) => (
            <PageNode
              key={page.id}
              page={page}
              isSelected={selectedPageId === page.id}
              onSelect={() => onSelectPage(page.id)}
              isSuperuser={isSuperuser}
              onStructureChange={onStructureChange}
            />
          ))}
          {canAdd && (
            <AddPageButton folderId={folder.id} onStructureChange={onStructureChange} />
          )}
        </div>
      )}

      {/* Delete dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa folder</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa <span className="font-semibold text-foreground">"{folder.title}"</span>?
              Tất cả {pages.length} trang trong folder cũng sẽ bị xóa. Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate()}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────
// Page Node (leaf)
// ─────────────────────────────────────────────

function PageNode({ page, isSelected, onSelect, isSuperuser, onStructureChange }: {
  page: HelpPageSummary;
  isSelected: boolean;
  onSelect: () => void;
  isSuperuser: boolean;
  onStructureChange: () => void;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canDelete = hasPermission('help_docs', 'can_delete');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMut = useMutation({
    mutationFn: () => deleteHelpPage(page.id),
    onSuccess: () => { toast.success('Đã xóa trang'); onStructureChange(); },
    onError: () => toast.error('Xóa thất bại'),
  });

  return (
    <>
      <div
        className={`flex items-center group gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-sm transition-all select-none
          ${isSelected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50 text-foreground/80'}`}
        onClick={onSelect}
      >
        <FileText className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-primary' : 'text-blue-500'}`} />
        <span className="flex-1 truncate">{page.title}</span>

        {/* Published status */}
        <span className="shrink-0" title={page.is_published ? 'Đã xuất bản' : 'Bản nháp'}>
          <div className={`w-1.5 h-1.5 rounded-full ${page.is_published ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        </span>

        {/* Delete action (superuser only) */}
        {canDelete && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost" size="icon" className="h-5 w-5"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa trang</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa <span className="font-semibold text-foreground">"{page.title}"</span>?
              Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate()}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─────────────────────────────────────────────
// Add Folder Button
// ─────────────────────────────────────────────

function AddFolderButton({ onStructureChange }: { onStructureChange: () => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  const addMut = useMutation({
    mutationFn: () => createHelpFolder({ title: name }),
    onSuccess: () => {
      toast.success('Đã tạo folder');
      setIsAdding(false);
      setName('');
      onStructureChange();
    },
    onError: () => toast.error('Tạo folder thất bại'),
  });

  if (isAdding) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 px-1">
        <input
          autoFocus
          className="flex h-7 flex-1 rounded border border-input bg-background px-2 text-xs shadow-sm"
          placeholder="Tên folder..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) addMut.mutate();
            if (e.key === 'Escape') setIsAdding(false);
          }}
        />
        <Button size="sm" className="h-7 text-xs" onClick={() => addMut.mutate()} disabled={addMut.isPending || !name.trim()}>
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
      className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      <Plus className="h-3.5 w-3.5" />
      Thêm Folder
    </button>
  );
}

// ─────────────────────────────────────────────
// Add Page Button
// ─────────────────────────────────────────────

function AddPageButton({ folderId, onStructureChange }: {
  folderId: string;
  onStructureChange: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  const addMut = useMutation({
    mutationFn: () => createHelpPage({ folder_id: folderId, title: name }),
    onSuccess: () => {
      toast.success('Đã tạo trang');
      setIsAdding(false);
      setName('');
      onStructureChange();
    },
    onError: () => toast.error('Tạo trang thất bại'),
  });

  if (isAdding) {
    return (
      <div className="flex items-center gap-1.5 mt-1 px-1">
        <input
          autoFocus
          className="flex h-7 flex-1 rounded border border-input bg-background px-2 text-xs shadow-sm"
          placeholder="Tên trang..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) addMut.mutate();
            if (e.key === 'Escape') setIsAdding(false);
          }}
        />
        <Button size="sm" className="h-7 text-xs" onClick={() => addMut.mutate()} disabled={addMut.isPending || !name.trim()}>
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
      className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      <Plus className="h-3 w-3" />
      Thêm trang
    </button>
  );
}
