// Mirror of the backend user authority policy (landa-backend
// src/modules/users/user-authority.logic.ts). The backend stays the boundary;
// this only decides which row actions and form fields the Users screen shows.
//   - Nobody changes the role/status of, resets the password of, or deletes
//     their own account here (the profile page stays the self-service path).
//   - Only a superadmin manages superadmin accounts or assigns that role.
//   - Everyone else manages accounts strictly below their own level, in their
//     own tenant: superuser → staff/learner_plus/learner, staff →
//     learner_plus/learner, learner_plus/learner → none.
//   - Each action also needs the account permission from the permission
//     matrix: add → can_add, edit/activate/deactivate (PUT) → can_edit,
//     permanent delete → can_delete.

export type UserRole = 'superadmin' | 'superuser' | 'staff' | 'learner_plus' | 'learner';

export const USER_ROLES: readonly UserRole[] = ['superadmin', 'superuser', 'staff', 'learner_plus', 'learner'];

const ROLE_LEVEL: Readonly<Record<UserRole, number>> = {
  learner: 0,
  learner_plus: 0,
  staff: 1,
  superuser: 2,
  superadmin: 3,
};

/** Backend refusal codes (`USER_AUTHORITY_<CODE>`) localized by users.authorityErrors.<CODE>. */
export const USER_AUTHORITY_ERROR_CODES = [
  'SELF_ROLE_CHANGE',
  'SELF_STATUS_CHANGE',
  'SELF_PASSWORD_CHANGE',
  'SELF_DELETE',
  'SELF_PERMISSION_GROUP_CHANGE',
  'SUPERADMIN_ONLY',
  'ROLE_NOT_ASSIGNABLE',
  'TARGET_NOT_MANAGEABLE',
  'CROSS_TENANT',
  'TENANT_REQUIRED',
  'LAST_SUPERADMIN',
  'TARGET_CHANGED',
] as const;

export const USER_AUTHORITY_CODE_PREFIX = 'USER_AUTHORITY_';

/** i18n key for a backend user-authority code, or null for any other code. */
export function userAuthorityErrorKey(code: unknown): string | null {
  if (typeof code !== 'string' || !code.startsWith(USER_AUTHORITY_CODE_PREFIX)) return null;
  const name = code.slice(USER_AUTHORITY_CODE_PREFIX.length);
  return (USER_AUTHORITY_ERROR_CODES as readonly string[]).includes(name) ? `users.authorityErrors.${name}` : null;
}

export interface UserAuthorityActor {
  id: string;
  role: string;
  tenant_id?: string | null;
}

export interface UserAuthorityTarget {
  id: string;
  role: string;
  tenant_id?: string | null;
  is_active: boolean;
  is_demo_iframe_active?: boolean;
}

export interface AccountPermissions {
  canEdit: boolean;
  canDelete: boolean;
}

function levelOf(role: string): number {
  return Object.prototype.hasOwnProperty.call(ROLE_LEVEL, role) ? ROLE_LEVEL[role as UserRole] : -1;
}

/** Roles the actor may give to an account, highest first (dropdown order). */
export function assignableUserRoles(actorRole: string): UserRole[] {
  if (actorRole === 'superadmin') return [...USER_ROLES];
  const level = levelOf(actorRole);
  return USER_ROLES.filter((role) => role !== 'superadmin' && ROLE_LEVEL[role] < level);
}

/** May the actor manage ANOTHER account (edit, status, password, delete)? */
export function canManageUser(actor: UserAuthorityActor, target: UserAuthorityTarget): boolean {
  if (target.id === actor.id) return false;
  if (actor.role === 'superadmin') return true;
  if (target.role === 'superadmin') return false;
  // The list API is already tenant-scoped for non-superadmins; this only
  // guards a row that somehow carries another tenant.
  if (typeof actor.tenant_id === 'string' && typeof target.tenant_id === 'string' && actor.tenant_id !== target.tenant_id) {
    return false;
  }
  return levelOf(target.role) < levelOf(actor.role);
}

export type UserRowState = 'self' | 'demo-locked' | 'no-permission' | 'manage';

export interface UserRowAccess {
  state: UserRowState;
  canEdit: boolean;
  canActivate: boolean;
  canDeactivate: boolean;
  canDelete: boolean;
}

const NO_ACTIONS = { canEdit: false, canActivate: false, canDeactivate: false, canDelete: false };

/** Row actions on the Users table: authority policy AND permission matrix. */
export function getUserRowAccess(
  actor: UserAuthorityActor | null | undefined,
  target: UserAuthorityTarget,
  permissions: AccountPermissions,
): UserRowAccess {
  if (!actor) return { state: 'no-permission', ...NO_ACTIONS };
  // Own account: only the non-privileged fields of the edit form remain.
  if (target.id === actor.id) return { state: 'self', ...NO_ACTIONS, canEdit: permissions.canEdit };
  if (target.is_demo_iframe_active === true) return { state: 'demo-locked', ...NO_ACTIONS };
  if (!canManageUser(actor, target)) return { state: 'no-permission', ...NO_ACTIONS };
  const access = {
    canEdit: permissions.canEdit,
    canActivate: !target.is_active && permissions.canEdit,
    canDeactivate: target.is_active && permissions.canEdit,
    canDelete: permissions.canDelete,
  };
  if (!access.canEdit && !access.canDelete) return { state: 'no-permission', ...NO_ACTIONS };
  return { state: 'manage', ...access };
}

export interface UserFormAccess {
  isSelf: boolean;
  roleLocked: boolean;
  statusLocked: boolean;
  passwordLocked: boolean;
  roleOptions: UserRole[];
}

/** Role dropdown and locked fields of the create/edit dialog. */
export function getUserFormAccess(
  actor: UserAuthorityActor | null | undefined,
  target?: Pick<UserAuthorityTarget, 'id' | 'role'> | null,
): UserFormAccess {
  const assignable = actor ? assignableUserRoles(actor.role) : [];
  if (!target) {
    return { isSelf: false, roleLocked: false, statusLocked: false, passwordLocked: false, roleOptions: assignable };
  }
  const currentRole = (USER_ROLES as readonly string[]).includes(target.role) ? (target.role as UserRole) : null;
  const isSelf = !!actor && target.id === actor.id;
  if (isSelf) {
    return { isSelf, roleLocked: true, statusLocked: true, passwordLocked: true, roleOptions: currentRole ? [currentRole] : [] };
  }
  // Keep the current role visible as the selected value even if it could not be assigned.
  const roleOptions = currentRole && !assignable.includes(currentRole)
    ? USER_ROLES.filter((role) => role === currentRole || assignable.includes(role))
    : assignable;
  return { isSelf, roleLocked: false, statusLocked: false, passwordLocked: false, roleOptions };
}
