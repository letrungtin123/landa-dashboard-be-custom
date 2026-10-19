import { createContext, useContext, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getReportChart, type ReportChartWindowDirection } from '@/api/custom-reports';
import { useTenantStore } from '@/utils/tenant-store';
import {
  mergeReportChartWindows,
  reportChartWindowParams,
  type ReportChartRequest,
} from '@/components/reports/report-chart-window.logic';

/**
 * The function the Reports charts load their data with. Production always
 * uses the real client; the development preview page provides an in-memory
 * one so it never reaches the backend.
 */
const ReportChartApiContext = createContext<typeof getReportChart>(getReportChart);
export const ReportChartApiProvider = ReportChartApiContext.Provider;
export function useReportChartFetcher(): typeof getReportChart {
  return useContext(ReportChartApiContext);
}

/** Keys carry every input that changes the answer: the tenant and the whole request (dates, filters, metric). */
export const reportChartKeys = {
  all: ['report-chart'] as const,
  window: (tenantId: string | null, request: ReportChartRequest) => [...reportChartKeys.all, 'window', tenantId, request] as const,
};

type WindowPageParam = { direction: ReportChartWindowDirection; anchor?: string };
const FIRST_WINDOW: WindowPageParam = { direction: 'initial' };

/**
 * One Reports chart in window mode: the first window of the selected range,
 * then the windows before / after it on demand (only when the range holds
 * more buckets than one window). Same requests as ReportWindowChart.
 */
export function useReportChartWindow(request: ReportChartRequest, { enabled = true }: { enabled?: boolean } = {}) {
  const fetchChart = useReportChartFetcher();
  const activeTenantId = useTenantStore(state => state.activeTenantId);
  const query = useInfiniteQuery({
    queryKey: reportChartKeys.window(activeTenantId, request),
    queryFn: ({ pageParam }) => fetchChart(reportChartWindowParams(request, pageParam.direction, pageParam.anchor)),
    initialPageParam: FIRST_WINDOW,
    getPreviousPageParam: (first): WindowPageParam | undefined => (
      first.window?.has_before && first.window.next_before ? { direction: 'before', anchor: first.window.next_before } : undefined
    ),
    getNextPageParam: (last): WindowPageParam | undefined => (
      last.window?.has_after && last.window.next_after ? { direction: 'after', anchor: last.window.next_after } : undefined
    ),
    enabled,
    // Same freshness as the summary cards above it: shown from cache, checked again on every visit.
    staleTime: 0,
  });
  const chart = useMemo(() => mergeReportChartWindows(query.data?.pages ?? []), [query.data]);
  return { ...chart, query };
}
