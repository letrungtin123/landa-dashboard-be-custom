// ═══════════════════════════════════════════════════════════════
// Chatbot Tab — Card Grid (click → BotDetail)
// Shows mascot fullbody images on bot cards
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Brain, Plus, Trash2, Search, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  fetchBots, createBot, deleteBot,
  fetchKnowledgebases,
  type Chatbot, type Knowledgebase,
} from "@/api/custom-ai-chatbot";
import { storageUrl } from "@/utils/storage-url";
import {
  cardVariants, formatDate, useDebounce,
  PaginationBar, BotCardSkeleton,
} from "./ai-chatbot-helpers";
import { AppTooltip } from '@/components/ui/tooltip';

const MASCOT_COLORS = ["#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];

interface ChatbotTabProps {
  onSelectBot: (bot: Chatbot) => void;
}

export function ChatbotTab({ onSelectBot }: ChatbotTabProps) {
  const [bots, setBots] = useState<Chatbot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const searchDebounced = useDebounce(searchInput);

  const [kbs, setKbs] = useState<Knowledgebase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formKbId, setFormKbId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPage(1); }, [searchDebounced, pageSize]);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [br, kr] = await Promise.all([fetchBots({ page, page_size: pageSize, search: searchDebounced || undefined }), fetchKnowledgebases({ page: 1, page_size: 100 })]);
      setBots(br.data); setTotal(br.total); setKbs(kr.data);
    } catch { toast.error("Lỗi"); } finally { setLoading(false); }
  }, [page, pageSize, searchDebounced]);
  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate() {
    if (!formName.trim()) { toast.error("Tên bot trống"); return; }
    setSaving(true);
    try {
      await createBot({ name: formName, kb_id: formKbId });
      toast.success("Tạo OK"); setShowCreate(false); setFormName(""); setFormKbId(null); loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setSaving(false); }
  }
  async function handleDelete() { if (!deletingId) return; try { await deleteBot(deletingId); toast.success("Xoá OK"); setDeletingId(null); loadData(); } catch { toast.error("Lỗi"); } }

  const totalPages = Math.ceil(total / pageSize);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Chatbots <Badge variant="outline" className="ml-1">{total}</Badge></h3>
        <Button onClick={() => { setFormName(""); setFormKbId(null); setShowCreate(true); }} className="gap-2"><Plus className="h-4 w-4" /> Tạo Bot</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Tìm bot..." value={searchInput} onChange={e => setSearchInput(e.target.value)} className="pl-9" /></div>
      </div>

      {/* Bot Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? Array.from({ length: 6 }).map((_, i) => <BotCardSkeleton key={i} />)
        : bots.length === 0 ? (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{searchDebounced ? "Không tìm thấy bot nào." : "Chưa có bot. Tạo mới để bắt đầu!"}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {bots.map((bot, i) => {
              const previews = bot.persona_previews ?? [];
              return (
                <motion.div
                  key={bot.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" exit="exit" layout
                  className="app-liquid-card group rounded-xl hover:border-primary/40 transition-all duration-300 cursor-pointer overflow-hidden"
                  onClick={() => onSelectBot(bot)}
                >
                  <div className="p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      {/* Bot Avatar */}
                      <div className="relative shrink-0">
                        <div className="h-12 w-12 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-border group-hover:border-primary/40 transition-colors flex items-center justify-center">
                          {bot.avatar_url ? (
                            <img src={storageUrl(bot.avatar_url)} alt={bot.name} className="h-full w-full object-cover" />
                          ) : (
                            <Bot className="h-6 w-6 text-primary/50" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold truncate group-hover:text-primary transition-colors">{bot.name}</h4>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingId(bot.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                        {bot.kb_name ? (
                          <Badge variant="outline" className="gap-1 mt-1 text-xs"><Brain className="h-3 w-3" /> {bot.kb_name}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Chưa gán Kho tri thức</span>
                        )}
                      </div>
                    </div>

                    {/* Mascot avatar circles */}
                    {previews.length > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="flex -space-x-1.5">
                          {previews.slice(0, 6).map((m, mi) => {
                            const color = MASCOT_COLORS[mi % MASCOT_COLORS.length];
                            return (
                              <AppTooltip content={m.name}><div
                                key={mi}
                                className="h-6 w-6 rounded-full overflow-hidden border-2 border-card flex items-center justify-center shadow-sm"
                                style={!m.avatar_url ? { backgroundColor: color + '15', borderColor: 'var(--card)' } : {}}

                              >
                                {m.avatar_url ? (
                                  <img src={storageUrl(m.avatar_url)} alt={m.name} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="text-[8px] font-bold" style={{ color }}>{m.name.charAt(0)}</span>
                                )}
                              </div></AppTooltip>
                            );
                          })}
                        </div>
                        <span className="text-[10px] text-muted-foreground ml-1">{previews.length} nhân cách</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">{formatDate(bot.created_at)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
      <PaginationBar page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />

      {/* Create Bot Dialog */}
      <Dialog open={showCreate} onOpenChange={() => setShowCreate(false)}>
        <DialogContent><DialogHeader><DialogTitle>Tạo Bot</DialogTitle><DialogDescription>Gán Kho tri thức để bot trả lời dựa trên tài liệu.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><label className="text-sm font-medium">Tên bot</label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="VD: Trợ lý tư vấn" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Kho tri thức</label>
              <Select value={formKbId || "__none__"} onValueChange={v => setFormKbId(v === "__none__" ? null : v)}><SelectTrigger><SelectValue placeholder="Chọn Kho tri thức..." /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">— Không gán Kho tri thức —</SelectItem>{kbs.map(kb => <SelectItem key={kb.id} value={kb.id}>{kb.name} ({kb.document_count})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">Huỷ</Button></DialogClose><Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tạo</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Bot Dialog */}
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}><DialogContent><DialogHeader><DialogTitle>Xoá Bot</DialogTitle><DialogDescription>Bot sẽ bị xoá. Kho tri thức không ảnh hưởng.</DialogDescription></DialogHeader>
        <DialogFooter><DialogClose asChild><Button variant="outline">Huỷ</Button></DialogClose><Button variant="destructive" onClick={handleDelete}>Xoá</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
