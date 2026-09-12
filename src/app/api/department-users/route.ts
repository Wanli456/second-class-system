import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { PermissionKey } from '@/lib/department-permissions';
import {
  canAssignManagedRole,
  canManageTargetUser,
  getEditablePermissionKeys,
  getManagedUserScope,
  type DepartmentUserManagementDepartment,
} from '@/lib/department-user-management';
import { query, queryOne, withTransaction } from '@/storage/database/supabase-client';
import { writeAuditLog } from '@/lib/audit-log';
import { buildBatchPermissionPlan } from '@/lib/department-user-batch';

const PERMISSION_COLUMNS: Record<PermissionKey, string> = {
  canPublish: 'can_publish',
  canScore: 'can_score',
  canSubmitActivity: 'can_submit_activity',
  canViewSubmissionStatus: 'can_view_submission_status',
  canSubmitScoring: 'can_submit_scoring',
  canRegisterOtherCollege: 'can_register_other_college',
  canReviewLeave: 'can_review_leave',
  canViewEveningStudy: 'can_view_evening_study',
  canStartGroupLeave: 'can_start_group_leave',
  canManageAttendanceWork: 'can_manage_attendance_work',
  canUploadLeave: 'can_upload_leave',
  canQueryLeave: 'can_query_leave',
  canManageOriginalLeave: 'can_manage_original_leave',
  canSubmitOriginalLeave: 'can_submit_original_leave',
  canImportScoring: 'can_import_scoring',
};

const USER_SELECT = [
  'SELECT id, username, student_id, role, department, class_name, contact_phone,',
  'can_publish, can_score, can_submit_activity, can_view_submission_status,',
  'can_submit_scoring, can_register_other_college, can_view_evening_study, can_review_leave,',
  'can_start_group_leave, can_manage_attendance_work, can_upload_leave,',
  'can_query_leave, can_manage_original_leave, can_submit_original_leave, can_import_scoring',
  'FROM users',
].join(' ');

type DepartmentUserRow = {
  id: string;
  username: string;
  student_id: string | null;
  role: string | null;
  department: string | null;
  class_name: string | null;
  contact_phone: string | null;
  [column: string]: unknown;
};

