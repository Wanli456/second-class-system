import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { createNotification } from '@/app/api/notifications/route';
import { requirePermission } from '@/lib/auth';
import { getActivityScopes, normalizeIds, scopeMatchesUser } from '@/lib/business-rules';
import { hasRequiredScoringMaterials } from '@/lib/activity-scoring';
import { hydrateActivityLeaderDetails } from '@/lib/hydrate-activity-leaders';

async function notifyRecipients(ids: string[], title: string, content: string, activityId: string) {
  for (const userId of [...new Set(ids)].filter(Boolean)) await createNotification(userId, 'activity_scored', title, content, activityId);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'score');
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const clauses = ["status='正常活动'"];
    const params: unknown[] = [];
    const status = searchParams.get('status');
    const level = searchParams.get('level');
    if (status) { params.push(status); clauses.push(`scoring_status=$${params.length}`); }
    if (level) { params.push(level); clauses.push(`level=$${params.length}`); }
    const allData = await query(`SELECT id,full_name,start_time,end_time,registration_start_time,registration_end_time,level,scoring_status,scoring_table_url,scoring_table_file_name,record_file_url,record_file_name,record_photo_url,record_photo_file_name,leader_name,leader_phone,leader_ids,leader_details,scope_type,scope_name,scope_names,activity_submitter_id,activity_submitter_name,activity_submitter_student_id,scoring_material_submitter_id,scoring_material_submitter_name,scoring_material_submitter_student_id,category,category_primary,category_secondary,status FROM activities WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`, params);
    const data = auth.user!.role === 'admin' ? allData : allData.filter((item) => scopeMatchesUser(auth.user!, getActivityScopes(item)));
    return NextResponse.json({ success: true, data: await hydrateActivityLeaderDetails(data) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '获取赋分数据失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'score');
    if (auth.response) return auth.response;
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    const activity = await queryOne('SELECT * FROM activities WHERE id=$1', [id]);
    if (!activity) return NextResponse.json({ success: false, error: '活动不存在' }, { status: 404 });
    if (activity.status !== '正常活动') return NextResponse.json({ success: false, error: '仅正常活动可以进行赋分' }, { status: 400 });
    if (auth.user!.role !== 'admin') {
      const inScope = scopeMatchesUser(auth.user!, getActivityScopes(activity));
      if (!inScope) return NextResponse.json({ success: false, error: '你没有该活动的赋分权限' }, { status: 403 });
    }
    if (activity.scoring_status === '已赋分') return NextResponse.json({ success: false, error: '该活动已完成赋分，不能重复操作' }, { status: 400 });
    if (!activity.scoring_table_url) return NextResponse.json({ success: false, error: '请等待活动赋分表提交' }, { status: 400 });
    if (!hasRequiredScoringMaterials({
      level: String(activity.level || ''),
      scoring_table_url: activity.scoring_table_url,
      record_photo_url: activity.record_photo_url,
    })) return NextResponse.json({ success: false, error: '校级活动需要上传备案表照片' }, { status: 400 });
    const updated = await queryOne(`UPDATE activities SET scoring_status='已赋分',updated_at=NOW() WHERE id=$1 AND scoring_status='待赋分' RETURNING *`, [id]);
    if (!updated) return NextResponse.json({ success: false, error: '赋分状态已被其他操作更新，请刷新后重试' }, { status: 409 });
    const recipients = normalizeIds(activity.leader_ids);
    if (activity.activity_submitter_id) recipients.push(activity.activity_submitter_id);
    if (activity.scoring_material_submitter_id) recipients.push(activity.scoring_material_submitter_id);
    await notifyRecipients(recipients, '活动赋分完成', `活动「${activity.full_name}」（ID：${id}）已完成赋分`, id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '赋分失败' }, { status: 500 });
  }
}
