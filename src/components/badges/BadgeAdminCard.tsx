import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Maximize2, X, Upload, Loader2, BadgeCheck, ImageIcon, Smartphone, RotateCcw } from "lucide-react";
import { cn } from "@/utils/utils";
import { BADGE_CARD_IMAGES, BADGE_ICONS, BADGE_MOBILE_CARD_IMAGES } from "@/data/badgeImages";
import { storageUrl } from "@/utils/storage-url";
import { badgesApi, type BadgeSetting } from "@/api/custom-badges";
import { toast } from "sonner";
import { AppTooltip } from '@/components/ui/tooltip';

interface BadgeAdminCardProps {
  tenantId: string;
  badge: BadgeSetting;
  onToggle: (badgeId: string) => void;
  onTextChange?: (badgeId: string, updates: Partial<Pick<BadgeSetting, "name" | "description">>) => void;
  onImageUploaded?: () => void;
}

export function BadgeAdminCard({ tenantId, badge, onToggle, onTextChange, onImageUploaded }: BadgeAdminCardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [uploadingCard, setUploadingCard] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadingMobileCard, setUploadingMobileCard] = useState(false);
  const cardInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const mobileCardInputRef = useRef<HTMLInputElement>(null);

  // Dynamic images from API, fallback to hardcoded static assets
  const imgSrc = badge.card_image_url
    ? storageUrl(badge.card_image_url)
    : (BADGE_CARD_IMAGES[badge.id] || BADGE_CARD_IMAGES["onboarding_warrior"]);
  const iconSrc = badge.icon_image_url
    ? storageUrl(badge.icon_image_url)
    : (BADGE_ICONS[badge.id] || BADGE_ICONS["onboarding_warrior"]);
  const mobileCardSrc = badge.mobile_card_image_url
    ? storageUrl(badge.mobile_card_image_url)
    : (BADGE_MOBILE_CARD_IMAGES[badge.id] || BADGE_MOBILE_CARD_IMAGES["onboarding_warrior"]);
  const isActive = badge.is_active;
  const uploadButtonClass = "absolute right-1.5 top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 opacity-100 shadow-lg backdrop-blur-md transition-all hover:bg-black/70 hover:text-white sm:right-2 sm:top-2 sm:h-8 sm:w-8 sm:opacity-0 group-hover/card:opacity-100 group-hover/mobile:opacity-100 group-hover/icon:opacity-100";
  const assetLabelClass = "pointer-events-none absolute left-1.5 top-1.5 z-20 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/85 backdrop-blur-md sm:left-2 sm:top-2 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px]";
  const defaultName = badge.default_name || "";
  const defaultDescription = badge.default_description || "";
  const hasTextOverride = (badge.name || "").trim() !== defaultName.trim()
    || (badge.description || "").trim() !== defaultDescription.trim();

  function openPreview(src: string) {
    setPreviewImageSrc(src);
    setShowPreview(true);
  }

  async function handleCardUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCard(true);
    try {
      await badgesApi.uploadCardImage(tenantId, badge.id, file);
      toast.success("Upload ảnh card thành công");
      onImageUploaded?.();
    } catch {
      toast.error("Lỗi upload ảnh card");
    } finally {
      setUploadingCard(false);
      if (cardInputRef.current) cardInputRef.current.value = "";
    }
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      await badgesApi.uploadIconImage(tenantId, badge.id, file);
      toast.success("Upload ảnh icon thành công");
      onImageUploaded?.();
    } catch {
      toast.error("Lỗi upload ảnh icon");
    } finally {
      setUploadingIcon(false);
      if (iconInputRef.current) iconInputRef.current.value = "";
    }
  }

  async function handleMobileCardUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMobileCard(true);
    try {
      await badgesApi.uploadMobileCardImage(tenantId, badge.id, file);
      toast.success("Upload ảnh card mobile thành công");
      onImageUploaded?.();
    } catch {
      toast.error("Lỗi upload ảnh card mobile");
    } finally {
      setUploadingMobileCard(false);
      if (mobileCardInputRef.current) mobileCardInputRef.current.value = "";
    }
  }

  function handleResetText() {
    onTextChange?.(badge.id, {
      name: defaultName,
      description: defaultDescription,
    });
  }

  return (
    <motion.div
      className={cn(
        "relative mx-auto flex w-full min-w-0 max-w-[560px] flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-[0_18px_70px_rgba(15,23,42,0.10)] transition-all dark:bg-[#070b16]/95 dark:shadow-[0_18px_80px_rgba(0,0,0,0.35)] sm:rounded-[28px]",
        isActive
          ? cn("border-primary/25 shadow-primary/10", !showPreview && "hover:border-primary/45 hover:shadow-primary/15 hover:-translate-y-1")
          : "border-border/50 opacity-85 grayscale"
      )}
      layout
    >
      {/* Header */}
      <div className="relative z-30 border-b border-border/50 bg-muted/20 px-4 py-4 dark:border-white/10 dark:bg-white/[0.025] sm:px-5 sm:py-5">
        <div className="mb-4 flex flex-col items-stretch gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <div className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
            isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
          )}>
            <BadgeCheck className="h-3.5 w-3.5" />
            {isActive ? "Đang bật" : "Đã tắt"}
          </div>
          <div className="flex items-center justify-between gap-2 min-[420px]:justify-end">
            <AppTooltip content="Reset title và mô tả về mặc định"><Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetText}
              disabled={!hasTextOverride}
              className="h-7 gap-1.5 whitespace-nowrap rounded-full border-border/70 bg-background/70 px-2.5 text-[11px] font-bold text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-white/[0.04]"
              aria-label="Reset title và mô tả về mặc định"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Mặc định
            </Button></AppTooltip>
            <Switch
              checked={isActive}
              onCheckedChange={() => onToggle(badge.id)}
              className={cn("shrink-0 scale-110 origin-right", isActive && "data-[state=checked]:bg-emerald-500")}
            />
          </div>
        </div>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <label htmlFor={`badge-name-${badge.id}`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Tiêu đề
            </label>
            <Input
              id={`badge-name-${badge.id}`}
              value={badge.name || ""}
              maxLength={200}
              onChange={(event) => onTextChange?.(badge.id, { name: event.target.value })}
              className="h-10 rounded-xl border-border/70 bg-background/80 px-3 text-[15px] font-bold shadow-inner shadow-black/5 focus-visible:ring-2 dark:border-white/10 dark:bg-white/[0.04]"
              placeholder={badge.default_name || "Tiêu đề huy hiệu"}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`badge-description-${badge.id}`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Mô tả
            </label>
            <Textarea
              id={`badge-description-${badge.id}`}
              value={badge.description || ""}
              maxLength={2000}
              rows={2}
              onChange={(event) => onTextChange?.(badge.id, { description: event.target.value })}
              className="min-h-[68px] resize-none rounded-xl border-border/70 bg-background/80 px-3 py-2.5 text-sm font-medium leading-relaxed shadow-inner shadow-black/5 focus-visible:ring-2 dark:border-white/10 dark:bg-white/[0.04]"
              placeholder={badge.default_description || "Mô tả huy hiệu"}
            />
          </div>
        </div>
      </div>

      {/* Assets Showcase */}
      <div className="z-10 flex h-40 justify-center gap-3 bg-muted/20 p-3 dark:bg-white/[0.025] sm:h-48 sm:gap-4 sm:p-5 min-[1800px]:h-[252px]">
        {/* Card Preview */}
        <div 
          className="relative h-full aspect-[4/6.5] cursor-pointer overflow-hidden rounded-2xl border border-border/30 bg-background/60 shadow-[0_12px_30px_rgba(15,23,42,0.14)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-white/[0.04] group/card"
          onClick={() => openPreview(imgSrc)}
        >
          <img 
            src={imgSrc} 
            alt="Card preview" 
            loading="lazy"
            className={cn(
              "w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105",
              badge.id === "omnipotent_master" && "scale-[1.06]"
            )} 
          />

          {/* Shine effect for active card */}
          {isActive && (
            <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-[16px]">
              <motion.div 
                className="absolute top-[-50%] w-[60%] h-[200%] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-25deg]"
                animate={{ left: ["-100%", "250%"] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3.5, ease: "easeInOut" }}
              />
            </div>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/card:opacity-100 z-20">
            <Maximize2 className="h-6 w-6 text-white drop-shadow-md sm:h-8 sm:w-8" />
          </div>
          <div className={assetLabelClass}><ImageIcon className="h-3 w-3" />CARD</div>

          {/* Upload button for card */}
          <AppTooltip content="Upload ảnh card mới"><button
            type="button"
            onClick={(e) => { e.stopPropagation(); cardInputRef.current?.click(); }}
            disabled={uploadingCard}
            className={uploadButtonClass}
            aria-label="Upload ảnh card mới"
          >
            {uploadingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </button></AppTooltip>
          <input ref={cardInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleCardUpload} />
        </div>

        {/* Mobile Card Preview */}
        <div
          className="relative h-full aspect-[84/113] cursor-pointer overflow-hidden rounded-2xl border border-border/30 bg-background/60 shadow-[0_12px_30px_rgba(15,23,42,0.12)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-white/[0.04] group/mobile"
          onClick={() => openPreview(mobileCardSrc)}
        >
          <img
            src={mobileCardSrc}
            alt="Mobile card preview"
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover/mobile:scale-105"
          />

          {isActive && (
            <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-[10px]">
              <motion.div
                className="absolute top-[-50%] w-[60%] h-[200%] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-25deg]"
                animate={{ left: ["-100%", "250%"] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3.5, ease: "easeInOut" }}
              />
            </div>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover/mobile:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/mobile:opacity-100 z-20">
            <Maximize2 className="h-6 w-6 text-white drop-shadow-md sm:h-8 sm:w-8" />
          </div>
          <div className={assetLabelClass}><Smartphone className="h-3 w-3" />MOBILE</div>

          <AppTooltip content="Upload mobile card"><button
            type="button"
            onClick={(e) => { e.stopPropagation(); mobileCardInputRef.current?.click(); }}
            disabled={uploadingMobileCard}
            className={uploadButtonClass}
            aria-label="Upload mobile card"
          >
            {uploadingMobileCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </button></AppTooltip>
          <input ref={mobileCardInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleMobileCardUpload} />
        </div>

        {/* Icon Preview */}
        <div className="relative flex h-full flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-primary/25 bg-[radial-gradient(circle_at_50%_44%,rgba(250,204,21,0.24),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] transition-all hover:border-primary/45 hover:bg-muted/30 dark:border-white/10 group/icon">
          {isActive ? (
            <motion.img 
              src={iconSrc} 
              alt="Icon preview"
              loading="lazy"
              className="h-16 w-16 object-contain filter drop-shadow-[0_0_25px_rgba(255,215,0,0.6)] sm:h-20 sm:w-20 min-[1800px]:h-32 min-[1800px]:w-32"
              animate={{ 
                y: [-6, 6, -6],
                rotateZ: [-3, 3, -3],
                scale: [1, 1.05, 1]
              }}
              transition={{ 
                duration: 4, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
            />
          ) : (
            <img 
              src={iconSrc} 
              alt="Icon preview"
              loading="lazy"
              className="h-16 w-16 object-contain filter drop-shadow-md transition-transform duration-500 group-hover/icon:scale-110 group-hover/icon:-translate-y-2 sm:h-20 sm:w-20 min-[1800px]:h-32 min-[1800px]:w-32"
            />
          )}

          {/* Optional shine for icon container */}
          {isActive && (
            <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-[16px]">
              <motion.div 
                className="absolute top-[-50%] w-[40%] h-[200%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-25deg]"
                animate={{ left: ["-100%", "300%"] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
              />
            </div>
          )}

          <div className="absolute inset-x-0 bottom-3 z-20"><p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-primary/80 transition-colors group-hover/icon:text-primary">ICON</p></div>

          {/* Upload button for icon */}
          <AppTooltip content="Upload ảnh icon mới"><button
            type="button"
            onClick={() => iconInputRef.current?.click()}
            disabled={uploadingIcon}
            className={uploadButtonClass}
            aria-label="Upload ảnh icon mới"
          >
            {uploadingIcon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </button></AppTooltip>
          <input ref={iconInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleIconUpload} />
        </div>
      </div>

      {/* Inactive Overlay */}
      {!isActive && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center rounded-2xl bg-background/55 backdrop-blur-[1.5px] sm:rounded-[28px]">
           <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-4 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md sm:gap-3 sm:px-5 sm:py-2.5 sm:text-sm">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
              </span>
              Đã vô hiệu hóa
           </div>
        </div>
      )}

      {/* Fullscreen Preview Modal */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showPreview && (
            <motion.div 
              className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowPreview(false); setPreviewImageSrc(null); }}
            >
              <motion.div
                className="relative max-h-[85vh] max-w-[90vw] cursor-default overflow-hidden rounded-2xl shadow-2xl sm:rounded-[32px]"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => { setShowPreview(false); setPreviewImageSrc(null); }}
                  className="absolute right-2 top-2 z-10 rounded-full bg-black/40 p-2 text-white/90 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white sm:right-4 sm:top-4 sm:p-3"
                >
                  <X className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
                <img 
                  src={previewImageSrc || imgSrc}
                  alt={`${badge.name} Full Preview`} 
                  className={cn(
                    "block max-h-[85vh] max-w-[90vw] object-contain",
                    badge.id === "omnipotent_master" && previewImageSrc === imgSrc && "scale-[1.06]"
                  )}
                />
                
                {/* Shine effect inside preview */}
                <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-[20px]">
                  <motion.div 
                    className="absolute top-[-50%] w-[60%] h-[200%] bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-25deg]"
                    animate={{ left: ["-100%", "250%"] }}
                    transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}
