/**
 * branding.tsx — Branding Management Page
 * Premium UI cho admin upload/xóa ảnh branding (FE + Admin Dashboard).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenantStore } from '@/utils/tenant-store';
import { useHeaderInfo } from '@/utils/header-store';
import { PageHeader } from '@/components/shared/page-header';
import { getBranding, uploadBrandingImage, deleteBrandingImage } from '@/api/custom-branding';
import { getDashboardContent, updateDashboardContent } from '@/api/custom-dashboard-content';
import type { UpsertDashboardContentPayload } from '@/api/custom-dashboard-content';
import { storageUrl } from '@/utils/storage-url';
import {
  Palette, Upload, Trash2, Image as ImageIcon, AlertCircle,
  Loader2, Info, Monitor, Moon, Users, Layers, ImagePlus,
  CheckCircle2, Sparkles, LayoutDashboard, Save, ArrowRight, Lightbulb, RotateCcw, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';

import heroImg from '@/assets/DasboardPage/hero-card-dashboard.png';
import exploreHeroImg from '@/assets/DasboardPage/explore-hero-illustration.png';

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

        {/* ── Dashboard Content Section ── */}
        <DashboardContentSection />

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
        app-liquid-card group relative rounded-2xl overflow-hidden
        transition-all duration-200 ease-out
        hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/20
        hover:border-primary/20
        ${isDragOver ? 'app-liquid-filter-active scale-[1.02]' : ''}
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

// ═══════════════════════════════════════════════════════════════
// Dashboard Content Section — Edit Hero Card + Tips text
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TIPS = [
  {
    quote: "“Hãy là sự thay đổi mà bạn muốn thấy ở thế giới này”",
    author: "Mahatma Gandhi"
  },
  {
    quote: "“Cách tốt nhất để dự đoán tương lai là tự mình tạo ra nó”",
    author: "Abraham Lincoln"
  }
];

const DEFAULT_BADGE = "SKILLS";
const DEFAULT_TITLE = "Khai phá tiềm năng từ kho tri thức đặc biệt";

const DEFAULT_EXPLORE_BADGE = "COURSE";
const DEFAULT_EXPLORE_TITLE = "Khám phá hành trình học tập của tôi";

