import { ArrowRight, Minus, Palette, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  EDGE_COLOR_SWATCHES,
  type DiagramEdgeAppearance,
  type DiagramEdgeArrow,
  type DiagramEdgeLineStyle,
  normalizeEdgeColor,
} from './edge-appearance';

interface EdgePropertiesPanelProps {
  appearance: DiagramEdgeAppearance;
  onChange: (patch: Partial<DiagramEdgeAppearance>) => void;
  onDelete: () => void;
}

const EDGE_OPTIONS: Array<{
  id: string;
  lineStyle: DiagramEdgeLineStyle;
  arrow: DiagramEdgeArrow;
}> = [
  { id: 'solid-none', lineStyle: 'solid', arrow: 'none' },
  { id: 'dashed-none', lineStyle: 'dashed', arrow: 'none' },
  { id: 'solid-end', lineStyle: 'solid', arrow: 'end' },
  { id: 'dashed-end', lineStyle: 'dashed', arrow: 'end' },
];

function EdgeSample({ lineStyle, arrow }: Pick<typeof EDGE_OPTIONS[number], 'lineStyle' | 'arrow'>) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-primary" aria-hidden="true">
      <span
        className={`h-0 min-w-0 flex-1 border-t-2 ${lineStyle === 'dashed' ? 'border-dashed' : ''}`}
      />
      {arrow === 'end' && <ArrowRight className="h-3.5 w-3.5 shrink-0" />}
    </span>
  );
}

export default function EdgePropertiesPanel({ appearance, onChange, onDelete }: EdgePropertiesPanelProps) {
  const { t } = useTranslation();
  const currentOption = `${appearance.lineStyle}-${appearance.arrow}`;
  const optionLabels = {
    'solid-none': t('courseEditorForms.edgeOption.solid-none'),
    'dashed-none': t('courseEditorForms.edgeOption.dashed-none'),
    'solid-end': t('courseEditorForms.edgeOption.solid-end'),
    'dashed-end': t('courseEditorForms.edgeOption.dashed-end'),
  };

  return (
    <div className="flex h-full w-72 flex-col border-l border-border bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 text-primary">
        <Palette className="h-4 w-4" />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold">{t('courseEditorForms.edgeProperties')}</h3>
          <p className="text-[11px] text-muted-foreground">{t('courseEditorForms.edgePropertiesHint')}</p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 custom-scrollbar">
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">{t('courseEditorForms.edgeStyle')}</h4>
          <div className="grid grid-cols-2 gap-2">
            {EDGE_OPTIONS.map((option) => {
              const optionId = option.id;
              const isActive = currentOption === optionId;
              return (
                <button
                  key={optionId}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onChange({ lineStyle: option.lineStyle, arrow: option.arrow })}
                  className={`flex min-h-16 flex-col items-stretch justify-between rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.04]'
                  }`}
                >
                  <EdgeSample lineStyle={option.lineStyle} arrow={option.arrow} />
                  <span className="mt-2 truncate text-[11px] font-medium">
                    {optionLabels[optionId as keyof typeof optionLabels]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-xs font-semibold text-foreground">{t('courseEditorForms.edgeColor')}</h4>
          </div>
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3">
            {EDGE_COLOR_SWATCHES.map((color) => {
              const isActive = appearance.color.toUpperCase() === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={t('courseEditorForms.edgeColorSwatch', { color })}
                  aria-pressed={isActive}
                  onClick={() => onChange({ color })}
                  className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${isActive ? 'border-foreground ring-2 ring-primary/30' : 'border-background'}`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
            <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/60 text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              <input
                type="color"
                value={normalizeEdgeColor(appearance.color)}
                onChange={(event) => onChange({ color: event.target.value.toUpperCase() })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={t('courseEditorForms.edgeCustomColor')}
              />
              <Minus className="h-3.5 w-3.5 rotate-45" aria-hidden="true" />
            </label>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/70 bg-background px-2.5 py-2">
            <span className="text-[11px] text-muted-foreground">{t('courseEditorForms.edgeCurrentColor')}</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-foreground">{appearance.color}</span>
          </div>
        </section>
      </div>

      <div className="border-t border-border bg-muted/10 p-4">
        <Button type="button" variant="destructive" className="w-full gap-2" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          {t('courseEditorForms.deleteConnection')}
        </Button>
      </div>
    </div>
  );
}
