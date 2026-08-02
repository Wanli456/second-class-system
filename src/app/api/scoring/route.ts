import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { createNotification } from '@/app/api/notifications/route';
import { requirePermission } from '@/lib/auth';

// GET /api/scoring - 获取赋分列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'score');
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const level = searchParams.get('level');

    let sql = "SELECT id, full_name, level, scoring_status, scoring_table_url, record_file_url, leader_name, leader_phone, category, status FROM activities WHERE status = '正常活动'";
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND scoring_status = $${paramIndex++}`;
      params.push(status);
    }
    if (level) {
      sql += ` AND level = $${paramIndex++}`;
      params.push(level);
    }

    sql += ' ORDER BY created_at DESC';

    const data = await query(sql, params);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/scoring - 赋分操作
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'score');
    if (auth.response) return auth.response;
    const body = await request.json();
    const { id, scoring_table_url } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    }

    const activity = await queryOne(
      'SELECT id, full_name, level, record_file_url, scoring_status, scoring_table_url, leader_phone FROM activities WHERE id = $1',
      [id]
    );

    if (!activity) {
      return NextResponse.json({ success: false, error: '活动不存在' }, { status: 404 });
    }

    if (activity.scoring_status === '已赋分') {
      return NextResponse.json({ success: false, error: '该活动已完成赋分' }, { status: 400 });
    }

    if (activity.level === '校级') {
      if (!activity.record_file_url) {
        return NextResponse.json({ success: false, error: '校级活动需要活动备案表，请等待负责人上传' }, { status: 400 });
      }
      if (!activity.scoring_table_url) {
        return NextResponse.json({ success: false, error: '请等待负责人上传活动赋分表' }, { status: 400 });
      }
    } else {
      if (!activity.scoring_table_url) {
        return NextResponse.json({ success: false, error: '请等待负责人上传活动赋分表' }, { status: 400 });
      }
    }

    await query(
      `UPDATE activities SET scoring_status = '已赋分', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // 查找负责人并发送通知
    const leader = await queryOne(
      `SELECT id FROM users WHERE username = $1 OR student_id = $2 LIMIT 1`,
      [activity.leader_name, activity.leader_phone]
    );

    if (leader) {
      await createNotification(
        leader.id,
        'activity_scored',
        '活动赋分完成',
        `您的活动「${activity.full_name}」（ID: ${id}）已完成赋分`,
        id
      );
    }

    return NextResponse.json({
      success: true,
      message: `赋分成功，已通知负责人`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
