// ═══════════════════════════════════════════════════════════════
// System Prompts Page — Superadmin manages mascot templates
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Drama, Plus, Trash2, Pencil, Loader2, Camera, Bot,
  Save, Image, Flag, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  fetchTemplates, createTemplate, updateTemplate, deleteTemplate,
  uploadTemplateAvatar, uploadTemplateFullbody,
  type PromptTemplate, type TemplateListResult,
} from "@/api/custom-prompt-templates";
import { storageUrl } from "@/utils/storage-url";

// ── Default mascot colors (matching BE) ──
const MASCOT_COLORS = ["#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];

function getDefaultColor(index: number) {
  return MASCOT_COLORS[index % MASCOT_COLORS.length];
}

// ── Card animation variants ──
const cardVariants = {
  hidden: (i: number) => ({ opacity: 0, y: 20, transition: { delay: i * 0.05 } }),
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3 } }),
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

export default function PromptTemplatesPage() {
  const [result, setResult] = useState<TemplateListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTpl, setEditTpl] = useState<PromptTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formVoicePrompt, setFormVoicePrompt] = useState("");
  const [formActive, setFormActive] = useState(false);
  const [formLessonAuthor, setFormLessonAuthor] = useState(false);

  // Image upload refs
  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null);
  const [uploadingFullbody, setUploadingFullbody] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const fullbodyInputRef = useRef<HTMLInputElement>(null);
  const [targetUploadId, setTargetUploadId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTemplates();
      setResult(data);
    } catch { toast.error("Lỗi tải dữ liệu"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function openCreate() {
    setFormName(""); setFormDesc(""); setFormPrompt(""); setFormVoicePrompt(""); setFormActive(false); setFormLessonAuthor(false);
    setEditTpl(null); setShowForm(true);
  }
  function openEdit(tpl: PromptTemplate) {
    setFormName(tpl.name); setFormDesc(tpl.description); setFormPrompt(tpl.prompt); setFormVoicePrompt(tpl.voice_prompt || ""); setFormActive(tpl.is_active); setFormLessonAuthor(tpl.is_lesson_author);
    setEditTpl(tpl); setShowForm(true);
  }

  function handleFormLessonAuthorChange(checked: boolean) {
    setFormLessonAuthor(checked);
    if (checked) setFormActive(false);
  }

  async function handleSave() {
    if (!formName.trim()) { toast.error("Tên mascot trống"); return; }
    if (!formPrompt.trim()) { toast.error("Prompt trống"); return; }
    setSaving(true);
    try {
      if (editTpl) {
        await updateTemplate(editTpl.id, {
          name: formName,
          description: formDesc,
          prompt: formPrompt,
          voice_prompt: formVoicePrompt.trim() || null,
          is_active: formLessonAuthor ? false : formActive,
          is_lesson_author: formLessonAuthor,
        });
        toast.success("Cập nhật thành công");
      } else {
        await createTemplate({
          name: formName,
          description: formDesc,
          prompt: formPrompt,
          voice_prompt: formVoicePrompt.trim() || null,
          is_active: formLessonAuthor ? false : formActive,
          is_lesson_author: formLessonAuthor,
        });
        toast.success("Tạo thành công");
      }
      setShowForm(false); loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try { await deleteTemplate(deletingId); toast.success("Đã xoá"); setDeletingId(null); loadData(); }
    catch { toast.error("Lỗi xoá"); }
  }

  async function handleToggleActive(tpl: PromptTemplate) {
    if (tpl.is_lesson_author) {
      toast.error("Mascot chuyên gia bài học không hiển thị trong AI Chatbot");
      return;
    }
    try {
      await updateTemplate(tpl.id, { is_active: !tpl.is_active });
      toast.success(tpl.is_active ? "Đã tắt" : "Đã bật");
      loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
  }

  async function handleToggleLessonAuthor(tpl: PromptTemplate) {
    try {
      await updateTemplate(tpl.id, { is_lesson_author: !tpl.is_lesson_author });
      toast.success(tpl.is_lesson_author ? "Đã tắt chuyên gia bài học" : "Đã chọn chuyên gia bài học");
      loadData();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi"); }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !targetUploadId) return;
    setUploadingAvatar(targetUploadId);
    try { await uploadTemplateAvatar(targetUploadId, file); toast.success("Avatar đã cập nhật"); loadData(); }
    catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi upload"); }
    finally { setUploadingAvatar(null); setTargetUploadId(null); if (avatarInputRef.current) avatarInputRef.current.value = ""; }
  }

  async function handleFullbodyUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !targetUploadId) return;
    setUploadingFullbody(targetUploadId);
    try { await uploadTemplateFullbody(targetUploadId, file); toast.success("Ảnh full-body đã cập nhật"); loadData(); }
    catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi upload"); }
    finally { setUploadingFullbody(null); setTargetUploadId(null); if (fullbodyInputRef.current) fullbodyInputRef.current.value = ""; }
  }

  const templates = result?.templates || [];
  const activeCount = result?.activeCount || 0;
  const lessonAuthorTemplate = templates.find(tpl => tpl.is_lesson_author);

  return (
    <div className="p-6 space-y-6">
      <input ref={avatarInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarUpload} />
      <input ref={fullbodyInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFullbodyUpload} />

      <div className="flex items-center justify-between">
        <PageHeader icon={Drama} title="System Prompts" description="Quản lý nhân cách (mascot) mặc định cho chatbot" />
        <div className="flex items-center gap-3">
          <Badge variant={lessonAuthorTemplate ? "default" : "outline"} className="text-sm px-3 py-1 gap-1.5">
            <Flag className="h-3.5 w-3.5" />
            {lessonAuthorTemplate ? "Đã chọn chuyên gia" : "Chưa chọn chuyên gia"}
          </Badge>
          <Badge variant={activeCount >= 6 ? "destructive" : "secondary"} className="text-sm px-3 py-1">
            {activeCount}/6 đang bật
          </Badge>
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Tạo Mascot</Button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {loading ? Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2 flex-1"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-20" /></div>
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-8 w-full" />
          </div>
        )) : templates.length === 0 ? (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Drama className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có mascot nào. Tạo mới để bắt đầu!</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {templates.map((tpl, i) => (
              <motion.div
                key={tpl.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" exit="exit" layout
                className="group rounded-xl border bg-card hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 overflow-hidden"
              >
                {/* Fullbody preview */}
                <div className="relative h-40 bg-gradient-to-br from-muted/30 to-muted/10 flex items-center justify-center overflow-hidden">
                  {uploadingFullbody === tpl.id ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : tpl.fullbody_url ? (
                    <img src={storageUrl(tpl.fullbody_url)} alt={tpl.name} className="h-full w-auto object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                      <Bot className="h-16 w-16" style={{ color: getDefaultColor(i) }} />
                    </div>
                  )}
                  {/* Upload fullbody overlay */}
                  <button
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => { setTargetUploadId(tpl.id); fullbodyInputRef.current?.click(); }}
                  >
                    <div className="flex items-center gap-2 text-white text-sm font-medium">
                      <Image className="h-4 w-4" /> Upload ảnh full-body
                    </div>
                  </button>
                </div>

                <div className="p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="relative shrink-0 cursor-pointer group/avatar"
                      onClick={() => { setTargetUploadId(tpl.id); avatarInputRef.current?.click(); }}
                    >
                      <div
                        className="h-12 w-12 rounded-full overflow-hidden border-2 border-border flex items-center justify-center"
                        style={!tpl.avatar_url ? { backgroundColor: getDefaultColor(i) + '20' } : {}}
                      >
                        {uploadingAvatar === tpl.id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        ) : tpl.avatar_url ? (
                          <img src={storageUrl(tpl.avatar_url)} alt={tpl.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-lg font-bold" style={{ color: getDefaultColor(i) }}>
                            {tpl.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                        <Camera className="h-4 w-4 text-white" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="font-semibold truncate">{tpl.name}</h4>
                        {tpl.is_lesson_author && (
                          <Badge className="shrink-0 bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1 text-[10px]">
                            <Flag className="h-3 w-3" /> Chuyên gia
                          </Badge>
                        )}
                      </div>
                      {tpl.description && <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tpl)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingId(tpl.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Prompt preview */}
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed font-mono">{tpl.prompt}</p>
                  </div>

                  {tpl.voice_prompt && (
                    <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                        <Volume2 className="h-3.5 w-3.5" /> Voice prompt
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tpl.voice_prompt}</p>
                    </div>
                  )}

                  {/* Toggle active */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={tpl.is_active}
                        onCheckedChange={() => handleToggleActive(tpl)}
                        disabled={tpl.is_lesson_author || (!tpl.is_active && activeCount >= 6)}
                      />
                      <span className={`text-xs font-medium ${tpl.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {tpl.is_active ? "Đang bật" : "Đã tắt"}
                      </span>
                    </div>
                    {tpl.is_lesson_author ? (
                      <span className="text-xs text-amber-600">Dùng riêng cho chuyên gia</span>
                    ) : !tpl.is_active && activeCount >= 6 && (
                      <span className="text-xs text-destructive">Đã đủ 6/6</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Flag className="h-3.5 w-3.5 text-amber-600" />
                        Chuyên gia bài học
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Chỉ superadmin chọn, mỗi thời điểm tối đa 1 mascot.
                      </p>
                    </div>
                    <Switch
                      checked={tpl.is_lesson_author}
                      onCheckedChange={() => handleToggleLessonAuthor(tpl)}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={() => setShowForm(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editTpl ? "Sửa Mascot" : "Tạo Mascot mới"}</DialogTitle>
            <DialogDescription>Mỗi mascot = 1 nhân cách AI với tên, mô tả và system prompt riêng.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tên mascot <span className="text-destructive">*</span></label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="VD: Tư vấn bán hàng" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Mô tả</label>
                <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Mô tả ngắn về nhân cách" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">System Prompt <span className="text-destructive">*</span></label>
              <Textarea
                value={formPrompt} onChange={e => setFormPrompt(e.target.value)}
                placeholder="Bạn là trợ lý AI chuyên tư vấn bán hàng. Phong cách: thân thiện, chuyên nghiệp..."
                rows={6} className="resize-none font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Voice Prompt</label>
              <Textarea
                value={formVoicePrompt} onChange={e => setFormVoicePrompt(e.target.value)}
                placeholder="VD: Nói giọng nữ miền Nam, ấm áp, tốc độ vừa phải, ngắt nghỉ tự nhiên."
                rows={4} className="resize-none text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formActive} onCheckedChange={setFormActive}
                disabled={formLessonAuthor || (!editTpl?.is_active && !formActive && activeCount >= 6)} />
              <label className="text-sm">Bật mascot thường {!editTpl?.is_active && activeCount >= 6 && !formLessonAuthor && "(đã đủ 6/6)"}</label>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Flag className="h-4 w-4 text-amber-600" />
                  Chuyên gia bài học
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Mascot này sẽ được widget course outline sử dụng. Chỉ có 1 mascot chuyên gia được active.
                </p>
              </div>
              <Switch checked={formLessonAuthor} onCheckedChange={handleFormLessonAuthorChange} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Huỷ</Button></DialogClose>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editTpl ? "Cập nhật" : "Tạo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá Mascot</DialogTitle>
            <DialogDescription>Mascot sẽ bị xoá khỏi hệ thống và tất cả bot đang dùng nhân cách này.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Huỷ</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>Xoá</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
