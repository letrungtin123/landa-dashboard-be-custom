import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/utils/utils";
import { BADGE_CARD_IMAGES, BADGE_ICONS } from "@/data/badgeImages";
import type { BadgeSetting } from "@/api/custom-badges";

interface BadgeAdminCardProps {
  badge: BadgeSetting;
  onToggle: (badgeId: string) => void;
}

export function BadgeAdminCard({ badge, onToggle }: BadgeAdminCardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const imgSrc = BADGE_CARD_IMAGES[badge.id] || BADGE_CARD_IMAGES["onboarding_warrior"];
  const iconSrc = BADGE_ICONS[badge.id] || BADGE_ICONS["onboarding_warrior"];
  const isActive = badge.is_active;

  return (
    <motion.div
      className={cn(
        "relative flex flex-col p-6 w-full max-w-[560px] mx-auto rounded-[32px] border bg-background shadow-sm transition-all",
        isActive 
          ? "border-primary/20 shadow-primary/5 hover:border-primary/40 hover:shadow-primary/10 hover:-translate-y-2" 
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
      <div className="flex gap-6 h-[300px] z-10">
        {/* Card Preview */}
        <div 
          className="relative h-full aspect-[4/6.5] rounded-[16px] border border-border/20 shadow-inner overflow-hidden group/card bg-muted/30 cursor-pointer"
          onClick={() => setShowPreview(true)}
        >
          <img 
            src={imgSrc} 
            alt="Card preview" 
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
        </div>

        {/* Icon Preview */}
        <div className="flex-1 h-full rounded-[16px] border border-dashed border-border/50 bg-muted/20 flex flex-col items-center justify-center relative group/icon overflow-hidden transition-colors hover:bg-muted/40 hover:border-border">
          {isActive ? (
            <motion.img 
              src={iconSrc} 
              alt="Icon preview" 
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
      <AnimatePresence>
        {showPreview && (
          <motion.div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm cursor-zoom-out"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              className="relative h-full max-h-[85vh] aspect-[4/6.5] rounded-[32px] overflow-hidden shadow-2xl cursor-default"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowPreview(false)}
                className="absolute top-4 right-4 z-10 p-3 bg-black/40 text-white/90 rounded-full hover:bg-black/80 hover:text-white backdrop-blur-md transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <img 
                src={imgSrc} 
                alt={`${badge.name} Full Preview`} 
                className={cn(
                  "w-full h-full object-cover",
                  badge.id === "omnipotent_master" && "scale-[1.06]"
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
      </AnimatePresence>
    </motion.div>
  );
}
