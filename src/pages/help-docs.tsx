/**
 * help-docs.tsx — Help Docs Page
 * Layout 2 panel: cây folder (trái) + editor/viewer (phải)
 * Giống Course Editor nhưng cho Help Docs.
 */
import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { useTenantStore } from '@/utils/tenant-store';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/utils/store';
import { useHeaderInfo } from '@/utils/header-store';
import { getHelpFolders, getHelpPages } from '@/api/custom-help-docs';
import HelpDocsTree from '@/components/help-docs/HelpDocsTree';
import HelpPageEditor from '@/components/help-docs/HelpPageEditor';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BookOpen, Menu, HelpCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 560;

export default function HelpDocsPage() {
  useHeaderInfo('Help Docs');
  const user = useAuthStore((s) => s.user);
  const canManageHelpDocs = user?.role === 'superadmin';
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);

  const handleSidebarResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = startWidth + moveEvent.clientX - startX;
      setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, nextWidth)));
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [sidebarWidth]);

  const { data: foldersData, isLoading: foldersLoading, isError: foldersError } = useQuery({
    queryKey: ['help-folders', activeTenantId],
    queryFn: getHelpFolders,
    staleTime: 30_000,
  });

  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ['help-pages', activeTenantId],
    queryFn: () => getHelpPages(),
    staleTime: 30_000,
  });

  const folders = foldersData?.folders || [];
  const pages = pagesData?.pages || [];
  const isLoading = foldersLoading || pagesLoading;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)] p-6 gap-6">
        <div className="w-80 space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" style={{ width: `${90 - i * 8}%` }} />
          ))}
        </div>
        <div className="flex-1">
          <Skeleton className="h-[500px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (foldersError) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border-l-4 border-destructive text-destructive p-5 rounded-xl flex gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">Lỗi tải Help Docs</h3>
            <p className="text-sm mt-1 opacity-80">
              Không thể kết nối đến server. Kiểm tra lại kết nối.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const treeContent = (
    <HelpDocsTree
      folders={folders}
      pages={pages}
      selectedPageId={selectedPageId}
      onSelectPage={setSelectedPageId}
      canManage={canManageHelpDocs}
    />
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      <div className="px-6 pt-3 shrink-0">
        <PageHeader
          icon={HelpCircle}
          title="Hướng dẫn sử dụng"
          description="Tài liệu hướng dẫn và trợ giúp"
        />
      </div>
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Help Docs</h2>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 flex gap-2">
              <Menu className="h-4 w-4" />
              Mục lục
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] p-0 flex flex-col">
            <div className="p-4 border-b border-border bg-background/80 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h2 className="text-base font-bold text-foreground">Help Docs</h2>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 opacity-60">
                Tài liệu hướng dẫn sử dụng
              </p>
            </div>
            <div className="p-3 flex-1 overflow-y-auto">
              {treeContent}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar: Folder Tree */}
      <div
        className="relative hidden md:flex border-r border-border bg-muted/20 flex-col shrink-0"
        style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN_WIDTH, maxWidth: SIDEBAR_MAX_WIDTH }}
      >
        <div className="p-4 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold text-foreground">Help Docs</h2>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 opacity-60">
            Tài liệu hướng dẫn sử dụng
          </p>
        </div>
        <div className="p-3 flex-1 overflow-y-auto">
          {treeContent}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Điều chỉnh chiều rộng mục lục"
          tabIndex={0}
          onPointerDown={handleSidebarResizeStart}
          className="group absolute -right-1 top-0 z-20 flex h-full w-2 cursor-col-resize items-center justify-center outline-none transition-colors hover:bg-primary/5 focus-visible:bg-primary/10"
        >
          <div className="h-10 w-0.5 rounded-full bg-border transition-colors group-hover:bg-primary/30" />
        </div>
      </div>

      {/* Main Content: Page Editor/Viewer */}
      <div className="flex-1 overflow-y-auto bg-background/50">
        {selectedPageId ? (
          <div className="p-4 md:p-6 max-w-4xl">
            <HelpPageEditor
              key={selectedPageId}
              pageId={selectedPageId}
              canManage={canManageHelpDocs}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground flex-col gap-4">
            <div className="w-20 h-20 bg-muted/40 rounded-full flex items-center justify-center shadow-inner">
              <BookOpen className="h-8 w-8 opacity-30" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium">Chọn trang để xem</p>
              <p className="text-sm opacity-60 mt-1">
                {canManageHelpDocs
                  ? 'Chọn trang ở sidebar trái hoặc tạo folder/trang mới'
                  : 'Chọn trang ở sidebar trái để đọc hướng dẫn'
                }
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
