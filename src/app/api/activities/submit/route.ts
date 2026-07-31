import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/activities/submit - 负责人查看自己提交的活动
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ success: false, error: '缺少负责人手机号' }, { status: 400 });
    }

    const { data, error } = await client
      .from('activity_submissions')
      .select('*')
      .eq('leader_phone', phone)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/activities/submit - 负责人提交活动
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { full_name, start_time, end_time, category, level, plan_file_url, record_file_url, leader_name, leader_phone } = body;

    if (!full_name || !start_time || !end_time || !category || !level || !leader_name || !leader_phone) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 });
    }

    const { data, error } = await client
      .from('activity_submissions')
      .insert({
        full_name,
        start_time,
        end_time,
        category,
        level,
        plan_file_url: plan_file_url || null,
        record_file_url: record_file_url || null,
        leader_name,
        leader_phone,
        review_status: '待审核',
      })
      .select()
      .single();

    if (error) throw new Error(`提交失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
