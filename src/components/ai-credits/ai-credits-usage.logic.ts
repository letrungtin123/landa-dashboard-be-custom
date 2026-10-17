// What the AI usage page derives from the usage summary: feature groups and
// colors, daily chart rows, top-user series, user search/sort and the look
// of each state. Pure functions; no React, no network.
import type { AiCreditState, AiUsageDaily, AiUsageFeature, AiUsageUser, AiUsageUserDaily } from '@/api/ai-credits';
import { daysOfMonth } from './ai-credits-format.logic';

/** Fixed display order; colors follow this order (never the ranking). */
export const AI_FEATURE_GROUPS = [
  'ai_id', 'chat', 'report_chat', 'report_pdf', 'document_indexing', 'video_transcription', 'other',
] as const;
export type AiFeatureGroup = typeof AI_FEATURE_GROUPS[number];

const FEATURE_GROUP: Record<string, AiFeatureGroup> = {
  ai_id: 'ai_id',
  chat: 'chat',
  report_chat_router: 'report_chat',
  report_chat_narrative: 'report_chat',
  report_pdf_narrative: 'report_pdf',
  document_indexing: 'document_indexing',
  video_transcription: 'video_transcription',
};

export function aiFeatureGroup(feature: string | null | undefined): AiFeatureGroup {
  return (feature && Object.prototype.hasOwnProperty.call(FEATURE_GROUP, feature)) ? FEATURE_GROUP[feature] : 'other';
}

export function aiFeatureLabelKey(group: AiFeatureGroup): string {
  return `aiCredits.features.${group}`;
}

/** CSS color of a feature group (light/dark steps live in globals.css). */
export function aiFeatureColor(group: AiFeatureGroup): string {
  return `var(--ai-feature-${group.replace(/_/g, '-')})`;
}

/** CSS color of the n-th person in the top-users chart (0-based, 8 slots). */
export function aiSeriesColor(index: number): string {
  return `var(--ai-series-${(Math.max(0, index) % 8) + 1})`;
}

function addNullable(total: number | null, value: number | null): number | null {
  if (value === null) return total;
  return Math.round(((total ?? 0) + value) * 10) / 10;
}

export interface AiFeatureTotal {
  group: AiFeatureGroup;
  points: number | null;
  calls: number;
  /** Share of the month in %, by points (or by uses when points cannot be computed). */
  share: number;
}

export interface AiFeatureTotals {
  items: AiFeatureTotal[];
  totalPoints: number | null;
  totalCalls: number;
  /** 'calls' when the month has no point values (no FX rate yet). */
  basis: 'points' | 'calls';
}

/** Groups the backend features (report chat router + narrative are one group), biggest first. */
export function groupFeatureTotals(features: readonly AiUsageFeature[]): AiFeatureTotals {
  const byGroup = new Map<AiFeatureGroup, { points: number | null; calls: number }>();
  for (const item of features) {
    const group = aiFeatureGroup(item.feature);
    const entry = byGroup.get(group) ?? { points: null, calls: 0 };
    entry.points = addNullable(entry.points, typeof item.points === 'number' && Number.isFinite(item.points) ? item.points : null);
    entry.calls += Number.isFinite(item.calls) ? item.calls : 0;
    byGroup.set(group, entry);
  }
  const entries = AI_FEATURE_GROUPS.filter(group => byGroup.has(group)).map(group => ({ group, ...byGroup.get(group)! }));
  const totalPoints = entries.reduce<number | null>((sum, entry) => addNullable(sum, entry.points), null);
  const totalCalls = entries.reduce((sum, entry) => sum + entry.calls, 0);
  const basis: AiFeatureTotals['basis'] = totalPoints !== null && totalPoints > 0 ? 'points' : 'calls';
  const denominator = basis === 'points' ? totalPoints ?? 0 : totalCalls;
  const items = entries.map(entry => {
    const amount = basis === 'points' ? entry.points ?? 0 : entry.calls;
    return { ...entry, share: denominator > 0 ? Math.round((amount / denominator) * 1000) / 10 : 0 };
  }).sort((a, b) => (basis === 'points' ? (b.points ?? 0) - (a.points ?? 0) : b.calls - a.calls)
    || AI_FEATURE_GROUPS.indexOf(a.group) - AI_FEATURE_GROUPS.indexOf(b.group));
  return { items, totalPoints, totalCalls, basis };
}

