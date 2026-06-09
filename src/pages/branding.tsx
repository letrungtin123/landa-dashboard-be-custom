/**
 * branding.tsx — Branding Management Page
 * Premium UI cho admin upload/xóa ảnh branding (FE + Admin Dashboard).
 */
import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/utils/tenant-store';
import { useHeaderInfo } from '@/utils/header-store';
import { PageHeader } from '@/components/shared/page-header';
import { getBranding, uploadBrandingImage, deleteBrandingImage } from '@/api/custom-branding';
import { storageUrl } from '@/utils/storage-url';
import {
  Palette, Upload, Trash2, Image as ImageIcon, AlertCircle,
  Loader2, Info, Monitor, Moon, Users, Layers, ImagePlus,
  CheckCircle2, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';

// ── Image slot config ──
interface ImageSlot {
  key: string;
  label: string;
  sizeHint: string;
  description: string;
  icon?: React.ElementType;
}

interface SectionConfig {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  accentColor: string;
  slots: ImageSlot[];
  gridCols: string;
  compact?: boolean;
  portrait?: boolean;     // preview area dọc (cho background images)
  darkPreview?: boolean;  // preview area nền tối (cho logo/icon dễ nhìn)
  isDynamic?: boolean;
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'backgrounds',
    title: 'Ảnh nền trang Login / Register',
    subtitle: 'Ảnh nền panel trái hiển thị trên trang đăng nhập và đăng ký (FE)',
    icon: Layers,
    accentColor: 'violet',
    gridCols: 'grid-cols-1 lg:grid-cols-2',
    portrait: true,
    slots: [
      { key: 'left_panel_bg', label: 'Ảnh nền đăng nhập', sizeHint: '1200×1600px (3:4)', description: 'Ảnh nền panel trái — trang Đăng nhập', icon: Monitor },
      { key: 'register_bg', label: 'Ảnh nền đăng ký', sizeHint: '1200×1600px (3:4)', description: 'Ảnh nền panel trái — trang Đăng ký', icon: Monitor },
    ],
  },
  {
    id: 'logos',
    title: 'Logo',
    subtitle: 'Logo hiển thị trên FE (Login, Header) và Admin Dashboard (Login, Sidebar)',
    icon: Sparkles,
    accentColor: 'blue',
    gridCols: 'grid-cols-2 lg:grid-cols-4',
    darkPreview: true,
    slots: [
      { key: 'white_logo', label: 'Logo trắng', sizeHint: '~300×36px, PNG', description: 'Trang Đăng nhập/Đăng ký (FE) + Đăng nhập (Admin)', icon: Moon },
      { key: 'square_icon', label: 'Biểu tượng vuông', sizeHint: '96×96px', description: 'Cạnh form đăng nhập (FE) và ảnh trên tab trình duyệt', icon: ImageIcon },
      { key: 'header_logo', label: 'Logo — Sáng', sizeHint: '~300×40px', description: 'Header + Sidebar chế độ sáng', icon: Monitor },
      { key: 'header_logo_dark', label: 'Logo — Tối', sizeHint: '~300×40px', description: 'Header + Sidebar chế độ tối', icon: Moon },
    ],
  },
  {
    id: 'people',
    title: 'Ảnh đại diện',
    subtitle: 'Ảnh avatar hiển thị trong badge "Được tin dùng bởi 100+ doanh nghiệp" (FE)',
    icon: Users,
    accentColor: 'emerald',
    gridCols: 'grid-cols-2 md:grid-cols-4',
    compact: true,
    darkPreview: true,
    slots: [
      { key: 'person_1', label: 'Người 1', sizeHint: '96×96px', description: 'Ảnh đại diện #1' },
      { key: 'person_2', label: 'Người 2', sizeHint: '96×96px', description: 'Ảnh đại diện #2' },
      { key: 'person_3', label: 'Người 3', sizeHint: '96×96px', description: 'Ảnh đại diện #3' },
      { key: 'person_4', label: 'Người 4', sizeHint: '96×96px', description: 'Ảnh đại diện #4' },
    ],
  },
];

const MAX_CAROUSEL = 10;

