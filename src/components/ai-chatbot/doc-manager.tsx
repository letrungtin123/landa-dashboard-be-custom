// ═══════════════════════════════════════════════════════════════
// Document Manager — 3 Sub-tabs: Tệp tin / Câu hỏi / Bài viết
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useTenantStore } from "@/utils/tenant-store";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2, Search, Loader2, Upload, FileText, FolderOpen, ArrowLeft,
  RotateCcw, Filter, Download, FileSpreadsheet, FileEdit, Plus, Pencil, RefreshCw, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  fetchDocuments, fetchKnowledgebase, uploadDocuments, deleteDocument, bulkDeleteDocuments, retryDocuments,
  uploadFaqDocument, downloadFaqTemplate,
  createArticle, updateArticle, getArticle, restoreKnowledgebase,
  type Knowledgebase, type KbDocument,
} from "@/api/custom-ai-chatbot";
import {
  statusBadge, formatBytes, formatDate, useDebounce,
  PaginationBar, TableSkeleton,
} from "./ai-chatbot-helpers";
import { AppTooltip } from '@/components/ui/tooltip';
import { getLocalizedApiError } from "@/utils/localized-error";

const TiptapEditor = lazy(() => import("@/components/shared/tiptap-editor"));

// ═══════════════════════════════════════════════════════════════
// Document Manager (entry point)
// ═══════════════════════════════════════════════════════════════
export function DocumentManager({ kb, onBack }: { kb: Knowledgebase; onBack: () => void }) {
  const { t } = useTranslation();
  const [docTab, setDocTab] = useState("files");
  const [restoringKb, setRestoringKb] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [kbState, setKbState] = useState(kb);

  const restoreState = kbState.restore_state || "idle";
  const restoreActive = restoreState === "queued" || restoreState === "restoring" || restoreState === "uploading";
  const restoreRequired = Boolean(kbState.restore_required);
  const restoreProgress = kbState.restore_progress;
  const restoreDone = restoreProgress
    ? restoreProgress.learned_docs + restoreProgress.failed_docs + restoreProgress.skipped_docs
    : 0;
  const restoreTotal = restoreProgress?.total_docs || 0;
  const aiTransitionState = kbState.ai_transition_state || "idle";
  const aiTransitionActive = aiTransitionState === "queued" || aiTransitionState === "running";
  const aiTransitionFailed = aiTransitionState === "failed";
  const aiTransitionProgress = kbState.ai_transition_progress;
  const aiTransitionDone = aiTransitionProgress?.processed_documents || 0;
  const aiTransitionTotal = aiTransitionProgress?.total_documents || 0;
  const aiTransitionToFileSearch = kbState.ai_pending_engine === "gemini_file_search";
  const aiTransitionTitle = aiTransitionToFileSearch
    ? t("aiChatbot.aiTransitionRunningToFileSearch")
    : t("aiChatbot.aiTransitionRunningToRag");
  const aiTransitionDescription = aiTransitionToFileSearch
    ? t("aiChatbot.aiTransitionRunningToFileSearchDescription")
    : t("aiChatbot.aiTransitionRunningDescription");
  const writeLocked = restoreActive || aiTransitionActive;
  const lockedMutationMessage = aiTransitionActive
    ? (aiTransitionToFileSearch ? t("aiChatbot.aiTransitionCannotModifyToFileSearch") : t("aiChatbot.aiTransitionCannotModify"))
    : t("aiChatbot.knowledgeBaseRestoring");

  useEffect(() => { setKbState(kb); }, [kb]);

  const refreshKbState = useCallback(async () => {
    try {
      setKbState(await fetchKnowledgebase(kb.id));
    } catch {
      // Non-critical; document polling still works.
    }
  }, [kb.id]);

  useEffect(() => {
    if (!restoreActive && !restoringKb && !aiTransitionActive) return;
    const timer = window.setInterval(refreshKbState, 3000);
    return () => window.clearInterval(timer);
  }, [restoreActive, restoringKb, aiTransitionActive, refreshKbState]);

  // Tự động quay lại KB list khi superadmin đổi tenant
  const activeTenantId = useTenantStore(s => s.activeTenantId);
  const initialTenantRef = useRef(activeTenantId);
  useEffect(() => {
    if (initialTenantRef.current !== activeTenantId) {
      onBack();
    }
  }, [activeTenantId, onBack]);

  async function handleRestoreKb() {
    setRestoreDialogOpen(false);
    setRestoringKb(true);
    try {
      await restoreKnowledgebase(kbState.id);
      await refreshKbState();
      toast.success(t("aiChatbot.restoreQueued"));
    } catch (err: unknown) {
      toast.error(getLocalizedApiError(err, t("aiChatbot.restoreFailed")));
    } finally {
      setRestoringKb(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> {t("aiChatbot.back")}</Button>
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><FolderOpen className="h-5 w-5 text-primary" /> {kbState.name}</h3>
          <p className="text-sm text-muted-foreground">{t("aiChatbot.manageKnowledgeBaseDocuments")}</p>
        </div>
      </div>
      {(aiTransitionActive || aiTransitionFailed) && (
        <div className={`rounded-lg border p-4 ${aiTransitionActive ? "border-sky-300 bg-sky-50 text-sky-950" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
          <div className="flex items-start gap-3">
            {aiTransitionActive ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin" /> : <AlertTriangle className="mt-0.5 h-5 w-5" />}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm font-semibold">
                {aiTransitionActive ? aiTransitionTitle : t("aiChatbot.aiTransitionFailed")}
              </div>
              <p className="text-sm opacity-90">
                {aiTransitionActive
                  ? aiTransitionDescription
                  : (aiTransitionProgress?.last_error || t("aiChatbot.aiTransitionFailedDescription"))}
              </p>
              {aiTransitionProgress && (
                <div className="text-xs opacity-80">
                  {t("aiChatbot.aiTransitionProgress", { done: aiTransitionDone, total: aiTransitionTotal })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {(restoreRequired || restoreActive || restoreState === "failed") && (
        <div className={`rounded-lg border p-4 ${restoreActive ? "border-amber-300 bg-amber-50 text-amber-950" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
          <div className="flex items-start gap-3">
            {restoreActive ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin" /> : <AlertTriangle className="mt-0.5 h-5 w-5" />}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm font-semibold">
                {restoreActive ? t("aiChatbot.knowledgeBaseRestoring") : t("aiChatbot.knowledgeBaseNeedsRestore")}
              </div>
              <p className="text-sm opacity-90">
                {restoreActive
                  ? t("aiChatbot.restoreInProgressDescription")
                  : (kbState.restore_error_reason || kbState.restore_reason || t("aiChatbot.restoreUnavailableReason"))}
              </p>
              {restoreProgress && (
                <div className="text-xs opacity-80">
                  {t("aiChatbot.restoreProgress", { done: restoreDone, total: restoreTotal, learned: restoreProgress.learned_docs, failed: restoreProgress.failed_docs, skipped: restoreProgress.skipped_docs })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {restoreRequired && !restoreActive && (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={restoringKb}
          onClick={() => setRestoreDialogOpen(true)}
        >
          {restoringKb ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("aiChatbot.restoreKnowledgeBase")}
        </Button>
      </div>
      )}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("aiChatbot.restoreKnowledgeBase")}</DialogTitle>
            <DialogDescription>
              {t("aiChatbot.restoreKnowledgeBaseDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={restoringKb}>{t("aiChatbot.cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleRestoreKb} disabled={restoringKb} className="gap-2">
              {restoringKb && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("aiChatbot.confirmRestore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Tabs value={docTab} onValueChange={setDocTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="files" className="gap-2"><FileText className="h-4 w-4" /> {t("aiChatbot.files")}</TabsTrigger>
          <TabsTrigger value="faqs" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> {t("aiChatbot.questions")}</TabsTrigger>
          <TabsTrigger value="articles" className="gap-2"><FileEdit className="h-4 w-4" /> {t("aiChatbot.articles")}</TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="mt-4"><FilesSubTab kb={kbState} restoreLocked={writeLocked} lockMessage={lockedMutationMessage} /></TabsContent>
        <TabsContent value="faqs" className="mt-4"><FaqsSubTab kb={kbState} restoreLocked={writeLocked} lockMessage={lockedMutationMessage} /></TabsContent>
        <TabsContent value="articles" className="mt-4"><ArticlesSubTab kb={kbState} restoreLocked={writeLocked} lockMessage={lockedMutationMessage} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────
// Files Sub-Tab
// ───────────────────────────────────────
function FilesSubTab({ kb, restoreLocked, lockMessage }: { kb: Knowledgebase; restoreLocked: boolean; lockMessage: string }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const searchDebounced = useDebounce(searchInput);
  const [filterStatus, setFilterStatus] = useState("__all__");

  useEffect(() => { setPage(1); }, [searchDebounced, filterStatus, pageSize]);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchDocuments(kb.id, { page, page_size: pageSize, search: searchDebounced || undefined, status: filterStatus !== "__all__" ? filterStatus : undefined, type: "file" });
      setDocs(r.data); setTotal(r.total);
    } catch { toast.error(t("aiChatbot.loadDocumentsFailed")); } finally { setLoading(false); }
  }, [kb.id, page, pageSize, searchDebounced, filterStatus, t]);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => { if (!docs.some(d => d.status === "learning")) return; const i = setInterval(loadDocs, 8000); return () => clearInterval(i); }, [docs, loadDocs]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, searchDebounced, filterStatus]);

  const allSelected = docs.length > 0 && docs.every(d => selectedIds.has(d.id));
  const someSelected = selectedIds.size > 0;
  const errorSelected = docs.filter(d => selectedIds.has(d.id) && d.status === "error");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (restoreLocked) { toast.error(lockMessage); return; }
    const fl = e.target.files; if (!fl || fl.length === 0) return;
    const files = Array.from(fl); if (files.length > 20) { toast.error(t("aiChatbot.maxFiles")); return; }
    setUploading(true);
    try { const r = await uploadDocuments(kb.id, files); if (r.uploaded > 0) toast.success(t("aiChatbot.uploadSucceeded", { count: r.uploaded })); if (r.failed > 0) r.results.filter(x => !x.success).forEach(x => toast.error(`${x.file}: ${x.error}`)); loadDocs(); }
    catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.uploadFailed"))); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }
  async function handleBulkDelete() {
    if (restoreLocked) { toast.error(lockMessage); return; }
    if (!selectedIds.size) return;
    const idsToDelete = Array.from(selectedIds);
    setConfirmBulkDelete(false);
    setDocs(prev => prev.map(d => idsToDelete.includes(d.id) ? { ...d, status: 'deleting' } : d));
    setSelectedIds(new Set());
    try { const r = await bulkDeleteDocuments(kb.id, idsToDelete); toast.success(t("aiChatbot.documentsDeleted", { count: r.deleted })); }
    catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.deleteFailed"))); }
    finally { loadDocs(); }
  }
  async function handleRetry() { if (restoreLocked) { toast.error(lockMessage); return; } const ids = errorSelected.map(d => d.id); if (!ids.length) return; setRetrying(true); try { const r = await retryDocuments(kb.id, ids); toast.success(t("aiChatbot.retryCount", { count: r.retried })); setSelectedIds(new Set()); loadDocs(); } catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.genericError"))); } finally { setRetrying(false); } }
  async function handleRetryAll() { if (restoreLocked) { toast.error(lockMessage); return; } const ids = docs.filter(d => d.status === "error").map(d => d.id); if (!ids.length) return; setRetrying(true); try { const r = await retryDocuments(kb.id, ids); toast.success(t("aiChatbot.retryCount", { count: r.retried })); loadDocs(); } catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.genericError"))); } finally { setRetrying(false); } }

  const hasErrors = docs.some(d => d.status === "error");
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t("aiChatbot.fileCount", { count: total })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadDocs} className="gap-1"><RefreshCw className="h-3.5 w-3.5" /> {t("aiChatbot.refresh")}</Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || restoreLocked} className="gap-2">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t("aiChatbot.upload")}</Button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.doc,.txt,.md,.pptx,.csv" multiple onChange={handleUpload} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t("aiChatbot.searchFileName")} value={searchInput} onChange={e => setSearchInput(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v)}><SelectTrigger className="w-[180px]"><Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">{t("aiChatbot.allStatuses")}</SelectItem><SelectItem value="learned">{t("aiChatbot.learned")}</SelectItem><SelectItem value="learning">{t("aiChatbot.learning")}</SelectItem><SelectItem value="error">{t("aiChatbot.error")}</SelectItem><SelectItem value="draft">{t("aiChatbot.draft")}</SelectItem></SelectContent>
        </Select>
      </div>
      {someSelected && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
        <span className="text-sm font-medium">{t("aiChatbot.selectedCount", { count: selectedIds.size })}</span>
        <div className="flex gap-2 ml-auto">
          {errorSelected.length > 0 && <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying || restoreLocked} className="gap-1.5">{retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} {t("aiChatbot.retryCount", { count: errorSelected.length })}</Button>}
          <Button variant="destructive" size="sm" onClick={() => setConfirmBulkDelete(true)} disabled={restoreLocked} className="gap-1.5"><Trash2 className="h-3.5 w-3.5" /> {t("aiChatbot.deleteCount", { count: selectedIds.size })}</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>{t("aiChatbot.deselect")}</Button>
        </div>
      </motion.div>}
      {hasErrors && !someSelected && <Button variant="outline" size="sm" onClick={handleRetryAll} disabled={retrying || restoreLocked} className="gap-1.5 text-orange-500 border-orange-500/30 hover:bg-orange-500/10">{retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} {t("aiChatbot.retryAllErrors")}</Button>}

      <div className="app-liquid-card rounded-lg border bg-card">
        {loading && docs.length === 0 ? <TableSkeleton cols={6} rows={5} />
        : <DocTable docs={docs} loading={loading} selectedIds={selectedIds} onToggleAll={() => setSelectedIds(allSelected ? new Set() : new Set(docs.map(d => d.id)))} onToggle={id => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })} kbId={kb.id} onRefresh={loadDocs} searchActive={!!searchDebounced || filterStatus !== "__all__"} onSetDeleting={id => setDocs(prev => prev.map(d => d.id === id ? { ...d, status: 'deleting' } : d))} restoreLocked={restoreLocked} lockMessage={lockMessage} />}
      </div>
      <PaginationBar page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />

      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}><DialogContent><DialogHeader><DialogTitle>{t("aiChatbot.deleteDocuments", { count: selectedIds.size })}</DialogTitle><DialogDescription>{t("aiChatbot.irreversible")}</DialogDescription></DialogHeader>
        <DialogFooter><DialogClose asChild><Button variant="outline">{t("aiChatbot.cancel")}</Button></DialogClose><Button variant="destructive" onClick={handleBulkDelete}>{t("aiChatbot.deleteDocuments", { count: selectedIds.size })}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}

// ───────────────────────────────────────
// FAQs Sub-Tab
// ───────────────────────────────────────
function FaqsSubTab({ kb, restoreLocked, lockMessage }: { kb: Knowledgebase; restoreLocked: boolean; lockMessage: string }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const searchDebounced = useDebounce(searchInput);
  const [filterStatus, setFilterStatus] = useState("__all__");

  useEffect(() => { setPage(1); }, [searchDebounced, filterStatus, pageSize]);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchDocuments(kb.id, { page, page_size: pageSize, search: searchDebounced || undefined, status: filterStatus !== "__all__" ? filterStatus : undefined, type: "faq" });
      setDocs(r.data); setTotal(r.total);
    } catch { toast.error(t("aiChatbot.loadFaqsFailed")); } finally { setLoading(false); }
  }, [kb.id, page, pageSize, searchDebounced, filterStatus, t]);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => { if (!docs.some(d => d.status === "learning")) return; const i = setInterval(loadDocs, 8000); return () => clearInterval(i); }, [docs, loadDocs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (restoreLocked) { toast.error(lockMessage); return; }
    const file = e.target.files?.[0]; if (!file) return;
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') { toast.error(t("aiChatbot.excelOnly")); return; }
    setUploading(true);
    try { await uploadFaqDocument(kb.id, file); toast.success(t("aiChatbot.faqUploadSuccess")); loadDocs(); }
    catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.faqUploadFailed"))); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function handleDownloadTemplate() { try { await downloadFaqTemplate(kb.id); } catch { toast.error(t("aiChatbot.templateDownloadFailed")); } }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-muted-foreground">{t("aiChatbot.faqFileCount", { count: total })}</span>
          <p className="text-xs text-muted-foreground mt-1">{t("aiChatbot.faqUploadHelp")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-1.5"><Download className="h-3.5 w-3.5" /> {t("aiChatbot.downloadTemplate")}</Button>
          <Button variant="outline" size="sm" onClick={loadDocs} className="gap-1"><RefreshCw className="h-3.5 w-3.5" /> {t("aiChatbot.refresh")}</Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || restoreLocked} className="gap-2">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t("aiChatbot.uploadFaq")}</Button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleUpload} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t("aiChatbot.searchFileName")} value={searchInput} onChange={e => setSearchInput(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v)}><SelectTrigger className="w-[180px]"><Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">{t("aiChatbot.allStatuses")}</SelectItem><SelectItem value="learned">{t("aiChatbot.learned")}</SelectItem><SelectItem value="learning">{t("aiChatbot.learning")}</SelectItem><SelectItem value="error">{t("aiChatbot.error")}</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="app-liquid-card rounded-lg border bg-card">
        {loading && docs.length === 0 ? <TableSkeleton cols={5} rows={4} />
        : <Table><TableHeader><TableRow><TableHead>{t("aiChatbot.fileName")}</TableHead><TableHead className="text-center">{t("aiChatbot.rows")}</TableHead><TableHead className="text-center">{t("aiChatbot.size")}</TableHead><TableHead className="text-center">{t("aiChatbot.status")}</TableHead><TableHead>{t("aiChatbot.uploadDate")}</TableHead><TableHead className="text-right">{t("aiChatbot.actions")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {docs.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">{searchDebounced || filterStatus !== "__all__" ? t("aiChatbot.notFound") : t("aiChatbot.noFaqs")}</TableCell></TableRow>
            : <AnimatePresence>{docs.map(doc => (
              <motion.tr key={doc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <TableCell><div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-emerald-500 shrink-0" /><span className="font-medium truncate max-w-[250px]">{doc.name}</span></div></TableCell>
                <TableCell className="text-center text-sm">{(doc.source_info as any)?.row_count || "—"}</TableCell>
                <TableCell className="text-center text-sm">{formatBytes(doc.source_info?.size)}</TableCell>
                <TableCell className="text-center"><div className="flex flex-col items-center gap-1">{statusBadge(doc.status)}{doc.error_reason && <AppTooltip content={doc.error_reason}><span className="text-xs text-destructive max-w-[150px] truncate" >{doc.error_reason}</span></AppTooltip>}</div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(doc.created_at)}</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-1">
                  {doc.status === "error" && <Button variant="ghost" size="icon" className="text-orange-500" disabled={restoreLocked} onClick={async () => { if (restoreLocked) { toast.error(lockMessage); return; } try { await retryDocuments(kb.id, [doc.id]); toast.success(t("aiChatbot.retry")); loadDocs(); } catch { toast.error(t("aiChatbot.genericError")); } }}><RotateCcw className="h-4 w-4" /></Button>}
                  {doc.status !== "deleting" && doc.status !== "learning" && <Button variant="ghost" size="icon" className="text-destructive" disabled={restoreLocked} onClick={async () => { if (restoreLocked) { toast.error(lockMessage); return; } setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'deleting' } : d)); try { await deleteDocument(kb.id, doc.id); toast.success(t("aiChatbot.delete")); } catch { toast.error(t("aiChatbot.deleteFailed")); } loadDocs(); }}><Trash2 className="h-4 w-4" /></Button>}
                </div></TableCell>
              </motion.tr>
            ))}</AnimatePresence>}
          </TableBody>
        </Table>}
      </div>
      <PaginationBar page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

