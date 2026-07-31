import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/scoring - 获取赋分列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const level = searchParams.get('level');

    let query = client
      .from('activities')
      .select('id, full_name, level, scoring_status, scoring_table_url, record_file_url, leader_name, leader_phone, category, status')
      .eq('status', '正常活动')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('scoring_status', status);
    if (level) query = query.eq('level', level);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/scoring - 赋分操作
export async function PUT(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { id, scoring_table_url } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    }

    // 先获取活动信息
    const { data: activity, error: fetchError } = await client
      .from('activities')
      .select('id, full_name, level, record_file_url, scoring_status, leader_phone')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw new Error(`查询失败: ${fetchError.message}`);
    if (!activity) {
      return NextResponse.json({ success: false, error: '活动不存在' }, { status: 404 });
    }

    if (activity.scoring_status === '已赋分') {
      return NextResponse.json({ success: false, error: '该活动已完成赋分' }, { status: 400 });
    }

    // 校验赋分条件
    if (activity.level === '校级') {
      // 校级：需要活动备案表照片和活动赋分表
      if (!activity.record_file_url) {
        return NextResponse.json({ success: false, error: '校级活动需要活动备案表才能赋分' }, { status: 400 });
      }
      if (!scoring_table_url) {
        return NextResponse.json({ success: false, error: '请上传活动赋分表' }, { status: 400 });
      }
    } else {
      // 院系级：只需要活动赋分表
      if (!scoring_table_url) {
        return NextResponse.json({ success: false, error: '请上传活动赋分表' }, { status: 400 });
      }
    }

    // 执行赋分
    const { error: updateError } = await client
      .from('activities')
      .update({
        scoring_status: '已赋分',
        scoring_table_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw new Error(`赋分失败: ${updateError.message}`);

    return NextResponse.json({
      success: true,
      message: `赋分成功，已通知负责人（${activity.leader_phone}）`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
