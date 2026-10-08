// Pure mapping from persisted report chat messages to what the card renders.
// No runtime imports: tested directly with node:test (report-chat-card.logic.test.mjs).

import type {
  ReportChatFilter,
  ReportClarification,
  ReportClarificationOption,
  ReportClarificationReason,
  ReportNarrative,
  ReportRequestContext,
  ReportSnapshotV2,
  ReportUnitLevel,
} from '@/api/custom-chat';

export type ReportChatAttachment =
  | {
    kind: 'filter';
    question: string;
    suggestedFilter: ReportChatFilter;
  }
  | {
    kind: 'clarification';
    question: string;
    clarification: ReportClarification;
    suggestedFilter: ReportChatFilter;
  }
  | {
    kind: 'analysis';
    question: string;
    filter: ReportChatFilter;
    generatedAt: string | null;
    hasData: boolean;
    snapshot: ReportSnapshotV2 | null;
    courseDetail: ReportSnapshotV2['course_detail'] | null;
    narrative: ReportNarrative | null;
    request: ReportRequestContext | null;
  };

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function readReportFilter(value: unknown): ReportChatFilter {
  const record = asRecord(value);
  if (!record) return {};
  return {
    ...(typeof record.date_from === 'string' ? { date_from: record.date_from } : {}),
    ...(typeof record.date_to === 'string' ? { date_to: record.date_to } : {}),
    ...(typeof record.group_id === 'string' ? { group_id: record.group_id } : {}),
    ...(typeof record.subgroup_id === 'string' ? { subgroup_id: record.subgroup_id } : {}),
    ...(typeof record.team_id === 'string' ? { team_id: record.team_id } : {}),
  };
}

function readReportHasData(value: unknown): boolean {
  const overview = asRecord(asRecord(asRecord(value)?.summary)?.overview);
  if (!overview) return true;
  return ['total_learners', 'active_learners', 'completion_rate', 'total_enrollments']
    .some((key) => Number(overview[key] ?? 0) > 0);
}

function isReportSnapshotV2(value: unknown): value is ReportSnapshotV2 {
  const snapshot = asRecord(value);
  return snapshot?.version === 2
    && Array.isArray(snapshot.factual_metrics)
    && Array.isArray(snapshot.signals)
    && asRecord(snapshot.availability) !== null;
}

export function readReportNarrative(value: unknown): ReportNarrative | null {
  const narrative = asRecord(value);
  if (!narrative || !Array.isArray(narrative.recommended_actions)) return null;
  const strings = (items: unknown) => (Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string') : []);
  return {
    selected_signal_ids: strings(narrative.selected_signal_ids),
    interpretation: strings(narrative.interpretation),
    recommended_actions: narrative.recommended_actions.flatMap((item) => {
      const action = asRecord(item);
      if (!action || typeof action.action !== 'string') return [];
      const priority: 'high' | 'medium' | 'low' = action.priority === 'high' || action.priority === 'low' ? action.priority : 'medium';
      return [{ signal_id: typeof action.signal_id === 'string' ? action.signal_id : null, priority, action: action.action }];
    }),
    limitations: strings(narrative.limitations),
  };
}

const PERIOD_SOURCES = ['parser', 'model', 'agreed', 'default', 'filters', 'correction'] as const;
const GRANULARITIES = ['day', 'week', 'month', 'quarter'] as const;

function readReportRequest(value: unknown): ReportRequestContext | null {
  const record = asRecord(value);
  const source = PERIOD_SOURCES.find((candidate) => candidate === record?.period_source);
  if (!record || !source) return null;
  const granularity = GRANULARITIES.find((candidate) => candidate === record.granularity);
  return {
    period_source: source,
    ...(record.clamped_to_today === true ? { clamped_to_today: true } : {}),
    ...(granularity ? { granularity } : {}),
    ...(record.compare === true ? { compare: true } : {}),
    ...(readString(record.course_hint) ? { course_hint: readString(record.course_hint) } : {}),
  };
}

const CLARIFICATION_REASONS: readonly ReportClarificationReason[] = [
  'date_conflict', 'date_invalid', 'date_reversed', 'date_too_long', 'date_multiple', 'date_future', 'date_open',
  'unit_ambiguous', 'unit_not_found', 'unit_forbidden', 'unit_multiple', 'scope_required',
];
const UNIT_LEVELS: readonly ReportUnitLevel[] = ['group', 'subgroup', 'team'];

function readClarificationOption(value: unknown, index: number): ReportClarificationOption[] {
  const record = asRecord(value);
  if (!record) return [];
  const filter = readReportFilter(record.filter);
  const period = asRecord(record.period);
  const unit = asRecord(record.unit);
  const level = UNIT_LEVELS.find((candidate) => candidate === unit?.level);
  const option: ReportClarificationOption = {
    id: readString(record.id) ?? `option-${index + 1}`,
    filter,
    ...(period && typeof period.date_from === 'string' && typeof period.date_to === 'string'
      ? { period: { date_from: period.date_from, date_to: period.date_to } }
      : {}),
    ...(unit && level && typeof unit.id === 'string' && typeof unit.name === 'string'
      ? { unit: { id: unit.id, level, name: unit.name, path: Array.isArray(unit.path) ? unit.path.filter((item): item is string => typeof item === 'string') : [] } }
      : {}),
    ...(record.all_scope === true ? { all_scope: true as const } : {}),
  };
  return option.period || option.unit || option.all_scope ? [option] : [];
}

export function readReportClarification(value: unknown): ReportClarification | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.reasons)) return null;
  const reasons = record.reasons.filter((reason): reason is ReportClarificationReason => CLARIFICATION_REASONS.some((known) => known === reason));
  const params = asRecord(record.params) ?? {};
  return {
    version: 1,
    reasons,
    params: {
      ...(readString(params.mention) ? { mention: readString(params.mention) } : {}),
      ...(readString(params.unit_name) ? { unit_name: readString(params.unit_name) } : {}),
      ...(typeof params.max_days === 'number' ? { max_days: params.max_days } : {}),
    },
    options: Array.isArray(record.options) ? record.options.flatMap(readClarificationOption).slice(0, 6) : [],
  };
}

