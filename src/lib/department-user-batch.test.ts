import assert from 'node:assert/strict';
import { BATCH_PERMISSION_USER_LIMIT, buildBatchPermissionPlan } from './department-user-batch';

const certificationManager = { id: 'cert-manager', role: 'leader', department: '第二课堂认证中心' };
const learningManager = { id: 'learn-manager', role: 'leader', department: '学习竞技部' };
const certStudent = { id: 'cert-student', role: 'student', department: '第二课堂认证中心' };
const certClassLeader = { id: 'cert-class-leader', role: 'class_leader', department: '第二课堂认证中心' };

// 认证中心可以给本部门成员批量开启活动审核/赋分权限
const plan = buildBatchPermissionPlan({
  manager: certificationManager,
  managedDepartment: '第二课堂认证中心',
  targets: [certStudent, certClassLeader],
  permissions: { canPublish: true, canScore: true },
});
assert.equal(plan.ok, true);
if (plan.ok) {
  assert.deepEqual(plan.updates, [
    { userId: 'cert-student', changes: [{ key: 'canPublish', value: true }, { key: 'canScore', value: true }] },
    { userId: 'cert-class-leader', changes: [{ key: 'canPublish', value: true }, { key: 'canScore', value: true }] },
  ]);
  assert.deepEqual(plan.skippedUserIds, []);
}

// 关闭权限
const disablePlan = buildBatchPermissionPlan({
  manager: certificationManager,
  managedDepartment: '第二课堂认证中心',
  targets: [certStudent],
  permissions: { canScore: false },
});
assert.equal(disablePlan.ok, true);
if (disablePlan.ok) {
  assert.deepEqual(disablePlan.updates, [{ userId: 'cert-student', changes: [{ key: 'canScore', value: false }] }]);
}

// 重复的用户只处理一次
const dedupePlan = buildBatchPermissionPlan({
  manager: certificationManager,
  managedDepartment: '第二课堂认证中心',
  targets: [certStudent, certStudent],
  permissions: { canPublish: true },
});
assert.equal(dedupePlan.ok, true);
if (dedupePlan.ok) assert.equal(dedupePlan.updates.length, 1);

// 缺少用户或权限、权限取值非法时报错
assert.equal(buildBatchPermissionPlan({ manager: certificationManager, managedDepartment: '第二课堂认证中心', targets: [], permissions: { canPublish: true } }).ok, false);
assert.equal(buildBatchPermissionPlan({ manager: certificationManager, managedDepartment: '第二课堂认证中心', targets: [certStudent], permissions: {} }).ok, false);
assert.equal(buildBatchPermissionPlan({ manager: certificationManager, managedDepartment: '第二课堂认证中心', targets: [certStudent], permissions: { canPublish: 'yes' } }).ok, false);

// 不能批量修改管理员或自己
assert.equal(buildBatchPermissionPlan({
  manager: certificationManager,
  managedDepartment: '第二课堂认证中心',
  targets: [{ id: 'admin-1', role: 'admin', department: '第二课堂认证中心' }],
  permissions: { canPublish: true },
}).ok, false);
assert.equal(buildBatchPermissionPlan({
  manager: certificationManager,
  managedDepartment: '第二课堂认证中心',
  targets: [{ id: 'cert-manager', role: 'leader', department: '第二课堂认证中心' }],
  permissions: { canPublish: true },
}).ok, false);

// 认证中心范围外的权限（如请假类）会被整体过滤掉
assert.equal(buildBatchPermissionPlan({
  manager: certificationManager,
  managedDepartment: '第二课堂认证中心',
  targets: [certStudent],
  permissions: { canQueryLeave: true },
}).ok, false);

// 归属学习竞技部的负责人：这组权限由部门自动授予，批量改动会被跳过
const autoLeader = { id: 'learn-leader-auto', role: 'leader', department: '学习竞技部' };
const allAutoPlan = buildBatchPermissionPlan({
  manager: learningManager,
  managedDepartment: '学习竞技部',
  targets: [autoLeader],
  permissions: { canQueryLeave: false },
});
assert.equal(allAutoPlan.ok, false);

// 归属其他部门的负责人：这些不是自动权限，可以批量设置；不可编辑的键会被过滤
const otherLeader = { id: 'learn-leader-other', role: 'leader', department: '其他部门' };
const otherPlan = buildBatchPermissionPlan({
  manager: learningManager,
  managedDepartment: '学习竞技部',
  targets: [otherLeader],
  permissions: { canQueryLeave: true, canPublish: true },
});
assert.equal(otherPlan.ok, true);
if (otherPlan.ok) {
  assert.deepEqual(otherPlan.updates, [{ userId: 'learn-leader-other', changes: [{ key: 'canQueryLeave', value: true }] }]);
  assert.deepEqual(otherPlan.skippedUserIds, []);
}

// 超过单次上限时拒绝
const tooMany = Array.from({ length: BATCH_PERMISSION_USER_LIMIT + 1 }, (_, index) => ({
  id: 'bulk-' + index,
  role: 'student',
  department: '第二课堂认证中心',
}));
assert.equal(buildBatchPermissionPlan({
  manager: certificationManager,
  managedDepartment: '第二课堂认证中心',
  targets: tooMany,
  permissions: { canPublish: true },
}).ok, false);

console.log('batch department permission plan tests passed');