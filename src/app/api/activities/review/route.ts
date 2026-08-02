import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { createNotification } from '@/app/api/notifications/route';
import { requirePermission } from '@/lib/auth';

// GET /api/activities/review - 管理员获取待审核提交
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'publish');
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let sql = 'SELECT * FROM activity_submissions';
    const params: any[] = [];

    if (status) {
      sql += ' WHERE review_status = $1';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const data = await query(sql, params);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/activities/review - 管理员审核提交
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'publish');
    if (auth.response) return auth.response;
    const body = await request.json();
    const { id, review_status, review_note } = body;

    if (!id || !review_status) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    if (!['待审核', '已通过', '已驳回'].includes(review_status)) {
      return NextResponse.json({ success: false, error: '无效的审核状态' }, { status: 400 });
    }

    // 先获取提交记录
    const submission = await queryOne(
      'SELECT * FROM activity_submissions WHERE id = $1',
      [id]
    );

    if (!submission) {
      return NextResponse.json({ success: false, error: '提交记录不存在' }, { status: 404 });
    }

    // 更新审核状态
    await query(
      `UPDATE activity_submissions SET review_status = $1, review_note = $2, updated_at = NOW() WHERE id = $3`,
      [review_status, review_note || null, id]
    );

    // 如果审核通过，自动写入活动总表并通知负责人
    if (review_status === '已通过') {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prefix = `EK${yearMonth}`;

      const existing = await query(
        `SELECT id FROM activities WHERE id LIKE $1 ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`]
      );

      let seq = 1;
      if (existing && existing.length > 0) {
        const lastId = existing[0].id;
        const lastSeq = parseInt(lastId.slice(-3), 10);
        seq = lastSeq + 1;
      }
      const activityId = `${prefix}${String(seq).padStart(3, '0')}`;

      await query(
        `INSERT INTO activities (id, full_name, start_time, end_time, category, level, plan_file_url, record_file_url, leader_name, leader_phone, status, scoring_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '正常活动', '待赋分')`,
        [activityId, submission.full_name, submission.start_time, submission.end_time, submission.category, submission.level, submission.plan_file_url, submission.record_file_url, submission.leader_name, submission.leader_phone]
      );

      // 查找负责人的用户 ID 并发送通知
      const leader = await queryOne(
        `SELECT id FROM users WHERE username = $1 OR student_id = $2 LIMIT 1`,
        [submission.leader_name, submission.leader_phone]
      );

      if (leader) {
        await createNotification(
          leader.id,
          'activity_approved',
          '活动审核通过',
          `您提交的活动「${submission.full_name}」已审核通过，活动ID：${activityId}`,
          activityId
        );
      }
    } else if (review_status === '已驳回') {
      // 驳回时也通知负责人
      const leader = await queryOne(
        `SELECT id FROM users WHERE username = $1 OR student_id = $2 LIMIT 1`,
        [submission.leader_name, submission.leader_phone]
      );

      if (leader) {
        await createNotification(
          leader.id,
          'activity_rejected',
          '活动审核被驳回',
          `您提交的活动「${submission.full_name}」审核未通过。${review_note ? '原因：' + review_note : ''}`,
          submission.id
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

