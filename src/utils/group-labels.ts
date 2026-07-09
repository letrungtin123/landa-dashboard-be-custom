export type GroupLabelKey = 'group' | 'subgroup' | 'team';
export type GroupLabelMap = Partial<Record<GroupLabelKey, string>>;

export const SYSTEM_GROUP_LABEL_KEYS: GroupLabelKey[] = ['group', 'subgroup', 'team'];

export const DEFAULT_GROUP_LABELS: Record<GroupLabelKey, string> = {
  group: 'Công ty',
  subgroup: 'Chi nhánh',
  team: 'Phòng ban',
};

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
  return fallback || DEFAULT_GROUP_LABELS[key as GroupLabelKey] || key;
}

export function getGroupLabelSet(labels?: GroupLabelMap | null): Record<GroupLabelKey, string> {
  return {
    group: getGroupLabel('group', labels),
    subgroup: getGroupLabel('subgroup', labels),
    team: getGroupLabel('team', labels),
  };
}

export function lowerGroupLabel(value: string): string {
  return value.toLocaleLowerCase('vi-VN');
}
