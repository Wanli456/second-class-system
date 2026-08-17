import assert from 'node:assert/strict';
import {
  getActivityScopes,
  hasAnyScopePermission,
  normalizeScopes,
  serializeScopes,
  scopeMatchesUser,
  validateHostingScope,
  validateScopes,
  type ActivityScopeAssignment,
} from '../src/lib/business-rules';

const departmentScopes: ActivityScopeAssignment[] = [
  { type: 'department', name: '学生会' },
  { type: 'department', name: '团委' },
];

const member = {
  id: 'u1',
  role: 'leader',
  department: '团委',
  class_name: '计算机2101',
  can_submit_activity: true,
  can_submit_scoring: false,
};

assert.deepEqual(validateScopes(departmentScopes), { valid: true, error: null });
assert.deepEqual(validateScopes([{ type: 'class', name: '计算机2101' }, { type: 'class', name: '计算机2102' }]), { valid: true, error: null });
assert.equal(validateScopes([{ type: 'department', name: '学生会' }, { type: 'class', name: '计算机2101' }]).valid, false);
assert.deepEqual(normalizeScopes(null, 'department', '学生会'), [{ type: 'department', name: '学生会' }]);
assert.deepEqual(normalizeScopes(serializeScopes(departmentScopes)), departmentScopes);
assert.deepEqual(getActivityScopes({ scope_type: 'class', scope_name: '计算机2101', scope_names: null }), [{ type: 'class', name: '计算机2101' }]);
assert.equal(scopeMatchesUser(member as never, departmentScopes), true);
assert.equal(scopeMatchesUser({ ...member, department: '宣传部' } as never, departmentScopes), false);
assert.equal(hasAnyScopePermission(member as never, 'submitActivity', departmentScopes), true);
assert.equal(hasAnyScopePermission({ ...member, can_submit_activity: false } as never, 'submitActivity', departmentScopes), false);
assert.deepEqual(validateHostingScope(member as never, [{ type: 'department', name: '团委' }, { type: 'department', name: '学生会' }]), { valid: true, error: null });
assert.equal(validateHostingScope(member as never, [{ type: 'department', name: '学生会' }, { type: 'department', name: '团委' }]).valid, false);

console.log('activity scope rules: ok');
