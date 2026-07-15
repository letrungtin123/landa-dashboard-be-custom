import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Braces,
  ChevronDown,
  Languages,
  Loader2,
  MessageSquareWarning,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TextCursorInput,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchBotInputFilter,
  updateBotInputFilter,
  type InputFilterConfig,
  type InputFilterMessageCode,
} from "@/api/custom-ai-chatbot";

const stepCards: Array<{
  key: keyof Pick<InputFilterConfig, "enable_length" | "enable_normalize" | "enable_language" | "enable_gibberish" | "enable_repeat" | "enable_profanity">;
  title: string;
  plainText: string;
  icon: typeof ShieldCheck;
  tone: string;
}> = [
  {
    key: "enable_length",
    title: "Tin nhắn quá ngắn hoặc quá dài",
    plainText: "Giữ cuộc trò chuyện gọn gàng, tránh gửi rỗng, chỉ link hoặc nội dung quá dài.",
    icon: TextCursorInput,
    tone: "text-sky-600 bg-sky-500/10 border-sky-500/20",
  },
  {
    key: "enable_normalize",
    title: "Làm sạch chữ trước khi kiểm tra",
    plainText: "Gộp khoảng trắng, bỏ ký tự ẩn và giúp các lớp kiểm tra phía sau chính xác hơn.",
    icon: Sparkles,
    tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    key: "enable_language",
    title: "Chỉ nhận tiếng Việt và tiếng Anh",
    plainText: "Chặn nội dung có quá nhiều ký tự ngoài hai ngôn ngữ đang hỗ trợ.",
    icon: Languages,
    tone: "text-cyan-600 bg-cyan-500/10 border-cyan-500/20",
  },
  {
    key: "enable_gibberish",
    title: "Nội dung gõ bừa hoặc khó hiểu",
    plainText: "Chặn chuỗi ký tự lặp, ký tự lỗi hoặc nội dung không giống một câu bình thường.",
    icon: Braces,
    tone: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  },
  {
    key: "enable_repeat",
    title: "Gửi lặp lại nhiều lần",
    plainText: "Giảm spam khi khách gửi cùng một câu liên tục trong thời gian ngắn.",
    icon: RotateCcw,
    tone: "text-violet-600 bg-violet-500/10 border-violet-500/20",
  },
  {
    key: "enable_profanity",
    title: "Từ ngữ không phù hợp",
    plainText: "Chặn lời lẽ thô tục và các từ cấm bổ sung do admin nhập.",
    icon: MessageSquareWarning,
    tone: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  },
];

const messageLabels: Record<InputFilterMessageCode, { title: string; when: string }> = {
  EMPTY: {
    title: "Khách chưa nhập nội dung",
    when: "Tin nhắn rỗng, chỉ emoji hoặc chỉ link.",
  },
  TOO_SHORT: {
    title: "Tin nhắn quá ngắn",
    when: "Nội dung ít hơn số ký tự tối thiểu.",
  },
  TOO_LONG: {
    title: "Tin nhắn quá dài",
    when: "Nội dung vượt quá số ký tự tối đa.",
  },
  GIBBERISH: {
    title: "Nội dung khó hiểu",
    when: "Chuỗi ký tự gõ bừa hoặc không rõ nghĩa.",
  },
  BINARY_GARBAGE: {
    title: "Ký tự lỗi",
    when: "Nội dung có ký tự điều khiển hoặc lỗi hiển thị.",
  },
  PROFANITY: {
    title: "Từ ngữ không phù hợp",
    when: "Nội dung có từ tục, từ cấm hoặc blacklist bổ sung.",
  },
  UNSUPPORTED_LANG: {
    title: "Ngôn ngữ chưa hỗ trợ",
    when: "Tin nhắn có quá nhiều ký tự ngoài tiếng Việt và tiếng Anh.",
  },
  REPEATED_SENTENCE: {
    title: "Gửi lặp lại",
    when: "Khách gửi cùng một nội dung nhiều lần.",
  },
};

function cloneConfig(config: InputFilterConfig): InputFilterConfig {
  return JSON.parse(JSON.stringify(config)) as InputFilterConfig;
}

function parseList(value: string): string[] {
  return Array.from(new Set(value.split(/\n|,/).map(item => item.trim()).filter(Boolean)));
}

function FilterSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

interface InputFilterTabProps {
  botId: string;
  botName?: string;
}

