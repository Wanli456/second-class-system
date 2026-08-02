import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/auth';

// GET /api/activities/submit - 负责人查看自己提交的活动（支持按活动名称搜索）
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'publish');
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const keyword = searchParams.get('keyword');

    if (!phone && !keyword) {
      return NextResponse.json({ success: false, error: '缺少查询条件' }, { status: 400 });
    }

    // 查询 activity_submissions 和 activities 表
    const [submissions, activities] = await Promise.all([
      query('SELECT * FROM activity_submissions ORDER BY created_at DESC'),
      query('SELECT id, full_name, start_time, end_time, category, level, leader_name, leader_phone, status, scoring_status, created_at FROM activities ORDER BY created_at DESC'),
    ]);

    let results: any[] = [];

    // 处理 submissions 结果
    let filteredSubmissions = submissions;
    if (phone) filteredSubmissions = filteredSubmissions.filter((s: any) => s.leader_phone === phone);
    if (keyword) filteredSubmissions = filteredSubmissions.filter((s: any) => s.full_name.includes(keyword));
    results = results.concat(filteredSubmissions.map((s: any) => ({ ...s, source: 'submission' })));

    // 处理 activities 结果
    let filteredActivities = activities;
    if (phone) filteredActivities = filteredActivities.filter((a: any) => a.leader_phone === phone);
    if (keyword) filteredActivities = filteredActivities.filter((a: any) => a.full_name.includes(keyword));
    results = results.concat(filteredActivities.map((a: any) => ({ 
      ...a, 
      source: 'activity', 
      review_status: a.status === '活动取消' ? '活动取消' : '已通过' 
    })));

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/activities/submit - 负责人提交活动
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'publish');
    if (auth.response) return auth.response;
    const body = await request.json();
    const { full_name, start_time, end_time, category, level, plan_file_url, record_file_url, leader_name, leader_phone } = body;

    if (!full_name || !start_time || !end_time || !category || !level || !leader_name || !leader_phone) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 });
    }

    const data = await queryOne(
      `INSERT INTO activity_submissions (full_name, start_time, end_time, category, level, plan_file_url, record_file_url, leader_name, leader_phone, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '待审核')
       RETURNING *`,
      [full_name, start_time, end_time, category, level, plan_file_url || null, record_file_url || null, leader_name, leader_phone]
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

