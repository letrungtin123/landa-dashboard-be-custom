import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Users screen authority: row actions and dialog role options mirror the
// backend policy AND the account permission matrix. Logic is exercised
// directly; the page/dialog wiring and EN/VI copy are checked from source.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const transpile = (filename, module) => ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module, target: ts.ScriptTarget.ES2022 },
}).outputText;
const logic = await import(`data:text/javascript;base64,${Buffer.from(transpile(path.join(directory, 'user-authority.logic.ts'), ts.ModuleKind.ESNext)).toString('base64')}`);

const locales = {};
for (const name of ['vi', 'en']) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpile(path.join(src, `i18n/locales/${name}.ts`), ts.ModuleKind.CommonJS))(
    (specifier) => (specifier === './vi' ? locales.viModule : require(specifier)), module, module.exports);
  if (name === 'vi') locales.viModule = module.exports;
  locales[name] = module.exports[name];
}
const lookup = (locale, key) => key.split('.').reduce((node, part) => node?.[part], locales[locale]);

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const ROLES = ['superadmin', 'superuser', 'staff', 'learner_plus', 'learner'];
const ME = 'me';
const actor = (role, tenant_id = TENANT_A) => ({ id: ME, role, tenant_id });
const row = (role, extra = {}) => ({ id: `u-${role}`, role, tenant_id: TENANT_A, is_active: true, ...extra });
const ALL = { canEdit: true, canDelete: true };

// Same matrix as landa-backend user-authority.logic.test.ts.
const MANAGE = {
  superadmin: { superadmin: true, superuser: true, staff: true, learner_plus: true, learner: true },
  superuser: { superadmin: false, superuser: false, staff: true, learner_plus: true, learner: true },
  staff: { superadmin: false, superuser: false, staff: false, learner_plus: true, learner: true },
  learner_plus: { superadmin: false, superuser: false, staff: false, learner_plus: false, learner: false },
  learner: { superadmin: false, superuser: false, staff: false, learner_plus: false, learner: false },
};
const ASSIGNABLE = {
  superadmin: ['superadmin', 'superuser', 'staff', 'learner_plus', 'learner'],
  superuser: ['staff', 'learner_plus', 'learner'],
  staff: ['learner_plus', 'learner'],
  learner_plus: [],
  learner: [],
};

test('row actions follow the role matrix inside the tenant', () => {
  for (const actorRole of ROLES) {
    for (const targetRole of ROLES) {
      const access = logic.getUserRowAccess(actor(actorRole), row(targetRole), ALL);
      const allowed = MANAGE[actorRole][targetRole];
      assert.equal(access.state, allowed ? 'manage' : 'no-permission', `${actorRole} -> ${targetRole}`);
      assert.equal(access.canDeactivate, allowed, `${actorRole} deactivates ${targetRole}`);
      assert.equal(access.canDelete, allowed, `${actorRole} deletes ${targetRole}`);
      assert.equal(access.canEdit, allowed, `${actorRole} edits ${targetRole}`);
    }
  }
  assert.equal(logic.getUserRowAccess(actor('superuser'), row('staff', { tenant_id: TENANT_B }), ALL).state, 'no-permission');
  assert.equal(logic.getUserRowAccess(actor('superadmin'), row('staff', { tenant_id: TENANT_B }), ALL).state, 'manage');
  assert.equal(logic.getUserRowAccess(null, row('learner'), ALL).state, 'no-permission');
});

test('the current user row never offers deactivate or delete, for every role', () => {
  for (const role of ROLES) {
    const self = { ...row(role), id: ME };
    const access = logic.getUserRowAccess(actor(role), self, ALL);
    assert.deepEqual(access, { state: 'self', canEdit: true, canActivate: false, canDeactivate: false, canDelete: false }, role);
    assert.equal(logic.getUserRowAccess(actor(role), self, { canEdit: false, canDelete: true }).canEdit, false);
    assert.equal(logic.getUserRowAccess(actor(role), { ...self, is_active: false }, ALL).canActivate, false);
  }
});

test('row actions also need the account permission: PUT actions need can_edit, delete needs can_delete', () => {
  const editOnly = logic.getUserRowAccess(actor('superuser'), row('staff'), { canEdit: true, canDelete: false });
  assert.deepEqual(editOnly, { state: 'manage', canEdit: true, canActivate: false, canDeactivate: true, canDelete: false });
  const deleteOnly = logic.getUserRowAccess(actor('staff'), row('learner'), { canEdit: false, canDelete: true });
  assert.deepEqual(deleteOnly, { state: 'manage', canEdit: false, canActivate: false, canDeactivate: false, canDelete: true });
  const inactive = logic.getUserRowAccess(actor('staff'), row('learner', { is_active: false }), ALL);
  assert.equal(inactive.canActivate, true);
  assert.equal(inactive.canDeactivate, false);
  assert.equal(logic.getUserRowAccess(actor('superuser'), row('staff'), { canEdit: false, canDelete: false }).state, 'no-permission');
  assert.equal(logic.getUserRowAccess(actor('superadmin'), row('learner', { is_demo_iframe_active: true }), ALL).state, 'demo-locked');
});

