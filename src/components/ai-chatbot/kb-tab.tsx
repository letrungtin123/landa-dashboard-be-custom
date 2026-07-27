// ═══════════════════════════════════════════════════════════════
// Knowledge Base Tab — Card Layout
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Pencil, Search, Loader2, FileText, Database, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  fetchKnowledgebases, createKnowledgebase, updateKnowledgebase, deleteKnowledgebase,
  type Knowledgebase,
} from "@/api/custom-ai-chatbot";
import { cardVariants, formatDate, useDebounce, PaginationBar, KbCardSkeleton } from "./ai-chatbot-helpers";

export function KnowledgeBaseTab({ onSelectKb }: { onSelectKb: (kb: Knowledgebase) => void }) {
  const [kbs, setKbs] = useState<Knowledgebase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const searchDebounced = useDebounce(searchInput);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editKb, setEditKb] = useState<Knowledgebase | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPage(1); }, [searchDebounced, pageSize]);

  const loadKbs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchKnowledgebases({ page, page_size: pageSize, search: searchDebounced || undefined });
      setKbs(r.data); setTotal(r.total);
    } catch { toast.error("Lỗi tải Kho tri thức"); } finally { setLoading(false); }
  }, [page, pageSize, searchDebounced]);
  useEffect(() => { loadKbs(); }, [loadKbs]);

  async function handleCreate() {
    if (!formName.trim()) { toast.error("Tên Kho tri thức không được trống"); return; }
    setSaving(true);
    try { await createKnowledgebase({ name: formName, description: formDesc }); toast.success("Tạo Kho tri thức thành công"); setShowCreate(false); setFormName(""); setFormDesc(""); loadKbs(); }
    catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); } finally { setSaving(false); }
  }
  async function handleUpdate() {
    if (!editKb || !formName.trim()) return; setSaving(true);
    try { await updateKnowledgebase(editKb.id, { name: formName, description: formDesc }); toast.success("Cập nhật OK"); setEditKb(null); loadKbs(); }
    catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); } finally { setSaving(false); }
  }
  async function handleDelete() {
    if (!deletingId) return;
    try { await deleteKnowledgebase(deletingId); toast.success("Xoá OK"); setDeletingId(null); loadKbs(); }
    catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
  }

  const totalPages = Math.ceil(total / pageSize);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Kho tri thức <Badge variant="outline" className="ml-1">{total}</Badge></h3>
        <Button onClick={() => { setFormName(""); setFormDesc(""); setShowCreate(true); }} className="gap-2"><Plus className="h-4 w-4" /> Tạo mới</Button>
      </div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Tìm Kho tri thức..." value={searchInput} onChange={e => setSearchInput(e.target.value)} className="pl-9" /></div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? Array.from({ length: 6 }).map((_, i) => <KbCardSkeleton key={i} />)
          : kbs.length === 0 ? (
            <div className="col-span-full text-center py-16 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{searchDebounced ? "Không tìm thấy Kho tri thức nào." : "Chưa có Kho tri thức nào. Tạo mới để bắt đầu!"}</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {kbs.map((kb, i) => (
                <motion.div
                  key={kb.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" exit="exit" layout
                  className="group rounded-xl border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-pointer overflow-hidden"
                  onClick={() => onSelectKb(kb)}
                >
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold truncate group-hover:text-primary transition-colors">{kb.name}</h4>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{kb.description || "Không có mô tả"}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setFormName(kb.name); setFormDesc(kb.description || ""); setEditKb(kb); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingId(kb.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" /> {kb.document_count || 0} tài liệu</Badge>
                      {kb.restore_required && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Cần khôi phục</Badge>}
                      {(kb.restore_state === "queued" || kb.restore_state === "restoring" || kb.restore_state === "uploading") && <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700"><RefreshCw className="h-3 w-3 animate-spin" /> Đang khôi phục</Badge>}
                      <span>{formatDate(kb.created_at)}</span>
                    </div>
                  </div>
                  <div className="h-0.5 bg-gradient-to-r from-primary/50 via-primary/20 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
      </div>
      <PaginationBar page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />

      {/* Create / Edit Dialog */}
      <Dialog open={showCreate || !!editKb} onOpenChange={() => { setShowCreate(false); setEditKb(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{editKb ? "Sửa Kho tri thức" : "Tạo Kho tri thức"}</DialogTitle><DialogDescription>Kho tri thức chứa tài liệu để AI chatbot tham khảo.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><label className="text-sm font-medium">Tên</label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="VD: Tài liệu sản phẩm" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Mô tả</label><Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Mô tả..." rows={3} /></div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">Huỷ</Button></DialogClose><Button onClick={editKb ? handleUpdate : handleCreate} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editKb ? "Cập nhật" : "Tạo"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent><DialogHeader><DialogTitle>Xoá Kho tri thức</DialogTitle><DialogDescription>Xoá Kho tri thức sẽ xoá tất cả tài liệu bên trong.</DialogDescription></DialogHeader>
          <DialogFooter><DialogClose asChild><Button variant="outline">Huỷ</Button></DialogClose><Button variant="destructive" onClick={handleDelete}>Xoá</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
