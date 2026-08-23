import assert from 'node:assert/strict';
import {
  canManageTargetUser,
  getEditablePermissionKeys,
  getManagedUserScope,
  isDepartmentUserManager,
} from './department-user-management';

const learningManager = { id: 'learning-manager', role: 'leader', department: '学习竞技部' };
const certificationManager = { id: 'certification-manager', role: 'leader', department: '第二课堂认证中心' };

assert.deepEqual(getManagedUserScope(learningManager), { department: '学习竞技部' });
assert.equal(isDepartmentUserManager(certificationManager), true);
assert.equal(isDepartmentUserManager({ role: 'leader', department: '其他部门' }), false);

assert.equal(canManageTargetUser(learningManager, { id: 'class-leader', role: 'class_leader', department: '学习竞技部' }), true);
assert.equal(canManageTargetUser(learningManager, { id: 'student', role: 'student', department: '学习竞技部' }), true);
assert.equal(canManageTargetUser(learningManager, { id: 'other-leader', role: 'leader', department: '其他部门' }), false);
assert.equal(canManageTargetUser(learningManager, { id: 'admin', role: 'admin', department: '学习竞技部' }), false);
assert.equal(canManageTargetUser(learningManager, { id: 'learning-manager', role: 'leader', department: '学习竞技部' }), false);

assert.equal(canManageTargetUser(certificationManager, { id: 'member', role: 'student', department: '第二课堂认证中心' }), true);
assert.equal(canManageTargetUser(certificationManager, { id: 'other-leader', role: 'leader', department: '其他部门' }), true);
assert.equal(canManageTargetUser(certificationManager, { id: 'same-leader', role: 'leader', department: '第二课堂认证中心' }), false);
assert.equal(canManageTargetUser(certificationManager, { id: 'admin', role: 'admin', department: '其他部门' }), false);

assert.deepEqual(getEditablePermissionKeys(learningManager, { id: 'student', role: 'student', department: '学习竞技部' }), [
  'canUploadLeave',
  'canStartGroupLeave',
  'canReviewLeave',
  'canQueryLeave',
  'canManageOriginalLeave',
  'canManageAttendanceWork',
  'canViewEveningStudy',
]);
assert.deepEqual(getEditablePermissionKeys(certificationManager, { id: 'other-leader', role: 'leader', department: '其他部门' }), [
  'canPublish',
  'canScore',
  'canSubmitScoring',
  'canViewSubmissionStatus',
  'canSubmitActivity',
]);
assert.deepEqual(getEditablePermissionKeys(learningManager, { id: 'other-leader', role: 'leader', department: '其他部门' }), []);

console.log('department-user-management tests passed');
