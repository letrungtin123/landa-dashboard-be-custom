import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, MoveHorizontal } from 'lucide-react';

import {
  getReportChart,
  type ReportChartGranularity,
  type ReportChartPoint,
  type ReportChartResponse,
  type ReportChartWindowMeta,
  type ReportChartWindowDirection,
} from '@/api/custom-reports';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/utils';
import { useTenantStore } from '@/utils/tenant-store';

type ReportChartRequest = Parameters<typeof getReportChart>[0];
type ChartView = { start: number; end: number };
type EdgeDirection = Extract<ReportChartWindowDirection, 'before' | 'after'>;
type TooltipState = { index: number; x: number; y: number } | null;
type ChartVariant = 'bar' | 'line';

const META_KEYS = new Set(['month', 'month_label', 'bucket', 'bucket_label']);
const WINDOW_LIMIT_BUCKETS = 72;
const SERIES_LIMIT = 8;
const EDGE_LOAD_THRESHOLD = 6;
const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6',
];

function getBucketId(point: ReportChartPoint): string {
  return String(point.bucket || point.month || '');
}

function getPreferredVisibleBuckets(granularity?: ReportChartGranularity): number {
  if (granularity === 'month') return 10;
  if (granularity === 'week') return 18;
  return 32;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function makeDefaultView(
  points: ReportChartPoint[],
  granularity: ReportChartGranularity | undefined,
  keys: string[],
): ChartView | null {
  const total = points.length;
  if (total <= 0) return null;

  const visible = Math.min(total, getPreferredVisibleBuckets(granularity));
  const firstValueIndex = points.findIndex(point => sumPoint(point, keys) > 0);
  const lastValueIndex = (() => {
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (sumPoint(points[index], keys) > 0) return index;
    }
    return -1;
  })();

  if (firstValueIndex >= 0 && lastValueIndex >= 0) {
    const dataSpan = lastValueIndex - firstValueIndex + 1;
    const contextBefore = dataSpan <= visible ? 1 : 0;
    const targetStart = dataSpan <= visible
      ? firstValueIndex - contextBefore
      : lastValueIndex - visible + 1;
    const start = clamp(targetStart, 0, Math.max(0, total - visible));
    return { start, end: start + visible - 1 };
  }

  return { start: total - visible, end: total - 1 };
}

function clampView(view: ChartView, total: number, granularity?: ReportChartGranularity): ChartView | null {
  if (total <= 0) return null;
  const width = Math.min(total, Math.max(1, view.end - view.start + 1 || getPreferredVisibleBuckets(granularity)));
  const start = clamp(view.start, 0, Math.max(0, total - width));
  return { start, end: start + width - 1 };
}

function mergePoints(existing: ReportChartPoint[], incoming: ReportChartPoint[]): ReportChartPoint[] {
  const points = new Map<string, ReportChartPoint>();
  for (const point of existing) {
    const id = getBucketId(point);
    if (id) points.set(id, point);
  }
  for (const point of incoming) {
    const id = getBucketId(point);
    if (id) points.set(id, point);
  }
  return [...points.values()].sort((a, b) => getBucketId(a).localeCompare(getBucketId(b)));
}

function mergeWindowMeta(
  previous: ReportChartWindowMeta | null,
  next: ReportChartWindowMeta | undefined,
  direction: ReportChartWindowDirection,
): ReportChartWindowMeta | null {
  if (!next) return previous;
  if (!previous || direction === 'initial') return next;
  if (direction === 'before') {
    return {
      ...previous,
      window_start: next.window_start,
      has_before: next.has_before,
      next_before: next.next_before,
    };
  }
  return {
    ...previous,
    window_end: next.window_end,
    has_after: next.has_after,
    next_after: next.next_after,
  };
}

