import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Award, Save, Loader2 } from "lucide-react";
import { PageHeader } from '@/components/shared/page-header';
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from 'react-i18next';

import { Button } from "@/components/ui/button";

import { useTenantStore } from "@/utils/tenant-store";
import { getLocalizedApiError } from "@/utils/localized-error";
import { badgesApi, type BadgeSetting } from "@/api/custom-badges";
import { BadgeAdminCard } from "@/components/badges/BadgeAdminCard";

export default function BadgesPage() {
  const { t } = useTranslation();
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
          toast.error(t('badges.loadFailed'));
        }
      } finally {
        if (!cancelled && sequence === loadSequenceRef.current) setLoadingBadges(false);
      }
    }

    void loadBadges();
    return () => {
      cancelled = true;
    };
  }, [activeTenantId, t]);

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
      toast.success(t('badges.saved'));
    } catch (err: unknown) {
      if (activeTenantIdRef.current === tenantId && saveSequence === saveSequenceRef.current) {
        toast.error(getLocalizedApiError(err, t('badges.saveFailed')));
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
          toast.error(t('badges.imageReloadFailed'));
        }
      })
      .finally(() => {
        if (sequence === loadSequenceRef.current) setLoadingBadges(false);
      });
  }

  return (
    <div className="min-w-0 space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        icon={Award}
        title={t('badges.title')}
        description={t('badges.description')}
        actions={
          <div className="flex min-w-0 items-center gap-3">
            {tenantReady && (
              <Button onClick={handleSave} disabled={saving || loadingBadges} className="gap-2 whitespace-nowrap">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t('badges.saveChanges')}
              </Button>
            )}
          </div>
        }
      />

      {!activeTenantId ? (
        <div className="text-center py-20 text-muted-foreground">
          {t('badges.selectTenant')}
        </div>
      ) : (
        <div className="min-w-0 pt-2 sm:pt-4">
          {loadingBadges || !tenantReady ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : badges.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              {t('badges.empty')}
            </div>
          ) : (
            <motion.div
              className="grid min-w-0 grid-cols-1 gap-4 min-[1180px]:grid-cols-2 min-[1800px]:grid-cols-3 xl:gap-6"
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
