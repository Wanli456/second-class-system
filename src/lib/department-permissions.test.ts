import assert from 'node:assert/strict';
import {
  computeDepartmentAutoPerms,
  getDepartmentAutoPermissionKeys,
  hasPermission,
  hasPermissionOverride,
  isDepartmentAutoPermission,
} from './department-permissions';

const student = {
  role: 'student',
  department: '学习竞技部',
  canUploadLeave: false,
};

const sportsLeader = {
  role: 'leader',
  department: '学习竞技部',
  canUploadLeave: false,
  canPublish: false,
};

const certificationLeader = {
  role: 'leader',
  department: '第二课堂认证中心',
  canSubmitActivity: false,
  canUploadLeave: false,
};

// 线上部门维护中已存在的历史名称也必须命中认证中心自动授权。
const legacyCertificationLeader = {
  role: 'leader',
  department: '第二课认证中心',
  canSubmitActivity: false,
  canUploadLeave: false,
};

assert.equal(hasPermission(null, 'canUploadLeave'), false);
assert.equal(hasPermission({ role: 'admin' }, 'canUploadLeave'), true);

// 学习竞技部负责人自动获得请假类权限。
assert.equal(hasPermission(sportsLeader, 'canUploadLeave'), true);
assert.equal(hasPermission(sportsLeader, 'canStartGroupLeave'), true);
assert.equal(hasPermission(sportsLeader, 'canManageOriginalLeave'), true);
assert.equal(hasPermission(sportsLeader, 'canQueryLeave'), true);
assert.equal(hasPermission(sportsLeader, 'canReviewLeave'), true);
assert.equal(hasPermission(sportsLeader, 'canViewEveningStudy'), true);
assert.equal(hasPermission(sportsLeader, 'canManageAttendanceWork'), true);
assert.equal(hasPermission(sportsLeader, 'canPublish'), false);

// 第二课堂认证中心负责人自动获得活动类权限。
assert.equal(hasPermission(certificationLeader, 'canSubmitActivity'), true);
assert.equal(hasPermission(certificationLeader, 'canSubmitScoring'), true);
assert.equal(hasPermission(certificationLeader, 'canPublish'), true);
assert.equal(hasPermission(certificationLeader, 'canScore'), true);
assert.equal(hasPermission(certificationLeader, 'canUploadLeave'), false);

assert.equal(hasPermission(legacyCertificationLeader, 'canSubmitActivity'), true);
assert.equal(hasPermission(legacyCertificationLeader, 'canViewSubmissionStatus'), true);
assert.equal(hasPermission(legacyCertificationLeader, 'canPublish'), true);
assert.equal(hasPermission(legacyCertificationLeader, 'canScore'), true);
assert.equal(hasPermission(legacyCertificationLeader, 'canSubmitScoring'), true);
assert.equal(hasPermission(legacyCertificationLeader, 'canRegisterOtherCollege'), true);

// 学生只能使用手动勾选字段。
assert.equal(hasPermission(student, 'canUploadLeave'), false);
assert.equal(hasPermission({ ...student, canUploadLeave: true }, 'canUploadLeave'), true);

// 自动权限标识。
assert.equal(isDepartmentAutoPermission(sportsLeader, 'canUploadLeave'), true);
assert.equal(isDepartmentAutoPermission(sportsLeader, 'canPublish'), false);
assert.equal(isDepartmentAutoPermission(student, 'canUploadLeave'), false);
assert.deepEqual(getDepartmentAutoPermissionKeys(sportsLeader).sort(), [
  'canManageAttendanceWork',
  'canManageOriginalLeave',
  'canQueryLeave',
  'canReviewLeave',
  'canStartGroupLeave',
  'canSubmitOriginalLeave',
  'canUploadLeave',
  'canViewEveningStudy',
]);

assert.deepEqual(computeDepartmentAutoPerms('leader', '  学习竞技部  ').canUploadLeave, true);
assert.deepEqual(computeDepartmentAutoPerms('student', '学习竞技部'), {});

// 管理员手动覆盖：显式关闭自动权限，优先级高于部门自动权限。
const overriddenSportsLeader = {
  role: 'leader',
  department: '学习竞技部',
  canUploadLeave: false,
  permissionOverrides: JSON.stringify({ canUploadLeave: false }),
};
assert.equal(hasPermission(overriddenSportsLeader, 'canUploadLeave'), false);
assert.equal(hasPermissionOverride(overriddenSportsLeader, 'canUploadLeave'), true);
assert.equal(isDepartmentAutoPermission(overriddenSportsLeader, 'canUploadLeave'), true);

// 手动覆盖开启原先未自动开放的权限。
const overriddenCertificationLeader = {
  role: 'leader',
  department: '第二课堂认证中心',
  canUploadLeave: false,
  permissionOverrides: JSON.stringify({ canUploadLeave: true }),
};
assert.equal(hasPermission(overriddenCertificationLeader, 'canUploadLeave'), true);
assert.equal(hasPermissionOverride(overriddenCertificationLeader, 'canUploadLeave'), true);

console.log('department permissions tests passed');