function resolveSeriesKeys(points: ReportChartPoint[], grouped: boolean): string[] {
  if (!grouped) return points.some(point => typeof point.value === 'number') ? ['value'] : [];
  const keys = new Set<string>();
  for (const point of points) {
    Object.keys(point).forEach((key) => {
      if (!META_KEYS.has(key) && Number.isFinite(Number(point[key]))) keys.add(key);
    });
  }
  return [...keys];
}

function sumPoint(point: ReportChartPoint, keys: string[]): number {
  return keys.reduce((sum, key) => sum + Math.max(0, Number(point[key]) || 0), 0);
}

function getSeriesValue(point: ReportChartPoint, key: string): number {
  return Math.max(0, Number(point[key]) || 0);
}

function formatBucketShort(bucket: string, granularity?: ReportChartGranularity): string {
  if (!bucket || bucket.length < 10) return bucket;
  const [year, month, day] = bucket.split('-');
  if (granularity === 'month') return `T${Number(month)}/${year.slice(2)}`;
  if (granularity === 'week') return `${day}/${month}`;
  return `${day}/${month}`;
}

function resolveCssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return fallback;
  return /^\d/.test(value) ? `hsl(${value})` : value;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function compactAxisValue(value: number, suffix?: string): string {
  if (suffix === '%') return `${Math.round(value)}%`;
  if (value >= 1000000) return `${Math.round(value / 100000) / 10}M`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
  return `${Math.round(value)}`;
}

