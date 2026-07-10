import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Maximize2, X, Upload, Loader2 } from "lucide-react";
import { cn } from "@/utils/utils";
import { BADGE_CARD_IMAGES, BADGE_ICONS, BADGE_MOBILE_CARD_IMAGES } from "@/data/badgeImages";
import { storageUrl } from "@/utils/storage-url";
import { badgesApi, type BadgeSetting } from "@/api/custom-badges";
import { toast } from "sonner";

interface BadgeAdminCardProps {
  tenantId: string;
  badge: BadgeSetting;
  onToggle: (badgeId: string) => void;
  onImageUploaded?: () => void;
}

export function BadgeAdminCard({ tenantId, badge, onToggle, onImageUploaded }: BadgeAdminCardProps) {
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

  return (
    <motion.div
      className={cn(
        "relative flex flex-col p-6 w-full max-w-[560px] mx-auto rounded-[32px] border bg-background shadow-sm transition-all",
        isActive 
          ? cn("border-primary/20 shadow-primary/5", !showPreview && "hover:border-primary/40 hover:shadow-primary/10 hover:-translate-y-2")
          : "border-border/40 opacity-80 grayscale"
      )}
      layout
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 z-30">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg leading-tight text-foreground truncate" title={badge.name}>
            {badge.name}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 truncate" title={badge.description}>
            {badge.description}
          </p>
        </div>
        <Switch 
          checked={isActive} 
          onCheckedChange={() => onToggle(badge.id)} 
          className={cn("shrink-0 scale-125 origin-right", isActive && "data-[state=checked]:bg-emerald-500")}
        />
      </div>

      {/* Assets Showcase */}
      <div className="flex justify-center gap-4 h-[240px] z-10">
        {/* Card Preview */}
        <div 
          className="relative h-full aspect-[4/6.5] rounded-[16px] border border-border/20 shadow-inner overflow-hidden group/card bg-muted/30 cursor-pointer"
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
            <Maximize2 className="w-8 h-8 text-white drop-shadow-md" />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-md py-2 translate-y-full group-hover/card:translate-y-0 transition-transform z-20">
            <p className="text-[12px] text-center font-bold text-white/90 tracking-widest">CARD</p>
          </div>

          {/* Upload button for card */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); cardInputRef.current?.click(); }}
            disabled={uploadingCard}
            className="absolute top-2 right-2 z-30 p-2 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors backdrop-blur-sm opacity-0 group-hover/card:opacity-100"
            title="Upload ảnh card mới"
          >
            {uploadingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </button>
          <input ref={cardInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleCardUpload} />
        </div>

        {/* Mobile Card Preview */}
        <div
          className="relative h-full aspect-[84/113] rounded-[10px] border border-border/20 shadow-inner overflow-hidden group/mobile bg-muted/30 cursor-pointer"
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
            <Maximize2 className="w-8 h-8 text-white drop-shadow-md" />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-md py-2 translate-y-full group-hover/mobile:translate-y-0 transition-transform z-20">
            <p className="text-[11px] text-center font-bold text-white/90 tracking-widest">MOBILE</p>
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); mobileCardInputRef.current?.click(); }}
            disabled={uploadingMobileCard}
            className="absolute top-2 right-2 z-30 p-2 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors backdrop-blur-sm opacity-0 group-hover/mobile:opacity-100"
            title="Upload mobile card"
          >
            {uploadingMobileCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </button>
          <input ref={mobileCardInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleMobileCardUpload} />
        </div>

        {/* Icon Preview */}
        <div className="flex-1 h-full rounded-[16px] border border-dashed border-border/50 bg-muted/20 flex flex-col items-center justify-center relative group/icon overflow-hidden transition-colors hover:bg-muted/40 hover:border-border">
          {isActive ? (
            <motion.img 
              src={iconSrc} 
              alt="Icon preview"
              loading="lazy"
              className="w-32 h-32 object-contain filter drop-shadow-[0_0_25px_rgba(255,215,0,0.6)]"
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
              className="w-32 h-32 object-contain filter drop-shadow-md transition-transform duration-500 group-hover/icon:scale-110 group-hover/icon:-translate-y-2" 
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

          <div className="absolute inset-x-0 bottom-3 z-20">
            <p className="text-[12px] text-center font-semibold text-muted-foreground uppercase tracking-widest group-hover/icon:text-foreground transition-colors">ICON</p>
          </div>

          {/* Upload button for icon */}
          <button
            type="button"
            onClick={() => iconInputRef.current?.click()}
            disabled={uploadingIcon}
            className="absolute top-2 right-2 z-30 p-2 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors backdrop-blur-sm opacity-0 group-hover/icon:opacity-100"
            title="Upload ảnh icon mới"
          >
            {uploadingIcon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </button>
          <input ref={iconInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleIconUpload} />
        </div>
      </div>

      {/* Inactive Overlay */}
      {!isActive && (
        <div className="absolute inset-0 z-20 pointer-events-none rounded-[32px] bg-background/50 backdrop-blur-[1.5px] flex items-center justify-center">
           <div className="bg-black/75 text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-xl backdrop-blur-md flex items-center gap-3 border border-white/10">
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
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm cursor-zoom-out"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowPreview(false); setPreviewImageSrc(null); }}
            >
              <motion.div
                className="relative max-h-[85vh] max-w-[90vw] rounded-[32px] overflow-hidden shadow-2xl cursor-default"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => { setShowPreview(false); setPreviewImageSrc(null); }}
                  className="absolute top-4 right-4 z-10 p-3 bg-black/40 text-white/90 rounded-full hover:bg-black/80 hover:text-white backdrop-blur-md transition-colors"
                >
                  <X className="w-6 h-6" />
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
