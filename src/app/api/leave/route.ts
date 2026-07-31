import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/leave - 查询请假记录
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('student_id');
    const status = searchParams.get('status');
    const role = searchParams.get('role'); // admin or student

    if (role === 'admin') {
      // 管理员查看所有
      let query = client
        .from('leave_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) query = query.eq('review_status', status);

      const { data, error } = await query;
      if (error) throw new Error(`查询失败: ${error.message}`);
      return NextResponse.json({ success: true, data });
    }

    if (!studentId) {
      return NextResponse.json({ success: false, error: '缺少学号' }, { status: 400 });
    }

    const { data, error } = await client
      .from('leave_requests')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/leave - 学生提交请假申请
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { student_id, class_name, student_name, leave_type, leave_image_url, activity_name } = body;

    if (!student_id || !class_name || !student_name || !leave_type) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 });
    }

    // 活动公假需要填写活动全称
    if (leave_type === '活动公假' && !activity_name) {
      return NextResponse.json({ success: false, error: '活动公假必须填写活动全称' }, { status: 400 });
    }

    let reviewStatus: string = '待审核';
    let reviewNote: string | null = null;

    // 活动公假：检查活动是否存在
    if (leave_type === '活动公假' && activity_name) {
      const { data: activity, error: actError } = await client
        .from('activities')
        .select('id')
        .eq('full_name', activity_name)
        .eq('status', '正常活动')
        .maybeSingle();

      if (actError) throw new Error(`查询活动失败: ${actError.message}`);

      if (!activity) {
        reviewStatus = '已驳回';
        reviewNote = `活动全称"${activity_name}"在系统中不存在或已取消，自动驳回`;
      }
    }

    const { data, error } = await client
      .from('leave_requests')
      .insert({
        student_id,
        class_name,
        student_name,
        leave_type,
        leave_image_url: leave_image_url || null,
        activity_name: leave_type === '活动公假' ? activity_name : null,
        review_status: reviewStatus,
        review_note: reviewNote,
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

// PUT /api/leave - 管理员审核请假
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

    const { data, error } = await client
      .from('leave_requests')
      .update({ review_status, review_note: review_note || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`更新失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
