import assert from 'node:assert/strict';
import {
  canAssignManagedRole,
  canManageTargetUser,
  getEditablePermissionKeys,
  getManagedUserScope,
  isDepartmentUserManager,
} from './department-user-management';

const learningManager = { id: 'learning-manager', role: 'leader', department: '学习竞技部' };
const certificationManager = { id: 'certification-manager', role: 'leader', department: '第二课堂认证中心' };
const learningAdmin = { id: 'learning-admin', role: 'admin', department: '学习竞技部' };

assert.deepEqual(getManagedUserScope(learningManager), { department: '学习竞技部' });
assert.equal(isDepartmentUserManager(certificationManager), true);
assert.deepEqual(getManagedUserScope(learningAdmin), { department: '学习竞技部' });
assert.equal(isDepartmentUserManager(learningAdmin), true);
assert.equal(isDepartmentUserManager({ role: 'admin', department: '其他部门' }), false);
assert.equal(isDepartmentUserManager({ role: 'leader', department: '其他部门' }), false);

assert.equal(canManageTargetUser(learningManager, { id: 'class-leader', role: 'class_leader', department: '学习竞技部' }), true);
assert.equal(canManageTargetUser(learningManager, { id: 'student', role: 'student', department: '学习竞技部' }), true);
assert.equal(canManageTargetUser(learningManager, { id: 'other-student', role: 'student', department: '其他部门' }), true);
assert.equal(canManageTargetUser(learningManager, { id: 'other-class-leader', role: 'class_leader', department: null }), true);
assert.equal(canManageTargetUser(learningManager, { id: 'admin', role: 'admin', department: '学习竞技部' }), false);
assert.equal(canManageTargetUser(learningManager, { id: 'learning-manager', role: 'leader', department: '学习竞技部' }), false);
// 部门负责人统一由学习竞技部维护：本部门、未分配部门、被管理员归入其他部门的负责人都可见可管理，
// 便于收回身份与维护联系方式；自己和 admin 不可管理（上方已排除）。
assert.equal(canManageTargetUser(learningManager, { id: 'other-dept-leader', role: 'leader', department: '其他部门' }), true);
assert.equal(canManageTargetUser(learningManager, { id: 'learning-leader-2', role: 'leader', department: '学习竞技部' }), true);
assert.equal(canManageTargetUser(learningManager, { id: 'pending-leader', role: 'leader', department: null }), true);

assert.equal(canManageTargetUser(certificationManager, { id: 'member', role: 'student', department: '第二课堂认证中心' }), true);
assert.equal(canManageTargetUser(certificationManager, { id: 'other-leader', role: 'leader', department: '其他部门' }), true);
assert.equal(canManageTargetUser(certificationManager, { id: 'same-leader', role: 'leader', department: '第二课堂认证中心' }), false);
assert.equal(canManageTargetUser(certificationManager, { id: 'admin', role: 'admin', department: '其他部门' }), false);

assert.deepEqual(getEditablePermissionKeys(learningManager, { id: 'student', role: 'student', department: '学习竞技部' }), [
  'canUploadLeave',
  'canStartGroupLeave',
  'canReviewLeave',
  'canQueryLeave',
  'canSubmitOriginalLeave',
  'canManageOriginalLeave',
  'canManageAttendanceWork',
  'canViewEveningStudy',
]);
assert.deepEqual(getEditablePermissionKeys(certificationManager, { id: 'other-leader', role: 'leader', department: '其他部门' }), [
  'canPublish',
  'canScore',
  'canSubmitScoring',
  'canRegisterOtherCollege',
  'canViewSubmissionStatus',
  'canSubmitActivity',
]);
// 其他部门的负责人同样可被学竞管理并授予这组业务权限（与班级负责人一致）。
assert.deepEqual(getEditablePermissionKeys(learningManager, { id: 'other-leader', role: 'leader', department: '其他部门' }), [
  'canUploadLeave',
  'canStartGroupLeave',
  'canReviewLeave',
  'canQueryLeave',
  'canSubmitOriginalLeave',
  'canManageOriginalLeave',
  'canManageAttendanceWork',
  'canViewEveningStudy',
]);
assert.deepEqual(getEditablePermissionKeys(learningManager, { id: 'learning-leader-2', role: 'leader', department: '学习竞技部' }), [
  'canUploadLeave',
  'canStartGroupLeave',
  'canReviewLeave',
  'canQueryLeave',
  'canSubmitOriginalLeave',
  'canManageOriginalLeave',
  'canManageAttendanceWork',
  'canViewEveningStudy',
]);
// 尚未分配部门的负责人没有自动权限，学竞界面仍可为其手动勾选业务权限。
assert.deepEqual(getEditablePermissionKeys(learningManager, { id: 'pending-leader', role: 'leader', department: null }), [
  'canUploadLeave',
  'canStartGroupLeave',
  'canReviewLeave',
  'canQueryLeave',
  'canSubmitOriginalLeave',
  'canManageOriginalLeave',
  'canManageAttendanceWork',
  'canViewEveningStudy',
]);

// 角色分配策略：只有学习竞技部可以设定角色，且允许把学生晋升为部门负责人。
assert.equal(canAssignManagedRole('学习竞技部', 'leader'), true);
assert.equal(canAssignManagedRole('学习竞技部', 'class_leader'), true);
assert.equal(canAssignManagedRole('学习竞技部', 'student'), true);
assert.equal(canAssignManagedRole('学习竞技部', 'admin'), false);
assert.equal(canAssignManagedRole('学习竞技部', ''), false);
assert.equal(canAssignManagedRole('第二课堂认证中心', 'leader'), false);
assert.equal(canAssignManagedRole('第二课堂认证中心', 'class_leader'), false);

console.log('department-user-management tests passed');
