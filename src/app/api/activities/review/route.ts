import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/activities/review - 管理员获取待审核提交
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = client
      .from('activity_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('review_status', status);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/activities/review - 管理员审核提交
export async function PUT(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { id, review_status, review_note } = body;

    if (!id || !review_status) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    if (!['待审核', '已通过', '已驳回'].includes(review_status)) {
      return NextResponse.json({ success: false, error: '无效的审核状态' }, { status: 400 });
    }

    // 先获取提交记录
    const { data: submission, error: fetchError } = await client
      .from('activity_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw new Error(`查询失败: ${fetchError.message}`);
    if (!submission) {
      return NextResponse.json({ success: false, error: '提交记录不存在' }, { status: 404 });
    }

    // 更新审核状态
    const { error: updateError } = await client
      .from('activity_submissions')
      .update({ review_status, review_note: review_note || null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw new Error(`更新失败: ${updateError.message}`);

    // 如果审核通过，自动写入活动总表
    if (review_status === '已通过') {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prefix = `EK${yearMonth}`;

      const { data: existing } = await client
        .from('activities')
        .select('id')
        .like('id', `${prefix}%`)
        .order('id', { ascending: false })
        .limit(1);

      let seq = 1;
      if (existing && existing.length > 0) {
        const lastId = existing[0].id;
        const lastSeq = parseInt(lastId.slice(-3), 10);
        seq = lastSeq + 1;
      }
      const activityId = `${prefix}${String(seq).padStart(3, '0')}`;

      const { error: insertError } = await client
        .from('activities')
        .insert({
          id: activityId,
          full_name: submission.full_name,
          start_time: submission.start_time,
          end_time: submission.end_time,
          category: submission.category,
          level: submission.level,
          plan_file_url: submission.plan_file_url,
          record_file_url: submission.record_file_url,
          leader_name: submission.leader_name,
          leader_phone: submission.leader_phone,
          status: '正常活动',
        });

      if (insertError) throw new Error(`写入总表失败: ${insertError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
