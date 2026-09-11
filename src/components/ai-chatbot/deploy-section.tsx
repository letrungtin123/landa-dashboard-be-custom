// ═══════════════════════════════════════════════════════════════
// Deploy Section — Bot assignment management for Admin/Learner FE
// Moved from bot-detail to top-level AI Chatbot page
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Rocket, Bot, Loader2, Database, Drama, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fetchBots, fetchKnowledgebases, type Chatbot, type Knowledgebase } from "@/api/custom-ai-chatbot";
import {
  fetchAssignments, assignBot, unassignBot,
  fetchLessonAuthorSettings, assignLessonAuthorKb, unassignLessonAuthorKb,
  type BotAssignment, type ChatTarget, type LessonAuthorSettings,
} from "@/api/custom-chat";
import { storageUrl } from "@/utils/storage-url";
import { useAuthStore } from "@/utils/store";
import { getLocalizedApiError } from "@/utils/localized-error";
import { useTenantStore } from "@/utils/tenant-store";

const TARGETS = [
  { key: "admin" as const, labelKey: "aiChatbot.targetAdmin", descriptionKey: "aiChatbot.targetAdminDescription" },
  { key: "learner" as const, labelKey: "aiChatbot.targetLearner", descriptionKey: "aiChatbot.targetLearnerDescription" },
  { key: "lesson_author" as const, labelKey: "aiChatbot.targetLessonAuthor", descriptionKey: "aiChatbot.targetLessonAuthorDescription" },
];