// ───────────────────────────────────────
// Articles Sub-Tab
// ───────────────────────────────────────
function ArticlesSubTab({ kb, restoreLocked, lockMessage }: { kb: Knowledgebase; restoreLocked: boolean; lockMessage: string }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const searchDebounced = useDebounce(searchInput);
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [showEditor, setShowEditor] = useState(false);
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [articleTitle, setArticleTitle] = useState("");
  const [articleContent, setArticleContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [articleUpdatedAt, setArticleUpdatedAt] = useState<string | null>(null);


  useEffect(() => { setPage(1); }, [searchDebounced, filterStatus, pageSize]);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchDocuments(kb.id, { page, page_size: pageSize, search: searchDebounced || undefined, status: filterStatus !== "__all__" ? filterStatus : undefined, type: "article" });
      setDocs(r.data); setTotal(r.total);
    } catch { toast.error(t("aiChatbot.loadArticlesFailed")); } finally { setLoading(false); }
  }, [kb.id, page, pageSize, searchDebounced, filterStatus, t]);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => { if (!docs.some(d => d.status === "learning")) return; const i = setInterval(loadDocs, 8000); return () => clearInterval(i); }, [docs, loadDocs]);


  function openCreate() { if (restoreLocked) { toast.error(lockMessage); return; } setEditDocId(null); setArticleTitle(""); setArticleContent(""); setArticleUpdatedAt(null); setShowEditor(true); }
  async function openEdit(docId: string) {
    if (restoreLocked) { toast.error(lockMessage); return; }
    setLoadingArticle(true); setShowEditor(true); setEditDocId(docId); setArticleUpdatedAt(null);
    try { const doc = await getArticle(kb.id, docId); setArticleTitle(doc.name); setArticleContent(doc.content || ""); setArticleUpdatedAt(doc.updated_at || null); }
    catch { toast.error(t("aiChatbot.loadArticlesFailed")); setShowEditor(false); }
    finally { setLoadingArticle(false); }
  }
  async function handleSave() {
    if (restoreLocked) { toast.error(lockMessage); return; }
    if (!articleTitle.trim()) { toast.error(t("aiChatbot.articleTitleRequired")); return; }
    if (!articleContent.trim()) { toast.error(t("aiChatbot.articleContentRequired")); return; }
    setSaving(true);
    try {
      if (editDocId) { await updateArticle(kb.id, editDocId, { title: articleTitle, content: articleContent, expected_updated_at: articleUpdatedAt || undefined }); toast.success(t("aiChatbot.articleSavedTraining")); }
      else { await createArticle(kb.id, { title: articleTitle, content: articleContent }); toast.success(t("aiChatbot.articleCreatedTraining")); }
      setShowEditor(false); loadDocs();
    } catch (err: unknown) { toast.error(getLocalizedApiError(err, t("aiChatbot.saveArticleFailed"))); }
    finally { setSaving(false); }
  }


  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-muted-foreground">{t("aiChatbot.articleCount", { count: total })}</span>
          <p className="text-xs text-muted-foreground mt-1">{t("aiChatbot.articleTrainingHelp")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadDocs} className="gap-1"><RefreshCw className="h-3.5 w-3.5" /> {t("aiChatbot.refresh")}</Button>
          <Button onClick={openCreate} disabled={restoreLocked} className="gap-2"><Plus className="h-4 w-4" /> {t("aiChatbot.createArticle")}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t("aiChatbot.searchArticleTitle")} value={searchInput} onChange={e => setSearchInput(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v)}><SelectTrigger className="w-[180px]"><Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">{t("aiChatbot.allStatuses")}</SelectItem><SelectItem value="learned">{t("aiChatbot.learned")}</SelectItem><SelectItem value="learning">{t("aiChatbot.learning")}</SelectItem><SelectItem value="error">{t("aiChatbot.error")}</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="app-liquid-card rounded-lg border bg-card">
        {loading && docs.length === 0 ? <TableSkeleton cols={4} rows={4} />
        : <Table><TableHeader><TableRow><TableHead>{t("aiChatbot.titleLabel")}</TableHead><TableHead className="text-center">{t("aiChatbot.status")}</TableHead><TableHead>{t("aiChatbot.createdDate")}</TableHead><TableHead className="text-right">{t("aiChatbot.actions")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {docs.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">{searchDebounced || filterStatus !== "__all__" ? t("aiChatbot.notFound") : t("aiChatbot.noArticles")}</TableCell></TableRow>
            : <AnimatePresence>{docs.map(doc => {
              const isLearning = doc.status === "learning";
              return (
              <motion.tr key={doc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={(isLearning || restoreLocked) ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-muted/50 transition-colors"}
                onClick={() => !isLearning && !restoreLocked && openEdit(doc.id)}
              >
                <TableCell><div className="flex items-center gap-2"><FileEdit className="h-4 w-4 text-blue-500 shrink-0" /><span className="font-medium truncate max-w-[300px]">{doc.name}</span></div></TableCell>
                <TableCell className="text-center"><div className="flex flex-col items-center gap-1">{statusBadge(doc.status)}{doc.error_reason && <AppTooltip content={doc.error_reason}><span className="text-xs text-destructive max-w-[150px] truncate" >{doc.error_reason}</span></AppTooltip>}</div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(doc.created_at)}</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" disabled={isLearning || restoreLocked} onClick={() => openEdit(doc.id)}><Pencil className="h-4 w-4" /></Button>
                  {doc.status === "error" && <Button variant="ghost" size="icon" className="text-orange-500" disabled={restoreLocked} onClick={async () => { if (restoreLocked) { toast.error(lockMessage); return; } try { await retryDocuments(kb.id, [doc.id]); toast.success(t("aiChatbot.retry")); loadDocs(); } catch { toast.error(t("aiChatbot.genericError")); } }}><RotateCcw className="h-4 w-4" /></Button>}
                  {doc.status !== "deleting" && !isLearning && <Button variant="ghost" size="icon" className="text-destructive" disabled={restoreLocked} onClick={async () => { if (restoreLocked) { toast.error(lockMessage); return; } setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'deleting' } : d)); try { await deleteDocument(kb.id, doc.id); toast.success(t("aiChatbot.delete")); } catch { toast.error(t("aiChatbot.deleteFailed")); } loadDocs(); }}><Trash2 className="h-4 w-4" /></Button>}
                </div></TableCell>
              </motion.tr>
              );
            })}</AnimatePresence>}
          </TableBody>
        </Table>}
      </div>
      <PaginationBar page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />

      <Dialog open={showEditor} onOpenChange={v => { if (!v) setShowEditor(false); }}>
        <DialogContent className="sm:max-w-[70vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editDocId ? t("aiChatbot.editArticle") : t("aiChatbot.createNewArticle")}</DialogTitle><DialogDescription>{t("aiChatbot.articleEditorDescription")}</DialogDescription></DialogHeader>
          {loadingArticle ? <div className="py-12"><TableSkeleton cols={1} rows={6} /></div> : (
            <div className="space-y-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">{t("aiChatbot.titleLabel")}</label><Input value={articleTitle} onChange={e => setArticleTitle(e.target.value)} placeholder={t("aiChatbot.articleTitlePlaceholder")} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">{t("aiChatbot.contentLabel")}</label>
                <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
                  <TiptapEditor content={articleContent} onChange={setArticleContent} placeholder={t("aiChatbot.articleContentPlaceholder")} />
                </Suspense>
              </div>
            </div>
          )}
          <DialogFooter><DialogClose asChild><Button variant="outline">{t("aiChatbot.cancel")}</Button></DialogClose><Button onClick={handleSave} disabled={saving || loadingArticle}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editDocId ? t("aiChatbot.updateAndRetrain") : t("aiChatbot.createAndTrain")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────────────────────────────────────