export type AiDailyRow = { date: string; total: number } & Partial<Record<AiFeatureGroup, number>>;

export interface AiDailyChart {
  rows: AiDailyRow[];
  /** Groups that used points this month, in the fixed order. */
  groups: AiFeatureGroup[];
  /** False when no day has a point value (nothing to draw). */
  hasPoints: boolean;
}

/** One row per day of the month (days without use are 0), stacked by feature group. */
export function dailyFeatureChart(daily: readonly AiUsageDaily[], month: string): AiDailyChart {
  const rows = new Map<string, AiDailyRow>(daysOfMonth(month).map(date => [date, { date, total: 0 }]));
  const used = new Set<AiFeatureGroup>();
  for (const item of daily) {
    if (typeof item.points !== 'number' || !Number.isFinite(item.points) || item.points <= 0) continue;
    const row = rows.get(item.date);
    if (!row) continue;
    const group = aiFeatureGroup(item.feature);
    row[group] = Math.round(((row[group] ?? 0) + item.points) * 10) / 10;
    row.total = Math.round((row.total + item.points) * 10) / 10;
    used.add(group);
  }
  return { rows: [...rows.values()], groups: AI_FEATURE_GROUPS.filter(group => used.has(group)), hasPoints: used.size > 0 };
}

export interface AiUserSeries {
  key: string;
  user: AiUsageUser | null;
  color: string;
}

export type AiUserChartRow = { date: string } & Record<string, number | string | null>;

export interface AiUserDailyChart {
  rows: AiUserChartRow[];
  series: AiUserSeries[];
  hasPoints: boolean;
}

/**
 * Lines of the top users, in the order of the user list (most points first).
 * `cumulative` adds the days up (a running total per person). Days after
 * `until` (today, in the current month) carry no value so lines stop there.
 */
export function userDailyChart(userDaily: readonly AiUsageUserDaily[], users: readonly AiUsageUser[], month: string,
  options: { cumulative?: boolean; until?: string | null } = {}): AiUserDailyChart {
  const keys = [...new Set(userDaily.map(item => item.user_key))];
  const rank = new Map(users.map((user, index) => [user.user_key, index]));
  keys.sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));
  const series = keys.slice(0, 8).map((key, index) => ({ key, user: users.find(user => user.user_key === key) ?? null, color: aiSeriesColor(index) }));
  const included = new Set(series.map(item => item.key));
  const perDay = new Map<string, Map<string, number>>();
  let hasPoints = false;
  for (const item of userDaily) {
    if (!included.has(item.user_key) || typeof item.points !== 'number' || !Number.isFinite(item.points)) continue;
    const day = perDay.get(item.date) ?? new Map<string, number>();
    day.set(item.user_key, Math.round(((day.get(item.user_key) ?? 0) + item.points) * 10) / 10);
    perDay.set(item.date, day);
    if (item.points > 0) hasPoints = true;
  }
  const running = new Map<string, number>();
  const rows = daysOfMonth(month).map(date => {
    const row: AiUserChartRow = { date };
    const future = Boolean(options.until) && date > options.until!;
    for (const item of series) {
      const value = perDay.get(date)?.get(item.key) ?? 0;
      const total = Math.round(((running.get(item.key) ?? 0) + value) * 10) / 10;
      running.set(item.key, total);
      row[item.key] = future ? null : options.cumulative ? total : value;
    }
    return row;
  });
  return { rows, series, hasPoints };
}

export interface AiUserLabels {
  system: string;
  deletedUser: string;
}

/** Name shown for a person: "System" for work without a person, a fallback for very old deleted rows. */
export function aiUserDisplayName(user: Pick<AiUsageUser, 'name' | 'email' | 'system'>, labels: AiUserLabels): string {
  if (user.system) return labels.system;
  return user.name?.trim() || user.email?.trim() || labels.deletedUser;
}

/** Up to two initials ("Nguyễn Văn An" -> "NA"). */
export function aiUserInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words[words.length - 1][0]];
  return letters.join('').toLocaleUpperCase();
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

export type AiUserSort = 'points' | 'calls' | 'name';