function DashboardContentSection() {
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-content', activeTenantId],
    queryFn: getDashboardContent,
    staleTime: 30_000,
  });

  // Local form state
  const [heroBadge, setHeroBadge] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [tip1Title, setTip1Title] = useState('');
  const [tip1Desc, setTip1Desc] = useState('');
  const [tip2Title, setTip2Title] = useState('');
  const [tip2Desc, setTip2Desc] = useState('');
  const [currentPreviewTip, setCurrentPreviewTip] = useState(0);

  // Explore hero card state
  const [exploreHeroBadge, setExploreHeroBadge] = useState('');
  const [exploreHeroTitle, setExploreHeroTitle] = useState('');

  // Sync from server data
  useEffect(() => {
    if (data) {
      setHeroBadge(data.hero_badge || '');
      setHeroTitle(data.hero_title || '');
      const tips = data.tips || [];
      setTip1Title(tips[0]?.title || '');
      setTip1Desc(tips[0]?.desc || '');
      setTip2Title(tips[1]?.title || '');
      setTip2Desc(tips[1]?.desc || '');
      setExploreHeroBadge(data.explore_hero_badge || '');
      setExploreHeroTitle(data.explore_hero_title || '');
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: UpsertDashboardContentPayload) => updateDashboardContent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-content', activeTenantId] });
      toast.success('Đã lưu nội dung Dashboard');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Lỗi lưu nội dung');
    },
  });

  const handleSave = () => {
    const errors: string[] = [];

    // ── Scope 1: Hero Card Dashboard (badge + title) ──
    const hasHeroBadge = !!heroBadge.trim();
    const hasHeroTitle = !!heroTitle.trim();
    if (hasHeroBadge || hasHeroTitle) {
      if (!hasHeroBadge) errors.push('Badge (Hero Card Dashboard)');
      if (!hasHeroTitle) errors.push('Tiêu đề (Hero Card Dashboard)');
    }

    // ── Scope 2: Tips (2 trang, mỗi trang cần đủ câu nói + tác giả) ──
    const hasTip1 = !!(tip1Title.trim() || tip1Desc.trim());
    const hasTip2 = !!(tip2Title.trim() || tip2Desc.trim());
    if (hasTip1 || hasTip2) {
      // Nếu nhập bất kỳ tip nào → cần đủ cả 2 trang
      if (!tip1Title.trim()) errors.push('Câu nói Trang 1');
      if (!tip1Desc.trim()) errors.push('Tác giả Trang 1');
      if (!tip2Title.trim()) errors.push('Câu nói Trang 2');
      if (!tip2Desc.trim()) errors.push('Tác giả Trang 2');
    }

    // ── Scope 3: Explore Hero Card (badge + title) ──
    const hasExploreBadge = !!exploreHeroBadge.trim();
    const hasExploreTitle = !!exploreHeroTitle.trim();
    if (hasExploreBadge || hasExploreTitle) {
      if (!hasExploreBadge) errors.push('Badge (Hero Card Explore)');
      if (!hasExploreTitle) errors.push('Tiêu đề (Hero Card Explore)');
    }

    if (errors.length > 0) {
      toast.error(`Vui lòng nhập đầy đủ: ${errors.join(', ')}`);
      return;
    }

    // Build payload — chỉ gửi data cho scope đã nhập, scope trống gửi null
    const tips: Array<{ title: string; desc: string }> | null =
      (hasTip1 || hasTip2)
        ? [
            { title: tip1Title.trim(), desc: tip1Desc.trim() },
            { title: tip2Title.trim(), desc: tip2Desc.trim() },
          ]
        : null;

    saveMutation.mutate({
      hero_badge: hasHeroBadge ? heroBadge.trim() : null,
      hero_title: hasHeroTitle ? heroTitle.trim() : null,
      tips,
      explore_hero_badge: hasExploreBadge ? exploreHeroBadge.trim() : null,
      explore_hero_title: hasExploreTitle ? exploreHeroTitle.trim() : null,
    });
  };

  const handleReset = () => {
    saveMutation.mutate(
      { hero_badge: null, hero_title: null, tips: null, explore_hero_badge: null, explore_hero_title: null },
      {
        onSuccess: () => {
          setHeroBadge('');
          setHeroTitle('');
          setTip1Title('');
          setTip1Desc('');
          setTip2Title('');
          setTip2Desc('');
          setCurrentPreviewTip(0);
          setExploreHeroBadge('');
          setExploreHeroTitle('');
          queryClient.invalidateQueries({ queryKey: ['dashboard-content', activeTenantId] });
          toast.success('Đã reset về nội dung mặc định');
        },
      },
    );
  };

  // Preview data fallbacks
  const previewBadge = heroBadge.trim() || DEFAULT_BADGE;
  const previewTitle = heroTitle.trim() || DEFAULT_TITLE;
  const previewTips = [];
  if (tip1Title.trim() || tip1Desc.trim()) {
    previewTips.push({ quote: tip1Title.trim(), author: tip1Desc.trim() });
  }
  if (tip2Title.trim() || tip2Desc.trim()) {
    previewTips.push({ quote: tip2Title.trim(), author: tip2Desc.trim() });
  }
  if (previewTips.length === 0) {
    previewTips.push(...DEFAULT_TIPS);
  }

  // Explore preview data fallbacks
  const previewExploreBadge = exploreHeroBadge.trim() || DEFAULT_EXPLORE_BADGE;
  const previewExploreTitle = exploreHeroTitle.trim() || DEFAULT_EXPLORE_TITLE;

  // Reset preview tip index if it exceeds available tips
  useEffect(() => {
    if (currentPreviewTip >= previewTips.length) {
      setCurrentPreviewTip(0);
    }
  }, [previewTips.length, currentPreviewTip]);

  const accent = accentMap.amber;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${accent.iconBg} text-white shadow-sm`}>
          <LayoutDashboard className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Nội dung trang Khám phá và Chương trình học</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Chỉnh sửa text Hero Card, Tips hiển thị trên trang Dashboard và Hero Card trang Explore (FE). Để trống sẽ dùng nội dung mặc định.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="app-liquid-card rounded-2xl p-6 space-y-10">

        {/* ── Hero Card Section ── */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Hero Card</h3>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="hero-badge" className="text-xs font-semibold text-foreground">
                Badge (ví dụ: SKILLS, COURSE)
              </Label>
              <Input
                id="hero-badge"
                value={heroBadge}
                onChange={(e) => setHeroBadge(e.target.value)}
                placeholder="SKILLS"
                maxLength={20}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-title" className="text-xs font-semibold text-foreground">
                Tiêu đề
              </Label>
              <Textarea
                id="hero-title"
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                placeholder="Khai phá tiềm năng từ kho tri thức đặc biệt..."
                maxLength={200}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="app-liquid-card mt-6 rounded-2xl p-6 flex flex-col items-center">
            <div className="w-full max-w-[828px]">
              <div className="mb-4 flex items-center justify-center gap-2">
                <Monitor className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Preview Hero Card (Kích thước PC)</span>
              </div>

              <div
                className="relative w-full overflow-hidden rounded-[32px] min-h-[220px] lg:h-[310px] shadow-sm flex flex-col justify-between p-6 md:p-8"
                style={{
                  border: '1.5px solid var(--primary)',
                  backgroundColor: 'color-mix(in srgb, var(--primary) 4%, transparent)',
                }}
              >
                <div className="relative z-10 w-[55%] md:w-[50%] lg:w-[60%]">
                  <div
                    className="mb-4 inline-flex w-fit whitespace-nowrap items-center justify-center h-[23px] rounded-[41px] px-3 py-1 text-[10px] font-bold uppercase tracking-widest font-['SF_Pro',_sans-serif]"
                    style={{ backgroundColor: "#43FDD7", color: "#000" }}
                  >
                    {previewBadge}
                  </div>
                  <h3
                    className="mb-4 text-[17px] md:text-[24px] lg:text-[26px] font-bold leading-[1.4] text-foreground md:leading-tight overflow-hidden"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {previewTitle}
                  </h3>
                </div>

                <div className="relative z-10 mt-auto inline-flex items-center text-sm font-semibold text-primary gap-1 w-fit cursor-pointer hover:underline">
                  Bắt đầu ngay <ArrowRight className="w-4 h-4" />
                </div>

                {/* Image */}
                <div className="absolute right-2 md:right-0 top-0 bottom-0 md:top-auto h-full w-[50%] md:w-[45%] lg:w-[40%] flex items-center md:items-end justify-end md:pr-8 md:py-6 pointer-events-none select-none z-0">
                  <img
                    src={heroImg}
                    alt="Illustration"
                    className="max-h-[85%] md:max-h-full h-[75%] md:h-full w-auto object-contain object-right md:object-right-bottom"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* ── Tips Section ── */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Tips (tối đa 2 trang)</h3>
          </div>

          <div className="flex flex-col xl:flex-row gap-8 xl:items-start">
            {/* Form Fields */}
            <div className="flex-1 space-y-4">
              {/* Tip 1 */}
              <div className="app-liquid-card rounded-xl p-5 space-y-4">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Trang 1</p>
                <div className="space-y-2">
                  <Label htmlFor="tip1-title" className="text-xs font-medium text-muted-foreground">
                    Câu nói
                  </Label>
                  <Textarea
                    id="tip1-title"
                    value={tip1Title}
                    onChange={(e) => setTip1Title(e.target.value)}
                    placeholder={`\u201cH\u00e3y l\u00e0 s\u1ef1 thay \u0111\u1ed5i m\u00e0 b\u1ea1n mu\u1ed1n th\u1ea5y \u1edf th\u1ebf gi\u1edbi n\u00e0y\u201d`}
                    maxLength={200}
                    rows={2}
                    className="resize-none bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tip1-desc" className="text-xs font-medium text-muted-foreground">
                    Tác giả
                  </Label>
                  <Input
                    id="tip1-desc"
                    value={tip1Desc}
                    onChange={(e) => setTip1Desc(e.target.value)}
                    placeholder="Mahatma Gandhi"
                    maxLength={100}
                    className="h-9 bg-background"
                  />
                </div>
              </div>

              {/* Tip 2 */}
              <div className="app-liquid-card rounded-xl p-5 space-y-4">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Trang 2</p>
                <div className="space-y-2">
                  <Label htmlFor="tip2-title" className="text-xs font-medium text-muted-foreground">
                    Câu nói
                  </Label>
                  <Textarea
                    id="tip2-title"
                    value={tip2Title}
                    onChange={(e) => setTip2Title(e.target.value)}
                    placeholder={`\u201cC\u00e1ch t\u1ed1t nh\u1ea5t \u0111\u1ec3 d\u1ef1 \u0111o\u00e1n t\u01b0\u01a1ng lai l\u00e0 t\u1ef1 m\u00ecnh t\u1ea1o ra n\u00f3\u201d`}
                    maxLength={200}
                    rows={2}
                    className="resize-none bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tip2-desc" className="text-xs font-medium text-muted-foreground">
                    Tác giả
                  </Label>
                  <Input
                    id="tip2-desc"
                    value={tip2Desc}
                    onChange={(e) => setTip2Desc(e.target.value)}
                    placeholder="Abraham Lincoln"
                    maxLength={100}
                    className="h-9 bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="app-liquid-card w-full xl:w-[320px] shrink-0 rounded-2xl p-6 flex flex-col items-center">
              <div className="mb-4 flex items-center justify-center gap-2 w-full">
                <Monitor className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Preview Tips (Kích thước PC)</span>
              </div>

              <div
                className="relative w-full max-w-[240px] shrink-0 rounded-[32px] p-6 flex flex-col shadow-sm mx-auto"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--primary) 4%, transparent)',
                  height: '310px' // Same height as hero card on desktop in FE
                }}
              >
                {/* Header */}
                <div className="flex items-center gap-2 mb-6 text-foreground">
                  <Lightbulb className="w-6 h-6" strokeWidth={2.2} />
                  <h3 className="text-xl font-bold">Tips</h3>
                </div>

                {/* Content (Quote + Author) */}
                <div className="relative flex-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentPreviewTip}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0 flex flex-col justify-start gap-4"
                    >
                      <p
                        className="text-[17px] font-bold leading-[1.6] text-foreground overflow-hidden"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {previewTips[currentPreviewTip]?.quote}
                      </p>
                      <footer className="text-[15px] text-muted-foreground italic mt-0">
                        {previewTips[currentPreviewTip]?.author}
                      </footer>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Footer (Dots) */}
                <div className="flex items-center gap-1.5 mt-auto pt-6 ml-1">
                  {previewTips.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentPreviewTip(idx)}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${currentPreviewTip === idx ? "bg-primary" : "bg-primary/20 hover:bg-primary/40"}`}
                      aria-label={`Go to tip ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* ── Explore Hero Card Section ── */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Hero Card — Trang Explore</h3>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="explore-hero-badge" className="text-xs font-semibold text-foreground">
                Badge (ví dụ: COURSE, TRAINING)
              </Label>
              <Input
                id="explore-hero-badge"
                value={exploreHeroBadge}
                onChange={(e) => setExploreHeroBadge(e.target.value)}
                placeholder="COURSE"
                maxLength={20}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="explore-hero-title" className="text-xs font-semibold text-foreground">
                Tiêu đề
              </Label>
              <Textarea
                id="explore-hero-title"
                value={exploreHeroTitle}
                onChange={(e) => setExploreHeroTitle(e.target.value)}
                placeholder="Khám phá hành trình học tập của tôi..."
                maxLength={200}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="app-liquid-card mt-6 rounded-2xl p-6 flex flex-col items-center">
            <div className="w-full max-w-[1000px]">
              <div className="mb-4 flex items-center justify-center gap-2">
                <Monitor className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Preview Hero Card Explore (Kích thước PC)</span>
              </div>

              <div
                className="relative w-full overflow-hidden rounded-[32px] p-5 pb-3 md:p-6 flex flex-col justify-between min-h-[240px] md:min-h-[250px] lg:h-[270px]"
                style={{
                  border: '1.5px solid var(--primary)',
                  backgroundColor: 'color-mix(in srgb, var(--primary) 4%, transparent)',
                }}
              >
                <div className="relative z-10 flex flex-col flex-1 w-full justify-between">
                  <div>
                    {/* Badge */}
                    <div
                      className="mb-3 inline-flex w-fit whitespace-nowrap items-center justify-center h-[23px] rounded-[41px] px-3 py-1 text-[10px] font-bold uppercase tracking-widest font-['SF_Pro',_sans-serif]"
                      style={{ backgroundColor: "#43FDD7", color: "#000" }}
                    >
                      {previewExploreBadge}
                    </div>

                    {/* Title */}
                    <h1
                      className="mb-4 max-w-[320px] text-[24px] lg:text-[26px] font-bold leading-[32px] text-foreground overflow-hidden"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {previewExploreTitle}
                    </h1>
                  </div>

                  {/* Search bar (preview only — non-functional) */}
                  <div className="mt-auto flex w-full max-w-[340px] items-center gap-2.5 rounded-full border border-border bg-card px-5 py-2.5 shadow-sm">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-[14px] font-normal leading-[18px] text-muted-foreground/60">
                      Tìm khoá học...
                    </span>
                  </div>
                </div>

                {/* Illustration */}
                <img
                  src={exploreHeroImg}
                  alt="Khám phá hành trình học tập"
                  className="hidden md:block absolute right-0 bottom-0 h-full w-auto max-w-[400px] object-contain pointer-events-none select-none z-0 pr-3 mr-20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reset mặc định
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Lưu nội dung
          </Button>
        </div>
      </div>
    </div>
  );
}
