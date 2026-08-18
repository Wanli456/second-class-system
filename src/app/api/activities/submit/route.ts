import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/auth';
import { canSelectActivityLeader } from '@/lib/activity-leader-rules';
import { getActivityScopes, hasAnyScopePermission, normalizeIds, normalizeScopes, serializeIds, serializeScopes, validateHostingScope } from '@/lib/business-rules';
import { mergeActivityStatusRecords, type ActivityStatusRecord } from '@/lib/activity-status';

class ActivityLeaderValidationError extends Error {}

function scopeFromUser(user: { department?: string | null; class_name?: string | null }) {
  return user.department ? { scopeType: 'department' as const, scopeName: user.department } : { scopeType: 'class' as const, scopeName: user.class_name || null };
}

async function resolveLeaders(ids: string[], fallbackName: string, fallbackPhone: string, scopes: ReturnType<typeof normalizeScopes>, currentUser: { id: string }) {
  const leaderIds = ids.length ? ids : [currentUser.id];
  const placeholders = leaderIds.map((_, index) => `$${index + 1}`).join(',');
  const users = await query<{
    id: string;
    username: string;
    student_id: string;
    department: string | null;
    class_name: string | null;
    role: string;
    can_submit_activity: boolean;
    can_submit_scoring: boolean;
  }>(`SELECT id, username, student_id, department, class_name, role, can_submit_activity, can_submit_scoring FROM users WHERE id IN (${placeholders})`, leaderIds);
  if (users.length !== leaderIds.length || users.some((leader) => !canSelectActivityLeader(leader, scopes))) {
    throw new ActivityLeaderValidationError(scopes[0]?.type === 'department'
      ? '部门活动负责人必须是所属部门的部门负责人或管理员'
      : '班级活动负责人必须来自主办班级或联办班级，并拥有活动提交或赋分材料权限');
  }
  const first = users[0];
  return { ids: users.map((leader) => leader.id), name: users.map((leader) => leader.username).join('、') || fallbackName, phone: first.student_id || fallbackPhone };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get('submission_id');
    const targetSubmissionId = searchParams.get('target_submission_id');
    const activityId = searchParams.get('activity_id');
    const keyword = searchParams.get('keyword');
    const auth = await requirePermission(request, submissionId ? 'submitActivity' : 'viewSubmissionStatus');
    if (auth.response) return auth.response;
    const user = auth.user!;
    if (targetSubmissionId) {
      const candidate = await queryOne('SELECT * FROM activity_submissions WHERE id=$1', [targetSubmissionId]);
      const submission = candidate && (user.role === 'admin' || candidate.activity_submitter_id === user.id || normalizeIds(candidate.leader_ids).includes(user.id)) ? candidate : null;
      return NextResponse.json({ success: true, data: submission ? [{ ...submission, source: 'submission' }] : [] });
    }
    if (activityId) {
      const candidate = await queryOne('SELECT * FROM activities WHERE id=$1', [activityId]);
      const activity = candidate && (user.role === 'admin' || candidate.activity_submitter_id === user.id || candidate.scoring_material_submitter_id === user.id || normalizeIds(candidate.leader_ids).includes(user.id)) ? candidate : null;
      return NextResponse.json({
        success: true,
        data: activity ? [{ ...activity, source: 'activity', review_status: activity.status === '活动取消' ? '活动取消' : '已通过' }] : [],
      });
    }
    if (submissionId) {
      const candidate = await queryOne('SELECT * FROM activity_submissions WHERE id=$1', [submissionId]);
      const submission = candidate && (user.role === 'admin' || candidate.activity_submitter_id === user.id || hasAnyScopePermission(user, 'submitActivity', getActivityScopes(candidate))) ? candidate : null;
      return NextResponse.json({ success: true, data: submission ? [{ ...submission, source: 'submission' }] : [] });
    }
    const isAdmin = user.role === 'admin';
    const submissions = await query<ActivityStatusRecord>('SELECT * FROM activity_submissions ORDER BY created_at DESC');
    const activities = await query<ActivityStatusRecord>('SELECT * FROM activities ORDER BY created_at DESC');
    const visible = (item: Record<string, unknown>) => isAdmin
      || item.activity_submitter_id === user.id
      || item.scoring_material_submitter_id === user.id
      || normalizeIds(item.leader_ids).includes(user.id);
    const matches = (item: Record<string, unknown>) => !keyword || String(item.full_name).includes(keyword);
    const visibleSubmissions = submissions.filter((item) => visible(item) && matches(item));
    const visibleActivities = activities.filter((item) => visible(item) && matches(item));
    return NextResponse.json({ success: true, data: mergeActivityStatusRecords(visibleSubmissions, visibleActivities) });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'submitActivity');
    if (auth.response) return auth.response;
    const user = auth.user!;
    const body = await request.json();
    const { submission_id, full_name, start_time, end_time, category, level, plan_file_url, plan_file_name, record_file_url, record_file_name, leader_name = '', leader_phone = '' } = body;
    const fallbackScope = scopeFromUser(user);
    const scopes = normalizeScopes(body.scope_names, body.scope_type || fallbackScope.scopeType, body.scope_name || fallbackScope.scopeName);
    if (!full_name || !start_time || !end_time || !category || !level) return NextResponse.json({ success: false, error: '缺少活动信息、时间或级别' }, { status: 400 });

    if (submission_id) {
      const existing = await queryOne('SELECT id, review_status, activity_submitter_id, scope_names, scope_type, scope_name FROM activity_submissions WHERE id=$1', [submission_id]);
      if (!existing) return NextResponse.json({ success: false, error: '原活动提交记录不存在' }, { status: 404 });
      if (existing.review_status === '已通过') return NextResponse.json({ success: false, error: '该活动已审核通过，不能重新提交' }, { status: 400 });
      const originalScopes = getActivityScopes(existing);
      if (!hasAnyScopePermission(user, 'submitActivity', originalScopes)) return NextResponse.json({ success: false, error: '你已不再拥有该联办活动的提交权限' }, { status: 403 });
      // 驳回重提沿用原联办范围；联办成员不必恰好属于原主办单位。
      const leader = await resolveLeaders(normalizeIds(body.leader_ids), leader_name, leader_phone, originalScopes, user);
      const firstScope = originalScopes[0];
      const data = await queryOne(`UPDATE activity_submissions SET full_name=$1,start_time=$2,end_time=$3,category=$4,level=$5,plan_file_url=$6,plan_file_name=$7,record_file_url=$8,record_file_name=$9,leader_name=$10,leader_phone=$11,scope_type=$12,scope_name=$13,scope_names=$14,leader_ids=$15,activity_submitter_id=$16,activity_submitter_name=$17,activity_submitter_student_id=$18,review_status='待审核',review_note=NULL,updated_at=NOW() WHERE id=$19 RETURNING *`, [full_name, start_time, end_time, category, level, plan_file_url || null, plan_file_name || null, record_file_url || null, record_file_name || null, leader.name, leader.phone, firstScope.type, firstScope.name, serializeScopes(originalScopes), serializeIds(leader.ids), user.id, user.username, user.student_id, submission_id]);
      return NextResponse.json({ success: true, data });
    }

    const scopeValidation = validateHostingScope(user, scopes);
    if (!scopeValidation.valid) return NextResponse.json({ success: false, error: scopeValidation.error || '缺少活动所属部门或班级' }, { status: 400 });
    if (!hasAnyScopePermission(user, 'submitActivity', scopes)) return NextResponse.json({ success: false, error: '你没有该部门或班级的活动提交权限' }, { status: 403 });
    const leader = await resolveLeaders(normalizeIds(body.leader_ids), leader_name, leader_phone, scopes, user);
    const firstScope = scopes[0];
    const data = await queryOne(`INSERT INTO activity_submissions (full_name,start_time,end_time,category,level,plan_file_url,plan_file_name,record_file_url,record_file_name,leader_name,leader_phone,scope_type,scope_name,scope_names,leader_ids,activity_submitter_id,activity_submitter_name,activity_submitter_student_id,review_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'待审核') RETURNING *`, [full_name, start_time, end_time, category, level, plan_file_url || null, plan_file_name || null, record_file_url || null, record_file_name || null, leader.name, leader.phone, firstScope.type, firstScope.name, serializeScopes(scopes), serializeIds(leader.ids), user.id, user.username, user.student_id]);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof ActivityLeaderValidationError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '提交失败' }, { status: 500 });
  }
}