export function ReportWindowChart({
  request,
  enabled = true,
  className,
  height = 320,
  emptyLabel = 'Không có dữ liệu',
  valueLabel = 'Giá trị',
  valueSuffix = '',
  formatValue = (value) => `${value.toLocaleString('vi-VN')}${valueSuffix}`,
  colors = DEFAULT_COLORS,
  variant = 'bar',
}: {
  request: ReportChartRequest;
  enabled?: boolean;
  className?: string;
  height?: number;
  emptyLabel?: string;
  valueLabel?: string;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
  colors?: string[];
  variant?: ChartVariant;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef<ReportChartPoint[]>([]);
  const viewRef = useRef<ChartView | null>(null);
  const metaRef = useRef<ReportChartWindowMeta | null>(null);
  const requestRef = useRef<ReportChartRequest>(request);
  const resetKeyRef = useRef('');
  const dragRef = useRef<{ pointerId: number; lastX: number; carry: number } | null>(null);
  const loadingRef = useRef({ before: false, after: false });

  const [points, setPoints] = useState<ReportChartPoint[]>([]);
  const [view, setView] = useState<ChartView | null>(null);
  const [granularity, setGranularity] = useState<ReportChartGranularity>('auto');
  const [isGrouped, setIsGrouped] = useState(false);
  const [windowMeta, setWindowMeta] = useState<ReportChartWindowMeta | null>(null);
  const [seriesOverflow, setSeriesOverflow] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [edgeLoading, setEdgeLoading] = useState<EdgeDirection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height });
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const activeTenantId = useTenantStore((state) => state.activeTenantId);
  const [themeVersion, setThemeVersion] = useState(0);

  const requestKey = useMemo(() => JSON.stringify({ request, activeTenantId }), [request, activeTenantId]);

  useEffect(() => {
    requestRef.current = request;
  }, [request, requestKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    let frameId: number | null = null;

    const scheduleRedraw = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = window.requestAnimationFrame(() => {
          frameId = null;
          setThemeVersion((version) => version + 1);
        });
      });
    };

    const observer = new MutationObserver(scheduleRedraw);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', scheduleRedraw);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', scheduleRedraw);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);
  const seriesKeys = useMemo(() => resolveSeriesKeys(points, isGrouped), [points, isGrouped]);
  const hasValue = useMemo(() => points.some(point => sumPoint(point, seriesKeys) > 0), [points, seriesKeys]);
  const isChartReady = !isInitialLoading && points.length > 0 && hasValue && !!view;
  const visiblePoints = useMemo(() => {
    if (!view) return [];
    return points.slice(view.start, view.end + 1);
  }, [points, view]);

  const applyResponse = useCallback((direction: ReportChartWindowDirection, response: ReportChartResponse) => {
    const incoming = response.data || [];
    const current = direction === 'initial' ? [] : pointsRef.current;
    const known = new Set(current.map(getBucketId));
    const insertedBefore = direction === 'before'
      ? incoming.filter(point => !known.has(getBucketId(point))).length
      : 0;
    const insertedAfter = direction === 'after'
      ? incoming.filter(point => !known.has(getBucketId(point))).length
      : 0;
    const merged = mergePoints(current, incoming);
    const nextGranularity = response.granularity || 'auto';
    const nextMeta = mergeWindowMeta(metaRef.current, response.window, direction);

    pointsRef.current = merged;
    metaRef.current = nextMeta;
    setPoints(merged);
    setGranularity(nextGranularity);
    setIsGrouped(!!response.is_grouped);
    setSeriesOverflow(!!response.series_overflow);
    setWindowMeta(nextMeta);
    setError(null);

    const previousView = viewRef.current;
    let nextView: ChartView | null;
    if (direction === 'initial' || !previousView) {
      const nextSeriesKeys = resolveSeriesKeys(merged, !!response.is_grouped);
      nextView = makeDefaultView(merged, nextGranularity, nextSeriesKeys);
    } else if (direction === 'before') {
      nextView = clampView({
        start: previousView.start + insertedBefore,
        end: previousView.end + insertedBefore,
      }, merged.length, nextGranularity);
    } else {
      const wasAtRightEdge = previousView.end >= current.length - 2;
      nextView = clampView({
        start: previousView.start + (wasAtRightEdge ? insertedAfter : 0),
        end: previousView.end + (wasAtRightEdge ? insertedAfter : 0),
      }, merged.length, nextGranularity);
    }

    viewRef.current = nextView;
    setView(nextView);
  }, []);

  const fetchWindow = useCallback(async (direction: ReportChartWindowDirection, anchorBucket?: string) => {
    const activeKey = resetKeyRef.current;
    const baseRequest = requestRef.current;
    const response = await getReportChart({
      ...baseRequest,
      mode: 'window',
      direction,
      anchor_bucket: anchorBucket,
      limit_buckets: WINDOW_LIMIT_BUCKETS,
      series_limit: SERIES_LIMIT,
      granularity: baseRequest.granularity || 'auto',
    });
    if (resetKeyRef.current !== activeKey) return;
    applyResponse(direction, response);
  }, [applyResponse]);

  const loadEdge = useCallback(async (direction: EdgeDirection) => {
    const meta = metaRef.current;
    const anchor = direction === 'before' ? meta?.next_before : meta?.next_after;
    const canLoad = direction === 'before' ? meta?.has_before : meta?.has_after;
    if (!enabled || !canLoad || !anchor || loadingRef.current[direction]) return;

    loadingRef.current[direction] = true;
    setEdgeLoading(direction);
    try {
      await fetchWindow(direction, anchor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải biểu đồ');
    } finally {
      loadingRef.current[direction] = false;
      setEdgeLoading(null);
    }
  }, [enabled, fetchWindow]);

  const panByBuckets = useCallback((delta: number) => {
    if (!delta) return;
    const current = viewRef.current;
    const total = pointsRef.current.length;
    if (!current || total <= 0) return;

    const width = Math.max(1, current.end - current.start + 1);
    const maxStart = Math.max(0, total - width);
    const nextStart = clamp(current.start + delta, 0, maxStart);
    const nextView = { start: nextStart, end: nextStart + width - 1 };
    viewRef.current = nextView;
    setView(nextView);

    if (delta < 0 && nextView.start <= EDGE_LOAD_THRESHOLD) void loadEdge('before');
    if (delta > 0 && nextView.end >= total - 1 - EDGE_LOAD_THRESHOLD) void loadEdge('after');
  }, [loadEdge]);

  useEffect(() => {
    if (!enabled) return;
    resetKeyRef.current = requestKey;
    pointsRef.current = [];
    viewRef.current = null;
    metaRef.current = null;
    loadingRef.current = { before: false, after: false };
    setPoints([]);
    setView(null);
    setWindowMeta(null);
    setTooltip(null);
    setError(null);
    setIsInitialLoading(true);

    fetchWindow('initial')
      .catch((err) => setError(err instanceof Error ? err.message : 'Lỗi tải biểu đồ'))
      .finally(() => {
        if (resetKeyRef.current === requestKey) setIsInitialLoading(false);
      });
  }, [enabled, fetchWindow, requestKey]);

  useEffect(() => {
    if (!isChartReady) return;
    const target = containerRef.current;
    if (!target) return;
    const updateSize = () => {
      const rect = target.getBoundingClientRect();
      setSize({ width: Math.max(0, Math.floor(rect.width)), height });
    };
    updateSize();
    const frame = window.requestAnimationFrame(updateSize);
    const observer = new ResizeObserver(updateSize);
    observer.observe(target);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [height, isChartReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const background = resolveCssColor('--card', '#0f172a');
    const border = resolveCssColor('--border', '#273449');
    const muted = resolveCssColor('--muted-foreground', '#94a3b8');
    const foreground = resolveCssColor('--foreground', '#f8fafc');
    const plot = {
      left: size.width < 560 ? 42 : 54,
      right: 18,
      top: 18,
      bottom: 38,
    };
    const plotWidth = Math.max(1, size.width - plot.left - plot.right);
    const plotHeight = Math.max(1, size.height - plot.top - plot.bottom);
    const zeroY = plot.top + plotHeight;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size.width, size.height);

    if (!visiblePoints.length || !seriesKeys.length) return;

    const maxValue = Math.max(1, ...visiblePoints.flatMap(point => variant === 'line' ? seriesKeys.map(key => getSeriesValue(point, key)) : [isGrouped ? sumPoint(point, seriesKeys) : getSeriesValue(point, seriesKeys[0])]));
    const yFor = (value: number) => zeroY - (Math.max(0, value) / maxValue) * plotHeight;

    ctx.save();
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 1;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i += 1) {
      const value = (maxValue / 4) * i;
      const y = yFor(value);
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(size.width - plot.right, y);
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.fillText(compactAxisValue(value, valueSuffix), plot.left - 8, y);
      ctx.globalAlpha = 0.42;
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.left, zeroY + 0.5);
    ctx.lineTo(size.width - plot.right, zeroY + 0.5);
    ctx.stroke();
    ctx.restore();

    const step = plotWidth / Math.max(visiblePoints.length, 1);
    const barWidth = clamp(step * (isGrouped ? 0.68 : 0.56), 5, isGrouped ? 30 : 24);
    const xLabelEvery = Math.max(1, Math.ceil(visiblePoints.length / (size.width < 560 ? 5 : 8)));

    if (variant === 'line') {
      seriesKeys.forEach((key, seriesIndex) => {
        const color = colors[seriesIndex % colors.length];
        let hasActiveSegment = false;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = seriesKeys.length > 4 ? 2 : 2.6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = `${color}33`;
        ctx.shadowBlur = 7;
        ctx.beginPath();

        visiblePoints.forEach((point, index) => {
          const value = getSeriesValue(point, key);
          const xCenter = plot.left + step * index + step / 2;
          if (value <= 0) {
            hasActiveSegment = false;
            return;
          }
          const y = yFor(value);
          if (!hasActiveSegment) {
            ctx.moveTo(xCenter, y);
            hasActiveSegment = true;
          } else {
            ctx.lineTo(xCenter, y);
          }
        });

        ctx.stroke();
        ctx.shadowBlur = 0;

        visiblePoints.forEach((point, index) => {
          const value = getSeriesValue(point, key);
          if (value <= 0) return;
          const xCenter = plot.left + step * index + step / 2;
          const y = yFor(value);
          ctx.fillStyle = background;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(xCenter, y, value > 0 ? 3.4 : 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        ctx.restore();
      });
    } else {
      visiblePoints.forEach((point, index) => {
        const xCenter = plot.left + step * index + step / 2;
        const x = xCenter - barWidth / 2;
        let stackedTop = zeroY;

        if (isGrouped) {
          for (let seriesIndex = 0; seriesIndex < seriesKeys.length; seriesIndex += 1) {
            const key = seriesKeys[seriesIndex];
            const value = getSeriesValue(point, key);
            if (value <= 0) continue;
            const y = yFor(sumPoint(point, seriesKeys.slice(0, seriesIndex + 1)));
            const heightPx = Math.max(2, stackedTop - y);
            ctx.fillStyle = colors[seriesIndex % colors.length];
            roundedRect(ctx, x, stackedTop - heightPx, barWidth, heightPx, Math.min(5, barWidth / 2));
            ctx.fill();
            stackedTop -= heightPx;
          }
        } else {
          const value = getSeriesValue(point, seriesKeys[0]);
          const y = yFor(value);
          const heightPx = value > 0 ? Math.max(2, zeroY - y) : 0;
          if (heightPx > 0) {
            const gradient = ctx.createLinearGradient(0, y, 0, zeroY);
            gradient.addColorStop(0, colors[0]);
            gradient.addColorStop(1, `${colors[0]}66`);
            ctx.fillStyle = gradient;
            roundedRect(ctx, x, zeroY - heightPx, barWidth, heightPx, Math.min(5, barWidth / 2));
            ctx.fill();
          }
        }
      });
    }

    visiblePoints.forEach((point, index) => {
      const xCenter = plot.left + step * index + step / 2;
      if (index % xLabelEvery === 0 || index === visiblePoints.length - 1) {
        ctx.fillStyle = muted;
        ctx.font = '700 10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(formatBucketShort(getBucketId(point), granularity), xCenter, zeroY + 12);
      }
    });

    if (tooltip && tooltip.index >= 0) {
      const visibleIndex = tooltip.index - (view?.start || 0);
      if (visibleIndex >= 0 && visibleIndex < visiblePoints.length) {
        const x = plot.left + step * visibleIndex + step / 2;
        ctx.save();
        ctx.strokeStyle = foreground;
        ctx.globalAlpha = 0.28;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(x, plot.top);
        ctx.lineTo(x, zeroY);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [colors, granularity, isGrouped, seriesKeys, size, themeVersion, tooltip, valueSuffix, variant, view, visiblePoints]);

  const moveTooltip = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const currentView = viewRef.current;
    if (!rect || !currentView) return;
    const plotLeft = rect.width < 560 ? 42 : 54;
    const plotRight = 18;
    const plotWidth = Math.max(1, rect.width - plotLeft - plotRight);
    const count = Math.max(1, currentView.end - currentView.start + 1);
    const relativeX = clientX - rect.left - plotLeft;
    const indexInView = clamp(Math.floor(relativeX / (plotWidth / count)), 0, count - 1);
    const absoluteIndex = currentView.start + indexInView;
    if (absoluteIndex < 0 || absoluteIndex >= pointsRef.current.length) return;
    setTooltip({ index: absoluteIndex, x: clientX - rect.left, y: clientY - rect.top });
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, carry: 0 };
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    moveTooltip(event.clientX, event.clientY);
    const drag = dragRef.current;
    const currentView = viewRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !currentView) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const count = Math.max(1, currentView.end - currentView.start + 1);
    const bucketWidth = Math.max(8, rect.width / count);
    drag.carry += event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    const deltaBuckets = -Math.trunc(drag.carry / bucketWidth);
    if (deltaBuckets !== 0) {
      drag.carry += deltaBuckets * bucketWidth;
      panByBuckets(deltaBuckets);
    }
  }, [moveTooltip, panByBuckets]);

  const stopDrag = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!rawDelta) return;
    event.preventDefault();
    panByBuckets(Math.sign(rawDelta) * Math.max(1, Math.ceil(Math.abs(rawDelta) / 80)));
  }, [panByBuckets]);

  const tooltipPoint = tooltip ? points[tooltip.index] : null;
  const tooltipRows = tooltipPoint
    ? seriesKeys
      .map((key, index) => ({ key, color: colors[index % colors.length], value: getSeriesValue(tooltipPoint, key) }))
      .filter(row => row.value > 0 || !isGrouped)
    : [];

  if (isInitialLoading) {
    return <Skeleton className={cn('w-full rounded-xl', className)} style={{ height }} />;
  }

  if (error && !points.length) {
    return (
      <div className={cn('flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground', className)} style={{ height }}>
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="h-6 w-6 opacity-60" />
          <span>Lỗi tải biểu đồ</span>
        </div>
      </div>
    );
  }

  if (!points.length || !hasValue || !view) {
    return (
      <div className={cn('flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground', className)} style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={cn('app-liquid-card relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-inner', className)} style={{ height }}>
      <div ref={containerRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onPointerLeave={() => setTooltip(null)}
          onWheel={handleWheel}
          title="Kéo ngang để xem dữ liệu trong khoảng đã chọn"
        />
      </div>

      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-border/70 bg-background/88 px-2.5 py-1 text-[10px] font-bold text-muted-foreground shadow-sm backdrop-blur">
        <MoveHorizontal className="h-3.5 w-3.5" />
        <span>Trong khoảng đã chọn</span>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 flex flex-wrap justify-end gap-1.5 max-w-[70%]">
        {seriesKeys.slice(0, 4).map((key, index) => (
          <span key={key} className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/88 px-2 py-1 text-[10px] font-bold text-muted-foreground shadow-sm backdrop-blur">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            <span className="max-w-[92px] truncate">{key === 'value' ? valueLabel : key}</span>
          </span>
        ))}
        {seriesKeys.length > 4 && (
          <span className="rounded-full border border-border/70 bg-background/88 px-2 py-1 text-[10px] font-bold text-muted-foreground shadow-sm backdrop-blur">
            +{seriesKeys.length - 4}
          </span>
        )}
      </div>

      <AnimatePresence>
        {edgeLoading && (
          <motion.div
            key="chart-edge-loading"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background/92 px-3 py-1.5 text-[11px] font-bold text-muted-foreground shadow-lg backdrop-blur"
          >
            Đang tải thêm...
          </motion.div>
        )}
      </AnimatePresence>

      {seriesOverflow && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-border/70 bg-background/88 px-2.5 py-1 text-[10px] font-bold text-muted-foreground shadow-sm backdrop-blur">
          Top {SERIES_LIMIT} + Khác
        </div>
      )}

      {tooltipPoint && tooltipRows.length > 0 && (
        <div
          className="pointer-events-none absolute z-20 min-w-[180px] rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-2xl"
          style={{
            left: clamp(tooltip!.x + 14, 8, Math.max(8, size.width - 220)),
            top: clamp(tooltip!.y + 14, 8, Math.max(8, size.height - 132)),
          }}
        >
          <div className="mb-2 font-bold text-foreground">{tooltipPoint.bucket_label || tooltipPoint.month_label}</div>
          <div className="space-y-1.5">
            {tooltipRows.slice(0, 8).map(row => (
              <div key={row.key} className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="truncate">{row.key === 'value' ? valueLabel : row.key}</span>
                </span>
                <span className="font-bold text-foreground">{formatValue(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && points.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[10px] font-bold text-destructive shadow-sm">
          Lỗi tải thêm
        </div>
      )}

      {!windowMeta?.has_before && view.start === 0 && (
        <div className="pointer-events-none absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-card to-transparent" />
      )}
      {!windowMeta?.has_after && view.end >= points.length - 1 && (
        <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-card to-transparent" />
      )}
    </div>
  );
}