// ── Accent helpers ──
const accentMap: Record<string, { bg: string; border: string; text: string; badge: string; iconBg: string }> = {
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-950/20',
    border: 'border-violet-200 dark:border-violet-800/40',
    text: 'text-violet-700 dark:text-violet-300',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-800/40',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    iconBg: 'bg-gradient-to-br from-blue-500 to-cyan-600',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    border: 'border-emerald-200 dark:border-emerald-800/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800/40',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
  },
};

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function BrandingPage() {
  useHeaderInfo('Branding');
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const queryClient = useQueryClient();
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['branding', activeTenantId],
    queryFn: getBranding,
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: (args: { imageKey: string; file: File }) => uploadBrandingImage(args.imageKey, args.file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding', activeTenantId] });
      toast.success('Upload ảnh thành công');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Lỗi upload ảnh');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (imageKey: string) => deleteBrandingImage(imageKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding', activeTenantId] });
      toast.success('Đã xóa ảnh');
      setDeletingKey(null);
    },
    onError: () => {
      toast.error('Lỗi xóa ảnh');
    },
  });

  const handleFileSelect = useCallback((imageKey: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File quá lớn. Tối đa 5MB');
      return;
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error('Định dạng không hỗ trợ. Chấp nhận: JPEG, PNG, WEBP, SVG, GIF');
      return;
    }
    uploadMutation.mutate({ imageKey, file });
  }, [uploadMutation]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="p-6 space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-72" /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (isError) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-6 rounded-2xl flex items-start gap-4">
          <div className="p-2 rounded-lg bg-destructive/10"><AlertCircle className="h-5 w-5" /></div>
          <div>
            <h3 className="font-semibold text-base">Lỗi tải branding</h3>
            <p className="text-sm mt-1 opacity-80">Không thể kết nối đến server. Vui lòng thử lại sau.</p>
          </div>
        </div>
      </div>
    );
  }

  const images = data?.images || {};
  const carousels = data?.carousels || [];
  const uploadedCount = Object.values(images).filter(Boolean).length + carousels.length;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-6 space-y-8 w-full">
        {/* ── Page Header ── */}
        <PageHeader
          icon={Palette}
          title="Thương hiệu"
          description={`Quản lý ảnh thương hiệu cho ${data?.tenant_name || 'tenant'}`}
          actions={
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border text-sm shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-muted-foreground">Đã upload</span>
              <span className="font-bold text-foreground">{uploadedCount}</span>
              <span className="text-muted-foreground">ảnh</span>
            </div>
          }
        />

        {/* ── Info banner ── */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30">
          <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 shrink-0 mt-0.5">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-semibold">Hướng dẫn</p>
            <p className="leading-relaxed opacity-90">
              Upload ảnh cho từng vị trí bên dưới. Kích thước gợi ý ghi trên mỗi card.
              Nếu chưa upload, hệ thống hiển thị ảnh mặc định. Hỗ trợ: JPEG, PNG, WEBP, SVG, GIF (tối đa 5MB).
            </p>
          </div>
        </div>

        {/* ── Sections ── */}
        {SECTIONS.map((section) => (
          <BrandingSection
            key={section.id}
            section={section}
            images={images}
            onUpload={handleFileSelect}
            onDelete={setDeletingKey}
            uploadingKey={uploadMutation.isPending ? uploadMutation.variables?.imageKey || null : null}
            onPreview={setPreviewImage}
            cacheBuster={dataUpdatedAt}
          />
        ))}

        {/* ── Carousel Section (dynamic) ── */}
        <BrandingSection
          section={{
            id: 'carousel',
            title: 'Logo đối tác',
            subtitle: `Logo đối tác hiển thị dạng cuộn ngang trên trang Đăng nhập (FE). Tối đa ${MAX_CAROUSEL} logo.`,
            icon: Layers,
            accentColor: 'amber',
            gridCols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
            compact: true,
            darkPreview: true,
            slots: Array.from({ length: Math.min(Math.max(carousels.length + 1, 1), MAX_CAROUSEL) }).map((_, idx) => ({
              key: `carousel_${idx + 1}`,
              label: `Đối tác ${idx + 1}`,
              sizeHint: '~200×28px, PNG',
              description: `Logo đối tác #${idx + 1}`,
            })),
          }}
          images={Object.fromEntries(
            carousels.map((path, idx) => [`carousel_${idx + 1}`, path])
          )}
          onUpload={handleFileSelect}
          onDelete={setDeletingKey}
          uploadingKey={uploadMutation.isPending ? uploadMutation.variables?.imageKey || null : null}
          onPreview={setPreviewImage}
        />

        {/* ── Delete Confirmation Dialog ── */}
        <Dialog open={!!deletingKey} onOpenChange={() => setDeletingKey(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Xác nhận xóa ảnh
              </DialogTitle>
              <DialogDescription className="pt-2">
                Bạn có chắc chắn muốn xóa ảnh này? Hệ thống sẽ hiển thị ảnh mặc định thay thế.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
              <Button
                variant="destructive"
                onClick={() => deletingKey && deleteMutation.mutate(deletingKey)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xóa ảnh
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Image Preview Modal ── */}
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="sm:max-w-3xl p-2 bg-black/95 border-white/10">
            <DialogHeader className="sr-only">
              <DialogTitle>{previewImage?.label}</DialogTitle>
              <DialogDescription>Xem trước ảnh</DialogDescription>
            </DialogHeader>
            {previewImage && (
              <div className="relative flex items-center justify-center min-h-[300px] max-h-[80vh]">
                <img
                  src={previewImage.url}
                  alt={previewImage.label}
                  className="max-w-full max-h-[80vh] object-contain rounded-lg"
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section Component
// ═══════════════════════════════════════════════════════════════

function BrandingSection({
  section,
  images,
  onUpload,
  onDelete,
  uploadingKey,
  onPreview,
  cacheBuster,
}: {
  section: SectionConfig;
  images: Record<string, string | null>;
  onUpload: (key: string, file: File) => void;
  onDelete: (key: string) => void;
  uploadingKey: string | null;
  onPreview: (img: { url: string; label: string }) => void;
  cacheBuster?: number;
}) {
  const accent = accentMap[section.accentColor] || accentMap.blue;
  const Icon = section.icon;
  const filled = section.slots.filter((s) => images[s.key]).length;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${accent.iconBg} text-white shadow-sm`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight">{section.title}</h2>
            <Badge variant="outline" className={`text-[10px] px-2 py-0 font-medium ${accent.badge} border-0`}>
              {filled}/{section.slots.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{section.subtitle}</p>
        </div>
      </div>

      {/* Cards grid */}
      <div className={`grid ${section.gridCols} gap-3`}>
        {section.slots.map((slot) => (
          <ImageCard
            key={slot.key}
            slot={slot}
            currentUrl={(() => {
              const raw = storageUrl(images[slot.key]);
              if (!raw) return null;
              // Cache-busting: append timestamp khi data thay đổi
              const sep = raw.includes('?') ? '&' : '?';
              return `${raw}${sep}v=${cacheBuster || 0}`;
            })()}
            onUpload={onUpload}
            onDelete={() => onDelete(slot.key)}
            isUploading={uploadingKey === slot.key}
            compact={section.compact}
            portrait={section.portrait}
            darkPreview={section.darkPreview}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Image Card Component
// ═══════════════════════════════════════════════════════════════

function ImageCard({
  slot,
  currentUrl,
  onUpload,
  onDelete,
  isUploading,
  compact,
  portrait,
  darkPreview,
  onPreview,
}: {
  slot: ImageSlot;
  currentUrl: string | null;
  onUpload: (key: string, file: File) => void;
  onDelete: () => void;
  isUploading: boolean;
  compact?: boolean;
  portrait?: boolean;
  darkPreview?: boolean;
  onPreview: (img: { url: string; label: string }) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(slot.key, file);
  }, [onUpload, slot.key]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handlePreviewClick = () => {
    if (isUploading) return;
    if (currentUrl) {
      onPreview({ url: currentUrl, label: slot.label });
    } else {
      fileInputRef.current?.click();
    }
  };

  // Height classes — portrait dùng aspect-ratio dọc
  const previewHeight = portrait ? 'aspect-[3/4]' : compact ? 'h-24' : 'h-44';

  return (
    <div
      className={`
        group relative rounded-2xl border bg-card overflow-hidden
        transition-all duration-200 ease-out
        hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/20
        hover:border-primary/20
        ${isDragOver ? 'border-primary/50 bg-primary/5 scale-[1.02]' : 'border-border'}
        ${compact ? 'p-3' : 'p-4'}
      `}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
    >
      {/* Status indicator */}
      {currentUrl && (
        <div className="absolute top-2.5 right-2.5 z-10">
          <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 ring-2 ring-card" />
        </div>
      )}

      {/* Preview area */}
      <div
        className={`
          relative rounded-xl overflow-hidden flex items-center justify-center cursor-pointer
          transition-colors duration-200
          ${previewHeight} ${compact ? 'mb-2.5' : 'mb-3'}
          ${currentUrl
            ? (darkPreview ? 'bg-slate-800 dark:bg-muted/10' : 'bg-muted/20 dark:bg-muted/10')
            : 'bg-muted/40 dark:bg-muted/20 border-2 border-dashed border-muted-foreground/15 hover:border-primary/30'
          }
        `}
        onClick={handlePreviewClick}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-2.5">
            <div className="relative">
              <div className="h-10 w-10 rounded-full border-2 border-primary/20" />
              <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-primary" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Đang upload...</span>
          </div>
        ) : currentUrl ? (
          <>
            <img
              src={currentUrl}
              alt={slot.label}
              className={`w-full h-full p-2 transition-transform duration-300 group-hover:scale-105 ${portrait ? 'object-cover rounded-lg' : 'object-contain'}`}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center rounded-xl">
              <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm">
                Nhấn để xem
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">
            <ImagePlus className={compact ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-wide uppercase">
              {isDragOver ? 'Thả ảnh tại đây' : 'Kéo thả hoặc click'}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
        <div className="flex items-center gap-1.5">
          {slot.icon && <slot.icon className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
          <h3 className={`font-semibold leading-tight truncate ${compact ? 'text-xs' : 'text-[13px]'}`}>
            {slot.label}
          </h3>
        </div>
        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-mono tracking-tight bg-muted/60">
          {slot.sizeHint}
        </Badge>
        {!compact && (
          <p className="text-[11px] text-muted-foreground/70 leading-snug">{slot.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className={`flex gap-1.5 ${compact ? 'mt-2' : 'mt-3'}`}>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-7 text-xs gap-1.5 font-medium hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Upload className="h-3 w-3" />
          {currentUrl ? 'Thay ảnh' : 'Tải lên'}
        </Button>
        {currentUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                onClick={onDelete}
                disabled={isUploading}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Xóa ảnh</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(slot.key, file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
