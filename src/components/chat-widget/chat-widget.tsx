// ═══════════════════════════════════════════════════════════════
// Chat Widget — Draggable FAB + Drawer with full chat experience
// FAB shows bot avatar, draggable via native pointer events
// Header has fullscreen toggle
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, X, Plus, ArrowLeft, Send, Trash2,
  Loader2, Bot, Sparkles, Clock, Maximize2, Minimize2, AlertTriangle,
  BookOpenCheck, CheckCircle2, AtSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { storageUrl } from '@/utils/storage-url';
import { useAuthStore } from '@/utils/store';
import {
  fetchActiveBot, fetchConversations, createConversation,
  deleteConversation, fetchMessages, sendMessageStream,
  fetchLessonAuthorSettings, applyLessonAuthorJob,
  type ActiveBot, type ChatConversation, type ChatMessage,
  type LessonAuthorProposalEvent, type LessonAuthorSettings,
  type OutlineMention,
} from '@/api/custom-chat';
import { fetchBotPersonas, type BotPersona } from '@/api/custom-ai-chatbot';
import {
  getCourseOutlineIndex,
  type CourseIndexResponse,
  type CourseIndexSection,
} from '@/api/custom-course-authoring';

// ── Types ──
type WidgetState = 'loading' | 'no-bot' | 'persona-picker' | 'conversations' | 'chat' | 'config-warning';
type ChatSurface = 'admin' | 'lesson_author';
type OutlineMentionOption = OutlineMention & { label: string; depth: number };
type OutlineAncestor = { id: string; block_type: string };

function normalizeMentionText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getMentionTypeLabel(blockType: string): string {
  if (blockType === 'chapter') return 'Section';
  if (blockType === 'sequential') return 'Subsection';
  if (blockType === 'vertical') return 'Unit';
  return 'Component';
}

function isStructuralBlock(blockType: string): boolean {
  return blockType === 'course' || blockType === 'chapter' || blockType === 'sequential' || blockType === 'vertical';
}

function getOutlineChildren(node: CourseIndexSection): CourseIndexSection[] {
  return node.children || node.child_info?.children || [];
}

function flattenOutlineMentions(
  node: CourseIndexSection,
  parents: string[] = [],
  depth = 0,
  ancestors: OutlineAncestor[] = [],
): OutlineMentionOption[] {
  const name = node.display_name || '(Không tên)';
  const isCourseRoot = node.block_type === 'course';
  const pathParts = isCourseRoot ? parents : [...parents, name];
  const children = getOutlineChildren(node);
  const currentAncestors = isCourseRoot
    ? ancestors
    : [...ancestors, { id: node.id, block_type: node.block_type }];
  const verticalAncestor = [...currentAncestors].reverse().find(item => item.block_type === 'vertical');
  const current: OutlineMentionOption[] = isCourseRoot ? [] : [{
    block_id: node.id,
    block_type: node.block_type,
    display_name: name,
    path: pathParts.join(' / '),
    unit_id: node.block_type === 'vertical' ? node.id : verticalAncestor?.id ?? null,
    ancestor_ids: ancestors.map(item => item.id),
    ancestor_types: ancestors.map(item => item.block_type),
    label: getMentionTypeLabel(node.block_type),
    depth,
  }];

  return [
    ...current,
    ...children.flatMap(child => flattenOutlineMentions(child, pathParts, depth + 1, currentAncestors)),
  ];
}

function getMessageOutlineMentions(metadata: unknown): OutlineMention[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const mentions = (metadata as { outline_mentions?: unknown }).outline_mentions;
  if (!Array.isArray(mentions)) return [];
  return mentions
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      block_id: typeof item.block_id === 'string' ? item.block_id : '',
      block_type: typeof item.block_type === 'string' ? item.block_type : 'unknown',
      display_name: typeof item.display_name === 'string' ? item.display_name : 'Không tên',
      path: typeof item.path === 'string' ? item.path : '',
      unit_id: typeof item.unit_id === 'string' ? item.unit_id : null,
      ancestor_ids: Array.isArray(item.ancestor_ids) ? item.ancestor_ids.filter((id): id is string => typeof id === 'string') : [],
      ancestor_types: Array.isArray(item.ancestor_types) ? item.ancestor_types.filter((type): type is string => typeof type === 'string') : [],
    }))
    .filter(item => item.block_id);
}

