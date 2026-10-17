// ═══════════════════════════════════════════════════════════════
// AI Chatbot Page — thin wrapper importing sub-components
// Persists state in URL search params so F5 doesn't lose context
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, Bot, Brain, Rocket } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchKnowledgebase,
  type Knowledgebase, type Chatbot,
} from "@/api/custom-ai-chatbot";
import { useTenantStore } from "@/utils/tenant-store";
import { useAuthStore } from "@/utils/store";
import { canViewAiUsage } from "@/utils/ai-credit-access";

import { KnowledgeBaseTab } from "@/components/ai-chatbot/kb-tab";
import { DocumentManager } from "@/components/ai-chatbot/doc-manager";
import { ChatbotTab } from "@/components/ai-chatbot/bot-tab";
import { BotDetail } from "@/components/ai-chatbot/bot-detail";
import { DeploySection } from "@/components/ai-chatbot/deploy-section";

// The overview tab is the tenant's AI usage in points (charts load with it, out of the main chunk).
const AiUsageTab = lazy(() => import("@/components/ai-credits/ai-usage-tab"));

function AiUsageTabFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-12 w-72 max-w-full rounded-xl" />
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  );
}

export default function AiChatbotPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") || "kb";
  const kbIdParam = searchParams.get("kbId");
  const botIdParam = searchParams.get("botId");

  const [tab, setTab] = useState(tabParam);
  const [selectedKb, setSelectedKb] = useState<Knowledgebase | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(botIdParam);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const activeTenantId = useTenantStore(s => s.activeTenantId);
  const role = useAuthStore(s => s.user?.role);
  const tenantModules = useAuthStore(s => s.tenantModules);
  const hasPermission = useAuthStore(s => s.hasPermission);
  useAuthStore(s => s.permissions); // re-render when the permission matrix changes (hasPermission reads it)
  // Owner rule: AI usage follows the AI Chatbot module rule and is never shown to learners (the API refuses them too).
  const showUsage = canViewAiUsage({ role, tenantModules, hasPermission });
  const activeTab = tab === "overview" && !showUsage ? "kb" : tab;

  // Reset state when tenant changes
  useEffect(() => {
    setSelectedKb(null);
    setSelectedBotId(null);
    setSearchParams(prev => { prev.delete("kbId"); prev.delete("botId"); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  // Restore KB from URL on mount
  useEffect(() => {
    if (kbIdParam && !selectedKb) {
      setLoadingRestore(true);
      fetchKnowledgebase(kbIdParam)
        .then(kb => setSelectedKb(kb))
        .catch(() => {
          setSearchParams(prev => { prev.delete("kbId"); return prev; }, { replace: true });
        })
        .finally(() => setLoadingRestore(false));
    }
    if (botIdParam) {
      setSelectedBotId(botIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectKb(kb: Knowledgebase) {
    setSelectedKb(kb);
    setSearchParams({ tab: "kb", kbId: kb.id }, { replace: true });
  }

  function handleBackFromKb() {
    setSelectedKb(null);
    setSearchParams({ tab: "kb" }, { replace: true });
  }

  function handleSelectBot(bot: Chatbot) {
    setSelectedBotId(bot.id);
    setSearchParams({ tab: "bots", botId: bot.id }, { replace: true });
  }

  function handleBackFromBot() {
    setSelectedBotId(null);
    setSearchParams({ tab: "bots" }, { replace: true });
  }

  function handleTabChange(t: string) {
    setTab(t);
    setSearchParams({ tab: t }, { replace: true });
  }

  if (loadingRestore) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (selectedKb) {
    return (
      <div className="p-6">
        <DocumentManager kb={selectedKb} onBack={handleBackFromKb} />
      </div>
    );
  }

  if (selectedBotId) {
    return (
      <div className="p-6">
        <BotDetail botId={selectedBotId} onBack={handleBackFromBot} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader icon={Bot} title={t("aiChatbot.title")} description={t("aiChatbot.description")} />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className={`grid w-full max-w-3xl grid-cols-2 ${showUsage ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          <TabsTrigger value="kb" className="gap-2"><Brain className="h-4 w-4" /> {t("aiChatbot.knowledgeBases")}</TabsTrigger>
          <TabsTrigger value="bots" className="gap-2"><Bot className="h-4 w-4" /> {t("aiChatbot.chatbots")}</TabsTrigger>
          <TabsTrigger value="deploy" className="gap-2"><Rocket className="h-4 w-4" /> {t("aiChatbot.deploy")}</TabsTrigger>
          {showUsage && <TabsTrigger value="overview" className="gap-2"><BarChart3 className="h-4 w-4" /> {t("aiChatbot.overview")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="kb" className="mt-6"><KnowledgeBaseTab key={activeTenantId} onSelectKb={handleSelectKb} /></TabsContent>
        <TabsContent value="bots" className="mt-6"><ChatbotTab key={activeTenantId} onSelectBot={handleSelectBot} /></TabsContent>
        <TabsContent value="deploy" className="mt-6"><DeploySection key={activeTenantId} /></TabsContent>
        {showUsage && (
          <TabsContent value="overview" className="mt-6">
            <Suspense fallback={<AiUsageTabFallback />}><AiUsageTab key={activeTenantId} /></Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