export function getReportChatAttachment(metadata: Record<string, unknown>): ReportChatAttachment | null {
  const question = typeof metadata.report_question === 'string' ? metadata.report_question : '';
  if (!question) return null;
  if (metadata.kind === 'report_filter_request') {
    return { kind: 'filter', question, suggestedFilter: readReportFilter(metadata.report_suggested_filter) };
  }
  if (metadata.kind === 'report_clarification') {
    const clarification = readReportClarification(metadata.report_clarification);
    return clarification
      ? { kind: 'clarification', question, clarification, suggestedFilter: readReportFilter(metadata.report_suggested_filter) }
      : { kind: 'filter', question, suggestedFilter: readReportFilter(metadata.report_suggested_filter) };
  }
  if (metadata.kind === 'report_analysis') {
    const snapshot = isReportSnapshotV2(metadata.report_snapshot) ? metadata.report_snapshot : null;
    return {
      kind: 'analysis',
      question,
      filter: readReportFilter(metadata.report_filter),
      generatedAt: typeof metadata.report_generated_at === 'string' ? metadata.report_generated_at : null,
      hasData: readReportHasData(metadata.report_snapshot),
      snapshot,
      courseDetail: snapshot?.course_detail ?? null,
      narrative: readReportNarrative(metadata.report_narrative),
      request: readReportRequest(metadata.report_request),
    };
  }
  return null;
}

export function getReportChatAppliedFilter(metadata: Record<string, unknown>): ReportChatFilter | null {
  const filter = readReportFilter(metadata.report_filters);
  return filter.date_from && filter.date_to ? filter : null;
}

