import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema, query, withTransaction } from '@/storage/database/supabase-client';
import { publicUser, requirePermission } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import { isDepartmentAutoPermission, parsePermissionOverrides, type PermissionKey } from '@/lib/department-permissions';
import { writeAuditLog } from '@/lib/audit-log';

/** 与 GET /api/auth 返回给管理端的字段保持一致。 */
const PUBLIC_USER_FIELDS = `id, username, student_id, role, can_publish, can_score,
  can_submit_activity, can_view_submission_status, can_submit_scoring, can_register_other_college,
  can_review_leave, can_view_evening_study, can_start_group_leave, can_manage_attendance_work,
  can_upload_leave, can_query_leave, can_manage_original_leave, can_submit_original_leave, can_import_scoring,
  department, class_name, contact_phone, permission_overrides`;

/** 单次批量设置权限的人数上限。 */
const BATCH_PERMISSION_USER_LIMIT = 200;

/** 批量设置时允许修改的权限与数据库列的对应关系。 */
const PERMISSION_COLUMNS: Record<string, string> = {
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

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

/**
 * 管理员批量设置用户功能权限。
 *
 * 语义与单个用户 PATCH /api/auth 保持一致：部门负责人由部门自动权限授予的项，
 * 直接改列不生效，这里会写成 permission_overrides 覆盖值，管理员随时可以改回去。
 */
export async function PUT(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest('请求数据格式错误');
    }
    if (!body || typeof body !== 'object') return badRequest('请求数据格式错误');
    const payload = body as { userIds?: unknown; permissions?: unknown };

    const userIds = Array.isArray(payload.userIds)
      ? [...new Set(payload.userIds
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean))]
      : [];
    if (!userIds.length) return badRequest('请选择要批量设置的用户');
    if (userIds.length > BATCH_PERMISSION_USER_LIMIT) {
      return badRequest(`单次最多批量设置 ${BATCH_PERMISSION_USER_LIMIT} 个用户`);
    }
    if (!payload.permissions || typeof payload.permissions !== 'object' || Array.isArray(payload.permissions)) {
      return badRequest('权限数据格式错误');
    }

    const requested = Object.entries(payload.permissions as Record<string, unknown>);
    if (!requested.length) return badRequest('请选择要批量设置的权限');
    if (requested.some(([key]) => !PERMISSION_COLUMNS[key])) return badRequest('包含不支持批量设置的权限');
    if (requested.some(([, value]) => typeof value !== 'boolean')) return badRequest('权限取值必须是布尔值');

    const placeholders = userIds.map((_, index) => '$' + (index + 1)).join(',');
    const targets = await query<{ id: string; role: string | null; department: string | null; permission_overrides: string | null }>(
      `SELECT id, role, department, permission_overrides FROM users WHERE id IN (${placeholders})`,
      userIds,
    );
    if (targets.length !== userIds.length) return badRequest('所选用户中包含不存在的账号');

    const plans = targets.map((target) => {
      const columns: Array<{ column: string; value: boolean }> = [];
      const overrides = { ...parsePermissionOverrides(target.permission_overrides) };
      const identity = { role: target.role, department: target.department };
      for (const [key, value] of requested) {
        if (isDepartmentAutoPermission(identity, key as PermissionKey)) {
          overrides[key as PermissionKey] = value as boolean;
        } else {
          columns.push({ column: PERMISSION_COLUMNS[key], value: value as boolean });
        }
      }
      return { id: target.id, columns, overrides };
    });

    await withTransaction(async (client) => {
      for (const plan of plans) {
        const setClauses = plan.columns.map((item, index) => `${item.column}=$${index + 1}`);
        const values: unknown[] = plan.columns.map((item) => item.value);
        if (Object.keys(plan.overrides).length) {
          values.push(JSON.stringify(plan.overrides));
          setClauses.push(`permission_overrides=$${values.length}`);
        }
        if (!setClauses.length) continue;
        values.push(plan.id);
        await client.query(`UPDATE users SET ${setClauses.join(',')} WHERE id=$${values.length}`, values);
        await writeAuditLog({
          actor: auth.user,
          action: 'batch_update_user_permissions',
          resourceType: 'user',
          resourceId: plan.id,
          details: { changedPermissionKeys: requested.map(([key]) => key) },
        }, client);
      }
    });

    const updated = await query<AuthUser>(
      `SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id IN (${placeholders})`,
      userIds,
    );
    return NextResponse.json({
      success: true,
      data: { users: updated.map(publicUser), updatedCount: updated.length },
    });
  } catch (error) {
    console.error('Failed to batch update user permissions:', error);
    return NextResponse.json({ success: false, error: '批量设置权限失败' }, { status: 500 });
  }
}

/** Excel 导入按表格覆盖全部手动权限；未勾选项清空。 */
export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const body = await request.json() as { rows?: unknown };
    if (!Array.isArray(body.rows) || !body.rows.length) return badRequest('Excel 中没有有效用户行');
    if (body.rows.length > BATCH_PERMISSION_USER_LIMIT) return badRequest(`单次最多导入 ${BATCH_PERMISSION_USER_LIMIT} 个用户`);
    const rows = body.rows.filter((item): item is { studentId: string; name: string; permissions?: Record<string, unknown> } => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.studentId === 'string' && typeof value.name === 'string' && Boolean(value.studentId.trim()) && Boolean(value.name.trim());
    }).map((item) => ({ studentId: item.studentId.trim(), name: item.name.trim(), permissions: item.permissions || {} }));
    const studentIds = [...new Set(rows.map((row) => row.studentId))];
    if (!studentIds.length) return badRequest('Excel 中没有学号');
    const placeholders = studentIds.map((_, index) => '$' + (index + 1)).join(',');
    const targets = await query<{ id: string; student_id: string; username: string }>(`SELECT id, student_id, username FROM users WHERE student_id IN (${placeholders})`, studentIds);
    if (targets.length !== studentIds.length) return badRequest('Excel 中包含不存在的学号');
    const byStudentId = new Map(targets.map((target) => [target.student_id, target]));
    const mismatched = rows.filter((row) => byStudentId.get(row.studentId)?.username !== row.name);
    if (mismatched.length) return badRequest(`学号与姓名不匹配：${mismatched.map((row) => row.studentId).join('、')}`);
    const permissionColumns = Object.values(PERMISSION_COLUMNS);
    await withTransaction(async (client) => {
      for (const row of rows) {
        const target = byStudentId.get(row.studentId)!;
        const values: unknown[] = permissionColumns.map(() => false);
        const setClauses = permissionColumns.map((column, index) => `${column}=$${index + 1}`);
        for (const [key, column] of Object.entries(PERMISSION_COLUMNS)) {
          if (row.permissions?.[key] === true) values[permissionColumns.indexOf(column)] = true;
        }
        values.push(null, target.id);
        setClauses.push(`permission_overrides=$${values.length - 1}`);
        await client.query(`UPDATE users SET ${setClauses.join(',')} WHERE id=$${values.length}`, values);
        await writeAuditLog({ actor: auth.user, action: 'import_user_permissions', resourceType: 'user', resourceId: target.id, details: { importedPermissionKeys: Object.keys(PERMISSION_COLUMNS) } }, client);
      }
    });
    return NextResponse.json({ success: true, data: { updatedCount: rows.length } });
  } catch (error) {
    console.error('Failed to import user permissions:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '权限导入失败' }, { status: 500 });
  }
}
