import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';
import {
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  publicUser,
  requirePermission,
  requireUser,
  setSessionCookie,
  verifyPassword,
} from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

const PUBLIC_USER_FIELDS = `id, username, student_id, role, can_publish, can_score,
  can_submit_activity, can_view_submission_status, can_submit_scoring,
  can_review_leave, can_view_evening_study, can_start_group_leave,
  can_upload_leave, can_query_leave, can_manage_original_leave, can_manage_leave_template,
  department, class_name, contact_phone`;

type StoredUser = AuthUser & { password: string };

export async function POST(request: NextRequest) {
  try {
    const { studentId, name, password, department, className } = await request.json();
    if (!studentId || !name || !password) return NextResponse.json({ success: false, error: '请填写学号、姓名和密码' }, { status: 400 });
    if (String(password).length < 6) return NextResponse.json({ success: false, error: '密码至少需要 6 位' }, { status: 400 });
    const existing = await queryOne('SELECT id FROM users WHERE student_id=$1', [String(studentId).trim()]);
    if (existing) return NextResponse.json({ success: false, error: '该学号已注册' }, { status: 400 });
    const user = await queryOne<AuthUser>(
      `INSERT INTO users (username,password,student_id,role,can_publish,can_score,can_review_leave,department,class_name)
       VALUES ($1,$2,$3,'student',false,false,false,$4,$5) RETURNING ${PUBLIC_USER_FIELDS}`,
      [String(name).trim(), await hashPassword(String(password)), String(studentId).trim(), department || null, className || null],
    );
    if (!user) return NextResponse.json({ success: false, error: '注册失败' }, { status: 500 });
    const sessionToken = createSessionToken(user.id);
    const response = NextResponse.json({ success: true, data: { ...publicUser(user), sessionToken } });
    setSessionCookie(response, user.id, sessionToken);
    return response;
  } catch (error) {
    console.error('Registration failed:', error);
    return NextResponse.json({ success: false, error: '注册失败，请稍后重试' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { studentId, name, password } = await request.json();
    if (!studentId || !name || !password) return NextResponse.json({ success: false, error: '请填写学号、姓名和密码' }, { status: 400 });
    const user = await queryOne<StoredUser>('SELECT * FROM users WHERE student_id=$1 AND username=$2', [studentId, name]);
    if (!user || !(await verifyPassword(password, user.password))) return NextResponse.json({ success: false, error: '学号、姓名或密码错误' }, { status: 401 });
    if (!user.password.startsWith('scrypt$')) await query('UPDATE users SET password=$1 WHERE id=$2', [await hashPassword(password), user.id]);
    const sessionToken = createSessionToken(user.id);
    const response = NextResponse.json({ success: true, data: { ...publicUser(user), sessionToken } });
    setSessionCookie(response, user.id, sessionToken);
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
      return NextResponse.json({ success: true, data: publicUser(auth.user!) });
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
      const current = await queryOne<Pick<StoredUser, 'password'>>('SELECT password FROM users WHERE id=$1', [body.id]);
      if (!current || !(await verifyPassword(body.oldPassword, current.password))) return NextResponse.json({ success: false, error: '原密码错误' }, { status: 400 });
      await query('UPDATE users SET password=$1 WHERE id=$2', [await hashPassword(body.password), body.id]);
      return NextResponse.json({ success: true });
    }
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const userId = String(body.userId || body.id || '').trim();
    if (!userId) return NextResponse.json({ success: false, error: '缺少用户 ID' }, { status: 400 });
    const target = await queryOne('SELECT id,role FROM users WHERE id=$1', [userId]);
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    const allowedRoles = new Set(['admin', 'leader', 'class_leader', 'student']);
    if (body.role !== undefined && !allowedRoles.has(String(body.role))) {
      return NextResponse.json({ success: false, error: '角色只能是管理员、部门负责人、班级负责人或学生' }, { status: 400 });
    }
    if (body.password) {
      if (String(body.password).length < 6) return NextResponse.json({ success: false, error: '密码至少需要 6 位' }, { status: 400 });
      await query('UPDATE users SET password=$1 WHERE id=$2', [await hashPassword(String(body.password)), userId]);
      return NextResponse.json({ success: true });
    }
    if (target.role === 'admin' && body.role && body.role !== 'admin') {
      const count = await queryOne(`SELECT COUNT(*)::int AS count FROM users WHERE role='admin'`, []);
      if (Number(count?.count || 0) <= 1) return NextResponse.json({ success: false, error: '不能降级最后一个管理员' }, { status: 400 });
    }
    const fields: Record<string, string> = {
      role: 'role', canPublish: 'can_publish', canScore: 'can_score', canSubmitActivity: 'can_submit_activity',
      canViewSubmissionStatus: 'can_view_submission_status', canSubmitScoring: 'can_submit_scoring',
      canReviewLeave: 'can_review_leave', canViewEveningStudy: 'can_view_evening_study', canStartGroupLeave: 'can_start_group_leave',
      canUploadLeave: 'can_upload_leave', canQueryLeave: 'can_query_leave',
      canManageOriginalLeave: 'can_manage_original_leave', canManageLeaveTemplate: 'can_manage_leave_template',
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
    if (!updates.length) return NextResponse.json({ success: false, error: '没有可更新的内容' }, { status: 400 });
    params.push(userId);
    const user = await queryOne<AuthUser>(`UPDATE users SET ${updates.join(',')} WHERE id=$${params.length} RETURNING ${PUBLIC_USER_FIELDS}`, params);
    if (!user) return NextResponse.json({ success: false, error: '用户更新失败' }, { status: 500 });
    return NextResponse.json({ success: true, data: publicUser(user) });
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json({ success: false, error: '更新用户失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  }
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const target = await queryOne('SELECT id,role,username,student_id FROM users WHERE id=$1', [id]);
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    if (target.role === 'admin') {
      const count = await queryOne(`SELECT COUNT(*)::int AS count FROM users WHERE role='admin'`, []);
      if (Number(count?.count || 0) <= 1) return NextResponse.json({ success: false, error: '不能删除最后一个管理员' }, { status: 400 });
    }
    // 保存提交时的身份快照，避免删除账号后历史记录失去原提交人信息。
    await query(
      `UPDATE activities
       SET activity_submitter_name=COALESCE(activity_submitter_name,$1),
           activity_submitter_student_id=COALESCE(activity_submitter_student_id,$2)
       WHERE activity_submitter_id=$3`,
      [target.username, target.student_id, id],
    );
    await query(
      `UPDATE activities
       SET scoring_material_submitter_name=COALESCE(scoring_material_submitter_name,$1),
           scoring_material_submitter_student_id=COALESCE(scoring_material_submitter_student_id,$2)
       WHERE scoring_material_submitter_id=$3`,
      [target.username, target.student_id, id],
    );
    await query(
      `UPDATE activity_submissions
       SET scoring_material_submitter_name=COALESCE(scoring_material_submitter_name,$1),
           scoring_material_submitter_student_id=COALESCE(scoring_material_submitter_student_id,$2)
       WHERE scoring_material_submitter_id=$3`,
      [target.username, target.student_id, id],
    );
    await query(
      `UPDATE activity_submissions
       SET activity_submitter_name=COALESCE(activity_submitter_name,$1),
           activity_submitter_student_id=COALESCE(activity_submitter_student_id,$2)
       WHERE activity_submitter_id=$3`,
      [target.username, target.student_id, id],
    );
    await query(
      `UPDATE leave_requests
       SET applicant_name=COALESCE(applicant_name,$1),
           applicant_student_id=COALESCE(applicant_student_id,$2)
       WHERE applicant_user_id=$3`,
      [target.username, target.student_id, id],
    );
    await query(
      `UPDATE leave_groups
       SET applicant_name=COALESCE(applicant_name,$1),
           applicant_student_id=COALESCE(applicant_student_id,$2)
       WHERE applicant_user_id=$3`,
      [target.username, target.student_id, id],
    );
    await query('DELETE FROM users WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json({ success: false, error: '删除用户失败' }, { status: 500 });
  }
}
