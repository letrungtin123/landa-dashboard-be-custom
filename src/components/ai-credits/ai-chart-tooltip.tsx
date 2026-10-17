import type { ReactNode } from 'react';

export interface AiTooltipRow {
  key: string;
  label: string;
  color: string;
  value: string;
}

/** Floating card used by every AI chart tooltip: title, rows with a color key, optional total. */
export function AiChartTooltipCard({ title, rows, total }: { title: ReactNode; rows: AiTooltipRow[]; total?: { label: string; value: string } }) {
  return (
    <div className="min-w-[180px] max-w-[260px] rounded-xl border border-border/70 bg-popover/95 p-3 text-popover-foreground shadow-xl shadow-black/10 backdrop-blur-md">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {rows.map(row => (
            <li key={row.key} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: row.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.label}</span>
              <span className="font-semibold tabular-nums text-foreground">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
      {total && (
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs">
          <span className="text-muted-foreground">{total.label}</span>
          <span className="font-semibold tabular-nums text-foreground">{total.value}</span>
        </div>
      )}
    </div>
  );
}

/** Legend chips: colored key + text in text colors (identity never by color alone). */
export function AiChartLegend({ items }: { items: Array<{ key: string; label: ReactNode; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map(item => (
        <li key={item.key} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} aria-hidden />
          <span className="truncate">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Payload entry recharts passes to a custom tooltip. */
export interface AiRechartsPayload {
  dataKey?: string | number;
  value?: number | string;
  payload?: Record<string, unknown>;
}
