import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { PermissionKey } from '@/lib/department-permissions';
import {
  canManageTargetUser,
  getEditablePermissionKeys,
  getManagedUserScope,
  type DepartmentUserManagementDepartment,
} from '@/lib/department-user-management';
import { query, queryOne } from '@/storage/database/supabase-client';

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
};

const USER_SELECT = [
  'SELECT id, username, student_id, role, department, class_name, contact_phone,',
  'can_publish, can_score, can_submit_activity, can_view_submission_status,',
  'can_submit_scoring, can_register_other_college, can_view_evening_study, can_review_leave,',
  'can_start_group_leave, can_manage_attendance_work, can_upload_leave,',
  'can_query_leave, can_manage_original_leave, can_submit_original_leave',
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
  const payload = body as { userId?: unknown; permissions?: unknown; department?: unknown; role?: unknown };
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
  if (requestedRole !== undefined && (
    scope.department !== '学习竞技部' ||
    (requestedRole !== 'student' && requestedRole !== 'class_leader')
  )) {
    return badRequest('只能将学生设置为班级负责人或恢复为学生');
  }

  const editableKeys = getEditablePermissionKeys(user, target, scope.department);
  // 班级负责人身份决定假条上传权限，避免客户端的旧勾选值覆盖自动授予的权限。
  const entries = Object.entries((payload.permissions || {}) as Record<string, unknown>)
    .filter(([key]) => requestedRole === undefined || key !== 'canUploadLeave');
  if (entries.length === 0 && requestedRole === undefined) return badRequest('至少提交一项权限或角色');
  const invalidKey = entries.find(([key, value]) => !editableKeys.includes(key as PermissionKey) || typeof value !== 'boolean');
  if (invalidKey) return badRequest('包含不可修改的权限');

  const setClauses = entries.map(([key], index) => PERMISSION_COLUMNS[key as PermissionKey] + ' = $' + (index + 1));
  const values: unknown[] = entries.map(([, value]) => value);
  if (requestedRole !== undefined) {
    setClauses.push('role = $' + (values.length + 1));
    values.push(requestedRole);
    // 班级负责人获得假条上传权限；取消负责人身份时同步关闭该角色权限。
    setClauses.push('can_upload_leave = $' + (values.length + 1));
    values.push(requestedRole === 'class_leader');
  }
  values.push(target.id);
  await query('UPDATE users SET ' + setClauses.join(', ') + ' WHERE id = $' + values.length, values);

  const updated = await queryOne(USER_SELECT + ' WHERE id = $1', [target.id]) as DepartmentUserRow | null;
  return NextResponse.json({
    success: true,
    data: updated ? serializeUser(updated, editableKeys) : null,
  });
}
