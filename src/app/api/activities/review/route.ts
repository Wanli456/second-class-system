import { NextRequest, NextResponse } from 'next/server';
import { ActivityImageError } from '@/lib/activity-image';
import { query, queryOne, withTransaction } from '@/storage/database/supabase-client';
import { createNotification } from '@/lib/notifications';
import { requirePermission } from '@/lib/auth';
import { getActivityScopes, nextActivityId, normalizeIds, scopeMatchesUser } from '@/lib/business-rules';
import { hydrateActivityLeaderDetails } from '@/lib/hydrate-activity-leaders';
import { writeAuditLog } from '@/lib/audit-log';

/** 任务领取的有效期：超时视为放弃，其他人可以接手。 */
const CLAIM_TTL_MS = 15 * 60 * 1000;

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
    return NextResponse.json({ success: true, data: await hydrateActivityLeaderDetails(data) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '获取活动审核数据失败' }, { status: 500 });
  }
}

/**
 * 领取 / 释放审核任务。
 *
 * 两个都有审核权限的人不能同时打开同一条待审核提交：
 * 打开时调用 claim，被占用则返回 409 并说明是谁在处理；
 * 关闭或提交后调用 release 释放（超过 CLAIM_TTL_MS 未处理会自动失效，可被他人接手）。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'publish');
    if (auth.response) return auth.response;
    const { id, action } = await request.json() as { id?: string; action?: string };
    if (!id) return NextResponse.json({ success: false, error: '缺少提交记录 ID' }, { status: 400 });
    if (action !== 'claim' && action !== 'release') {
      return NextResponse.json({ success: false, error: '操作只能是 claim 或 release' }, { status: 400 });
    }

    const submission = await queryOne<{
      id: string;
      review_status: string;
      review_claimed_by_id: string | null;
      review_claimed_by_name: string | null;
      review_claimed_at: string | null;
    }>('SELECT id,review_status,review_claimed_by_id,review_claimed_by_name,review_claimed_at FROM activity_submissions WHERE id=$1', [id]);
    if (!submission) return NextResponse.json({ success: false, error: '提交记录不存在' }, { status: 404 });

    if (action === 'release') {
      await query(
        'UPDATE activity_submissions SET review_claimed_by_id=NULL,review_claimed_by_name=NULL,review_claimed_at=NULL WHERE id=$1 AND review_claimed_by_id=$2',
        [id, auth.user!.id],
      );
      return NextResponse.json({ success: true, data: { claimed: false } });
    }

    if (submission.review_status !== '待审核') {
      return NextResponse.json({ success: false, error: '该提交已处理，不能重复审核' }, { status: 409 });
    }
    const scoped = await queryOne<{ id: string; scope_type: string | null; scope_name: string | null; scope_names: string | null }>(
      'SELECT id,scope_type,scope_name,scope_names FROM activity_submissions WHERE id=$1',
      [id],
    );
    if (!scoped) return NextResponse.json({ success: false, error: '提交记录不存在' }, { status: 404 });
    if (auth.user!.role !== 'admin' && !scopeMatchesUser(auth.user!, getActivityScopes(scoped))) {
      return NextResponse.json({ success: false, error: '你没有审核该范围活动的权限' }, { status: 403 });
    }

    const claimedAt = submission.review_claimed_at ? new Date(submission.review_claimed_at).getTime() : 0;
    const heldByOther = Boolean(submission.review_claimed_by_id)
      && submission.review_claimed_by_id !== auth.user!.id
      && Date.now() - claimedAt < CLAIM_TTL_MS;
    if (heldByOther) {
      return NextResponse.json({
        success: false,
        error: `该任务正在由 ${submission.review_claimed_by_name || '其他审核人'} 处理，请稍后再试`,
        data: { claimedBy: submission.review_claimed_by_name || '其他审核人' },
      }, { status: 409 });
    }

    const claimed = await queryOne<{ id: string }>(
      `UPDATE activity_submissions SET review_claimed_by_id=$1,review_claimed_by_name=$2,review_claimed_at=NOW()
       WHERE id=$3 AND review_status='待审核' RETURNING id`,
      [auth.user!.id, auth.user!.username, id],
    );
    if (!claimed) return NextResponse.json({ success: false, error: '该提交已被其他人处理，请刷新' }, { status: 409 });
    return NextResponse.json({ success: true, data: { claimed: true } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '领取审核任务失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'publish');
    if (auth.response) return auth.response;
    const { id, review_status, review_note } = await request.json();
    if (!id || !['已通过', '已驳回'].includes(review_status)) return NextResponse.json({ success: false, error: '审核结果只能是已通过或已驳回' }, { status: 400 });
    const submission = await queryOne('SELECT * FROM activity_submissions WHERE id=$1', [id]);
    if (!submission) return NextResponse.json({ success: false, error: '提交记录不存在' }, { status: 404 });
    if (submission.review_status !== '待审核') return NextResponse.json({ success: false, error: '该提交已处理，不能重复审核' }, { status: 400 });
    if (auth.user!.role !== 'admin') {
      const allowed = scopeMatchesUser(auth.user!, getActivityScopes(submission));
      if (!allowed) return NextResponse.json({ success: false, error: '你没有审核该范围活动的权限' }, { status: 403 });
    }
    // 有人正在处理这条提交时，其他人不能抢先提交结果。
    const claimedAt = submission.review_claimed_at ? new Date(submission.review_claimed_at).getTime() : 0;
    const heldByOther = Boolean(submission.review_claimed_by_id)
      && submission.review_claimed_by_id !== auth.user!.id
      && Date.now() - claimedAt < CLAIM_TTL_MS;
    if (heldByOther) {
      return NextResponse.json({
        success: false,
        error: `该任务正在由 ${submission.review_claimed_by_name || '其他审核人'} 处理，请稍后再试`,
      }, { status: 409 });
    }

    // 抢占审核状态、写入审核人、插入正式活动放在同一事务里：先原子抢占 review_status='待审核'，
    // 抢占失败立即返回 409；只有抢占成功才会插入 activities，避免并发审核在插入之后
    // 才发现状态冲突，留下无提交记录关联的孤儿活动，也避免两步操作中途失败导致状态不一致。
    let activityId: string | null = null;
    const updated = await withTransaction(async (client) => {
      // 先锁图片，再锁提交记录，与清理顺序一致；旧记录没有图片时不要求补传。
      if (review_status === '已通过' && submission.activity_image_url) {
        const asset = await client.query('SELECT url FROM upload_assets WHERE url=$1 FOR UPDATE', [submission.activity_image_url]);
        const cleanup = await client.query('SELECT id FROM file_cleanup_jobs WHERE asset_url=$1', [submission.activity_image_url]);
        if (!asset.rows.length || cleanup.rows.length) throw new ActivityImageError('活动图片不可用或正在清理，请重新提交图片后审核');
      }
      const claimResult = await client.query(
        `UPDATE activity_submissions
           SET review_status=$1,review_note=$2,reviewed_by_id=$3,reviewed_by_name=$4,reviewed_at=NOW(),
               review_claimed_by_id=NULL,review_claimed_by_name=NULL,review_claimed_at=NULL,updated_at=NOW()
         WHERE id=$5 AND review_status='待审核' RETURNING *`,
        [review_status, review_note || null, auth.user!.id, auth.user!.username, id],
      );
      const claimed = claimResult.rows[0];
      if (!claimed) return null;
      if (review_status === '已通过' && claimed.activity_image_url !== submission.activity_image_url) {
        throw new ActivityImageError('活动图片已更新，请刷新后重新审核');
      }

      if (review_status === '已通过') {
        activityId = await nextActivityId(client);
        await client.query(`INSERT INTO activities (id,full_name,start_time,end_time,registration_start_time,registration_end_time,category,category_primary,category_secondary,level,plan_file_url,plan_file_name,record_file_url,record_file_name,leader_name,leader_phone,scope_type,scope_name,scope_names,leader_ids,activity_submitter_id,activity_submitter_name,activity_submitter_student_id,status,scoring_status,reviewed_by_id,reviewed_by_name,reviewed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'正常活动','待赋分',$24,$25,NOW())`, [
          activityId, submission.full_name, submission.start_time, submission.end_time, submission.registration_start_time || null, submission.registration_end_time || null, submission.category, submission.category_primary || null, submission.category_secondary || null, submission.level,
          submission.plan_file_url, submission.plan_file_name || null, submission.record_file_url, submission.record_file_name || null, submission.leader_name, submission.leader_phone,
          submission.scope_type || 'department', submission.scope_name, submission.scope_names || null, submission.leader_ids || '[]', submission.activity_submitter_id || null, submission.activity_submitter_name || null, submission.activity_submitter_student_id || null,
          auth.user!.id, auth.user!.username,
        ]);
        await client.query('UPDATE activities SET leader_details=$1,activity_image_url=$3 WHERE id=$2', [submission.leader_details || null, activityId, claimed.activity_image_url || null]);
        await client.query('UPDATE activity_submissions SET activity_id=$1 WHERE id=$2', [activityId, id]);
      }
      await writeAuditLog({ actor: auth.user, action: 'review_activity_submission', resourceType: 'activity_submission', resourceId: id, details: { reviewStatus: review_status, activityId } }, client);
      return claimed;
    });
    if (!updated) return NextResponse.json({ success: false, error: '审核状态已被其他操作更新，请刷新后重试' }, { status: 409 });

    const recipients = normalizeIds(submission.leader_ids);
    if (submission.activity_submitter_id) recipients.push(submission.activity_submitter_id);
    const isApproved = review_status === '已通过';
    await notifyUsers(recipients, isApproved ? 'activity_approved' : 'activity_rejected', isApproved ? '活动审核通过' : '活动审核被驳回', isApproved
      ? `活动「${submission.full_name}」已审核通过，活动ID：${activityId}`
      : `活动「${submission.full_name}」审核未通过。${review_note ? `原因：${review_note}` : ''}`, activityId || submission.id);
    return NextResponse.json({ success: true, data: updated, activityId });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '审核活动失败' }, { status: error instanceof ActivityImageError ? 409 : 500 });
  }
}