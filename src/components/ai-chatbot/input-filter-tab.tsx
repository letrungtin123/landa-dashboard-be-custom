import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
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
import { getLocalizedApiError } from "@/utils/localized-error";

const stepCards: Array<{
  key: keyof Pick<InputFilterConfig, "enable_length" | "enable_normalize" | "enable_language" | "enable_gibberish" | "enable_repeat" | "enable_profanity">;
  titleKey: string;
  plainTextKey: string;
  icon: typeof ShieldCheck;
  tone: string;
}> = [
  {
    key: "enable_length",
    titleKey: "aiChatbot.stepLengthTitle",
    plainTextKey: "aiChatbot.stepLengthDescription",
    icon: TextCursorInput,
    tone: "text-sky-600 bg-sky-500/10 border-sky-500/20",
  },
  {
    key: "enable_normalize",
    titleKey: "aiChatbot.stepNormalizeTitle",
    plainTextKey: "aiChatbot.stepNormalizeDescription",
    icon: Sparkles,
    tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    key: "enable_language",
    titleKey: "aiChatbot.stepLanguageTitle",
    plainTextKey: "aiChatbot.stepLanguageDescription",
    icon: Languages,
    tone: "text-cyan-600 bg-cyan-500/10 border-cyan-500/20",
  },
  {
    key: "enable_gibberish",
    titleKey: "aiChatbot.stepGibberishTitle",
    plainTextKey: "aiChatbot.stepGibberishDescription",
    icon: Braces,
    tone: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  },
  {
    key: "enable_repeat",
    titleKey: "aiChatbot.stepRepeatTitle",
    plainTextKey: "aiChatbot.stepRepeatDescription",
    icon: RotateCcw,
    tone: "text-violet-600 bg-violet-500/10 border-violet-500/20",
  },
  {
    key: "enable_profanity",
    titleKey: "aiChatbot.stepProfanityTitle",
    plainTextKey: "aiChatbot.stepProfanityDescription",
    icon: MessageSquareWarning,
    tone: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  },
];