test('dialog role options are the assignable roles; own account locks role, status and password', () => {
  for (const role of ROLES) {
    assert.deepEqual(logic.assignableUserRoles(role), ASSIGNABLE[role], role);
    assert.deepEqual(logic.getUserFormAccess(actor(role), null),
      { isSelf: false, roleLocked: false, statusLocked: false, passwordLocked: false, roleOptions: ASSIGNABLE[role] });
    assert.deepEqual(logic.getUserFormAccess(actor(role), { id: ME, role }),
      { isSelf: true, roleLocked: true, statusLocked: true, passwordLocked: true, roleOptions: [role] });
  }
  // Editing someone else: never more than the actor may assign.
  assert.deepEqual(logic.getUserFormAccess(actor('superuser'), { id: 'x', role: 'staff' }).roleOptions, ['staff', 'learner_plus', 'learner']);
  assert.deepEqual(logic.getUserFormAccess(actor('staff'), { id: 'x', role: 'learner' }).roleOptions, ['learner_plus', 'learner']);
  assert.equal(logic.getUserFormAccess(actor('staff'), { id: 'x', role: 'learner' }).roleOptions.includes('superadmin'), false);
  assert.deepEqual(logic.getUserFormAccess(null, null).roleOptions, []);
});

test('backend USER_AUTHORITY_* codes map to EN/VI copy', () => {
  assert.equal(logic.userAuthorityErrorKey('USER_AUTHORITY_SELF_DELETE'), 'users.authorityErrors.SELF_DELETE');
  assert.equal(logic.userAuthorityErrorKey('USER_AUTHORITY_UNKNOWN'), null);
  assert.equal(logic.userAuthorityErrorKey('TENANT_DATA_LIMIT_REACHED'), null);
  assert.equal(logic.userAuthorityErrorKey(undefined), null);
  for (const code of logic.USER_AUTHORITY_ERROR_CODES) {
    const key = logic.userAuthorityErrorKey(`USER_AUTHORITY_${code}`);
    const vi = lookup('vi', key);
    const en = lookup('en', key);
    assert.ok(typeof vi === 'string' && typeof en === 'string' && vi !== en, key);
  }
  for (const key of ['users.ownAccount', 'userForm.ownAccountNotice', 'userForm.ownPasswordHint']) {
    assert.ok(typeof lookup('vi', key) === 'string' && typeof lookup('en', key) === 'string' && lookup('vi', key) !== lookup('en', key), key);
  }
  assert.equal(lookup('en', 'users.ownAccount'), 'This is your account');
  assert.equal(lookup('vi', 'users.ownAccount'), 'Đây là tài khoản của bạn');
});

test('the Users page and dialog are wired to the shared policy', () => {
  const page = readFileSync(path.join(src, 'pages/users.tsx'), 'utf8');
  const dialog = readFileSync(path.join(directory, 'user-form-dialog.tsx'), 'utf8');
  const localizedError = readFileSync(path.join(src, 'utils/localized-error.ts'), 'utf8');
  assert.match(page, /getUserRowAccess\(currentUser, u, \{ canEdit, canDelete \}\)/);
  assert.match(page, /access\.state === 'self' \? t\('users\.ownAccount'\)/);
  assert.match(page, /\{access\.canDeactivate && \(/);
  assert.match(page, /\{access\.canDelete && \(/);
  assert.doesNotMatch(page, /canEditDelete|u\.is_active && canDelete/);
  assert.match(dialog, /getUserFormAccess\(currentUser, user\)/);
  assert.match(dialog, /formAccess\.roleOptions\.map/);
  assert.match(dialog, /disabled=\{formAccess\.roleLocked\}/);
  assert.match(dialog, /disabled=\{formAccess\.statusLocked\}/);
  assert.match(dialog, /disabled=\{formAccess\.passwordLocked\}/);
  assert.match(dialog, /if \(formAccess\.isSelf\) \{\s*delete payload\.role;\s*delete payload\.is_active;\s*delete payload\.password;/);
  assert.doesNotMatch(dialog, /SelectItem value="superadmin"/);
  assert.match(localizedError, /userAuthorityErrorKey\(response\?\.data\?\.code\)/);
});
