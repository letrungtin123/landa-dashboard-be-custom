// ═══════════════════════════════════════════════════════════════
// Deploy Section — Bot assignment management for Admin/Learner FE
// Moved from bot-detail to top-level AI Chatbot page
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Rocket, Bot, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fetchBots, type Chatbot } from "@/api/custom-ai-chatbot";
import {
  fetchAssignments, assignBot, unassignBot,
  type BotAssignment,
} from "@/api/custom-chat";
import { storageUrl } from "@/utils/storage-url";

const TARGETS = [
  { key: "admin" as const, label: "FE Admin (Dashboard)", desc: "Bot trò chuyện trên trang quản trị" },
  { key: "learner" as const, label: "FE Learner (Học viên)", desc: "Bot trò chuyện trên trang học viên" },
];

export function DeploySection() {
  const [assignments, setAssignments] = useState<BotAssignment[]>([]);
  const [bots, setBots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingTarget, setTogglingTarget] = useState<string | null>(null);
  const [selectingTarget, setSelectingTarget] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assignData, botData] = await Promise.all([
        fetchAssignments(),
        fetchBots({ page: 1, page_size: 100 }),
      ]);
      setAssignments(assignData);
      setBots(botData.data);
    } catch { toast.error("Lỗi tải dữ liệu triển khai"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleToggle(target: string, botId: string, checked: boolean) {
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

  async function handleSelectBot(target: string, botId: string) {
    setSelectingTarget(target);
    try {
      await assignBot(target, botId);
      toast.success("Đã gán bot");
      loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setSelectingTarget(null); }
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TARGETS.map(({ key, label, desc }) => {
          const current = assignments.find(a => a.target === key);
          const isToggling = togglingTarget === key;
          const isSelecting = selectingTarget === key;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border bg-card p-5 space-y-4"
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
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
