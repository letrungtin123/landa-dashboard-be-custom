export type UserRole = 'superadmin' | 'superuser' | 'staff' | 'learner' | 'learner_plus';
export type RoleLabelMap = Partial<Record<UserRole, string>>;

export const SYSTEM_ROLE_KEYS: UserRole[] = [
  'superadmin',
  'superuser',
  'staff',
  'learner',
  'learner_plus',
];

export const DEFAULT_ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  superuser: 'Superuser',
  staff: 'Staff',
  learner: 'Learner',
  learner_plus: 'Learner+',
};

export function normalizeRoleLabels(input?: RoleLabelMap | null): RoleLabelMap {
  const labels: RoleLabelMap = {};
  if (!input) return labels;

  for (const role of SYSTEM_ROLE_KEYS) {
    const label = input[role]?.trim();
    if (label) labels[role] = label;
  }
  return labels;
}

export function getRoleLabel(
  role?: string | null,
  labels?: RoleLabelMap | null,
  fallback?: string,
): string {
  if (!role) return fallback || '';
  const label = labels?.[role as UserRole]?.trim();
  if (label) return label;
  return fallback || DEFAULT_ROLE_LABELS[role as UserRole] || role;
}
