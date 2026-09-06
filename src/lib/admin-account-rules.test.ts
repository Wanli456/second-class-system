import { strict as assert } from 'node:assert';
import { getAdminAccountRuleError, isLastAdminMutation } from './admin-account-rules';

assert.equal(getAdminAccountRuleError({ role: 'admin', username: ' admin ', studentId: '1001', existingAdmin: null }), null);
assert.equal(getAdminAccountRuleError({ role: 'admin', username: 'admin', studentId: '1001', existingAdmin: { id: 'other', username: 'admin', studentId: '2002' } }), null, '同名管理员应当是独立账号，不能被误拦');
assert.equal(getAdminAccountRuleError({ role: 'admin', username: 'admin', studentId: '1001', existingAdmin: { id: 'other', username: 'other', studentId: '1001' } }), '该学号已绑定其他管理员账号');
assert.equal(isLastAdminMutation({ currentRole: 'admin', nextRole: 'student', adminCount: 1 }), true);
assert.equal(isLastAdminMutation({ currentRole: 'admin', nextRole: 'student', adminCount: 2 }), false);
assert.equal(isLastAdminMutation({ currentRole: 'student', nextRole: 'admin', adminCount: 1 }), false);
console.log('admin account rules passed');