const messageLabels: Record<InputFilterMessageCode, { titleKey: string; whenKey: string }> = {
  EMPTY: {
    titleKey: "aiChatbot.messageEmptyTitle",
    whenKey: "aiChatbot.messageEmptyWhen",
  },
  TOO_SHORT: {
    titleKey: "aiChatbot.messageTooShortTitle",
    whenKey: "aiChatbot.messageTooShortWhen",
  },
  TOO_LONG: {
    titleKey: "aiChatbot.messageTooLongTitle",
    whenKey: "aiChatbot.messageTooLongWhen",
  },
  GIBBERISH: {
    titleKey: "aiChatbot.messageGibberishTitle",
    whenKey: "aiChatbot.messageGibberishWhen",
  },
  BINARY_GARBAGE: {
    titleKey: "aiChatbot.messageBinaryTitle",
    whenKey: "aiChatbot.messageBinaryWhen",
  },
  PROFANITY: {
    titleKey: "aiChatbot.messageProfanityTitle",
    whenKey: "aiChatbot.messageProfanityWhen",
  },
  UNSUPPORTED_LANG: {
    titleKey: "aiChatbot.messageUnsupportedLanguageTitle",
    whenKey: "aiChatbot.messageUnsupportedLanguageWhen",
  },
  REPEATED_SENTENCE: {
    titleKey: "aiChatbot.messageRepeatedTitle",
    whenKey: "aiChatbot.messageRepeatedWhen",
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
      <div className="app-liquid-card rounded-xl border bg-card p-5 space-y-4">
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
  const { t } = useTranslation();
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
      toast.error(getLocalizedApiError(err, t("aiChatbot.loadFilterFailed")));
      setConfig(null);
      setInitialConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, [t]);

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
      toast.success(t("aiChatbot.filterSaved"));
    } catch (err: any) {
      toast.error(getLocalizedApiError(err, t("aiChatbot.saveFilterFailed")));
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
      <div className="app-liquid-card rounded-xl border bg-card overflow-hidden">
        <div className="p-5 border-b bg-muted/20">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {t("aiChatbot.inputFilter")}
                <Badge variant={config?.enabled ? "default" : "outline"}>{config?.enabled ? t("aiChatbot.enabled") : t("aiChatbot.disabled")}</Badge>
              </h3>
              <p className="text-sm text-muted-foreground max-w-3xl">
                {t("aiChatbot.inputFilterDescription")}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Button variant="outline" disabled={!isDirty || saving} onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                {t("aiChatbot.undo")}
              </Button>
              <Button disabled={!isDirty || saving || !config} onClick={handleSave} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("aiChatbot.save")}
              </Button>
            </div>
          </div>
        </div>

        {loadingConfig || !config ? (
          <div className="p-5"><FilterSkeleton /></div>
        ) : (
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 gap-5">
              <div className="app-liquid-card rounded-lg border bg-background p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{t("aiChatbot.filterForBot", { bot: botName || t("aiChatbot.thisChatbot") })}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("aiChatbot.filterOffDescription")}
                  </p>
                </div>
                <Switch checked={config.enabled} onCheckedChange={checked => updateConfig(draft => { draft.enabled = checked; })} />
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{t("aiChatbot.protectionLayers")}</h4>
                  <p className="text-sm text-muted-foreground">{t("aiChatbot.protectionLayersDescription")}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {stepCards.map(step => {
                  const Icon = step.icon;
                  return (
                    <motion.div
                      key={step.key}
                      layout
                      className="app-liquid-card rounded-lg border bg-background p-4 flex gap-3"
                    >
                      <div className={`h-10 w-10 rounded-lg border flex items-center justify-center ${step.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium leading-snug">{t(step.titleKey)}</p>
                          <Switch
                            size="sm"
                            checked={Boolean(config[step.key])}
                            onCheckedChange={checked => updateConfig(draft => { draft[step.key] = checked; })}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{t(step.plainTextKey)}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            <section className="app-liquid-card rounded-lg border bg-background overflow-hidden">
              <button
                type="button"
                onClick={() => setAdvancedOpen(open => !open)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <SlidersHorizontal className="h-5 w-5 text-primary" />
                  <div>
                    <h4 className="font-semibold">{t("aiChatbot.advancedSettings")}</h4>
                    <p className="text-sm text-muted-foreground">{t("aiChatbot.advancedSettingsDescription")}</p>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>

              {advancedOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="border-t p-4 space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <h5 className="font-medium">{t("aiChatbot.messageLength")}</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">{t("aiChatbot.minimum")}</label>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={config.filter_params.length.min}
                            onChange={event => updateConfig(draft => { draft.filter_params.length.min = Number(event.target.value); })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">{t("aiChatbot.maximum")}</label>
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
                      <h5 className="font-medium">{t("aiChatbot.foreignLanguage")}</h5>
                      <p className="text-sm text-muted-foreground">{t("aiChatbot.foreignLanguageDescription", { percent: Math.round(config.filter_params.language.foreignCharThreshold * 100) })}</p>
                      <Slider
                        value={[config.filter_params.language.foreignCharThreshold * 100]}
                        min={10}
                        max={90}
                        step={10}
                        onValueChange={value => updateConfig(draft => { draft.filter_params.language.foreignCharThreshold = value[0] / 100; })}
                      />
                    </div>

                    <div className="space-y-3">
                      <h5 className="font-medium">{t("aiChatbot.repeatedMessages")}</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">{t("aiChatbot.blockFromAttempt")}</label>
                          <Input
                            type="number"
                            min={2}
                            max={10}
                            value={config.filter_params.repeat.maxRepeatCount}
                            onChange={event => updateConfig(draft => { draft.filter_params.repeat.maxRepeatCount = Number(event.target.value); })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">{t("aiChatbot.forgetAfterSeconds")}</label>
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
                      <p className="text-xs text-muted-foreground">{t("aiChatbot.redisNotice")}</p>
                    </div>

                    <div className="space-y-3">
                      <h5 className="font-medium">{t("aiChatbot.profanityLevel")}</h5>
                      <Select
                        value={config.filter_params.profanity.blockSeverity}
                        onValueChange={value => updateConfig(draft => { draft.filter_params.profanity.blockSeverity = value as "HIGH" | "MEDIUM"; })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HIGH">{t("aiChatbot.vietnameseOnly")}</SelectItem>
                          <SelectItem value="MEDIUM">{t("aiChatbot.vietnameseAndEnglish")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="app-liquid-card rounded-lg border bg-muted/20 p-4 space-y-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium">{t("aiChatbot.gibberishParameters")}</p>
                        <p className="text-sm text-muted-foreground">{t("aiChatbot.gibberishParametersDescription")}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">{t("aiChatbot.minimumNaturalness")}</label>
                        <Input type="number" step="0.1" min={0.5} max={4} value={config.filter_params.gibberish.minEntropyThreshold} onChange={event => updateConfig(draft => { draft.filter_params.gibberish.minEntropyThreshold = Number(event.target.value); })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">{t("aiChatbot.maximumSingleCharacterRepeat")}</label>
                        <Input type="number" step="0.1" min={0.3} max={0.9} value={config.filter_params.gibberish.maxRepeatRatio} onChange={event => updateConfig(draft => { draft.filter_params.gibberish.maxRepeatRatio = Number(event.target.value); })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">{t("aiChatbot.minimumValidCharacters")}</label>
                        <Input type="number" step="0.1" min={0.2} max={0.9} value={config.filter_params.gibberish.minValidCharRatio} onChange={event => updateConfig(draft => { draft.filter_params.gibberish.minValidCharRatio = Number(event.target.value); })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">{t("aiChatbot.maximumConsonantCluster")}</label>
                        <Input type="number" min={3} max={10} value={config.filter_params.gibberish.maxConsonantCluster} onChange={event => updateConfig(draft => { draft.filter_params.gibberish.maxConsonantCluster = Number(event.target.value); })} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("aiChatbot.extraVietnameseBlacklist")}</label>
                      <Textarea
                        value={config.filter_params.profanity.blacklistVi.join("\n")}
                        onChange={event => updateConfig(draft => { draft.filter_params.profanity.blacklistVi = parseList(event.target.value); })}
                        placeholder={t("aiChatbot.oneItemPerLine")}
                        className="min-h-28"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("aiChatbot.extraEnglishBlacklist")}</label>
                      <Textarea
                        value={config.filter_params.profanity.blacklistEn.join("\n")}
                        onChange={event => updateConfig(draft => { draft.filter_params.profanity.blacklistEn = parseList(event.target.value); })}
                        placeholder={t("aiChatbot.oneItemPerLine")}
                        className="min-h-28"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </section>

            <section className="app-liquid-card rounded-lg border bg-background overflow-hidden">
              <button
                type="button"
                onClick={() => setMessagesOpen(open => !open)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <MessageSquareWarning className="h-5 w-5 text-primary" />
                  <div>
                    <h4 className="font-semibold">{t("aiChatbot.blockedReply")}</h4>
                    <p className="text-sm text-muted-foreground">{t("aiChatbot.blockedReplyDescription")}</p>
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
                              <p className="font-medium">{t(meta.titleKey)}</p>
                              <p className="text-xs text-muted-foreground mt-1">{t(meta.whenKey)}</p>
                            </div>
                            <Badge variant="outline" className="shrink-0">{message.code}</Badge>
                          </div>
                          <Textarea
                            value={message.message}
                            maxLength={500}
                            onChange={event => updateConfig(draft => { draft.message_config[index].message = event.target.value; })}
                            className="min-h-24"
                          />
                          <p className="text-xs text-muted-foreground text-right">{t("aiChatbot.characters", { count: message.message.length })}</p>
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
