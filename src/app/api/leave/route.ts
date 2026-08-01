import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { createNotification } from '@/app/api/notifications/route';

// GET /api/leave - 查询请假记录
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('student_id');
    const studentName = searchParams.get('name');
    const status = searchParams.get('status');
    const role = searchParams.get('role');
    const className = searchParams.get('class');

    // 按班级查询
    if (className) {
      let sql = 'SELECT * FROM leave_requests WHERE class_name ILIKE $1';
      const params: any[] = [`%${className}%`];
      let paramIndex = 2;

      if (status) {
        sql += ` AND review_status = $${paramIndex++}`;
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';

      const data = await query(sql, params);
      return NextResponse.json({ success: true, data });
    }

    // 按姓名查询
    if (studentName) {
      let sql = 'SELECT * FROM leave_requests WHERE student_name ILIKE $1';
      const params: any[] = [`%${studentName}%`];
      let paramIndex = 2;

      if (status) {
        sql += ` AND review_status = $${paramIndex++}`;
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';

      const data = await query(sql, params);
      return NextResponse.json({ success: true, data });
    }

    if (role === 'admin') {
      let sql = 'SELECT * FROM leave_requests';
      const params: any[] = [];
      let paramIndex = 1;

      if (status) {
        sql += ` WHERE review_status = $${paramIndex++}`;
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';

      const data = await query(sql, params);
      return NextResponse.json({ success: true, data });
    }

    if (!studentId) {
      return NextResponse.json({ success: false, error: '缺少学号' }, { status: 400 });
    }

    const data = await query(
      'SELECT * FROM leave_requests WHERE student_id = $1 ORDER BY created_at DESC',
      [studentId]
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/leave - 学生提交请假申请
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { student_id, class_name, student_name, leave_type, leave_image_url, activity_name } = body;

    if (!student_id || !class_name || !student_name || !leave_type) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 });
    }

    if (leave_type === '活动公假' && !activity_name) {
      return NextResponse.json({ success: false, error: '活动公假必须填写活动全称' }, { status: 400 });
    }

    let reviewStatus = '待审核';
    let reviewNote: string | null = null;

    // 活动公假：检查活动是否存在
    if (leave_type === '活动公假' && activity_name) {
      const activity = await queryOne(
        `SELECT id FROM activities WHERE full_name = $1 AND status = '正常活动'`,
        [activity_name]
      );

      if (!activity) {
        reviewStatus = '已驳回';
        reviewNote = `活动全称"${activity_name}"在系统中不存在或已取消，自动驳回`;
      }
    }

    const data = await queryOne(
      `INSERT INTO leave_requests (student_id, class_name, student_name, leave_type, leave_image_url, activity_name, review_status, review_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [student_id, class_name, student_name, leave_type, leave_image_url || null, leave_type === '活动公假' ? activity_name : null, reviewStatus, reviewNote]
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/leave - 管理员审核请假
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, review_status, review_note } = body;

    if (!id || !review_status) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    if (!['待审核', '已通过', '已驳回'].includes(review_status)) {
      return NextResponse.json({ success: false, error: '无效的审核状态' }, { status: 400 });
    }

    const data = await queryOne(
      `UPDATE leave_requests SET review_status = $1, review_note = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [review_status, review_note || null, id]
    );

    // 查找请假学生并发送通知
    const student = await queryOne(
      `SELECT id FROM users WHERE student_id = $1 LIMIT 1`,
      [data.student_id]
    );

    if (student) {
      const title = review_status === '已通过' ? '请假审核通过' : '请假审核被驳回';
      const content = review_status === '已通过'
        ? `您的${data.leave_type}请假申请已审核通过`
        : `您的${data.leave_type}请假申请审核未通过。${review_note ? '原因：' + review_note : ''}`;

      await createNotification(
        student.id,
        review_status === '已通过' ? 'leave_approved' : 'leave_rejected',
        title,
        content,
        data.id
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