// Shared Document Table (Files tab)
// ───────────────────────────────────────
function DocTable({ docs, loading, selectedIds, onToggleAll, onToggle, kbId, onRefresh, searchActive, onSetDeleting, restoreLocked, lockMessage }: {
  docs: KbDocument[]; loading: boolean; selectedIds: Set<string>;
  onToggleAll: () => void; onToggle: (id: string) => void;
  kbId: string; onRefresh: () => void; searchActive: boolean;
  onSetDeleting?: (id: string) => void;
  restoreLocked?: boolean;
  lockMessage: string;
}) {
  const { t } = useTranslation();
  const allSelected = docs.length > 0 && docs.every(d => selectedIds.has(d.id));
  return (
    <Table><TableHeader><TableRow>
      <TableHead className="w-[40px]"><Checkbox checked={allSelected && docs.length > 0} onCheckedChange={onToggleAll} /></TableHead>
      <TableHead>{t("aiChatbot.fileName")}</TableHead><TableHead>{t("aiChatbot.type")}</TableHead><TableHead className="text-center">{t("aiChatbot.size")}</TableHead><TableHead className="text-center">{t("aiChatbot.status")}</TableHead><TableHead>{t("aiChatbot.uploadDate")}</TableHead><TableHead className="text-right">{t("aiChatbot.actions")}</TableHead>
    </TableRow></TableHeader>
      <TableBody>
        {docs.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{searchActive ? t("aiChatbot.notFound") : t("aiChatbot.noFiles")}</TableCell></TableRow>
        : <AnimatePresence>{docs.map(doc => {
          const isSelected = selectedIds.has(doc.id);
          return (
            <motion.tr key={doc.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={isSelected ? "bg-muted/40" : undefined}>
              <TableCell><Checkbox checked={isSelected} onCheckedChange={() => onToggle(doc.id)} /></TableCell>
              <TableCell><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground shrink-0" /><span className="font-medium truncate max-w-[250px]">{doc.name}</span></div></TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{doc.source_info?.extension || doc.type}</Badge></TableCell>
              <TableCell className="text-center text-sm">{formatBytes(doc.source_info?.size)}</TableCell>
              <TableCell className="text-center"><div className="flex flex-col items-center gap-1">{statusBadge(doc.status)}{doc.error_reason && <AppTooltip content={doc.error_reason}><span className="text-xs text-destructive max-w-[150px] truncate" >{doc.error_reason}</span></AppTooltip>}</div></TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(doc.created_at)}</TableCell>
              <TableCell className="text-right"><div className="flex justify-end gap-1">
                {doc.status === "error" && <Button variant="ghost" size="icon" className="text-orange-500" disabled={restoreLocked} onClick={async () => { if (restoreLocked) { toast.error(lockMessage); return; } try { await retryDocuments(kbId, [doc.id]); toast.success(t("aiChatbot.retry")); onRefresh(); } catch { toast.error(t("aiChatbot.genericError")); } }}><RotateCcw className="h-4 w-4" /></Button>}
                {doc.status !== "deleting" && doc.status !== "learning" && <Button variant="ghost" size="icon" className="text-destructive" disabled={restoreLocked} onClick={async () => { if (restoreLocked) { toast.error(lockMessage); return; } onSetDeleting?.(doc.id); try { await deleteDocument(kbId, doc.id); toast.success(t("aiChatbot.delete")); } catch { toast.error(t("aiChatbot.deleteFailed")); } onRefresh(); }}><Trash2 className="h-4 w-4" /></Button>}
              </div></TableCell>
            </motion.tr>
          );
        })}</AnimatePresence>}
      </TableBody>
    </Table>
  );
}
