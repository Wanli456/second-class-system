import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, withActivityWallTime, withActivityWallTimes, withTransaction } from '@/storage/database/supabase-client';
import { createNotification, resolveNotifications } from '@/lib/notifications';
import { requirePermission } from '@/lib/auth';
import { normalizeIds } from '@/lib/business-rules';
import { hasRequiredScoringMaterials } from '@/lib/activity-scoring';
import { hydrateActivityLeaderDetails } from '@/lib/hydrate-activity-leaders';
import { writeAuditLog } from '@/lib/audit-log';

/** 任务领取的有效期：超时视为放弃，其他人可以接手。 */
const CLAIM_TTL_MS = 15 * 60 * 1000;

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
    if (status && status !== 'all') { params.push(status); clauses.push(`scoring_status=$${params.length}`); }
    else if (!status) { params.push('待赋分'); clauses.push(`scoring_status=$${params.length}`); }
    if (level) { params.push(level); clauses.push(`level=$${params.length}`); }
    const allData = await query(`SELECT id,full_name,start_time,end_time,registration_start_time,registration_end_time,level,scoring_status,scoring_table_url,scoring_table_file_name,record_file_url,record_file_name,record_photo_url,record_photo_file_name,leader_name,leader_phone,leader_ids,leader_details,scope_type,scope_name,scope_names,activity_submitter_id,activity_submitter_name,activity_submitter_student_id,scoring_material_submitter_id,scoring_material_submitter_name,scoring_material_submitter_student_id,category,category_primary,category_secondary,status,reviewed_by_name,scored_by_name,scored_at,scoring_claimed_by_id,scoring_claimed_by_name,scoring_claimed_at FROM activities WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`, params);
    const data = withActivityWallTimes(allData);
    return NextResponse.json({ success: true, data: await hydrateActivityLeaderDetails(data) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '获取赋分数据失败' }, { status: 500 });
  }
}

/**
 * 领取 / 释放赋分任务，避免两个赋分人同时处理同一个活动。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'score');
    if (auth.response) return auth.response;
    const { id, action } = await request.json() as { id?: string; action?: string };
    if (!id) return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    if (action !== 'claim' && action !== 'release') {
      return NextResponse.json({ success: false, error: '操作只能是 claim 或 release' }, { status: 400 });
    }

    const activity = await queryOne<{
      id: string;
      status: string;
      scoring_status: string;
      scoring_claimed_by_id: string | null;
      scoring_claimed_by_name: string | null;
      scoring_claimed_at: string | null;
    }>('SELECT id,status,scoring_status,scoring_claimed_by_id,scoring_claimed_by_name,scoring_claimed_at FROM activities WHERE id=$1', [id]);
    if (!activity) return NextResponse.json({ success: false, error: '活动不存在' }, { status: 404 });

    if (action === 'release') {
      await query(
        'UPDATE activities SET scoring_claimed_by_id=NULL,scoring_claimed_by_name=NULL,scoring_claimed_at=NULL WHERE id=$1 AND scoring_claimed_by_id=$2',
        [id, auth.user!.id],
      );
      return NextResponse.json({ success: true, data: { claimed: false } });
    }

    if (activity.scoring_status === '已赋分') {
      return NextResponse.json({ success: false, error: '该活动已完成赋分' }, { status: 409 });
    }
    if (auth.user!.role !== 'admin') {

    }

    const claimedAt = activity.scoring_claimed_at ? new Date(activity.scoring_claimed_at).getTime() : 0;
    const heldByOther = Boolean(activity.scoring_claimed_by_id)
      && activity.scoring_claimed_by_id !== auth.user!.id
      && Date.now() - claimedAt < CLAIM_TTL_MS;
    if (heldByOther) {
      return NextResponse.json({
        success: false,
        error: `该任务正在由 ${activity.scoring_claimed_by_name || '其他赋分人'} 处理，请稍后再试`,
        data: { claimedBy: activity.scoring_claimed_by_name || '其他赋分人' },
      }, { status: 409 });
    }

    const claimed = await queryOne<{ id: string }>(
      `UPDATE activities SET scoring_claimed_by_id=$1,scoring_claimed_by_name=$2,scoring_claimed_at=NOW()
       WHERE id=$3 AND scoring_status='待赋分' RETURNING id`,
      [auth.user!.id, auth.user!.username, id],
    );
    if (!claimed) return NextResponse.json({ success: false, error: '该活动已被其他人处理，请刷新' }, { status: 409 });
    return NextResponse.json({ success: true, data: { claimed: true } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '领取赋分任务失败' }, { status: 500 });
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

    if (activity.scoring_status === '已赋分') return NextResponse.json({ success: false, error: '该活动已完成赋分，不能重复操作' }, { status: 400 });
    if (!activity.scoring_table_url) return NextResponse.json({ success: false, error: '请等待活动赋分表提交' }, { status: 400 });
    if (!hasRequiredScoringMaterials({
      level: String(activity.level || ''),
      scoring_table_url: activity.scoring_table_url,
      record_photo_url: activity.record_photo_url,
    })) return NextResponse.json({ success: false, error: '校级活动需要上传备案表照片' }, { status: 400 });

    // 有人正在处理这个活动时，其他人不能抢先提交赋分。
    const claimedAt = activity.scoring_claimed_at ? new Date(activity.scoring_claimed_at).getTime() : 0;
    const heldByOther = Boolean(activity.scoring_claimed_by_id)
      && activity.scoring_claimed_by_id !== auth.user!.id
      && Date.now() - claimedAt < CLAIM_TTL_MS;
    if (heldByOther) {
      return NextResponse.json({
        success: false,
        error: `该任务正在由 ${activity.scoring_claimed_by_name || '其他赋分人'} 处理，请稍后再试`,
      }, { status: 409 });
    }

    const updated = await withTransaction(async (client) => {
      const result = await client.query(`UPDATE activities
        SET scoring_status='已赋分',scored_by_id=$2,scored_by_name=$3,scored_at=NOW(),
            scoring_claimed_by_id=NULL,scoring_claimed_by_name=NULL,scoring_claimed_at=NULL,updated_at=NOW()
        WHERE id=$1 AND scoring_status='待赋分' RETURNING *`, [id, auth.user!.id, auth.user!.username]);
      const row = result.rows[0] || null;
      if (row) await writeAuditLog({ actor: auth.user, action: 'score_activity', resourceType: 'activity', resourceId: id, details: { previousStatus: activity.scoring_status, nextStatus: '已赋分' } }, client);
      return row;
    });
    if (!updated) return NextResponse.json({ success: false, error: '赋分状态已被其他操作更新，请刷新后重试' }, { status: 409 });
    const recipients = normalizeIds(activity.leader_ids);
    if (activity.activity_submitter_id) recipients.push(activity.activity_submitter_id);
    if (activity.scoring_material_submitter_id) recipients.push(activity.scoring_material_submitter_id);
    await notifyRecipients(recipients, '活动赋分完成', `活动「${activity.full_name}」（ID：${id}）已完成赋分`, id);
    await resolveNotifications({
      relatedIds: [id],
      types: ['activity_pending_scoring'],
      title: '活动赋分完成',
      content: `活动「${activity.full_name}」已由 ${auth.user!.username} 完成赋分。`,
    });
    return NextResponse.json({ success: true, data: withActivityWallTime(updated) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '赋分失败' }, { status: 500 });
  }
}
