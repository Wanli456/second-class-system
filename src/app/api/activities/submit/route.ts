import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/activities/submit - 负责人查看自己提交的活动（支持按活动名称搜索）
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const keyword = searchParams.get('keyword');

    if (!phone && !keyword) {
      return NextResponse.json({ success: false, error: '缺少查询条件' }, { status: 400 });
    }

    // 同时查询 activity_submissions 和 activities 表
    const [submissionsQuery, activitiesQuery] = await Promise.all([
      client.from('activity_submissions').select('*').order('created_at', { ascending: false }),
      client.from('activities').select('id, full_name, start_time, end_time, category, level, leader_name, leader_phone, status, scoring_status, created_at').order('created_at', { ascending: false }),
    ]);

    let results: any[] = [];

    // 处理 submissions 结果
    if (submissionsQuery.data) {
      let filtered = submissionsQuery.data;
      if (phone) filtered = filtered.filter((s: any) => s.leader_phone === phone);
      if (keyword) filtered = filtered.filter((s: any) => s.full_name.includes(keyword));
      results = results.concat(filtered.map((s: any) => ({ ...s, source: 'submission' })));
    }

    // 处理 activities 结果
    if (activitiesQuery.data) {
      let filtered = activitiesQuery.data;
      if (phone) filtered = filtered.filter((a: any) => a.leader_phone === phone);
      if (keyword) filtered = filtered.filter((a: any) => a.full_name.includes(keyword));
      results = results.concat(filtered.map((a: any) => ({ ...a, source: 'activity', review_status: '已通过' })));
    }

    return NextResponse.json({ success: true, data: results });
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
