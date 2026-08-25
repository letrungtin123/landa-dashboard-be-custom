import { useState, useEffect, useRef } from "react";
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
  const [loadedTenantId, setLoadedTenantId] = useState<string | null>(null);
  const activeTenantIdRef = useRef(activeTenantId);
  const loadSequenceRef = useRef(0);
  const saveSequenceRef = useRef(0);

  activeTenantIdRef.current = activeTenantId;
  const tenantReady = Boolean(activeTenantId && loadedTenantId === activeTenantId);

  // Scope every response to the tenant that initiated it.
  useEffect(() => {
    const tenantId = activeTenantId;
    const sequence = ++loadSequenceRef.current;
    let cancelled = false;

    saveSequenceRef.current += 1;
    setSaving(false);
    setBadges([]);
    setLoadedTenantId(null);

    if (!tenantId) {
      setLoadingBadges(false);
      return () => { cancelled = true; };
    }

    const requestedTenantId: string = tenantId;
    setLoadingBadges(true);
    async function loadBadges() {
      try {
        const result = await badgesApi.getTenantBadges(requestedTenantId);
        if (cancelled || sequence !== loadSequenceRef.current) return;
        setBadges(result.data);
        setLoadedTenantId(requestedTenantId);
      } catch {
        if (!cancelled && sequence === loadSequenceRef.current) {
          toast.error("Không thể tải cấu hình danh hiệu");
        }
      } finally {
        if (!cancelled && sequence === loadSequenceRef.current) setLoadingBadges(false);
      }
    }

    void loadBadges();
    return () => {
      cancelled = true;
    };
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
    if (!activeTenantId || loadedTenantId !== activeTenantId) return;
    const tenantId = loadedTenantId;
    const saveSequence = ++saveSequenceRef.current;
    setSaving(true);
    try {
      const payload = badges.map((badge) => ({
        badge_id: badge.id,
        is_active: badge.is_active,
        name: badge.name,
        description: badge.description,
      }));
      await badgesApi.updateTenantBadges(tenantId, payload);
      if (activeTenantIdRef.current !== tenantId || saveSequence !== saveSequenceRef.current) return;

      const loadSequence = ++loadSequenceRef.current;
      const result = await badgesApi.getTenantBadges(tenantId);
      if (activeTenantIdRef.current !== tenantId || loadSequence !== loadSequenceRef.current) return;
      setBadges(result.data);
      setLoadedTenantId(tenantId);
      toast.success("Đã lưu cấu hình danh hiệu thành công");
    } catch {
      if (activeTenantIdRef.current === tenantId && saveSequence === saveSequenceRef.current) {
        toast.error("Lỗi khi lưu cấu hình danh hiệu");
      }
    } finally {
      if (saveSequence === saveSequenceRef.current) setSaving(false);
    }
  }

  function handleImageUploaded(tenantId: string) {
    if (activeTenantIdRef.current !== tenantId || loadedTenantId !== tenantId) return;
    const sequence = ++loadSequenceRef.current;
    setLoadingBadges(true);
    badgesApi.getTenantBadges(tenantId)
      .then((result) => {
        if (activeTenantIdRef.current !== tenantId || sequence !== loadSequenceRef.current) return;
        setBadges(result.data);
        setLoadedTenantId(tenantId);
      })
      .catch(() => {
        if (activeTenantIdRef.current === tenantId && sequence === loadSequenceRef.current) {
          toast.error("Không thể tải lại ảnh danh hiệu");
        }
      })
      .finally(() => {
        if (sequence === loadSequenceRef.current) setLoadingBadges(false);
      });
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={Award}
        title="Quản lý Danh hiệu"
        description="Bật/tắt các danh hiệu (Badges) cho tenant hiện tại"
        actions={
          <div className="flex items-center gap-3">
            {tenantReady && (
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
          {loadingBadges || !tenantReady ? (
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
                    key={`${loadedTenantId}:${b.id}`}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 }
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  >
                    <BadgeAdminCard
                      tenantId={loadedTenantId!}
                      badge={b}
                      onToggle={toggleBadge}
                      onTextChange={updateBadgeText}
                      onImageUploaded={() => handleImageUploaded(loadedTenantId!)}
                    />
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
