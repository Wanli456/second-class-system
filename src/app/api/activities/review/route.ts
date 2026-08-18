import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { createNotification } from '@/app/api/notifications/route';
import { requirePermission } from '@/lib/auth';
import { getActivityScopes, newActivityId, normalizeIds, scopeMatchesUser } from '@/lib/business-rules';

async function notifyUsers(ids: string[], type: string, title: string, content: string, relatedId: string) {
  for (const userId of [...new Set(ids)].filter(Boolean)) await createNotification(userId, type, title, content, relatedId);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'publish');
    if (auth.response) return auth.response;
    const status = new URL(request.url).searchParams.get('status');
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); clauses.push(`review_status=$${params.length}`); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const allData = await query(`SELECT * FROM activity_submissions${where} ORDER BY created_at DESC`, params);
    const data = auth.user!.role === 'admin' ? allData : allData.filter((item) => scopeMatchesUser(auth.user!, getActivityScopes(item)));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '获取活动审核数据失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'publish');
    if (auth.response) return auth.response;
    const { id, review_status, review_note } = await request.json();
    if (!id || !['待审核', '已通过', '已驳回'].includes(review_status)) return NextResponse.json({ success: false, error: '缺少或无效的审核参数' }, { status: 400 });
    const submission = await queryOne('SELECT * FROM activity_submissions WHERE id=$1', [id]);
    if (!submission) return NextResponse.json({ success: false, error: '提交记录不存在' }, { status: 404 });
    if (submission.review_status !== '待审核') return NextResponse.json({ success: false, error: '该提交已处理，不能重复审核' }, { status: 400 });
    if (auth.user!.role !== 'admin') {
      const allowed = scopeMatchesUser(auth.user!, getActivityScopes(submission));
      if (!allowed) return NextResponse.json({ success: false, error: '你没有审核该范围活动的权限' }, { status: 403 });
    }

    let activityId: string | null = null;
    if (review_status === '已通过') {
      activityId = newActivityId();
      await query(`INSERT INTO activities (id,full_name,start_time,end_time,registration_start_time,registration_end_time,category,category_primary,category_secondary,level,plan_file_url,plan_file_name,record_file_url,record_file_name,leader_name,leader_phone,scope_type,scope_name,scope_names,leader_ids,activity_submitter_id,activity_submitter_name,activity_submitter_student_id,status,scoring_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'正常活动','待赋分')`, [
        activityId, submission.full_name, submission.start_time, submission.end_time, submission.registration_start_time || null, submission.registration_end_time || null, submission.category, submission.category_primary || null, submission.category_secondary || null, submission.level,
        submission.plan_file_url, submission.plan_file_name || null, submission.record_file_url, submission.record_file_name || null, submission.leader_name, submission.leader_phone,
        submission.scope_type || 'department', submission.scope_name, submission.scope_names || null, submission.leader_ids || '[]', submission.activity_submitter_id || null, submission.activity_submitter_name || null, submission.activity_submitter_student_id || null,
      ]);
      await query('UPDATE activity_submissions SET activity_id=$1 WHERE id=$2', [activityId, id]);
    }
    const updated = await queryOne(`UPDATE activity_submissions SET review_status=$1,review_note=$2,updated_at=NOW() WHERE id=$3 AND review_status='待审核' RETURNING *`, [review_status, review_note || null, id]);
    if (!updated) return NextResponse.json({ success: false, error: '审核状态已被其他操作更新，请刷新后重试' }, { status: 409 });

    const recipients = normalizeIds(submission.leader_ids);
    if (submission.activity_submitter_id) recipients.push(submission.activity_submitter_id);
    const isApproved = review_status === '已通过';
    await notifyUsers(recipients, isApproved ? 'activity_approved' : 'activity_rejected', isApproved ? '活动审核通过' : '活动审核被驳回', isApproved
      ? `活动「${submission.full_name}」已审核通过，活动ID：${activityId}`
      : `活动「${submission.full_name}」审核未通过。${review_note ? `原因：${review_note}` : ''}`, activityId || submission.id);
    return NextResponse.json({ success: true, data: updated, activityId });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '审核活动失败' }, { status: 500 });
  }
}
