import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema, lockTransactionKey, query, queryOne, withTransaction } from '@/storage/database/supabase-client';
import {
  clearSessionCookie,
  createSessionToken,
  getActiveSessionToken,
  hashPassword,
  issueSessionToken,
  publicUser,
  requirePermission,
  requireUser,
  revokeAdminSession,
  setSessionCookie,
  verifyPassword,
  validatePassword,
} from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import { parsePermissionOverrides, type PermissionKey } from '@/lib/department-permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAdminAccountRuleError, isLastAdminMutation } from '@/lib/admin-account-rules';
import { writeAuditLog } from '@/lib/audit-log';
import { disposeRegisteredUser } from '@/lib/data-retention';

const PUBLIC_USER_FIELDS = `id, username, student_id, role, can_publish, can_score,
  can_submit_activity, can_view_submission_status, can_submit_scoring, can_register_other_college,
  can_review_leave, can_view_evening_study, can_start_group_leave, can_manage_attendance_work,
  can_upload_leave, can_query_leave, can_manage_original_leave, can_submit_original_leave, can_import_scoring,
  department, class_name, contact_phone, permission_overrides`;

type StoredUser = AuthUser & { password: string };

function clientAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}
function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json({ success: false, error: '请求过于频繁，请稍后再试' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
}

export async function POST(request: NextRequest) {
  try {
    const { studentId, name, password, department, className, role } = await request.json();
    const address = clientAddress(request);
    const limit = checkRateLimit(`auth:register:${address}`, 10, 10 * 60 * 1000);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
    if (!studentId || !name || !password) return NextResponse.json({ success: false, error: '请填写学号、姓名和密码' }, { status: 400 });
    if (role === 'admin') return NextResponse.json({ success: false, error: '管理员账号不能通过公开注册创建，请使用已有账号并由管理员授权' }, { status: 403 });
    if (String(password).length < 6) return NextResponse.json({ success: false, error: '密码至少需要 6 位' }, { status: 400 });
    const existing = await queryOne('SELECT id FROM users WHERE student_id=$1', [String(studentId).trim()]);
    if (existing) return NextResponse.json({ success: false, error: '该学号已注册' }, { status: 400 });
    const user = await queryOne<AuthUser>(
      `INSERT INTO users (username,password,student_id,role,can_publish,can_score,can_review_leave,department,class_name)
       VALUES ($1,$2,$3,'student',false,false,false,$4,$5) RETURNING ${PUBLIC_USER_FIELDS}`,
      [String(name).trim(), await hashPassword(String(password)), String(studentId).trim(), department || null, className || null],
    );
    if (!user) return NextResponse.json({ success: false, error: '注册失败' }, { status: 500 });
    const response = NextResponse.json({ success: true, data: publicUser(user) });
    setSessionCookie(response, user.id, await issueSessionToken(user.id), request);
    return response;
  } catch (error) {
    console.error('Registration failed:', error);
    return NextResponse.json({ success: false, error: '注册失败，请稍后重试' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { studentId, name, password } = await request.json();
    const address = clientAddress(request);
    const normalizedStudentId = String(studentId || '').trim();
    const addressLimit = checkRateLimit(`auth:login:address:${address}`, 60, 10 * 60 * 1000);
    const accountLimit = checkRateLimit(`auth:login:account:${normalizedStudentId || 'unknown'}`, 10, 10 * 60 * 1000);
    if (!addressLimit.allowed) return rateLimitedResponse(addressLimit.retryAfterSeconds);
    if (!accountLimit.allowed) return rateLimitedResponse(accountLimit.retryAfterSeconds);
    if (!studentId || !name || !password) return NextResponse.json({ success: false, error: '请填写学号、姓名和密码' }, { status: 400 });
    const user = await queryOne<StoredUser>('SELECT * FROM users WHERE student_id=$1 AND username=$2', [studentId, name]);
    if (!user || !(await verifyPassword(password, user.password))) return NextResponse.json({ success: false, error: '学号、姓名或密码错误' }, { status: 401 });
    if (!user.password.startsWith('scrypt$')) await query('UPDATE users SET password=$1 WHERE id=$2', [await hashPassword(password), user.id]);
    const response = NextResponse.json({ success: true, data: publicUser(user) });
    setSessionCookie(response, user.id, await issueSessionToken(user.id), request);
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json({ success: false, error: '登录失败，请稍后重试' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const { searchParams } = new URL(request.url);
    if (searchParams.get('me') === 'true') {
      const auth = await requireUser(request);
      if (auth.response) return auth.response;
      const response = NextResponse.json({ success: true, data: publicUser(auth.user!) });
      // A verified legacy bearer session is migrated to an HttpOnly cookie.
      setSessionCookie(response, auth.user!.id, createSessionToken(auth.user!.id, auth.user!.admin_session_id || undefined), request);
      return response;
    }
    if (searchParams.get('directory') === 'true') {
      const auth = await requirePermission(request, 'submitActivity');
      if (auth.response) return auth.response;
      const data = await query('SELECT id,username,student_id,role,can_submit_activity,can_submit_scoring,department,class_name FROM users ORDER BY username');
      return NextResponse.json({ success: true, data });
    }
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const data = await query<AuthUser>(`SELECT ${PUBLIC_USER_FIELDS} FROM users ORDER BY created_at DESC`);
    return NextResponse.json({ success: true, data: data.map(publicUser) });
  } catch (error) {
    console.error('Failed to list users:', error);
    return NextResponse.json({ success: false, error: '获取用户失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.password && body.oldPassword) {
      const auth = await requireUser(request);
      if (auth.response) return auth.response;
      if (auth.user!.id !== body.id) return NextResponse.json({ success: false, error: '只能修改自己的密码' }, { status: 403 });
      const passwordError = validatePassword(body.password);
      if (passwordError) return NextResponse.json({ success: false, error: passwordError }, { status: 400 });
      const current = await queryOne<Pick<StoredUser, 'password'>>('SELECT password FROM users WHERE id=$1', [body.id]);
      if (!current || !(await verifyPassword(body.oldPassword, current.password))) return NextResponse.json({ success: false, error: '原密码错误' }, { status: 400 });
      await withTransaction(async (client) => {
        await client.query('UPDATE users SET password=$1,admin_session_id=NULL WHERE id=$2', [await hashPassword(body.password), body.id]);
        await writeAuditLog({ actor: auth.user!, action: 'update_user', resourceType: 'user', resourceId: body.id, details: { fields: ['password'] } }, client);
      });
      return NextResponse.json({ success: true });
    }
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const userId = String(body.userId || body.id || '').trim();
    if (!userId) return NextResponse.json({ success: false, error: '缺少用户 ID' }, { status: 400 });
    const target = await queryOne<{ id: string; role: string; username: string; student_id: string; permission_overrides: string | null; department: string | null }>('SELECT id,role,username,student_id,permission_overrides,department FROM users WHERE id=$1', [userId]);
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    const allowedRoles = new Set(['admin', 'leader', 'class_leader', 'student']);
    if (body.role !== undefined && !allowedRoles.has(String(body.role))) {
      return NextResponse.json({ success: false, error: '角色只能是管理员、部门负责人、班级负责人或学生' }, { status: 400 });
    }
    if (body.password) {
      const passwordError = validatePassword(body.password);
      if (passwordError) return NextResponse.json({ success: false, error: passwordError }, { status: 400 });
      await withTransaction(async (client) => {
        await client.query('UPDATE users SET password=$1,admin_session_id=NULL WHERE id=$2', [await hashPassword(String(body.password)), userId]);
        await writeAuditLog({ actor: auth.user!, action: 'update_user', resourceType: 'user', resourceId: userId, details: { fields: ['password'] } }, client);
      });
      return NextResponse.json({ success: true });
    }
    const fields: Record<string, string> = {
      role: 'role', canPublish: 'can_publish', canScore: 'can_score', canSubmitActivity: 'can_submit_activity',
      canViewSubmissionStatus: 'can_view_submission_status', canSubmitScoring: 'can_submit_scoring', canRegisterOtherCollege: 'can_register_other_college',
      canReviewLeave: 'can_review_leave', canViewEveningStudy: 'can_view_evening_study', canStartGroupLeave: 'can_start_group_leave', canManageAttendanceWork: 'can_manage_attendance_work',
      canUploadLeave: 'can_upload_leave', canQueryLeave: 'can_query_leave',
      canManageOriginalLeave: 'can_manage_original_leave', canSubmitOriginalLeave: 'can_submit_original_leave', canImportScoring: 'can_import_scoring',
      department: 'department', className: 'class_name', contactPhone: 'contact_phone',
    };
    const updates: string[] = [];
    if (body.contactPhone !== undefined) {
      const current = await queryOne<{ role: string; can_submit_activity: boolean; can_submit_scoring: boolean }>('SELECT role,can_submit_activity,can_submit_scoring FROM users WHERE id=$1', [userId]);
      const effectiveRole = body.role === undefined ? current?.role : String(body.role);
      const canSubmitActivity = body.canSubmitActivity === undefined ? current?.can_submit_activity : body.canSubmitActivity === true;
      const canSubmitScoring = body.canSubmitScoring === undefined ? current?.can_submit_scoring : body.canSubmitScoring === true;
      if (!(effectiveRole === 'admin' || effectiveRole === 'leader' || canSubmitActivity || canSubmitScoring)) {
        return NextResponse.json({ success: false, error: '只有管理员、部门负责人或拥有活动业务权限的学生可以填写联系方式' }, { status: 400 });
      }
    }
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(fields)) {
      if (body[key] !== undefined) { params.push(body[key]); updates.push(`${column}=$${params.length}`); }
    }

    // 管理端对部门负责人的手动覆盖：显式写入 permission_overrides JSON，
    // 优先级高于“部门自动权限”，允许管理员关闭某个自动权限或额外开启。
    if (body.permissionOverrides && typeof body.permissionOverrides === 'object' && !Array.isArray(body.permissionOverrides)) {
      const currentOverrides = parsePermissionOverrides(target?.permission_overrides);
      const merged: Partial<Record<PermissionKey, boolean>> = { ...currentOverrides };
      for (const [key, value] of Object.entries(body.permissionOverrides as Record<string, unknown>)) {
        if (typeof value === 'boolean') merged[key as PermissionKey] = value;
      }
      params.push(JSON.stringify(merged));
      updates.push(`permission_overrides=$${params.length}`);
    }

    if (!updates.length) return NextResponse.json({ success: false, error: '没有可更新的内容' }, { status: 400 });
    const requestedDepartment = body.department === undefined
      ? undefined
      : body.department === null
        ? null
        : String(body.department).trim();
    const user = await withTransaction(async (client) => {
      await lockTransactionKey(client, 'admin-role');
      const lockedTarget = (await client.query<{ id: string; role: string; username: string; student_id: string; department: string | null }>(
        'SELECT id,role,username,student_id,department FROM users WHERE id=$1 FOR UPDATE',
        [userId],
      )).rows[0];
      if (!lockedTarget) throw new Error('USER_NOT_FOUND');
      if (lockedTarget.role === 'admin' && body.role && body.role !== 'admin') {
        const count = await client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM users WHERE role='admin'`);
        if (isLastAdminMutation({ currentRole: lockedTarget.role, nextRole: String(body.role), adminCount: Number(count.rows[0]?.count || 0) })) throw new Error('LAST_ADMIN_DEMOTION');
      }
      if (body.role === 'admin' && lockedTarget.role !== 'admin') {
        const duplicate = await client.query<{ id: string; username: string; student_id: string }>(
          `SELECT id,username,student_id FROM users WHERE role='admin' AND id<>$1 AND student_id=$2 LIMIT 1`,
          [userId, lockedTarget.student_id],
        );
        const match = duplicate.rows[0];
        const error = getAdminAccountRuleError({
          role: 'admin',
          username: lockedTarget.username,
          studentId: lockedTarget.student_id,
          existingAdmin: match ? { id: match.id, username: match.username, studentId: match.student_id } : null,
        });
        if (error) throw new Error(`DUPLICATE_ADMIN:${error}`);
      }
      const paramsForUpdate = [...params];
      const roleChanged = body.role !== undefined && String(body.role) !== lockedTarget.role;
      if (roleChanged) {
        // 角色自带的基础权限：部门负责人 -> 提交原假条，班级负责人 -> 假条上传。
        // 与部门用户管理接口保持一致，避免改为部门负责人后原假条提交仍是未勾选。
        // 同一请求里显式勾选的权限优先，不被角色默认值覆盖。
        if (body.canSubmitOriginalLeave === undefined) {
          paramsForUpdate.push(String(body.role) === 'leader');
          updates.push('can_submit_original_leave=$' + paramsForUpdate.length);
        }
        if (body.canUploadLeave === undefined) {
          paramsForUpdate.push(String(body.role) === 'class_leader');
          updates.push('can_upload_leave=$' + paramsForUpdate.length);
        }
      }
      if (roleChanged && (lockedTarget.role === 'admin' || body.role === 'admin')) {
        updates.push('admin_session_id=NULL');
      }
      const departmentLocks = [...new Set([lockedTarget.department, requestedDepartment].filter((value): value is string => Boolean(value)))].sort();
      for (const department of departmentLocks) {
        await lockTransactionKey(client, department);
      }
      paramsForUpdate.push(userId);
      const updated = (await client.query<AuthUser>(`UPDATE users SET ${updates.join(',')} WHERE id=$${paramsForUpdate.length} RETURNING ${PUBLIC_USER_FIELDS}`, paramsForUpdate)).rows[0] || null;
      if (updated) {
        await writeAuditLog({ actor: auth.user, action: 'update_user', resourceType: 'user', resourceId: userId, details: { fields: Object.keys(body).filter((key) => key !== 'password') } }, client);
      }
      return updated;
    });
    if (!user) return NextResponse.json({ success: false, error: '用户更新失败' }, { status: 500 });
    return NextResponse.json({ success: true, data: publicUser(user) });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    if (error instanceof Error && error.message === 'LAST_ADMIN_DEMOTION') return NextResponse.json({ success: false, error: '不能降级最后一个管理员' }, { status: 400 });
    if (error instanceof Error && error.message.startsWith('DUPLICATE_ADMIN:')) return NextResponse.json({ success: false, error: error.message.slice('DUPLICATE_ADMIN:'.length) }, { status: 409 });
    console.error('Failed to update user:', error);
    return NextResponse.json({ success: false, error: '更新用户失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    try {
      const auth = await requireUser(request);
      if (auth.response) return auth.response;
      const session = await getActiveSessionToken(request);
      if (auth.user!.role === 'admin' && session?.sessionId) await revokeAdminSession(auth.user!.id, session.sessionId);
      const response = NextResponse.json({ success: true });
      clearSessionCookie(response, request);
      return response;
    } catch (error) {
      console.error('Failed to revoke session:', error);
      return NextResponse.json({ success: false, error: '注销失败' }, { status: 500 });
    }
  }
  const reason = searchParams.get('reason') === 'graduation' ? 'graduation' : 'manual_delete';
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const result = await disposeRegisteredUser(auth.user!, id, reason);
    if (result.error === 'LAST_ADMIN') return NextResponse.json({ success: false, error: '不能删除最后一个管理员' }, { status: 400 });
    if (result.error === 'DATABASE_FAILURE') return NextResponse.json({ success: false, error: '删除用户失败' }, { status: 500 });
    if (result.error === 'REVIEW_REQUIRED') return NextResponse.json({ success: false, error: '账号处置需要先处理未能安全去个人化的数据', data: result }, { status: 409 });
    if (result.alreadyDisposed) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json({ success: false, error: '删除用户失败' }, { status: 500 });
  }
}
