import type { AuthUser } from '@/lib/auth';
import { query, type DatabaseClient } from '@/storage/database/supabase-client';

export type AuditLogInput = {
  actor?: Pick<AuthUser, 'id'> | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
};

const SENSITIVE_DETAIL_KEY = /(password|passphrase|secret|token|api[_-]?key|hash|attachment|file.*url|image.*url|\burl\b|ocr|name|student|phone|ip)/i;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE_DETAIL_KEY.test(key))
    .map(([key, item]) => [key, sanitizeValue(item, depth + 1)])
    .filter(([, item]) => item !== undefined));
}

export function sanitizeAuditDetails(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  return sanitizeValue(details) as Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput, client?: DatabaseClient): Promise<void> {
  const executor = client ?? { query };
  await executor.query(
    `INSERT INTO audit_logs (actor_user_id, actor_name, action, resource_type, resource_id, details, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [input.actor?.id || null, null, input.action, input.resourceType, input.resourceId || null, JSON.stringify(sanitizeAuditDetails(input.details)), null],
  );
}

/** 操作日志的 action 中文名。未知 action 原样显示。 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create_activity: '新增活动', update_activity: '修改活动', delete_activity: '删除活动', cancel_activity: '取消活动',
  create_activity_submission: '提交活动', resubmit_activity_submission: '重新提交活动',
  review_activity_submission: '审核活动', score_activity: '活动赋分',
  create_leave_slip: '提交假条', update_leave_slip: '修改假条', delete_leave_slip: '删除假条', review_leave_slip: '查对假条',
  create_original_leave_slip: '提交原假条', delete_original_leave_slip: '删除原假条',
  create_attendance_work: '新增考勤安排', update_attendance_work: '修改考勤安排', review_attendance_work: '审核考勤安排',
  create_evening_study_schedule: '新增晚自习安排', update_evening_study_schedule: '修改晚自习安排', delete_evening_study_schedule: '删除晚自习安排',
  create_evening_study_attendance: '登记晚自习考勤',
  create_class_roster: '新增班级名单', update_class_roster: '修改班级名单', delete_class_roster: '删除班级名单', replace_department_class_roster: '替换部门班级名单',
  create_department: '新增部门', delete_department: '删除部门',
  create_other_college_registration: '其他学院登记',
  update_user: '修改用户', batch_update_user_permissions: '批量设置用户权限',
  update_department_user: '修改部门用户', batch_update_department_user: '批量设置部门用户权限',
  update_own_contact_phone: '修改本人联系方式',
  upload: '上传文件', export_data: '导出数据',
  delete_notification: '删除通知', mark_notification_read: '标记通知已读',
  claim: '领取任务', release: '释放任务',
  delete_file_pending_physical_cleanup: '文件待清理', delete_file_completed: '文件已清理', delete_file_physical_cleanup_failed: '文件清理失败',
  import_class_scoring: '提交班级赋分表', reject_class_scoring: '班级赋分表自动驳回', confirm_class_scoring: '确认班级赋分',
};

/** 资源类型中文名。 */
export const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  user: '用户', activity: '活动', activity_submission: '活动提交',
  leave_slip: '假条', original_leave_slip: '原假条', attendance_work: '考勤安排',
  evening_study_schedule: '晚自习安排', evening_study_attendance: '晚自习考勤',
  class_roster: '班级名单', department: '部门', file: '文件', notification: '通知',
  other_college_registration: '其他学院登记', scoring_import: '班级赋分表',
  audit_log: '操作日志', data_retention: '数据治理', upload_asset: '上传文件',
};

/** 日志 details 里的字段中文名（含权限位）。 */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  userId: '用户ID', fields: '变更字段', role: '角色', department: '部门', className: '班级',
  contactPhone: '联系方式', email: '通知邮箱', password: '密码',
  roleChanged: '角色变更', contactChanged: '联系方式变更',
  reviewStatus: '审核结果', activityId: '活动ID', nextStatus: '新状态', previousStatus: '原状态',
  updateKind: '更新类型', changedPermissionKeys: '变更权限', reason: '原因',
  fileName: '文件名', size: '文件大小', purpose: '用途', fileId: '文件ID',
  canPublish: '活动审核权限', canScore: '活动赋分权限', canSubmitActivity: '活动提交权限',
  canViewSubmissionStatus: '提交状态权限', canSubmitScoring: '赋分材料权限', canRegisterOtherCollege: '其他学院登记权限',
  canReviewLeave: '假条查对权限', canViewEveningStudy: '晚自习查询权限', canStartGroupLeave: '临时请假权限',
  canManageAttendanceWork: '考勤工作安排权限', canUploadLeave: '假条上传权限', canQueryLeave: '假条查看权限',
  canManageOriginalLeave: '假条对比权限', canSubmitOriginalLeave: '提交原假条权限', canImportScoring: '班级赋分表提交权限',
  rowCount: '数据行数', validRows: '通过行数', issueCount: '错误数', confirmedRows: '确认行数',
};

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action;
}

export function formatAuditResource(type: string, id?: string | null): string {
  return `${AUDIT_RESOURCE_LABELS[type] || type}${id ? `  ${id}` : ''}`;
}

/** 把 details 渲染成字段中文名：值的可读文本。 */
export function formatAuditDetails(details: unknown): string {
  if (details === null || details === undefined) return '';
  if (typeof details === 'string') return details || '';
  if (typeof details !== 'object' || Array.isArray(details)) return String(details);
  const entries = Object.entries(details as Record<string, unknown>);
  if (!entries.length) return '';
  return entries
    .map(([key, value]) => `${AUDIT_FIELD_LABELS[key] || key}：${formatAuditValue(value)}`)
    .join('；');
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '无';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) {
    return value.map((item) => AUDIT_FIELD_LABELS[String(item)] || String(item)).join('、') || '无';
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}