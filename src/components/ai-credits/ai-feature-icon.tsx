import { Captions, FileSearch, FileText, GraduationCap, MessageSquare, MessagesSquare, Sparkles, type LucideIcon } from 'lucide-react';
import type { AiFeatureGroup } from './ai-credits-usage.logic';

const ICONS: Record<AiFeatureGroup, LucideIcon> = {
  ai_id: GraduationCap,
  chat: MessageSquare,
  report_chat: MessagesSquare,
  report_pdf: FileText,
  document_indexing: FileSearch,
  video_transcription: Captions,
  other: Sparkles,
};

export function aiFeatureIcon(group: AiFeatureGroup): LucideIcon {
  return ICONS[group] ?? Sparkles;
}

/** Feature icon in a soft tile of the feature color (the color marks identity; text stays in text colors). */
export function AiFeatureIconTile({ group, color, size = 'md' }: { group: AiFeatureGroup; color: string; size?: 'sm' | 'md' }) {
  const Icon = aiFeatureIcon(group);
  return (
    <span
      className={size === 'sm' ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg' : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl'}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      aria-hidden
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  );
}
