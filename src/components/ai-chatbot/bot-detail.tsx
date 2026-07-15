// ═══════════════════════════════════════════════════════════════
// Bot Detail — Full-page detail view with tabs
// Tabs: Cài đặt chung | Nhân cách (Personas) | Bộ lọc đầu vào
// Vertical card grid + "..." menu + full edit modal
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Bot, Brain, Camera, Loader2, Save, Settings,
  Drama, RotateCcw, Pencil, Plus, Trash2, X, Sparkles, MoreHorizontal, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchBot, updateBot, uploadBotAvatar,
  fetchKnowledgebases, fetchBotPersonas,
  updateBotPersona, resetBotPersona,
  addBotPersona, removeBotPersona,
  type Chatbot, type Knowledgebase, type BotPersona,
} from "@/api/custom-ai-chatbot";
import {
  fetchActiveTemplates,
  type PromptTemplate,
} from "@/api/custom-prompt-templates";
import { storageUrl } from "@/utils/storage-url";
import { useTenantStore } from "@/utils/tenant-store";
import { InputFilterTab } from "@/components/ai-chatbot/input-filter-tab";
// ── Mascot palette ──
const MASCOT_COLORS = ["#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];
function getMascotColor(i: number) { return MASCOT_COLORS[i % MASCOT_COLORS.length]; }

// ── Props ──
interface BotDetailProps { botId: string; onBack: () => void; }

// ── Detail Skeleton ──
function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-32" /></div>
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="rounded-xl border bg-card p-6 space-y-6">
        <div className="flex items-center gap-6">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-3 flex-1"><Skeleton className="h-5 w-32" /><Skeleton className="h-10 w-full" /></div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export function BotDetail({ botId, onBack }: BotDetailProps) {
  const [bot, setBot] = useState<Chatbot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kbs, setKbs] = useState<Knowledgebase[]>([]);
  const [formName, setFormName] = useState("");
  const [formKbId, setFormKbId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isDirty, setIsDirty] = useState(false);

  // ── Personas state ──
  const [personas, setPersonas] = useState<BotPersona[]>([]);
  const [personasLoading, setPersonasLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // ── Edit persona modal ──
  const [editingPersona, setEditingPersona] = useState<BotPersona | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [savingPersona, setSavingPersona] = useState(false);

  // ── Add persona modal ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTemplates, setActiveTemplates] = useState<PromptTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [addingTemplateId, setAddingTemplateId] = useState<string | null>(null);

  // ── Tự động quay lại bot list khi superadmin đổi tenant ──
  const activeTenantId = useTenantStore(s => s.activeTenantId);
  const initialTenantRef = useRef(activeTenantId);
  useEffect(() => {
    if (initialTenantRef.current !== activeTenantId) {
      onBack();
    }
  }, [activeTenantId, onBack]);



  // ── Load data ──
  const loadBot = useCallback(async () => {
    setLoading(true);
    try {
      const [b, kr] = await Promise.all([fetchBot(botId), fetchKnowledgebases({ page: 1, page_size: 100 })]);
      setBot(b); setFormName(b.name); setFormKbId(b.kb_id); setKbs(kr.data); setIsDirty(false);
    } catch { toast.error("Lỗi tải thông tin bot"); onBack(); }
    finally { setLoading(false); }
  }, [botId, onBack]);

  const loadPersonas = useCallback(async () => {
    setPersonasLoading(true);
    try { const data = await fetchBotPersonas(botId); setPersonas(data); }
    catch { toast.error("Lỗi tải nhân cách"); }
    finally { setPersonasLoading(false); }
  }, [botId]);

  useEffect(() => { loadBot(); loadPersonas(); }, [loadBot, loadPersonas]);
  useEffect(() => {
    if (!bot) return;
    setIsDirty(formName !== bot.name || formKbId !== bot.kb_id);
  }, [formName, formKbId, bot]);

  // ── Settings handlers ──
  async function handleSave() {
    if (!formName.trim()) { toast.error("Tên bot không được trống"); return; }
    setSaving(true);
    try {
      const updated = await updateBot(botId, { name: formName, kb_id: formKbId });
      setBot(updated); setIsDirty(false); toast.success("Đã cập nhật bot");
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi cập nhật"); }
    finally { setSaving(false); }
  }



  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true);
    try { const updated = await uploadBotAvatar(botId, file); setBot(updated); toast.success("Avatar đã cập nhật"); }
    catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi upload avatar"); }
    finally { setUploadingAvatar(false); if (avatarInputRef.current) avatarInputRef.current.value = ""; }
  }

  // ── Persona handlers ──
  function openEditPersona(p: BotPersona) {
    setEditingPersona(p);
    setEditName(p.custom_name ?? p.template_name);
    setEditDesc(p.custom_description ?? p.template_description ?? "");
    setEditPrompt(p.custom_prompt ?? p.template_prompt);
  }

  async function handleSavePersona() {
    if (!editingPersona) return;
    setSavingPersona(true);
    try {
      await updateBotPersona(botId, editingPersona.id, {
        custom_name: editName,
        custom_description: editDesc,
        custom_prompt: editPrompt,
      });
      toast.success("Đã cập nhật nhân cách"); setEditingPersona(null); loadPersonas();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setSavingPersona(false); }
  }

  async function handleResetPersona(personaId: string) {
    setResettingId(personaId);
    try { await resetBotPersona(botId, personaId); toast.success("Đã reset về mặc định"); loadPersonas(); if (editingPersona?.id === personaId) setEditingPersona(null); }
    catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setResettingId(null); }
  }

  async function handleRemovePersona() {
    if (!confirmRemoveId) return;
    setRemovingId(confirmRemoveId);
    try { await removeBotPersona(botId, confirmRemoveId); toast.success("Đã xoá nhân cách"); setConfirmRemoveId(null); loadPersonas(); }
    catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setRemovingId(null); }
  }

  async function openAddModal() {
    setShowAddModal(true); setTemplatesLoading(true);
    try { setActiveTemplates(await fetchActiveTemplates()); }
    catch { toast.error("Lỗi tải danh sách nhân cách"); }
    finally { setTemplatesLoading(false); }
  }

  async function handleAddPersona(templateId: string) {
    setAddingTemplateId(templateId);
    try {
      await addBotPersona(botId, templateId);
      toast.success("Đã thêm nhân cách"); loadPersonas();
      setActiveTemplates(await fetchActiveTemplates());
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setAddingTemplateId(null); }
  }

  if (loading) return <DetailSkeleton />;
  if (!bot) return null;
  const assignedTemplateIds = new Set(personas.map(p => p.template_id));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-border flex items-center justify-center">
              {bot.avatar_url ? <img src={storageUrl(bot.avatar_url)} alt={bot.name} className="h-full w-full object-cover" /> : <Bot className="h-5 w-5 text-primary/50" />}
            </div>
            <div>
              <h2 className="text-xl font-bold">{bot.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {bot.kb_name && <Badge variant="outline" className="gap-1 text-xs"><Brain className="h-3 w-3" /> {bot.kb_name}</Badge>}
                <Badge variant="outline" className="text-xs gap-1">
                  <Bot className="h-3 w-3" />
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!isDirty || saving} onClick={handleSave} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu thay đổi
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="w-full max-w-2xl">
          <TabsTrigger value="settings" className="gap-2 flex-1"><Settings className="h-4 w-4" /> Cài đặt chung</TabsTrigger>
          <TabsTrigger value="personas" className="gap-2 flex-1">
            <Drama className="h-4 w-4" /> Nhân cách
            {personas.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{personas.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="input-filter" className="gap-2 flex-1">
            <ShieldCheck className="h-4 w-4" /> Bộ lọc đầu vào
          </TabsTrigger>
        </TabsList>

        {/* ═══════ Settings Tab ═══════ */}
        <TabsContent value="settings" className="mt-5">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border bg-card overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Avatar</h3>
              <div className="flex items-center gap-6">
                <input ref={avatarInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarUpload} />
                <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                  <div className="h-24 w-24 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-border group-hover:border-primary/40 transition-all flex items-center justify-center shadow-sm">
                    {uploadingAvatar ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : bot.avatar_url ? <img src={storageUrl(bot.avatar_url)} alt={bot.name} className="h-full w-full object-cover" /> : <Bot className="h-10 w-10 text-primary/30" />}
                  </div>
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera className="h-6 w-6 text-white" /></div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Ảnh đại diện bot</p>
                  <p className="text-xs text-muted-foreground">JPEG, PNG, WebP hoặc GIF. Tối đa 5MB.</p>
                  <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => avatarInputRef.current?.click()}>{bot.avatar_url ? "Đổi ảnh" : "Tải ảnh lên"}</Button>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Thông tin cơ bản</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tên Bot <span className="text-destructive">*</span></label>
                  <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="VD: Trợ lý tư vấn" className="h-10" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Kho tri thức</label>
                  <Select value={formKbId || "__none__"} onValueChange={v => setFormKbId(v === "__none__" ? null : v)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Chọn Kho tri thức..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Không gán Kho tri thức —</SelectItem>
                      {kbs.map(kb => <SelectItem key={kb.id} value={kb.id}>{kb.name} ({kb.document_count} tài liệu)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {isDirty && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Bạn có thay đổi chưa lưu</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={loadBot}>Huỷ</Button>
                  <Button size="sm" disabled={saving} onClick={handleSave} className="gap-1.5">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu</Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </TabsContent>

        {/* ═══════ Personas Tab ═══════ */}
        <TabsContent value="personas" className="mt-5">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2"><Drama className="h-5 w-5 text-primary" /> Nhân cách</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Mỗi nhân cách tương ứng 1 mascot với prompt riêng. Tối đa 6 / bot.</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-sm">{personas.length}/6</Badge>
                <Button onClick={openAddModal} disabled={personas.length >= 6} size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Thêm nhân cách</Button>
              </div>
            </div>

            {/* Persona Cards — Vertical Grid */}
            {personasLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border bg-card overflow-hidden">
                    <Skeleton className="h-44 w-full" />
                    <div className="p-4 space-y-2">
                      <Skeleton className="h-10 w-10 rounded-full mx-auto" />
                      <Skeleton className="h-4 w-24 mx-auto" />
                      <Skeleton className="h-3 w-32 mx-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : personas.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground rounded-xl border bg-card">
                <Drama className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Bot này chưa có nhân cách nào.</p>
                <Button variant="outline" size="sm" onClick={openAddModal} className="gap-1.5 mt-4"><Plus className="h-4 w-4" /> Thêm nhân cách</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <AnimatePresence>
                  {personas.map((p, i) => {
                    const isCustom = p.custom_prompt !== null || p.custom_name !== null || p.custom_description !== null;
                    const color = getMascotColor(i);
                    const effectiveName = p.custom_name || p.template_name;
                    const effectiveDesc = p.custom_description ?? p.template_description;

                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        layout
                        className="group rounded-xl border bg-card overflow-hidden hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300"
                      >
                        {/* Fullbody Image */}
                        <div
                          className="relative h-44 flex items-center justify-center overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${color}06 0%, ${color}12 100%)` }}
                        >
                          {p.template_fullbody_url ? (
                            <img src={storageUrl(p.template_fullbody_url)} alt={effectiveName} className="h-full w-auto object-contain drop-shadow-lg" />
                          ) : (
                            <Bot className="h-16 w-16 opacity-20" style={{ color }} />
                          )}

                          {/* Custom badge */}
                          {isCustom && (
                            <Badge className="absolute top-2 left-2 bg-amber-500/90 text-white gap-0.5 text-[10px] h-5 shadow">
                              <Pencil className="h-2.5 w-2.5" /> Đã tuỳ chỉnh
                            </Badge>
                          )}

                          {/* "..." Menu */}
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="secondary" size="icon" className="h-7 w-7 shadow-md bg-card/90 backdrop-blur-sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem onClick={() => openEditPersona(p)} className="gap-2 cursor-pointer">
                                  <Pencil className="h-3.5 w-3.5" /> Chỉnh sửa
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setConfirmRemoveId(p.id)} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" /> Xoá
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-4 text-center space-y-2">
                          <div
                            className="h-11 w-11 rounded-full mx-auto overflow-hidden border-2 flex items-center justify-center shadow-sm -mt-9 relative z-10 bg-card"
                            style={!p.template_avatar_url ? { backgroundColor: color + '15', borderColor: color + '30' } : { borderColor: 'var(--border)' }}
                          >
                            {p.template_avatar_url ? (
                              <img src={storageUrl(p.template_avatar_url)} alt={effectiveName} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-sm font-bold" style={{ color }}>{effectiveName.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <h4 className="font-semibold text-sm">{effectiveName}</h4>
                          {effectiveDesc && (
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{effectiveDesc}</p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </TabsContent>

        {/* ═══════ Input Filter Tab ═══════ */}
        <TabsContent value="input-filter" className="mt-5">
          <InputFilterTab botId={botId} botName={bot.name} />
        </TabsContent>

      </Tabs>

      {/* ═══════ Edit Persona Dialog ═══════ */}
      <Dialog open={!!editingPersona} onOpenChange={() => setEditingPersona(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Drama className="h-5 w-5 text-primary" /> Chỉnh sửa nhân cách</DialogTitle>
            <DialogDescription>Tuỳ chỉnh tên, mô tả và prompt cho nhân cách này. Reset để trở về mặc định hệ thống.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-5 py-4 -mx-1 px-1">
            {/* Mascot preview */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border">
              <div className="h-14 w-14 rounded-full overflow-hidden border-2 flex items-center justify-center shrink-0" style={!editingPersona?.template_avatar_url ? { backgroundColor: '#6366f115', borderColor: '#6366f130' } : { borderColor: 'var(--border)' }}>
                {editingPersona?.template_avatar_url ? (
                  <img src={storageUrl(editingPersona.template_avatar_url)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-primary">{editingPersona?.template_name?.charAt(0)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Mặc định: <strong>{editingPersona?.template_name}</strong></p>
                {editingPersona?.template_description && <p className="text-[11px] text-muted-foreground/70 line-clamp-1 mt-0.5">{editingPersona.template_description}</p>}
              </div>
              {(editingPersona?.custom_prompt !== null || editingPersona?.custom_name !== null || editingPersona?.custom_description !== null) && (
                <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-0.5 text-[10px] shrink-0"><Pencil className="h-2.5 w-2.5" /> Đã tuỳ chỉnh</Badge>
              )}
            </div>

            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tên nhân cách</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder={editingPersona?.template_name || "Tên..."} className="h-10" />
              {editingPersona?.custom_name !== null && editName !== editingPersona?.template_name && (
                <p className="text-[11px] text-muted-foreground">Mặc định: {editingPersona?.template_name}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Mô tả</label>
              <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} className="resize-none text-sm" placeholder={editingPersona?.template_description || "Mô tả nhân cách..."} />
              {editingPersona?.custom_description !== null && editDesc !== (editingPersona?.template_description ?? '') && (
                <p className="text-[11px] text-muted-foreground">Mặc định: {editingPersona?.template_description || '(trống)'}</p>
              )}
            </div>

            {/* Default prompt reference */}
            {(editingPersona?.custom_prompt !== null) && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prompt mặc định (tham khảo)</label>
                <div className="bg-muted/40 rounded-lg p-3 max-h-24 overflow-y-auto">
                  <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">{editingPersona?.template_prompt}</p>
                </div>
              </div>
            )}

            {/* Editable prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium">System Prompt</label>
              <Textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} rows={8} className="resize-none font-mono text-sm" placeholder="Nhập system prompt..." />
              <p className="text-xs text-muted-foreground">{editPrompt.length.toLocaleString()} / 20,000 ký tự</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
            {(editingPersona?.custom_prompt !== null || editingPersona?.custom_name !== null || editingPersona?.custom_description !== null) && (
              <Button
                variant="outline" size="sm"
                className="mr-auto text-xs gap-1"
                disabled={resettingId === editingPersona?.id}
                onClick={() => editingPersona && handleResetPersona(editingPersona.id)}
              >
                {resettingId === editingPersona?.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Reset tất cả về mặc định
              </Button>
            )}
            <DialogClose asChild><Button variant="outline">Huỷ</Button></DialogClose>
            <Button onClick={handleSavePersona} disabled={savingPersona} className="gap-1.5">
              {savingPersona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Remove Confirm ═══════ */}
      <Dialog open={!!confirmRemoveId} onOpenChange={() => setConfirmRemoveId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-destructive" /> Xoá nhân cách</DialogTitle>
            <DialogDescription>Nhân cách sẽ bị gỡ khỏi bot. Bạn có thể thêm lại sau.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Huỷ</Button></DialogClose>
            <Button variant="destructive" onClick={handleRemovePersona} disabled={removingId === confirmRemoveId} className="gap-1.5">
              {removingId === confirmRemoveId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Add Persona Modal — Mascot Picker ═══════ */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" /> Chọn nhân cách cho bot</DialogTitle>
            <DialogDescription>Chọn mascot để thêm làm nhân cách cho bot. Nhân cách đã gán sẽ được đánh dấu.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 -mx-1 px-1">
            {templatesLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-xl border bg-card overflow-hidden">
                    <Skeleton className="h-36 w-full" />
                    <div className="p-4 space-y-2"><Skeleton className="h-10 w-10 rounded-full mx-auto" /><Skeleton className="h-4 w-28 mx-auto" /><Skeleton className="h-8 w-full rounded-lg" /></div>
                  </div>
                ))}
              </div>
            ) : activeTemplates.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Drama className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Chưa có nhân cách nào được bật.</p>
                <p className="text-xs mt-1">Hãy liên hệ superadmin để tạo System Prompts.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <AnimatePresence>
                  {activeTemplates.map((tpl, i) => {
                    const isAssigned = assignedTemplateIds.has(tpl.id);
                    const isAdding = addingTemplateId === tpl.id;
                    const color = getMascotColor(i);

                    return (
                      <motion.div
                        key={tpl.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className={`rounded-xl border overflow-hidden transition-all duration-300 ${isAssigned ? 'bg-muted/30 border-primary/20 opacity-70' : 'bg-card hover:shadow-lg hover:border-primary/30'}`}
                      >
                        {/* Fullbody */}
                        <div className="relative h-36 flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}08 0%, ${color}15 100%)` }}>
                          {tpl.fullbody_url ? (
                            <img src={storageUrl(tpl.fullbody_url)} alt={tpl.name} className="h-full w-auto object-contain drop-shadow-lg" />
                          ) : (
                            <Bot className="h-14 w-14 opacity-20" style={{ color }} />
                          )}
                          {isAssigned && (
                            <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
                              <Badge className="bg-primary/90 text-primary-foreground gap-1 shadow-lg">✓ Đã thêm</Badge>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-4 text-center space-y-2">
                          <div className="h-10 w-10 rounded-full mx-auto overflow-hidden border-2 flex items-center justify-center shadow-sm -mt-8 relative z-10 bg-card" style={!tpl.avatar_url ? { backgroundColor: color + '15', borderColor: color + '30' } : { borderColor: 'var(--border)' }}>
                            {tpl.avatar_url ? <img src={storageUrl(tpl.avatar_url)} alt={tpl.name} className="h-full w-full object-cover" /> : <span className="text-sm font-bold" style={{ color }}>{tpl.name.charAt(0)}</span>}
                          </div>
                          <h4 className="font-semibold text-sm truncate">{tpl.name}</h4>
                          {tpl.description && <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>}
                          {isAssigned ? (
                            <div className="flex items-center justify-center h-8 rounded-lg bg-muted/50 text-[11px] text-muted-foreground font-medium">Đã gán cho bot</div>
                          ) : (
                            <Button variant="outline" size="sm" className="w-full gap-1.5 h-8 hover:bg-primary hover:text-primary-foreground hover:border-primary text-xs" onClick={() => handleAddPersona(tpl.id)} disabled={isAdding || personas.length >= 6}>
                              {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Thêm
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="pt-4 border-t flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{personas.length}/6 nhân cách đã gán{personas.length >= 6 && <span className="text-destructive font-medium ml-1">• Đã đủ</span>}</p>
            <DialogClose asChild><Button variant="outline" className="gap-1.5"><X className="h-4 w-4" /> Đóng</Button></DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