function getLatestPendingProposalEvent(messages: ChatMessage[]): LessonAuthorProposalEvent | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = messages[index].metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;

    const record = metadata as Record<string, unknown>;
    if (record.kind !== 'lesson_author_proposal') continue;
    if (record.lesson_author_job_status !== 'proposed') continue;

    const jobId = typeof record.lesson_author_job_id === 'string' ? record.lesson_author_job_id : '';
    const proposal = record.lesson_author_proposal;
    if (!jobId || !proposal || typeof proposal !== 'object' || Array.isArray(proposal)) continue;

    return {
      type: 'proposal',
      job_id: jobId,
      proposal: proposal as LessonAuthorProposalEvent['proposal'],
    };
  }
  return null;
}

// ── Main Component ──
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [surface, setSurface] = useState<ChatSurface>('admin');
  const [state, setState] = useState<WidgetState>('loading');
  const [activeBot, setActiveBot] = useState<ActiveBot | null>(null);
  const [lessonSettings, setLessonSettings] = useState<LessonAuthorSettings | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [personas, setPersonas] = useState<BotPersona[]>([]);
  const [currentConv, setCurrentConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposalEvent, setProposalEvent] = useState<LessonAuthorProposalEvent | null>(null);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [outlineMentionOptions, setOutlineMentionOptions] = useState<OutlineMentionOption[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<OutlineMentionOption[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamAccRef = useRef('');  // accumulate stream text without React state race
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── FAB drag ref ──
  const fabRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ sx: 0, sy: 0, sl: 0, st: 0, active: false, moved: false });

  const user = useAuthStore(s => s.user);
  const permissions = useAuthStore(s => s.permissions);
  const hasPermission = user?.role === 'superadmin' || (permissions as any)?.ai_chatbot?.can_view;
  const location = useLocation();
  const queryClient = useQueryClient();
  const courseMatch = location.pathname.match(/^\/courses\/(.+)\/edit\/?$/);
  const courseId = courseMatch?.[1] ? decodeURIComponent(courseMatch[1]) : undefined;
  const isCourseOutline = Boolean(courseId);
  const isLessonAuthor = surface === 'lesson_author';

  // ── Pre-load bot avatar on mount (for FAB) ──
  useEffect(() => {
    if (!hasPermission) return;
    fetchActiveBot()
      .then(bot => { if (bot) setActiveBot(bot); })
      .catch(() => {});
  }, [hasPermission]);

  // ── Load full data when widget opens ──
  const resetChatState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setCurrentConv(null);
    setMessages([]);
    setInputValue('');
    setSelectedMentions([]);
    setStreamText('');
    setStreaming(false);
    setHasMore(false);
    setNextCursor(null);
    setProposalEvent(null);
  }, []);

  const loadOutlineMentions = useCallback(async (force = false) => {
    if (!courseId) {
      setOutlineMentionOptions([]);
      return;
    }

    try {
      const cacheKey = ['course-outline-index', courseId] as const;
      const cached = force ? undefined : queryClient.getQueryData<CourseIndexResponse>(cacheKey);
      const outline = cached ?? await queryClient.fetchQuery({
        queryKey: cacheKey,
        queryFn: () => getCourseOutlineIndex(courseId),
        staleTime: force ? 0 : 30_000,
      });
      if (!outline?.course_structure) {
        setOutlineMentionOptions([]);
        return;
      }
      setOutlineMentionOptions(flattenOutlineMentions(outline.course_structure));
    } catch {
      setOutlineMentionOptions([]);
    }
  }, [courseId, queryClient]);

  const loadActiveBot = useCallback(async (nextSurface: ChatSurface = surface) => {
    setState('loading');
    setLoadingConvs(false);
    try {
      if (nextSurface === 'lesson_author') {
        if (!courseId) {
          setSurface('admin');
          return;
        }

        const settings = await fetchLessonAuthorSettings();
        setLessonSettings(settings);
        setActiveBot(settings.active_bot);

        const personaMismatch = Boolean(
          settings.active_bot &&
          settings.active_persona &&
          settings.active_persona.bot_id !== settings.active_bot.bot_id,
        );

        if (!settings.active_bot || !settings.active_kb || !settings.active_persona || personaMismatch) {
          setConversations([]);
          setState('config-warning');
          return;
        }

        setLoadingConvs(true);
        const convs = await fetchConversations({ target: 'lesson_author', courseId });
        setConversations(convs);
        setLoadingConvs(false);
        setState('conversations');
        return;
      }

      setLessonSettings(null);
      const bot = await fetchActiveBot('admin');
      setActiveBot(bot);
      if (!bot) { setState('no-bot'); return; }

      setLoadingConvs(true);
      const convs = await fetchConversations({ target: 'admin' });
      setConversations(convs);
      setLoadingConvs(false);

      if (convs.length === 0) {
        const p = await fetchBotPersonas(bot.bot_id);
        setPersonas(p);
        setState('persona-picker');
      } else {
        setState('conversations');
      }
    } catch {
      setLoadingConvs(false);
      setState('no-bot');
    }
  }, [courseId, surface]);

  useEffect(() => {
    if (open) loadActiveBot();
  }, [open, loadActiveBot]);

  useEffect(() => {
    if (open && isLessonAuthor && courseId) {
      void loadOutlineMentions();
    } else if (!isLessonAuthor) {
      setOutlineMentionOptions([]);
      setSelectedMentions([]);
    }
  }, [courseId, isLessonAuthor, loadOutlineMentions, open]);

  useEffect(() => {
    if (!isCourseOutline && isLessonAuthor) {
      setSurface('admin');
      resetChatState();
      if (open) loadActiveBot('admin');
    }
  }, [isCourseOutline, isLessonAuthor, loadActiveBot, open, resetChatState]);

  // ── FAB pointer drag ──
  const onFabPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const fab = fabRef.current;
    if (!fab) return;
    fab.setPointerCapture(e.pointerId);
    const r = fab.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, sl: r.left, st: r.top, active: true, moved: false };
  }, []);

  const onFabPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const fab = fabRef.current;
    if (!fab) return;
    const nl = Math.max(8, Math.min(window.innerWidth - 64, d.sl + dx));
    const nt = Math.max(8, Math.min(window.innerHeight - 64, d.st + dy));
    fab.style.left = nl + 'px';
    fab.style.top = nt + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }, []);

  const onFabPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    d.active = false;
    const fab = fabRef.current;
    if (!fab) return;
    try { fab.releasePointerCapture(e.pointerId); } catch {}

    if (!d.moved) {
      setOpen(true);
      return;
    }
    // Snap to nearest edge
    const r = fab.getBoundingClientRect();
    const mid = window.innerWidth / 2;
    if (r.left + 28 > mid) {
      fab.style.left = 'auto';
      fab.style.right = '24px';
    } else {
      fab.style.left = '24px';
      fab.style.right = 'auto';
    }
    const clampedTop = Math.max(24, Math.min(window.innerHeight - 80, r.top));
    fab.style.top = clampedTop + 'px';
    fab.style.bottom = 'auto';
  }, []);

  // ── Create conversation ──
  const handleCreateConversation = async (personaId?: string) => {
    try {
      const activePersonaId = isLessonAuthor ? lessonSettings?.active_persona?.persona_id : personaId;
      if (!activePersonaId) {
        toast.error('Chua cau hinh nhan cach chuyen gia bai hoc');
        return;
      }
      const conv = await createConversation(activePersonaId, {
        target: isLessonAuthor ? 'lesson_author' : 'admin',
        courseId: isLessonAuthor ? courseId : undefined,
      });
      setConversations(prev => [conv, ...prev]);
      setCurrentConv(conv);
      setMessages([]);
      setSelectedMentions([]);
      setProposalEvent(null);
      setState('chat');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  // ── Open existing conversation ──
  const handleOpenConversation = async (conv: ChatConversation) => {
    setCurrentConv(conv);
    setSelectedMentions([]);
    setLoadingMessages(true);
    setState('chat');
    try {
      const result = await fetchMessages(conv.id);
      setMessages(result.messages);
      setProposalEvent(getLatestPendingProposalEvent(result.messages));
      setHasMore(result.has_more);
      setNextCursor(result.next_cursor);
    } catch { toast.error('Không tải được tin nhắn'); }
    setLoadingMessages(false);
  };

  // ── Load more messages ──
  const handleLoadMore = async () => {
    if (!currentConv || !hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchMessages(currentConv.id, nextCursor);
      const pendingProposal = getLatestPendingProposalEvent(result.messages);
      if (!proposalEvent && pendingProposal) setProposalEvent(pendingProposal);
      setMessages(prev => [...result.messages, ...prev]);
      setHasMore(result.has_more);
      setNextCursor(result.next_cursor);
    } catch { toast.error('Lỗi tải thêm tin nhắn'); }
    setLoadingMore(false);
  };

  // ── Delete conversation ──
  const handleDeleteConversation = (convId: string) => {
    setConfirmDeleteId(convId);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deleteConversation(confirmDeleteId);
      setConversations(prev => prev.filter(c => c.id !== confirmDeleteId));
      if (currentConv?.id === confirmDeleteId) { setCurrentConv(null); setState('conversations'); }
      toast.success('Đã xoá');
    } catch { toast.error('Lỗi khi xoá'); }
    finally { setDeleting(false); setConfirmDeleteId(null); }
  };

  // ── New conversation ──
  const handleNewConvFromList = async () => {
    if (!activeBot) return;
    if (conversations.length >= 10) { toast.error('Tối đa 10 cuộc hội thoại'); return; }
    if (isLessonAuthor) {
      await handleCreateConversation();
      return;
    }
    try {
      const p = await fetchBotPersonas(activeBot.bot_id);
      setPersonas(p);
      setState('persona-picker');
    } catch { toast.error('Không tải được nhân cách'); }
  };

  // ── Send message ──
  const handleSend = () => {
    if (!currentConv || !inputValue.trim() || streaming) return;
    const content = inputValue.trim();
    const outgoingMentions: OutlineMention[] = isLessonAuthor
      ? selectedMentions.map(({ block_id, block_type, display_name, path, unit_id, ancestor_ids, ancestor_types }) => ({
        block_id,
        block_type,
        display_name,
        path,
        unit_id,
        ancestor_ids,
        ancestor_types,
      }))
      : [];
    setInputValue('');
    setSelectedMentions([]);

    const userMsg: ChatMessage = {
      id: 'temp-' + Date.now(),
      conversation_id: currentConv.id,
      role: 'user',
      content,
      metadata: outgoingMentions.length > 0 ? { outline_mentions: outgoingMentions } : {},
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamText('');
    setProposalEvent(null);
    streamAccRef.current = '';
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);

    abortRef.current = sendMessageStream(
      currentConv.id,
      content,
      (text) => {
        streamAccRef.current += text;
        setStreamText(streamAccRef.current);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 10);
      },
      () => {
        const full = streamAccRef.current;
        if (full) {
          const assistantMsg: ChatMessage = {
            id: 'resp-' + Date.now(),
            conversation_id: currentConv.id,
            role: 'assistant',
            content: full,
            metadata: {},
            created_at: new Date().toISOString(),
          };
          setMessages(msgs => [...msgs, assistantMsg]);
        }
        setStreamText('');
        streamAccRef.current = '';
        setStreaming(false);
      },
      (message) => {
        const partial = streamAccRef.current.trim();
        if (isLessonAuthor) {
          const assistantMsg: ChatMessage = {
            id: 'err-' + Date.now(),
            conversation_id: currentConv.id,
            role: 'assistant',
            content: partial ? `${partial}\n\n${message}` : message,
            metadata: { kind: 'lesson_author_stream_error' },
            created_at: new Date().toISOString(),
          };
          setMessages(msgs => [...msgs, assistantMsg]);
        }
        toast.error(message);
        setStreaming(false);
        setStreamText('');
        streamAccRef.current = '';
      },
      {
        target: isLessonAuthor ? 'lesson_author' : 'admin',
        courseId: isLessonAuthor ? courseId : undefined,
        mode: isLessonAuthor ? 'auto' : 'chat',
        outline_mentions: outgoingMentions,
        onProposal: isLessonAuthor ? setProposalEvent : undefined,
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleBack = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setStreaming(false);
    setStreamText('');
    setCurrentConv(null);
    setMessages([]);
    setSelectedMentions([]);
    setHasMore(false);
    setNextCursor(null);
    setProposalEvent(null);
    setState('conversations');
    fetchConversations({
      target: isLessonAuthor ? 'lesson_author' : 'admin',
      courseId: isLessonAuthor ? courseId : undefined,
    }).then(setConversations).catch(() => {});
  };

  const handleSwitchLessonAuthor = async () => {
    if (!isCourseOutline || !courseId) return;
    const nextSurface: ChatSurface = isLessonAuthor ? 'admin' : 'lesson_author';
    setSurface(nextSurface);
    resetChatState();
    if (open) await loadActiveBot(nextSurface);
  };

  const handleApplyProposal = async () => {
    if (!proposalEvent || !courseId || applyingProposal) return;
    setApplyingProposal(true);
    try {
      const result = await applyLessonAuthorJob(proposalEvent.job_id);
      toast.success(`Đã tạo ${result.created_count} block, cập nhật ${result.updated_count} block`);
      setProposalEvent(null);
      const queryKey = ['course-outline-index', courseId] as const;
      await queryClient.invalidateQueries({ queryKey, exact: true });
      await queryClient.refetchQueries({ queryKey, exact: true, type: 'active' });
      await loadOutlineMentions(true);
      window.dispatchEvent(new CustomEvent('landa:course-outline-updated', {
        detail: {
          courseId,
          jobId: proposalEvent.job_id,
          createdBlockIds: result.created_block_ids,
          updatedBlockIds: result.updated_block_ids,
        },
      }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Không áp dụng được đề xuất');
    } finally {
      setApplyingProposal(false);
    }
  };

  const handleMentionClick = useCallback((mention: OutlineMention) => {
    if (!courseId) return;
    window.dispatchEvent(new CustomEvent('landa:focus-course-block', {
      detail: { courseId, mention },
    }));
  }, [courseId]);

  if (!hasPermission) return null;

  const widgetClass = fullscreen
    ? 'fixed inset-4 z-[9998] rounded-2xl'
    : 'fixed bottom-6 right-6 z-[9998] w-[420px] h-[600px] rounded-2xl';

  const activeAvatarUrl = isLessonAuthor
    ? (lessonSettings?.active_persona?.persona_avatar_url || activeBot?.bot_avatar_url)
    : activeBot?.bot_avatar_url;
  const botAvatarSrc = activeAvatarUrl ? storageUrl(activeAvatarUrl) : null;
  const headerTitle = isLessonAuthor ? 'Chuyên gia bài học' : (activeBot?.bot_name || 'AI Assistant');
  const headerSubtitle = isLessonAuthor
    ? (lessonSettings?.active_kb?.kb_name || 'Lesson author')
    : (streaming ? 'Đang trả lời...' : 'Online');

  return (
    <>
      {/* ═══════ Draggable FAB ═══════ */}
      {!open && (
        <div
          ref={fabRef}
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, touchAction: 'none' }}
          className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 flex items-center justify-center hover:shadow-xl hover:shadow-primary/30 cursor-grab active:cursor-grabbing select-none"
          title="Chat với AI"
        >
          {botAvatarSrc ? (
            <img src={botAvatarSrc} alt="" className="h-9 w-9 rounded-full object-cover pointer-events-none" draggable={false} />
          ) : (
            <MessageCircle className="h-6 w-6 text-primary-foreground pointer-events-none" />
          )}
          <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background animate-pulse pointer-events-none" />
        </div>
      )}

      {/* ═══════ Widget Panel ═══════ */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className={`${widgetClass} border bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/20 flex flex-col overflow-hidden`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-2.5">
                {state === 'chat' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                  {botAvatarSrc ? (
                    <img src={botAvatarSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{headerTitle}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{headerSubtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isCourseOutline && (
                  <Button
                    variant={isLessonAuthor ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={handleSwitchLessonAuthor}
                    title="Chuyên gia bài học"
                  >
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Chuyên gia</span>
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Thu nhỏ' : 'Phóng to'}>
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setOpen(false); setFullscreen(false); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 flex flex-col">
              {state === 'loading' && <LoadingState />}
              {state === 'no-bot' && <NoBotState />}
              {state === 'config-warning' && (
                <LessonAuthorWarning settings={lessonSettings} />
              )}
              {state === 'persona-picker' && (
                <PersonaPicker
                  personas={personas}
                  onSelect={handleCreateConversation}
                  onBack={conversations.length > 0 ? () => setState('conversations') : undefined}
                />
              )}
              {state === 'conversations' && (
                <ConversationList
                  conversations={conversations}
                  loading={loadingConvs}
                  onOpen={handleOpenConversation}
                  onDelete={handleDeleteConversation}
                  onNew={handleNewConvFromList}
                />
              )}
              {state === 'chat' && (
                <ChatView
                  messages={messages}
                  streamText={streamText}
                  streaming={streaming}
                  loading={loadingMessages}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={handleLoadMore}
                  inputValue={inputValue}
                  onInputChange={setInputValue}
                  onSend={handleSend}
                  onKeyDown={handleKeyDown}
                  isLessonAuthor={isLessonAuthor}
                  outlineMentionOptions={outlineMentionOptions}
                  selectedMentions={selectedMentions}
                  onSelectedMentionsChange={setSelectedMentions}
                  onMentionClick={handleMentionClick}
                  scrollRef={scrollRef}
                  inputRef={inputRef}
                  proposalEvent={proposalEvent}
                  applyingProposal={applyingProposal}
                  onApplyProposal={handleApplyProposal}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ Delete Confirmation Modal ═══════ */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!deleting) setConfirmDeleteId(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-background border rounded-xl shadow-2xl p-6 w-[340px] space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Xoá hội thoại</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Tin nhắn sẽ bị xoá vĩnh viễn và không thể khôi phục.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>Huỷ</Button>
                <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleting} className="gap-1.5">
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Xoá
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
      <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      <p className="text-sm text-muted-foreground">Đang kết nối...</p>
    </div>
  );
}

function NoBotState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
        <Bot className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground">Chưa có bot nào được kích hoạt cho trang này.</p>
      <p className="text-xs text-muted-foreground/60">Vào AI Chatbot → Triển khai → Chọn bot cho FE Admin.</p>
    </div>
  );
}

function LessonAuthorWarning({ settings }: { settings: LessonAuthorSettings | null }) {
  const missing: string[] = [];
  if (!settings?.active_bot) missing.push('Chatbot chuyên gia bài học');
  if (!settings?.active_kb) missing.push('KB chuyên gia bài học');
  if (!settings?.active_persona) missing.push('Mascot nhân cách chuyên gia bài học');
  if (
    settings?.active_bot &&
    settings?.active_persona &&
    settings.active_persona.bot_id !== settings.active_bot.bot_id
  ) {
    missing.push('Mascot chuyên gia không thuộc chatbot đang active');
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold">Chưa đủ cấu hình chuyên gia bài học</p>
        <p className="text-xs text-muted-foreground mt-1">
          Cần cấu hình đủ bot, KB và mascot chuyên gia trước khi chat trong course outline.
        </p>
      </div>
      <div className="w-full max-w-xs rounded-lg border bg-muted/30 p-3 text-left">
        <p className="text-[11px] font-medium text-muted-foreground mb-2">Đang thiếu</p>
        <div className="space-y-1">
          {missing.map(item => (
            <div key={item} className="flex items-center gap-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground max-w-xs">
        Vào AI Chatbot → Triển khai để chọn bot/KB, rồi vào tab Nhân cách của bot để bật cờ chuyên gia bài học.
      </p>
    </div>
  );
}

function PersonaPicker({ personas, onSelect, onBack }: {
  personas: BotPersona[];
  onSelect: (id: string) => void;
  onBack?: () => void;
}) {
  const [selecting, setSelecting] = useState<string | null>(null);

  const handleSelect = async (id: string) => {
    setSelecting(id);
    await onSelect(id);
    setSelecting(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /></Button>
          )}
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Chọn nhân cách</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Mỗi nhân cách có phong cách trả lời khác nhau</p>
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="grid grid-cols-2 gap-3 pt-2">
          {personas.map((p, i) => {
            const name = p.custom_name || p.template_name;
            const desc = p.custom_description || p.template_description || '';
            const fullbody = p.template_fullbody_url;
            const avatar = p.template_avatar_url;

            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => handleSelect(p.id)}
                disabled={selecting !== null}
                className="group relative rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 overflow-hidden text-left disabled:opacity-50"
              >
                <div className="h-28 bg-gradient-to-br from-muted/40 to-muted/10 flex items-end justify-center overflow-hidden">
                  {fullbody ? (
                    <img src={storageUrl(fullbody)} alt="" className="h-[90%] w-auto object-contain drop-shadow-md group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                      <Bot className="h-6 w-6 text-primary/40" />
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    {avatar ? (
                      <img src={storageUrl(avatar)} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-primary">{name.charAt(0)}</span>
                      </div>
                    )}
                    <p className="text-xs font-semibold truncate flex-1">{name}</p>
                  </div>
                  {desc && <p className="text-[10px] text-muted-foreground line-clamp-2">{desc}</p>}
                </div>
                {selecting === p.id && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function ConversationList({ conversations, loading, onOpen, onDelete, onNew }: {
  conversations: ChatConversation[];
  loading: boolean;
  onOpen: (conv: ChatConversation) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Hội thoại</h3>
          <p className="text-[11px] text-muted-foreground">{conversations.length}/10</p>
        </div>
        <Button size="sm" variant="outline" onClick={onNew} disabled={conversations.length >= 10} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" /> Mới
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {loading ? (
          <div className="space-y-2 px-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border"><Skeleton className="h-4 w-2/3 mb-2" /><Skeleton className="h-3 w-full" /></div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6 text-muted-foreground">
            <MessageCircle className="h-8 w-8 opacity-30" />
            <p className="text-xs">Chưa có hội thoại nào</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {conversations.map((conv, i) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors overflow-hidden"
                onClick={() => onOpen(conv)}
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 overflow-hidden">
                  {conv.persona_avatar_url ? (
                    <img src={storageUrl(conv.persona_avatar_url)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="h-4 w-4 text-primary/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{conv.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{conv.last_message || 'Chưa có tin nhắn'}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
                    <span className="text-[9px] text-muted-foreground/50">
                      {new Date(conv.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {conv.persona_name && <Badge variant="outline" className="text-[8px] h-4 px-1 ml-1">{conv.persona_name}</Badge>}
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatView({ messages, streamText, streaming, loading, hasMore, loadingMore, onLoadMore, inputValue, onInputChange, onSend, onKeyDown, isLessonAuthor, outlineMentionOptions, selectedMentions, onSelectedMentionsChange, onMentionClick, scrollRef, inputRef, proposalEvent, applyingProposal, onApplyProposal }: {
  messages: ChatMessage[];
  streamText: string;
  streaming: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLessonAuthor?: boolean;
  outlineMentionOptions?: OutlineMentionOption[];
  selectedMentions?: OutlineMentionOption[];
  onSelectedMentionsChange?: (mentions: OutlineMentionOption[]) => void;
  onMentionClick?: (mention: OutlineMention) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  proposalEvent?: LessonAuthorProposalEvent | null;
  applyingProposal?: boolean;
  onApplyProposal?: () => void;
}) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const selectedMentionList = selectedMentions ?? [];

  const mentionMatches = useMemo(() => {
    if (!isLessonAuthor || mentionQuery === null) return [];
    const query = normalizeMentionText(mentionQuery);
    const selectedIds = new Set(selectedMentionList.map(mention => mention.block_id));
    return (outlineMentionOptions ?? [])
      .filter(option => !selectedIds.has(option.block_id))
      .filter(option => {
        if (!query) return true;
        return normalizeMentionText(`${option.display_name} ${option.path} ${option.block_type} ${option.label}`).includes(query);
      })
      .slice(0, 8);
  }, [isLessonAuthor, mentionQuery, outlineMentionOptions, selectedMentionList]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, proposalEvent?.job_id, streamText, scrollRef]);

  useEffect(() => { if (!loading) inputRef.current?.focus(); }, [loading, inputRef]);
  useEffect(() => { setActiveMentionIndex(0); }, [mentionQuery]);

  const updateMentionState = (value: string, caret: number) => {
    if (!isLessonAuthor) return;
    const prefix = value.slice(0, caret);
    const atIndex = prefix.lastIndexOf('@');
    if (atIndex < 0 || (atIndex > 0 && !/\s/.test(prefix[atIndex - 1]))) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }

    const query = prefix.slice(atIndex + 1);
    if (query.includes('\n') || query.length > 80) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }

    setMentionQuery(query);
    setMentionStart(atIndex);
  };

  const closeMentionPicker = () => {
    setMentionQuery(null);
    setMentionStart(null);
    setActiveMentionIndex(0);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    onInputChange(value);
    updateMentionState(value, event.target.selectionStart ?? value.length);
  };

  const handleSelectMention = (mention: OutlineMentionOption) => {
    const textarea = inputRef.current;
    const caret = textarea?.selectionStart ?? inputValue.length;
    const start = mentionStart ?? caret;
    const before = inputValue.slice(0, start);
    const after = inputValue.slice(caret);
    const needsSpace = before.length > 0 && after.length > 0 && !/\s$/.test(before) && !/^\s/.test(after);
    const nextValue = `${before}${needsSpace ? ' ' : ''}${after}`.replace(/[ \t]{2,}/g, ' ');

    onInputChange(nextValue);
    if (!selectedMentionList.some(item => item.block_id === mention.block_id)) {
      onSelectedMentionsChange?.([...selectedMentionList, mention]);
    }
    closeMentionPicker();

    requestAnimationFrame(() => {
      const nextCaret = Math.min(start + (needsSpace ? 1 : 0), nextValue.length);
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleRemoveMention = (blockId: string) => {
    onSelectedMentionsChange?.(selectedMentionList.filter(mention => mention.block_id !== blockId));
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveMentionIndex(index => (index + 1) % mentionMatches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMentionIndex(index => (index - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        handleSelectMention(mentionMatches[activeMentionIndex] ?? mentionMatches[0]);
        return;
      }
    }

    if (mentionQuery !== null && event.key === 'Escape') {
      event.preventDefault();
      closeMentionPicker();
      return;
    }

    onKeyDown(event);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-2/3' : 'w-3/4'}`} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center py-1">
                <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore} className="gap-1.5 text-xs h-7">
                  {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                  {loadingMore ? 'Đang tải...' : 'Xem tin nhắn cũ hơn'}
                </Button>
              </div>
            )}
            {messages.length === 0 && !streaming && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <Sparkles className="h-8 w-8 text-primary/30" />
                <p className="text-xs text-muted-foreground">Bắt đầu cuộc trò chuyện!</p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onMentionClick={onMentionClick} />
            ))}
            {streaming && streamText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-muted/50 text-sm whitespace-pre-wrap break-words">
                  {streamText}
                  <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />
                </div>
              </div>
            )}
            {streaming && !streamText && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-muted/50">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            {proposalEvent && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Proposal sẵn sàng</p>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{proposalEvent.proposal.summary}</p>
                <Button size="sm" className="w-full gap-2" onClick={onApplyProposal} disabled={applyingProposal || !onApplyProposal}>
                  {applyingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Áp dụng vào outline
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t px-3 py-2.5 bg-background/50">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            {isLessonAuthor && mentionQuery !== null && (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
                {mentionMatches.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Không có mục phù hợp trong outline.</div>
                ) : (
                  mentionMatches.map((mention, index) => (
                    <button
                      key={mention.block_id}
                      type="button"
                      className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        index === activeMentionIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectMention(mention);
                      }}
                    >
                      <AtSign className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{mention.display_name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {mention.label} · {mention.path}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-xl border bg-muted/30 px-2.5 py-1.5 transition-all focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20">
              {isLessonAuthor && selectedMentionList.map(mention => (
                <MentionBadge
                  key={mention.block_id}
                  mention={mention}
                  onClick={() => onMentionClick?.(mention)}
                  onRemove={() => handleRemoveMention(mention.block_id)}
                  compact
                />
              ))}
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleTextareaKeyDown}
                placeholder={selectedMentionList.length > 0 ? 'Nhập yêu cầu...' : isLessonAuthor ? 'Gõ @ để chọn phần trong outline...' : 'Nhập tin nhắn...'}
                disabled={streaming}
                rows={1}
                className="min-w-[140px] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50 max-h-24"
                style={{ minHeight: '28px' }}
              />
            </div>
          </div>
          <Button
            size="icon"
            className="h-10 w-10 rounded-xl shrink-0"
            disabled={!inputValue.trim() || streaming}
            onClick={onSend}
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MentionBadge({ mention, onClick, onRemove, compact = false, inverted = false }: {
  mention: OutlineMention;
  onClick?: () => void;
  onRemove?: () => void;
  compact?: boolean;
  inverted?: boolean;
}) {
  const label = getMentionTypeLabel(mention.block_type);
  return (
    <Badge
      variant="secondary"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`max-w-full gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
        compact ? 'h-7' : ''
      } ${
        onClick ? 'cursor-pointer' : ''
      } ${
        inverted
          ? 'border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/20'
          : 'border-primary/15 bg-primary/10 text-primary hover:bg-primary/15'
      }`}
      title={mention.path || mention.display_name}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <AtSign className="h-3 w-3 shrink-0" />
      <span className="shrink-0 opacity-75">{label}</span>
      <span className="truncate max-w-[180px]">{mention.display_name}</span>
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Bỏ chọn ${mention.display_name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}

function MessageBubble({ message, onMentionClick }: { message: ChatMessage; onMentionClick?: (mention: OutlineMention) => void }) {
  const isUser = message.role === 'user';
  const mentions = getMessageOutlineMentions(message.metadata);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted/50 rounded-bl-md'
        }`}
      >
        {mentions.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {mentions.map(mention => (
              <MentionBadge
                key={mention.block_id}
                mention={mention}
                inverted={isUser}
                onClick={onMentionClick ? () => onMentionClick(mention) : undefined}
              />
            ))}
          </div>
        )}
        {message.content && <div>{message.content}</div>}
      </div>
    </motion.div>
  );
}