export function InputFilterTab({ botId, botName }: InputFilterTabProps) {
  const [config, setConfig] = useState<InputFilterConfig | null>(null);
  const [initialConfig, setInitialConfig] = useState<InputFilterConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(true);

  const isDirty = useMemo(() => {
    if (!config || !initialConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(initialConfig);
  }, [config, initialConfig]);

  const loadConfig = useCallback(async (botId: string) => {
    if (!botId) return;
    setLoadingConfig(true);
    try {
      const nextConfig = await fetchBotInputFilter(botId);
      setConfig(cloneConfig(nextConfig));
      setInitialConfig(cloneConfig(nextConfig));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Không tải được bộ lọc");
      setConfig(null);
      setInitialConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConfig(botId);
  }, [botId, loadConfig]);

  function updateConfig(updater: (draft: InputFilterConfig) => void) {
    setConfig(current => {
      if (!current) return current;
      const draft = cloneConfig(current);
      updater(draft);
      return draft;
    });
  }

  async function handleSave() {
    if (!botId || !config) return;
    setSaving(true);
    try {
      const saved = await updateBotInputFilter(botId, config);
      setConfig(cloneConfig(saved));
      setInitialConfig(cloneConfig(saved));
      toast.success("Đã lưu bộ lọc đầu vào");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Không lưu được bộ lọc");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!initialConfig) return;
    setConfig(cloneConfig(initialConfig));
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-5 border-b bg-muted/20">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Bộ lọc đầu vào
                <Badge variant={config?.enabled ? "default" : "outline"}>{config?.enabled ? "Đang bật" : "Đang tắt"}</Badge>
              </h3>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Bộ lọc kiểm tra tin nhắn trước khi gửi xuống AI. Khi bị chặn, khách sẽ nhận câu trả lời do admin tự viết và hệ thống không tốn lượt gọi Gemini.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Button variant="outline" disabled={!isDirty || saving} onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Hoàn tác
              </Button>
              <Button disabled={!isDirty || saving || !config} onClick={handleSave} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu
              </Button>
            </div>
          </div>
        </div>

        {loadingConfig || !config ? (
          <div className="p-5"><FilterSkeleton /></div>
        ) : (
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 gap-5">
              <div className="rounded-lg border bg-background p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Bật bộ lọc cho {botName || "chatbot này"}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Khi tắt, mọi tin nhắn vẫn đi theo luồng AI như hiện tại.
                  </p>
                </div>
                <Switch checked={config.enabled} onCheckedChange={checked => updateConfig(draft => { draft.enabled = checked; })} />
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Các lớp bảo vệ</h4>
                  <p className="text-sm text-muted-foreground">Bật những loại tin nhắn muốn chặn trước khi gửi xuống AI.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {stepCards.map(step => {
                  const Icon = step.icon;
                  return (
                    <motion.div
                      key={step.key}
                      layout
                      className="rounded-lg border bg-background p-4 flex gap-3"
                    >
                      <div className={`h-10 w-10 rounded-lg border flex items-center justify-center ${step.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium leading-snug">{step.title}</p>
                          <Switch
                            size="sm"
                            checked={Boolean(config[step.key])}
                            onCheckedChange={checked => updateConfig(draft => { draft[step.key] = checked; })}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{step.plainText}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border bg-background overflow-hidden">
              <button
                type="button"
                onClick={() => setAdvancedOpen(open => !open)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <SlidersHorizontal className="h-5 w-5 text-primary" />
                  <div>
                    <h4 className="font-semibold">Cài đặt nâng cao</h4>
                    <p className="text-sm text-muted-foreground">Chỉ cần chỉnh khi muốn siết chặt hoặc nới lỏng bộ lọc.</p>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>

              {advancedOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="border-t p-4 space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <h5 className="font-medium">Độ dài tin nhắn</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">Tối thiểu</label>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={config.filter_params.length.min}
                            onChange={event => updateConfig(draft => { draft.filter_params.length.min = Number(event.target.value); })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">Tối đa</label>
                          <Input
                            type="number"
                            min={100}
                            max={10000}
                            value={config.filter_params.length.max}
                            onChange={event => updateConfig(draft => { draft.filter_params.length.max = Number(event.target.value); })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h5 className="font-medium">Ngôn ngữ ngoài Việt/Anh</h5>
                      <p className="text-sm text-muted-foreground">Cho phép tối đa {Math.round(config.filter_params.language.foreignCharThreshold * 100)}% ký tự ngoài tiếng Việt và tiếng Anh.</p>
                      <Slider
                        value={[config.filter_params.language.foreignCharThreshold * 100]}
                        min={10}
                        max={90}
                        step={10}
                        onValueChange={value => updateConfig(draft => { draft.filter_params.language.foreignCharThreshold = value[0] / 100; })}
                      />
                    </div>

                    <div className="space-y-3">
                      <h5 className="font-medium">Gửi lặp lại</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">Chặn từ lần thứ</label>
                          <Input
                            type="number"
                            min={2}
                            max={10}
                            value={config.filter_params.repeat.maxRepeatCount}
                            onChange={event => updateConfig(draft => { draft.filter_params.repeat.maxRepeatCount = Number(event.target.value); })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">Tự quên sau giây</label>
                          <Input
                            type="number"
                            min={60}
                            max={3600}
                            step={60}
                            value={config.filter_params.repeat.ttlSeconds}
                            onChange={event => updateConfig(draft => { draft.filter_params.repeat.ttlSeconds = Number(event.target.value); })}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Lớp này cần Redis trên máy chủ. Nếu Redis chưa bật, hệ thống sẽ bỏ qua riêng lớp gửi lặp.</p>
                    </div>

                    <div className="space-y-3">
                      <h5 className="font-medium">Mức chặn từ ngữ</h5>
                      <Select
                        value={config.filter_params.profanity.blockSeverity}
                        onValueChange={value => updateConfig(draft => { draft.filter_params.profanity.blockSeverity = value as "HIGH" | "MEDIUM"; })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HIGH">Chỉ danh sách tiếng Việt</SelectItem>
                          <SelectItem value="MEDIUM">Tiếng Việt và tiếng Anh</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Thông số chống nội dung gõ bừa</p>
                        <p className="text-sm text-muted-foreground">Giá trị mặc định phù hợp cho đa số chatbot. Chỉ chỉnh khi thấy hệ thống chặn quá nhiều hoặc quá ít.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">Độ tự nhiên tối thiểu</label>
                        <Input type="number" step="0.1" min={0.5} max={4} value={config.filter_params.gibberish.minEntropyThreshold} onChange={event => updateConfig(draft => { draft.filter_params.gibberish.minEntropyThreshold = Number(event.target.value); })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">Lặp một ký tự tối đa</label>
                        <Input type="number" step="0.1" min={0.3} max={0.9} value={config.filter_params.gibberish.maxRepeatRatio} onChange={event => updateConfig(draft => { draft.filter_params.gibberish.maxRepeatRatio = Number(event.target.value); })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">Ký tự hợp lệ tối thiểu</label>
                        <Input type="number" step="0.1" min={0.2} max={0.9} value={config.filter_params.gibberish.minValidCharRatio} onChange={event => updateConfig(draft => { draft.filter_params.gibberish.minValidCharRatio = Number(event.target.value); })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">Cụm phụ âm tối đa</label>
                        <Input type="number" min={3} max={10} value={config.filter_params.gibberish.maxConsonantCluster} onChange={event => updateConfig(draft => { draft.filter_params.gibberish.maxConsonantCluster = Number(event.target.value); })} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Từ cấm tiếng Việt bổ sung</label>
                      <Textarea
                        value={config.filter_params.profanity.blacklistVi.join("\n")}
                        onChange={event => updateConfig(draft => { draft.filter_params.profanity.blacklistVi = parseList(event.target.value); })}
                        placeholder="Mỗi dòng một từ hoặc cụm từ"
                        className="min-h-28"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Từ cấm tiếng Anh bổ sung</label>
                      <Textarea
                        value={config.filter_params.profanity.blacklistEn.join("\n")}
                        onChange={event => updateConfig(draft => { draft.filter_params.profanity.blacklistEn = parseList(event.target.value); })}
                        placeholder="Mỗi dòng một từ hoặc cụm từ"
                        className="min-h-28"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </section>

            <section className="rounded-lg border bg-background overflow-hidden">
              <button
                type="button"
                onClick={() => setMessagesOpen(open => !open)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <MessageSquareWarning className="h-5 w-5 text-primary" />
                  <div>
                    <h4 className="font-semibold">Câu trả lời khi bị chặn</h4>
                    <p className="text-sm text-muted-foreground">Khách sẽ thấy đúng nội dung admin nhập ở đây.</p>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${messagesOpen ? "rotate-180" : ""}`} />
              </button>

              {messagesOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="border-t p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {config.message_config.map((message, index) => {
                      const meta = messageLabels[message.code];
                      return (
                        <div key={message.code} className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{meta.title}</p>
                              <p className="text-xs text-muted-foreground mt-1">{meta.when}</p>
                            </div>
                            <Badge variant="outline" className="shrink-0">{message.code}</Badge>
                          </div>
                          <Textarea
                            value={message.message}
                            maxLength={500}
                            onChange={event => updateConfig(draft => { draft.message_config[index].message = event.target.value; })}
                            className="min-h-24"
                          />
                          <p className="text-xs text-muted-foreground text-right">{message.message.length}/500 ký tự</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </section>
          </div>
        )}
      </div>
    </motion.div>
  );
}