function serializeUser(user: DepartmentUserRow, permissionKeys: PermissionKey[]) {
  return {
    id: user.id,
    name: user.username,
    studentId: user.student_id,
    role: user.role,
    department: user.department,
    className: user.class_name,
    contactPhone: user.contact_phone,
    permissions: Object.fromEntries(
      permissionKeys.map((key) => [key, Boolean(user[PERMISSION_COLUMNS[key]])]),
    ),
  };
}

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function parseManagedDepartment(value: unknown): DepartmentUserManagementDepartment | null {
  return value === '学习竞技部' || value === '第二课堂认证中心' ? value : null;
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response) return response;
  const managedDepartment = parseManagedDepartment(request.nextUrl.searchParams.get('department'));
  const scope = getManagedUserScope(user, managedDepartment || undefined);
  if (!scope) {
    return NextResponse.json({ success: false, error: '只有指定部门负责人可以管理部门用户' }, { status: 403 });
  }

  const rows = await query(USER_SELECT, []) as DepartmentUserRow[];
  const users = rows
    .filter((target) => canManageTargetUser(user, target, scope.department))
    .sort((a, b) => (a.class_name || '').localeCompare(b.class_name || '') || a.username.localeCompare(b.username))
    .map((target) => serializeUser(target, getEditablePermissionKeys(user, target, scope.department)));

  return NextResponse.json({
    success: true,
    data: {
      department: scope.department,
      permissionKeys: getEditablePermissionKeys(user, undefined, scope.department),
      users,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('请求数据格式错误');
  }

  if (!body || typeof body !== 'object') return badRequest('请求数据格式错误');
  const payload = body as { userId?: unknown; permissions?: unknown; department?: unknown; role?: unknown; contactPhone?: unknown };
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  if (!userId) return badRequest('缺少用户 ID');
  const requestedRole = payload.role === undefined
    ? undefined
    : typeof payload.role === 'string'
      ? payload.role.trim()
      : '';
  const managedDepartment = parseManagedDepartment(payload.department);
  const scope = getManagedUserScope(user, managedDepartment || undefined);
  if (!scope) {
    return NextResponse.json({ success: false, error: '只有指定部门负责人可以管理部门用户' }, { status: 403 });
  }
  if (payload.permissions !== undefined && (!payload.permissions || typeof payload.permissions !== 'object' || Array.isArray(payload.permissions))) {
    return badRequest('权限数据格式错误');
  }

  const target = await queryOne(USER_SELECT + ' WHERE id = $1', [userId]) as DepartmentUserRow | null;
  if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
  if (!canManageTargetUser(user, target, scope.department)) {
    return NextResponse.json({ success: false, error: '无权管理该用户' }, { status: 403 });
  }
  if (requestedRole !== undefined && !canAssignManagedRole(scope.department, requestedRole)) {
    return badRequest('只能将学生设置为班级负责人、部门负责人，或恢复为学生');
  }
  // 晋升只改角色，归属部门由管理员在用户管理界面另行设置。
  const contactPhoneRequested = payload.contactPhone !== undefined;
  const effectiveRole = requestedRole ?? target.role;
  if (contactPhoneRequested && effectiveRole !== 'leader') {
    return badRequest('只有部门负责人可以设置联系方式');
  }
  let contactPhone: string | null | undefined;
  if (contactPhoneRequested) {
    if (payload.contactPhone !== null && typeof payload.contactPhone !== 'string') {
      return badRequest('联系方式格式错误');
    }
    contactPhone = (typeof payload.contactPhone === 'string' ? payload.contactPhone.trim() : '') || null;
  }

  const editableKeys = getEditablePermissionKeys(user, target, scope.department);
  // 角色身份决定假条上传/提交原假条权限，避免客户端的旧勾选值覆盖自动授予的权限。
  const entries = Object.entries((payload.permissions || {}) as Record<string, unknown>)
    .filter(([key]) => requestedRole === undefined || (key !== 'canUploadLeave' && key !== 'canSubmitOriginalLeave'));
  if (entries.length === 0 && requestedRole === undefined && !contactPhoneRequested) return badRequest('至少提交一项权限、角色或联系方式');
  const invalidKey = entries.find(([key, value]) => !editableKeys.includes(key as PermissionKey) || typeof value !== 'boolean');
  if (invalidKey) return badRequest('包含不可修改的权限');

  const setClauses = entries.map(([key], index) => PERMISSION_COLUMNS[key as PermissionKey] + ' = $' + (index + 1));
  const values: unknown[] = entries.map(([, value]) => value);
  if (requestedRole !== undefined) {
    setClauses.push('role = $' + (values.length + 1));
    values.push(requestedRole);
    // 班级负责人获得假条上传权限；部门负责人获得提交原假条权限；取消身份时同步收回。
    setClauses.push('can_upload_leave = $' + (values.length + 1));
    values.push(requestedRole === 'class_leader');
    setClauses.push('can_submit_original_leave = $' + (values.length + 1));
    values.push(requestedRole === 'leader');
  }
  if (contactPhone !== undefined) {
    setClauses.push('contact_phone = $' + (values.length + 1));
    values.push(contactPhone);
  }
  values.push(target.id);
  const updated = await withTransaction(async (client) => {
    await client.query('UPDATE users SET ' + setClauses.join(', ') + ' WHERE id = $' + values.length, values);
    await writeAuditLog({ actor: user, action: 'update_department_user', resourceType: 'user', resourceId: target.id, details: { changedPermissionKeys: entries.map(([key]) => key), roleChanged: requestedRole !== undefined, contactChanged: contactPhoneRequested } }, client);
    const result = await client.query<DepartmentUserRow>(USER_SELECT + ' WHERE id = $1', [target.id]);
    return result.rows[0] || null;
  });
  return NextResponse.json({
    success: true,
    data: updated ? serializeUser(updated, editableKeys) : null,
  });
}

/**
 * 批量设置部门业务权限。
 *
 * 认证中心/学竞的用户管理界面一次可以勾选多个成员，统一开启或关闭某一项权限；
 * 部门自动授予的权限会被跳过，不会写入数据库。
 */
export async function PUT(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('请求数据格式错误');
  }
  if (!body || typeof body !== 'object') return badRequest('请求数据格式错误');
  const payload = body as { userIds?: unknown; permissions?: unknown; department?: unknown };

  const userIds = Array.isArray(payload.userIds)
    ? [...new Set(payload.userIds
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean))]
    : [];
  if (!userIds.length) return badRequest('请选择要批量设置的用户');

  const managedDepartment = parseManagedDepartment(payload.department);
  const scope = getManagedUserScope(user, managedDepartment || undefined);
  if (!scope) {
    return NextResponse.json({ success: false, error: '只有指定部门负责人可以管理部门用户' }, { status: 403 });
  }
  if (!payload.permissions || typeof payload.permissions !== 'object' || Array.isArray(payload.permissions)) {
    return badRequest('权限数据格式错误');
  }

  const placeholders = userIds.map((_, index) => '$' + (index + 1)).join(',');
  const rows = await query(USER_SELECT + ' WHERE id IN (' + placeholders + ')', userIds) as DepartmentUserRow[];
  const plan = buildBatchPermissionPlan({
    manager: user,
    managedDepartment: scope.department,
    targets: rows.map((row) => ({ id: row.id, role: row.role, department: row.department })),
    permissions: payload.permissions as Record<string, unknown>,
  });
  if (!plan.ok) return badRequest(plan.error);

  const updatedIds = plan.updates.map((entry) => entry.userId);
  await withTransaction(async (client) => {
    for (const entry of plan.updates) {
      const values: unknown[] = entry.changes.map((change) => change.value);
      const setClauses = entry.changes.map((change, index) => PERMISSION_COLUMNS[change.key] + ' = $' + (index + 1));
      values.push(entry.userId);
      await client.query('UPDATE users SET ' + setClauses.join(', ') + ' WHERE id = $' + values.length, values);
      await writeAuditLog({
        actor: user,
        action: 'batch_update_department_user',
        resourceType: 'user',
        resourceId: entry.userId,
        details: { changedPermissionKeys: entry.changes.map((change) => change.key) },
      }, client);
    }
  });

  const updatedPlaceholders = updatedIds.map((_, index) => '$' + (index + 1)).join(',');
  const updatedRows = await query(USER_SELECT + ' WHERE id IN (' + updatedPlaceholders + ')', updatedIds) as DepartmentUserRow[];
  const permissionKeys = getEditablePermissionKeys(user, undefined, scope.department);
  const byId = new Map(updatedRows.map((row) => [row.id, row]));
  const users = updatedIds
    .map((id) => byId.get(id))
    .filter((row): row is DepartmentUserRow => Boolean(row))
    .map((row) => serializeUser(row, permissionKeys));

  return NextResponse.json({
    success: true,
    data: { users, updatedCount: users.length, skippedUserIds: plan.skippedUserIds },
  });
}
