import assert from 'node:assert/strict';
import { formatAuditAction, formatAuditDetails, formatAuditResource } from './audit-log';

// 动作名中文化
assert.equal(formatAuditAction('update_user'), '修改用户');
assert.equal(formatAuditAction('review_activity_submission'), '审核活动');
assert.equal(formatAuditAction('score_activity'), '活动赋分');
assert.equal(formatAuditAction('unknown_action'), 'unknown_action');
// 配合新增功能预留的动作
assert.equal(formatAuditAction('import_class_scoring'), '提交班级赋分表');
assert.equal(formatAuditAction('confirm_class_scoring'), '确认班级赋分');

// 资源类型中文化
assert.equal(formatAuditResource('user', 'u-1'), '用户  u-1');
assert.equal(formatAuditResource('activity_submission', null), '活动提交');
assert.equal(formatAuditResource('weird_type', 'x'), 'weird_type  x');

// details 中文化
assert.equal(formatAuditDetails({ fields: ['userId', 'canSubmitOriginalLeave'] }), '变更字段：用户ID、提交原假条权限');
assert.equal(formatAuditDetails({ roleChanged: false, contactChanged: true }), '角色变更：否；联系方式变更：是');
assert.equal(formatAuditDetails({ reviewStatus: '已通过', activityId: 'EK202609003' }), '审核结果：已通过；活动ID：EK202609003');
assert.equal(formatAuditDetails({ changedPermissionKeys: ['canImportScoring'] }), '变更权限：班级赋分表提交权限');
assert.equal(formatAuditDetails({}), '');
assert.equal(formatAuditDetails(null), '');
assert.equal(formatAuditDetails({ reason: '' }), '原因：无');

console.log('audit log formatting tests passed');