/** dd/MM/yyyy (vi) or "08 Oct 2026" (en), from a YYYY-MM-DD calendar day. */
export function formatReportDay(value: string, isEnglish: boolean): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat(isEnglish ? 'en-GB' : 'vi-VN', {
    day: '2-digit',
    month: isEnglish ? 'short' : '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

export function formatReportPeriod(period: { date_from: string; date_to: string }, isEnglish: boolean): string {
  return period.date_from === period.date_to
    ? formatReportDay(period.date_from, isEnglish)
    : `${formatReportDay(period.date_from, isEnglish)} – ${formatReportDay(period.date_to, isEnglish)}`;
}

export type ReportAppliedChip =
  | { kind: 'period'; label: string; isDefault: boolean; clampedToToday: boolean }
  | { kind: 'unit'; level: ReportUnitLevel; name: string }
  | { kind: 'all_units' }
  | { kind: 'course'; name: string };

/** Period, unit(s) and course actually used by the snapshot, in display order. */
export function buildReportAppliedChips(
  attachment: Extract<ReportChatAttachment, { kind: 'analysis' }>,
  isEnglish: boolean,
): ReportAppliedChip[] {
  const chips: ReportAppliedChip[] = [];
  const { filter, snapshot, request } = attachment;
  if (filter.date_from && filter.date_to) {
    chips.push({
      kind: 'period',
      label: formatReportPeriod({ date_from: filter.date_from, date_to: filter.date_to }, isEnglish),
      isDefault: request?.period_source === 'default',
      clampedToToday: request?.clamped_to_today === true,
    });
  }
  const scope = snapshot?.scope_display;
  const units: Array<[ReportUnitLevel, string | undefined]> = [['group', scope?.group_name], ['subgroup', scope?.subgroup_name], ['team', scope?.team_name]];
  const named = units.filter((entry): entry is [ReportUnitLevel, string] => Boolean(entry[1]));
  if (named.length > 0) named.forEach(([level, name]) => chips.push({ kind: 'unit', level, name }));
  else if (snapshot) chips.push({ kind: 'all_units' });
  if (attachment.courseDetail?.name) chips.push({ kind: 'course', name: attachment.courseDetail.name });
  return chips;
}

export type ReportLimitationView = { kind: 'known'; key: 'noData' | 'noScope' | 'smallSample' } | { kind: 'text'; text: string };

export interface ReportNarrativeView {
  interpretation: string[];
  actions: Array<{ priority: 'high' | 'medium' | 'low'; text: string }>;
  limitations: ReportLimitationView[];
}

const KNOWN_LIMITATIONS: Array<[RegExp, 'noData' | 'noScope' | 'smallSample']> = [
  [/^no_data_in_selected_period$/, 'noData'],
  [/^no_accessible_scope$/, 'noScope'],
  [/^completion_decline_insufficient_sample(?::v\d+)?$/, 'smallSample'],
];

/**
 * The stored AI narrative, ready to show: free text is kept, machine codes
 * are mapped to translated sentences, and unknown codes are never displayed.
 */
export function getReportNarrativeView(narrative: ReportNarrative | null): ReportNarrativeView | null {
  if (!narrative) return null;
  const limitations = narrative.limitations.flatMap((item): ReportLimitationView[] => {
    const known = KNOWN_LIMITATIONS.find(([pattern]) => pattern.test(item));
    if (known) return [{ kind: 'known', key: known[1] }];
    return /^[a-z0-9_]+(?::[a-z0-9_]+)?$/.test(item) ? [] : [{ kind: 'text', text: item }];
  });
  const view: ReportNarrativeView = {
    interpretation: narrative.interpretation.filter((item) => item.trim()),
    actions: narrative.recommended_actions.filter((item) => item.action.trim()).map((item) => ({ priority: item.priority, text: item.action })),
    limitations: limitations.filter((item, index) => limitations.findIndex((other) => JSON.stringify(other) === JSON.stringify(item)) === index),
  };
  return view.interpretation.length || view.actions.length || view.limitations.length ? view : null;
}

export interface ReportEmptyStateView {
  reason: 'no_data' | 'no_scope';
  period: string | null;
  nearest: { filter: ReportChatFilter; label: string; direction: 'before' | 'after' } | null;
}

export function getReportEmptyState(
  attachment: Extract<ReportChatAttachment, { kind: 'analysis' }>,
  isEnglish: boolean,
): ReportEmptyStateView | null {
  const state = attachment.snapshot?.availability.state;
  if (!attachment.snapshot || state === 'available') return null;
  const { filter } = attachment;
  const nearest = state === 'empty' ? attachment.snapshot.availability.nearest_data_period : undefined;
  return {
    reason: state === 'no_accessible_scope' ? 'no_scope' : 'no_data',
    period: filter.date_from && filter.date_to ? formatReportPeriod({ date_from: filter.date_from, date_to: filter.date_to }, isEnglish) : null,
    nearest: nearest
      ? {
        filter: { ...filter, date_from: nearest.date_from, date_to: nearest.date_to },
        label: formatReportPeriod(nearest, isEnglish),
        direction: nearest.direction,
      }
      : null,
  };
}

export interface ReportClarificationOptionView {
  id: string;
  filter: ReportChatFilter;
  unit: { name: string; level: ReportUnitLevel; path: string } | null;
  period: string | null;
  allScope: boolean;
}

export function getReportClarificationOptions(clarification: ReportClarification, isEnglish: boolean): ReportClarificationOptionView[] {
  return clarification.options.map((option) => ({
    id: option.id,
    filter: option.filter,
    unit: option.unit ? { name: option.unit.name, level: option.unit.level, path: option.unit.path.join(' / ') } : null,
    period: option.period ? formatReportPeriod(option.period, isEnglish) : null,
    allScope: option.all_scope === true,
  }));
}

/** i18n key suffix for a reason; a generic variant when the name it needs is missing. */
export function getReportClarificationReasonKey(reason: ReportClarificationReason, params: ReportClarification['params']): string {
  if ((reason === 'unit_ambiguous' || reason === 'unit_not_found') && !params.mention) return `${reason}_generic`;
  if (reason === 'unit_forbidden' && !params.unit_name) return `${reason}_generic`;
  return reason;
}
