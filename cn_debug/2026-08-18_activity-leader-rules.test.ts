import assert from 'node:assert/strict';
import { canSelectActivityLeader, type ActivityLeaderScope } from '../src/lib/activity-leader-rules';

const departmentScopes: ActivityLeaderScope[] = [
  { type: 'department', name: '学生会' },
];
const classScopes: ActivityLeaderScope[] = [
  { type: 'class', name: '计算机2101' },
];
const jointClassScopes: ActivityLeaderScope[] = [
  { type: 'class', name: '计算机2101' },
  { type: 'class', name: '计算机2102' },
];

assert.equal(canSelectActivityLeader({ role: 'leader', department: '学生会' }, departmentScopes), true);
assert.equal(canSelectActivityLeader({ role: 'leader', department: '团委' }, departmentScopes), false);
assert.equal(canSelectActivityLeader({ role: 'student', department: '学生会' }, departmentScopes), false);
assert.equal(canSelectActivityLeader({ role: 'admin', department: null }, departmentScopes), true);

assert.equal(canSelectActivityLeader({ role: 'student', class_name: '计算机2101', can_submit_activity: true }, classScopes), true);
assert.equal(canSelectActivityLeader({ role: 'student', class_name: '计算机2101', can_submit_scoring: true }, classScopes), true);
assert.equal(canSelectActivityLeader({ role: 'student', class_name: '计算机2101' }, classScopes), false);
assert.equal(canSelectActivityLeader({ role: 'student', class_name: '计算机2102', can_submit_activity: true }, classScopes), false);

assert.equal(canSelectActivityLeader({ role: 'student', class_name: '计算机2102', can_submit_scoring: true }, jointClassScopes), true);
assert.equal(canSelectActivityLeader({ role: 'student', class_name: '计算机2103', can_submit_activity: true }, jointClassScopes), false);
// 管理员角色在系统权限模型中隐含拥有全部业务权限。
assert.equal(canSelectActivityLeader({ role: 'admin', class_name: '计算机2101' }, classScopes), true);
assert.equal(canSelectActivityLeader({ role: 'admin', class_name: '计算机2102' }, classScopes), false);
assert.equal(canSelectActivityLeader({ role: 'student', class_name: '计算机2101', can_submit_activity: true }, jointClassScopes), true);

console.log('activity leader rules: ok');