export function DeploySection() {
  const { t } = useTranslation();
  const activeTenantId = useTenantStore(s => s.activeTenantId);
  const actorTenantId = useAuthStore(s => s.user?.tenant_id);
  const [assignments, setAssignments] = useState<BotAssignment[]>([]);
  const [bots, setBots] = useState<Chatbot[]>([]);
  const [kbs, setKbs] = useState<Knowledgebase[]>([]);
  const [lessonSettings, setLessonSettings] = useState<LessonAuthorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingTarget, setTogglingTarget] = useState<string | null>(null);
  const [selectingTarget, setSelectingTarget] = useState<string | null>(null);
  const [selectingKb, setSelectingKb] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assignData, botData, kbData, settingsData] = await Promise.all([
        fetchAssignments(),
        fetchBots({ page: 1, page_size: 100 }),
        fetchKnowledgebases({ page: 1, page_size: 100 }),
        fetchLessonAuthorSettings(),
      ]);
      setAssignments(assignData);
      setBots(botData.data);
      setKbs(kbData.data);
      setLessonSettings(settingsData);
    } catch { toast.error(t("aiChatbot.deployLoadFailed")); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);

  const notifyRuntimeAssignmentChanged = useCallback(() => {
    const tenantId = activeTenantId ?? actorTenantId;
    if (!tenantId || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<{ tenantId: string }>("landa:ai-bot-assignment-changed", {
      detail: { tenantId },
    }));
  }, [activeTenantId, actorTenantId]);

  async function handleToggle(target: ChatTarget, botId: string, checked: boolean) {
    setTogglingTarget(target);
    try {
      if (checked) {
        await assignBot(target, botId);
        toast.success(t("aiChatbot.botAssigned"));
      } else {
        await unassignBot(target);
        toast.success(t("aiChatbot.botUnassigned"));
      }
      notifyRuntimeAssignmentChanged();
      loadData();
    } catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.genericError"))); }
    finally { setTogglingTarget(null); }
  }

  async function handleSelectBot(target: ChatTarget, botId: string) {
    setSelectingTarget(target);
    try {
      await assignBot(target, botId);
      toast.success(t("aiChatbot.botAssigned"));
      notifyRuntimeAssignmentChanged();
      loadData();
    } catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.genericError"))); }
    finally { setSelectingTarget(null); }
  }

  async function handleSelectKb(kbId: string) {
    setSelectingKb(true);
    try {
      await assignLessonAuthorKb(kbId);
      toast.success(t("aiChatbot.lessonAuthorKbAssigned"));
      loadData();
    } catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.genericError"))); }
    finally { setSelectingKb(false); }
  }

  async function handleClearKb() {
    setSelectingKb(true);
    try {
      await unassignLessonAuthorKb();
      toast.success(t("aiChatbot.lessonAuthorKbUnassigned"));
      loadData();
    } catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.genericError"))); }
    finally { setSelectingKb(false); }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" /> {t("aiChatbot.deployBots")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("aiChatbot.deployDescription")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TARGETS.map(({ key, labelKey, descriptionKey }) => {
          const current = assignments.find(a => a.target === key);
          const isToggling = togglingTarget === key;
          const isSelecting = selectingTarget === key;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="app-liquid-card rounded-xl border bg-card p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm">{t(labelKey)}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{t(descriptionKey)}</p>
                </div>
                {current && (
                  <Switch
                    checked={true}
                    disabled={isToggling}
                    onCheckedChange={() => handleToggle(key, current.bot_id, false)}
                  />
                )}
              </div>

              {current ? (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                  <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-border flex items-center justify-center shrink-0">
                    {current.bot_avatar_url ? (
                      <img src={storageUrl(current.bot_avatar_url)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Bot className="h-5 w-5 text-primary/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{current.bot_name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                        {t("aiChatbot.active")}
                      </Badge>
                      {key !== "lesson_author" && (
                        current.bot_kb_id ? (
                          <Badge variant="outline" className="max-w-full truncate text-[10px]">
                            {t("aiChatbot.botKbAssigned", { name: current.bot_kb_name || current.bot_kb_id })}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">
                            {t("aiChatbot.botKbMissing")}
                          </Badge>
                        )
                      )}
                    </div>
                    {key !== "lesson_author" && !current.bot_kb_id && (
                      <p className="mt-1 text-[11px] leading-snug text-amber-700">
                        {t("aiChatbot.botKbMissingHint")}
                      </p>
                    )}
                  </div>
                  {isToggling && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t("aiChatbot.noBotSelectToDeploy")}</p>
                  <Select
                    value=""
                    onValueChange={(v) => handleSelectBot(key, v)}
                    disabled={isSelecting}
                  >
                    <SelectTrigger className="w-full">
                      {isSelecting ? (
                        <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> {t("aiChatbot.assigning")}</span>
                      ) : (
                        <SelectValue placeholder={t("aiChatbot.selectBot")} />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {bots.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">{t("aiChatbot.noBotsCreateFirst")}</div>
                      ) : (
                        bots.map(bot => (
                          <SelectItem key={bot.id} value={bot.id}>
                            <span className="flex items-center gap-2">
                              {bot.avatar_url ? (
                                <img src={storageUrl(bot.avatar_url)} alt="" className="h-5 w-5 rounded-full object-cover" />
                              ) : (
                                <Bot className="h-4 w-4 text-muted-foreground" />
                              )}
                              {bot.name}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {key === "lesson_author" && (
                <>
                  <div className="app-liquid-card space-y-2 rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        {t("aiChatbot.activeKnowledgeBase")}
                      </div>
                      {lessonSettings?.active_kb && (
                        <button
                          type="button"
                          disabled={selectingKb}
                          onClick={handleClearKb}
                          className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          {t("aiChatbot.unassign")}
                        </button>
                      )}
                    </div>
                    <Select
                      value={lessonSettings?.active_kb?.kb_id ?? ""}
                      onValueChange={handleSelectKb}
                      disabled={selectingKb}
                    >
                      <SelectTrigger className="w-full h-9">
                        {selectingKb ? (
                          <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> {t("aiChatbot.assigning")}</span>
                        ) : (
                          <SelectValue placeholder={t("aiChatbot.selectKnowledgeBaseShort")} />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {kbs.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">{t("aiChatbot.noKnowledgeBasesShort")}</div>
                        ) : (
                          kbs.map(kb => (
                            <SelectItem key={kb.id} value={kb.id}>
                              <span className="flex items-center gap-2">
                                <Database className="h-4 w-4 text-muted-foreground" />
                                {kb.name}
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {lessonSettings?.active_kb && (
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <Badge variant="outline">{t("aiChatbot.docs", { count: lessonSettings.active_kb.document_count })}</Badge>
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">{lessonSettings.active_kb.learned_count} {t("aiChatbot.learned").toLowerCase()}</Badge>
                        {lessonSettings.active_kb.learning_count > 0 && <Badge variant="secondary">{lessonSettings.active_kb.learning_count} {t("aiChatbot.learning").toLowerCase()}</Badge>}
                        {lessonSettings.active_kb.error_count > 0 && <Badge variant="destructive">{lessonSettings.active_kb.error_count} {t("aiChatbot.error").toLowerCase()}</Badge>}
                      </div>
                    )}
                  </div>
                  <div className="app-liquid-card rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <Drama className="h-3.5 w-3.5 text-amber-600" />
                      {t("aiChatbot.expertPersona")}
                    </div>
                    {lessonSettings?.active_persona ? (
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full overflow-hidden bg-muted border flex items-center justify-center shrink-0">
                          {lessonSettings.active_persona.persona_avatar_url ? (
                            <img src={storageUrl(lessonSettings.active_persona.persona_avatar_url)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Drama className="h-4 w-4 text-amber-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{lessonSettings.active_persona.persona_name}</p>
                          {/* <p className="text-[11px] text-muted-foreground">Lấy từ Prompt hệ thống</p> */}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {t("aiChatbot.expertPersonaMissing")}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
