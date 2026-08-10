// ═══════════════════════════════════════════════════════════════
// Deploy Section — Bot assignment management for Admin/Learner FE
// Moved from bot-detail to top-level AI Chatbot page
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
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

const TARGETS = [
  { key: "admin" as const, label: "FE Admin (Dashboard)", desc: "Bot trò chuyện trên trang quản trị" },
  { key: "learner" as const, label: "FE Learner (Học viên)", desc: "Bot trò chuyện trên trang học viên" },
  { key: "lesson_author" as const, label: "Chuyên gia tạo bài học", desc: "Bot trong widget course editor, dùng KB active riêng" },
];

export function DeploySection() {
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
    } catch { toast.error("Lỗi tải dữ liệu triển khai"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleToggle(target: ChatTarget, botId: string, checked: boolean) {
    setTogglingTarget(target);
    try {
      if (checked) {
        await assignBot(target, botId);
        toast.success("Đã gán bot");
      } else {
        await unassignBot(target);
        toast.success("Đã bỏ gán bot");
      }
      loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setTogglingTarget(null); }
  }

  async function handleSelectBot(target: ChatTarget, botId: string) {
    setSelectingTarget(target);
    try {
      await assignBot(target, botId);
      toast.success("Đã gán bot");
      loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setSelectingTarget(null); }
  }

  async function handleSelectKb(kbId: string) {
    setSelectingKb(true);
    try {
      await assignLessonAuthorKb(kbId);
      toast.success("Đã gán KB chuyên gia bài học");
      loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setSelectingKb(false); }
  }

  async function handleClearKb() {
    setSelectingKb(true);
    try {
      await unassignLessonAuthorKb();
      toast.success("Đã bỏ gán KB chuyên gia bài học");
      loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
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
          <Rocket className="h-5 w-5 text-primary" /> Triển khai Bot
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Gán bot cho từng FE. Mỗi FE chỉ active được 1 bot cùng lúc.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TARGETS.map(({ key, label, desc }) => {
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
                  <h4 className="font-semibold text-sm">{label}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
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
                    <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] mt-0.5">
                      Đang active
                    </Badge>
                  </div>
                  {isToggling && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Chưa có bot nào — chọn bot để triển khai:</p>
                  <Select
                    value=""
                    onValueChange={(v) => handleSelectBot(key, v)}
                    disabled={isSelecting}
                  >
                    <SelectTrigger className="w-full">
                      {isSelecting ? (
                        <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Đang gán...</span>
                      ) : (
                        <SelectValue placeholder="Chọn bot..." />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {bots.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Chưa có bot nào. Tạo bot trước.</div>
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
                        KB active
                      </div>
                      {lessonSettings?.active_kb && (
                        <button
                          type="button"
                          disabled={selectingKb}
                          onClick={handleClearKb}
                          className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          Bỏ gán
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
                          <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Đang gán...</span>
                        ) : (
                          <SelectValue placeholder="Chọn KB..." />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {kbs.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">Chưa có KB nào.</div>
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
                        <Badge variant="outline">{lessonSettings.active_kb.document_count} docs</Badge>
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">{lessonSettings.active_kb.learned_count} learned</Badge>
                        {lessonSettings.active_kb.learning_count > 0 && <Badge variant="secondary">{lessonSettings.active_kb.learning_count} learning</Badge>}
                        {lessonSettings.active_kb.error_count > 0 && <Badge variant="destructive">{lessonSettings.active_kb.error_count} error</Badge>}
                      </div>
                    )}
                  </div>
                  <div className="app-liquid-card rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <Drama className="h-3.5 w-3.5 text-amber-600" />
                      Nhân cách chuyên gia
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
                        Superadmin chưa chọn mascot chuyên gia bài học trong Prompt hệ thống.
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
