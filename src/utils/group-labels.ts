import i18n from '@/i18n';

export type GroupLabelKey = 'group' | 'subgroup' | 'team';
export type GroupLabelMap = Partial<Record<GroupLabelKey, string>>;

export const SYSTEM_GROUP_LABEL_KEYS: GroupLabelKey[] = ['group', 'subgroup', 'team'];

export const DEFAULT_GROUP_LABELS: Record<GroupLabelKey, string> = {
  group: 'Công ty',
  subgroup: 'Chi nhánh',
  team: 'Phòng ban',
};

const LOCALIZED_DEFAULT_GROUP_LABEL_KEYS: Record<GroupLabelKey, string> = {
  group: 'groupLabels.group',
  subgroup: 'groupLabels.subgroup',
  team: 'groupLabels.team',
};

/** Default labels shown by the UI when a tenant has not configured its own labels. */
export function getLocalizedDefaultGroupLabel(key: GroupLabelKey): string {
  return i18n.t(LOCALIZED_DEFAULT_GROUP_LABEL_KEYS[key]);
}

export function normalizeGroupLabels(input?: GroupLabelMap | null): GroupLabelMap {
  const labels: GroupLabelMap = {};
  if (!input) return labels;

  for (const key of SYSTEM_GROUP_LABEL_KEYS) {
    const label = input[key]?.trim();
    if (label) labels[key] = label;
  }
  return labels;
}

export function getGroupLabel(
  key?: string | null,
  labels?: GroupLabelMap | null,
  fallback?: string,
): string {
  if (!key) return fallback || '';
  const label = labels?.[key as GroupLabelKey]?.trim();
  if (label) return label;
  if (fallback) return fallback;
  return key in LOCALIZED_DEFAULT_GROUP_LABEL_KEYS
    ? getLocalizedDefaultGroupLabel(key as GroupLabelKey)
    : key;
}

export function getGroupLabelSet(labels?: GroupLabelMap | null): Record<GroupLabelKey, string> {
  return {
    group: getGroupLabel('group', labels),
    subgroup: getGroupLabel('subgroup', labels),
    team: getGroupLabel('team', labels),
  };
}

/**
 * Preserves the canonical Vietnamese defaults for API payloads and stored
 * configuration. Do not use this for rendered UI labels.
 */
export function getStoredGroupLabelSet(labels?: GroupLabelMap | null): Record<GroupLabelKey, string> {
  return {
    group: labels?.group?.trim() || DEFAULT_GROUP_LABELS.group,
    subgroup: labels?.subgroup?.trim() || DEFAULT_GROUP_LABELS.subgroup,
    team: labels?.team?.trim() || DEFAULT_GROUP_LABELS.team,
  };
}

export function lowerGroupLabel(value: string): string {
  return value.toLocaleLowerCase('vi-VN');
}