/** Client-side search (name or email, accents ignored) and sort of the at most 100 users. */
export function filterAndSortUsers(users: readonly AiUsageUser[], query: string, sort: AiUserSort, labels: AiUserLabels): AiUsageUser[] {
  const needle = fold(query.trim());
  const filtered = needle
    ? users.filter(user => fold(`${aiUserDisplayName(user, labels)} ${user.system ? '' : user.email ?? ''}`).includes(needle))
    : [...users];
  return filtered.sort((a, b) => {
    if (sort === 'name') return aiUserDisplayName(a, labels).localeCompare(aiUserDisplayName(b, labels), 'vi');
    if (sort === 'calls') return b.calls - a.calls || (b.points ?? 0) - (a.points ?? 0);
    return (b.points ?? -1) - (a.points ?? -1) || b.calls - a.calls;
  });
}

export interface AiUserFeatureSegment {
  group: AiFeatureGroup;
  points: number;
  share: number;
}

/** A person's points split by feature group (for the mini bar), in the fixed order. */
export function userFeatureSegments(user: Pick<AiUsageUser, 'features'>): AiUserFeatureSegment[] {
  const byGroup = new Map<AiFeatureGroup, number>();
  for (const [feature, points] of Object.entries(user.features ?? {})) {
    if (typeof points !== 'number' || !Number.isFinite(points) || points <= 0) continue;
    const group = aiFeatureGroup(feature);
    byGroup.set(group, Math.round(((byGroup.get(group) ?? 0) + points) * 10) / 10);
  }
  const total = [...byGroup.values()].reduce((sum, value) => sum + value, 0);
  return AI_FEATURE_GROUPS.filter(group => byGroup.has(group)).map(group => ({
    group, points: byGroup.get(group)!, share: total > 0 ? (byGroup.get(group)! / total) * 100 : 0,
  }));
}

export interface AiStateTone {
  state: AiCreditState;
  labelKey: string;
  /** Ring gradient stops and track (hex / rgba for SVG). */
  from: string;
  to: string;
  track: string;
  /** Tailwind classes for a chip and for text. */
  chip: string;
  text: string;
  /** Soft background glow of the hero card. */
  glow: string;
}

const TONES: Record<AiCreditState, Omit<AiStateTone, 'state' | 'labelKey'>> = {
  ok: {
    from: '#10b981', to: '#14b8a6', track: 'rgba(16,185,129,0.14)',
    chip: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    text: 'text-emerald-600 dark:text-emerald-400', glow: 'from-emerald-500/20 via-teal-500/10',
  },
  warning: {
    from: '#f59e0b', to: '#f97316', track: 'rgba(245,158,11,0.16)',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    text: 'text-amber-600 dark:text-amber-400', glow: 'from-amber-500/20 via-orange-500/10',
  },
  exhausted: {
    from: '#f43f5e', to: '#dc2626', track: 'rgba(244,63,94,0.15)',
    chip: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    text: 'text-rose-600 dark:text-rose-400', glow: 'from-rose-500/20 via-red-500/10',
  },
  unlimited: {
    from: '#8b5cf6', to: '#d946ef', track: 'rgba(139,92,246,0.15)',
    chip: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    text: 'text-violet-600 dark:text-violet-400', glow: 'from-violet-500/20 via-fuchsia-500/10',
  },
  unvalued: {
    from: '#94a3b8', to: '#64748b', track: 'rgba(100,116,139,0.16)',
    chip: 'border-slate-400/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    text: 'text-slate-600 dark:text-slate-400', glow: 'from-slate-400/20 via-slate-500/10',
  },
};

export function aiStateTone(state: AiCreditState): AiStateTone {
  const tone = TONES[state] ?? TONES.unvalued;
  return { state: TONES[state] ? state : 'unvalued', labelKey: `aiCredits.states.${TONES[state] ? state : 'unvalued'}`, ...tone };
}

/** How full the ring is drawn (0-100). Unlimited is a full ring, unvalued an empty one. */
export function aiRingProgress(state: AiCreditState, percent: number | null): number {
  if (state === 'unlimited') return 100;
  if (state === 'unvalued') return 0;
  if (state === 'exhausted') return 100;
  return typeof percent === 'number' && Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
}

/** The month has no AI use at all. */
export function isUsageEmpty(summary: { features: readonly AiUsageFeature[] }): boolean {
  return summary.features.every(item => !item.calls && !(item.points && item.points > 0));
}
