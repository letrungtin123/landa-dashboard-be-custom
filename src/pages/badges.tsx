import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Award, Save, Loader2 } from "lucide-react";
import { PageHeader } from '@/components/shared/page-header';
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";

import { useTenantStore } from "@/utils/tenant-store";
import { badgesApi, type BadgeSetting } from "@/api/custom-badges";
import { BadgeAdminCard } from "@/components/badges/BadgeAdminCard";

export default function BadgesPage() {
  const activeTenantId = useTenantStore((s) => s.activeTenantId);

  const [badges, setBadges] = useState<BadgeSetting[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load Badges when global Tenant is selected
  useEffect(() => {
    if (!activeTenantId) {
      setBadges([]);
      return;
    }
    async function loadBadges() {
      if (!activeTenantId) return;
      setLoadingBadges(true);
      try {
        const result = await badgesApi.getTenantBadges(activeTenantId);
        setBadges(result.data);
      } catch (err) {
        toast.error("Không thể tải cấu hình danh hiệu");
      } finally {
        setLoadingBadges(false);
      }
    }
    loadBadges();
  }, [activeTenantId]);

  function toggleBadge(badgeId: string) {
    setBadges((prev) => 
      prev.map((b) => b.id === badgeId ? { ...b, is_active: !b.is_active } : b)
    );
  }

  function updateBadgeText(badgeId: string, updates: Partial<Pick<BadgeSetting, "name" | "description">>) {
    setBadges((prev) =>
      prev.map((b) => b.id === badgeId ? { ...b, ...updates } : b)
    );
  }
  async function handleSave() {
    if (!activeTenantId) return;
    setSaving(true);
    try {
      const payload = badges.map(b => ({
        badge_id: b.id,
        is_active: b.is_active,
        name: b.name,
        description: b.description,
      }));
      await badgesApi.updateTenantBadges(activeTenantId, payload);
      const result = await badgesApi.getTenantBadges(activeTenantId);
      setBadges(result.data);
      toast.success("Đã lưu cấu hình danh hiệu thành công");
    } catch (err) {
      toast.error("Lỗi khi lưu cấu hình danh hiệu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={Award}
        title="Quản lý Danh hiệu"
        description="Bật/tắt các danh hiệu (Badges) cho tenant hiện tại"
        actions={
          <div className="flex items-center gap-3">
            {activeTenantId && (
              <Button onClick={handleSave} disabled={saving || loadingBadges} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu thay đổi
              </Button>
            )}
          </div>
        }
      />

      {!activeTenantId ? (
        <div className="text-center py-20 text-muted-foreground">
          Vui lòng chọn Tenant từ thanh điều hướng (Header) để tiếp tục
        </div>
      ) : (
        <div className="pt-4">
          {loadingBadges ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : badges.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              Không có danh hiệu nào
            </div>
          ) : (
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.05 }
                }
              }}
            >
              <AnimatePresence>
                {badges.map((b) => (
                  <motion.div
                    key={b.id}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 }
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  >
                    <BadgeAdminCard tenantId={activeTenantId} badge={b} onToggle={toggleBadge} onTextChange={updateBadgeText} onImageUploaded={() => {
                      // Reload badges to get new image URLs
                      if (!activeTenantId) return;
                      badgesApi.getTenantBadges(activeTenantId).then(result => setBadges(result.data)).catch(() => {});
                    }} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
