// ═══════════════════════════════════════════════════════════════
// Chat Widget — Draggable FAB + Drawer with full chat experience
// FAB shows bot avatar, draggable via native pointer events
// Header has fullscreen toggle
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, X, Plus, ArrowLeft, Send, Trash2,
  Loader2, Bot, Sparkles, Clock, Maximize2, Minimize2, AlertTriangle,
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
  type ActiveBot, type ChatConversation, type ChatMessage,
  type PaginatedMessages,
} from '@/api/custom-chat';
import { fetchBotPersonas, type BotPersona } from '@/api/custom-ai-chatbot';

// ── Types ──
type WidgetState = 'loading' | 'no-bot' | 'persona-picker' | 'conversations' | 'chat';

// ── Main Component ──
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [state, setState] = useState<WidgetState>('loading');
  const [activeBot, setActiveBot] = useState<ActiveBot | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [personas, setPersonas] = useState<BotPersona[]>([]);
  const [currentConv, setCurrentConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
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

  // ── Pre-load bot avatar on mount (for FAB) ──
  useEffect(() => {
    if (!hasPermission) return;
    fetchActiveBot()
      .then(bot => { if (bot) setActiveBot(bot); })
      .catch(() => {});
  }, [hasPermission]);

  // ── Load full data when widget opens ──
  const loadActiveBot = useCallback(async () => {
    setState('loading');
    try {
      const bot = await fetchActiveBot();
      setActiveBot(bot);
      if (!bot) { setState('no-bot'); return; }

      setLoadingConvs(true);
      const convs = await fetchConversations();
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
      setState('no-bot');
    }
  }, []);

  useEffect(() => {
    if (open) loadActiveBot();
  }, [open, loadActiveBot]);

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
  const handleCreateConversation = async (personaId: string) => {
    try {
      const conv = await createConversation(personaId);
      setConversations(prev => [conv, ...prev]);
      setCurrentConv(conv);
      setMessages([]);
      setState('chat');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  // ── Open existing conversation ──
  const handleOpenConversation = async (conv: ChatConversation) => {
    setCurrentConv(conv);
    setLoadingMessages(true);
    setState('chat');
    try {
      const result = await fetchMessages(conv.id);
      setMessages(result.messages);
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
    setInputValue('');

    const userMsg: ChatMessage = {
      id: 'temp-' + Date.now(),
      conversation_id: currentConv.id,
      role: 'user',
      content,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamText('');
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
        toast.error(message);
        setStreaming(false);
        setStreamText('');
        streamAccRef.current = '';
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
    setHasMore(false);
    setNextCursor(null);
    setState('conversations');
    fetchConversations().then(setConversations).catch(() => {});
  };

  if (!hasPermission) return null;

  const widgetClass = fullscreen
    ? 'fixed inset-4 z-[9998] rounded-2xl'
    : 'fixed bottom-6 right-6 z-[9998] w-[420px] h-[600px] rounded-2xl';

  const botAvatarSrc = activeBot?.bot_avatar_url ? storageUrl(activeBot.bot_avatar_url) : null;

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
                  <p className="text-sm font-semibold truncate">{activeBot?.bot_name || 'AI Assistant'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {streaming ? '✍️ Đang trả lời...' : '🟢 Online'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
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
                  scrollRef={scrollRef}
                  inputRef={inputRef}
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

function ChatView({ messages, streamText, streaming, loading, hasMore, loadingMore, onLoadMore, inputValue, onInputChange, onSend, onKeyDown, scrollRef, inputRef }: {
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
  scrollRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, streamText, scrollRef]);

  useEffect(() => { if (!loading) inputRef.current?.focus(); }, [loading, inputRef]);

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
              <MessageBubble key={msg.id} message={msg} />
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
          </>
        )}
      </div>

      <div className="border-t px-3 py-2.5 bg-background/50">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nhập tin nhắn..."
            disabled={streaming}
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all disabled:opacity-50 max-h-24"
            style={{ minHeight: '40px' }}
          />
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
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
        {message.content}
      </div>
    </motion.div>
  );
}
