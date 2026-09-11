import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BarChart3, Coins, Database, Gauge, Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchAiOverviewReport, type AiOverviewReport } from '@/api/custom-ai-chatbot';
import {
  createAiPricingRateCard,
  fetchAiPricingRateCards,
  type AiPricingRateCard,
} from '@/api/custom-tenants';
import { getLocalizedApiError } from '@/utils/localized-error';
import { useAuthStore } from '@/utils/store';

const EMPTY_RATE_FORM = {
  model: '',
  input_vnd_per_1m: '0',
  output_vnd_per_1m: '0',
  embedding_vnd_per_1m: '0',
  source_url: '',
  source_note: '',
};

function parseNumber(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function AiOverviewTab() {
  const { t, i18n } = useTranslation();
  const isSuperadmin = useAuthStore((state) => state.user?.role === 'superadmin');
  const [report, setReport] = useState<AiOverviewReport | null>(null);
  const [rateCards, setRateCards] = useState<AiPricingRateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [rateForm, setRateForm] = useState(EMPTY_RATE_FORM);

  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
  const integerFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const vndFormatter = useMemo(() => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }), [locale]);

  const formatTokens = useCallback((value: string | null) => {
    if (value === null) return t('aiChatbot.unlimited');
    try {
      return integerFormatter.format(BigInt(value));
    } catch {
      return value;
    }
  }, [integerFormatter, t]);

  const formatVnd = useCallback((value: string) => vndFormatter.format(parseNumber(value)), [vndFormatter]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await fetchAiOverviewReport();
      setReport(overview);
    } catch (error) {
      toast.error(getLocalizedApiError(error, t('aiChatbot.overviewLoadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadRateCards = useCallback(async () => {
    if (!isSuperadmin) return;
    try {
      setRateCards(await fetchAiPricingRateCards());
    } catch (error) {
      toast.error(getLocalizedApiError(error, t('aiChatbot.pricingLoadFailed')));
    }
  }, [isSuperadmin, t]);

  useEffect(() => { void loadReport(); }, [loadReport]);
  useEffect(() => {
    if (pricingOpen) void loadRateCards();
  }, [loadRateCards, pricingOpen]);

  const handleSaveRateCard = async () => {
    if (!rateForm.model.trim()) {
      toast.error(t('aiChatbot.pricingModelRequired'));
      return;
    }
    setSavingRate(true);
    try {
      await createAiPricingRateCard({
        provider: 'google_ai_studio',
        model: rateForm.model.trim(),
        input_vnd_per_1m: rateForm.input_vnd_per_1m,
        output_vnd_per_1m: rateForm.output_vnd_per_1m,
        embedding_vnd_per_1m: rateForm.embedding_vnd_per_1m,
        ...(rateForm.source_url.trim() ? { source_url: rateForm.source_url.trim() } : {}),
        ...(rateForm.source_note.trim() ? { source_note: rateForm.source_note.trim() } : {}),
      });
      toast.success(t('aiChatbot.pricingSaved'));
      setRateForm(EMPTY_RATE_FORM);
      await Promise.all([loadRateCards(), loadReport()]);
    } catch (error) {
      toast.error(getLocalizedApiError(error, t('aiChatbot.pricingSaveFailed')));
    } finally {
      setSavingRate(false);
    }
  };

  if (loading && !report) {
    return <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/30" />;
  }

  if (!report) return null;

  const quotaPercent = report.quota.monthlyLimit
    ? Math.min(100, Math.round((parseNumber(report.quota.totalUsed) / Math.max(1, parseNumber(report.quota.monthlyLimit))) * 100))
    : 0;
  const dailyMax = Math.max(1, ...report.daily.map((item) => parseNumber(item.totalTokens)));
  const periodLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(new Date(`${report.periodStart}T00:00:00`));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('aiChatbot.overviewTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('aiChatbot.overviewPeriod', { period: periodLabel })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperadmin && (
            <Button variant="outline" size="sm" onClick={() => setPricingOpen(true)}>
              <Coins className="h-3.5 w-3.5" />
              {t('aiChatbot.pricing')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void loadReport()} disabled={loading}>
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            {t('aiChatbot.refresh')}
          </Button>
        </div>
      </div>

      {report.cost.hasUnpricedUsage && (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>{t('aiChatbot.unpricedUsageNotice', { count: formatTokens(report.cost.unpricedEventCount) })}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Gauge} label={t('aiChatbot.tokenUsed')} value={formatTokens(report.quota.totalUsed)} detail={t('aiChatbot.tokenLimit', { limit: formatTokens(report.quota.monthlyLimit) })} />
        <MetricCard icon={Database} label={t('aiChatbot.tokenRemaining')} value={formatTokens(report.quota.remaining)} detail={t('aiChatbot.tokenReserved', { count: formatTokens(report.quota.reserved) })} />
        <MetricCard icon={Coins} label={t('aiChatbot.estimatedCost')} value={formatVnd(report.cost.estimatedVnd)} detail={t('aiChatbot.vndOnly')} />
        <MetricCard icon={BarChart3} label={t('aiChatbot.quotaProgress')} value={`${quotaPercent}%`} detail={t('aiChatbot.timezone', { value: report.tokenTimezone })} />
      </div>

      <Card>
        <CardHeader className="border-b border-border/60">
          <CardTitle>{t('aiChatbot.dailyUsage')}</CardTitle>
          <CardDescription>{t('aiChatbot.dailyUsageDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          {report.daily.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">{t('aiChatbot.noUsage')}</div>
          ) : (
            <div className="flex h-40 items-end gap-1.5 overflow-x-auto pb-5 pt-2">
              {report.daily.map((item) => {
                const height = Math.max(8, Math.round((parseNumber(item.totalTokens) / dailyMax) * 100));
                return (
                  <div key={item.day} className="group relative flex h-full min-w-7 flex-1 flex-col justify-end">
                    <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden w-max max-w-52 -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-xs shadow-lg ring-1 ring-border group-hover:block">
                      <div>{item.day}</div>
                      <div className="text-muted-foreground">{formatTokens(item.totalTokens)} · {formatVnd(item.estimatedVnd)}</div>
                    </div>
                    <div className="rounded-sm bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${height}%` }} />
                    <span className="mt-2 truncate text-center text-[10px] text-muted-foreground">{item.day.slice(-2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/60">
          <CardTitle>{t('aiChatbot.operationUsage')}</CardTitle>
          <CardDescription>{t('aiChatbot.operationUsageDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('aiChatbot.operation')}</TableHead>
                <TableHead className="text-right">{t('aiChatbot.tokens')}</TableHead>
                <TableHead className="text-right">{t('aiChatbot.requests')}</TableHead>
                <TableHead className="text-right">{t('aiChatbot.estimatedCost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.breakdown.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">{t('aiChatbot.noUsage')}</TableCell></TableRow>
              ) : report.breakdown.map((item) => (
                <TableRow key={item.operation}>
                  <TableCell className="font-medium">{t(`aiChatbot.operation_${item.operation}`)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTokens(item.totalTokens)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTokens(item.eventCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatVnd(item.estimatedVnd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={pricingOpen} onOpenChange={setPricingOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('aiChatbot.pricingTitle')}</DialogTitle>
            <DialogDescription>{t('aiChatbot.pricingDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="ai-price-model">{t('aiChatbot.pricingModel')}</Label><Input id="ai-price-model" value={rateForm.model} onChange={(event) => setRateForm((current) => ({ ...current, model: event.target.value }))} placeholder="gemini-2.5-flash" className="mt-1.5" /></div>
            <PriceField id="ai-price-input" label={t('aiChatbot.pricingInput')} value={rateForm.input_vnd_per_1m} onChange={(value) => setRateForm((current) => ({ ...current, input_vnd_per_1m: value }))} />
            <PriceField id="ai-price-output" label={t('aiChatbot.pricingOutput')} value={rateForm.output_vnd_per_1m} onChange={(value) => setRateForm((current) => ({ ...current, output_vnd_per_1m: value }))} />
            <PriceField id="ai-price-embedding" label={t('aiChatbot.pricingEmbedding')} value={rateForm.embedding_vnd_per_1m} onChange={(value) => setRateForm((current) => ({ ...current, embedding_vnd_per_1m: value }))} />
            <div><Label htmlFor="ai-price-source">{t('aiChatbot.pricingSource')}</Label><Input id="ai-price-source" type="url" value={rateForm.source_url} onChange={(event) => setRateForm((current) => ({ ...current, source_url: event.target.value }))} placeholder="https://..." className="mt-1.5" /></div>
            <div className="sm:col-span-2"><Label htmlFor="ai-price-note">{t('aiChatbot.pricingNote')}</Label><Input id="ai-price-note" value={rateForm.source_note} onChange={(event) => setRateForm((current) => ({ ...current, source_note: event.target.value }))} className="mt-1.5" /></div>
            <div className="sm:col-span-2"><Button onClick={() => void handleSaveRateCard()} disabled={savingRate}><Plus className="h-4 w-4" />{t('aiChatbot.pricingSave')}</Button></div>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader><TableRow><TableHead>{t('aiChatbot.pricingModel')}</TableHead><TableHead className="text-right">{t('aiChatbot.pricingInput')}</TableHead><TableHead className="text-right">{t('aiChatbot.pricingOutput')}</TableHead><TableHead className="text-right">{t('aiChatbot.pricingEmbedding')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {rateCards.filter((card) => card.status === 'active').length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">{t('aiChatbot.pricingEmpty')}</TableCell></TableRow>
                ) : rateCards.filter((card) => card.status === 'active').map((card) => (
                  <TableRow key={card.id}>
                    <TableCell><div className="font-medium">{card.model}</div>{card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{t('aiChatbot.pricingSource')}</a>}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVnd(card.inputVndPer1M)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVnd(card.outputVndPer1M)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVnd(card.embeddingVndPer1M)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPricingOpen(false)}>{t('aiChatbot.close')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Gauge; label: string; value: string; detail: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3 pt-1">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p></div>
      </CardContent>
    </Card>
  );
}

function PriceField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5" /></div>;
}
