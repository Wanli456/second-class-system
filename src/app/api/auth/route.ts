import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';

// POST /api/auth - 注册
export async function POST(request: NextRequest) {
  try {
    const { studentId, name, password } = await request.json();

    if (!studentId || !name || !password) {
      return NextResponse.json({ success: false, error: '学号、姓名和密码不能为空' }, { status: 400 });
    }

    // 检查学号是否已存在
    const existing = await queryOne(
      'SELECT id FROM users WHERE student_id = $1',
      [studentId]
    );

    if (existing) {
      return NextResponse.json({ success: false, error: '该学号已注册' }, { status: 400 });
    }

    // 创建用户
    const user = await queryOne(
      `INSERT INTO users (username, password, student_id, role, can_publish, can_score, can_review_leave)
       VALUES ($1, $2, $3, 'student', false, false, false)
       RETURNING *`,
      [name, password, studentId]
    );

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: user.id, 
        studentId: user.student_id,
        name: user.username,
        role: user.role,
        canPublish: user.can_publish,
        canScore: user.can_score,
      } 
    });
  } catch (error) {
    console.error('注册失败:', error);
    return NextResponse.json({ success: false, error: '注册失败' }, { status: 500 });
  }
}

// PUT /api/auth - 登录
export async function PUT(request: NextRequest) {
  try {
    const { studentId, name, password } = await request.json();

    if (!studentId || !name || !password) {
      return NextResponse.json({ success: false, error: '学号、姓名和密码不能为空' }, { status: 400 });
    }

    const user = await queryOne(
      'SELECT * FROM users WHERE student_id = $1 AND username = $2 AND password = $3',
      [studentId, name, password]
    );

    if (!user) {
      return NextResponse.json({ success: false, error: '学号、姓名或密码错误' }, { status: 401 });
    }

    // 管理员自动拥有所有权限
    const isAdmin = user.role === 'admin';

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: user.id, 
        studentId: user.student_id,
        name: user.username, 
        role: user.role,
        canPublish: isAdmin ? true : user.can_publish,
        canScore: isAdmin ? true : user.can_score,
        canReviewLeave: isAdmin ? true : user.can_review_leave,
        canViewEveningStudy: isAdmin ? true : user.can_view_evening_study,
      } 
    });
  } catch (error) {
    console.error('登录失败:', error);
    return NextResponse.json({ success: false, error: '登录失败' }, { status: 500 });
  }
}

// GET /api/auth - 获取用户列表（管理员）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const admin = searchParams.get('admin');

    if (role !== 'admin' && admin !== 'true') {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const userList = await query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );

    return NextResponse.json({ 
      success: true, 
      data: userList.map(u => ({
        id: u.id,
        studentId: u.student_id,
        name: u.username,
        role: u.role,
        canPublish: u.can_publish,
        canScore: u.can_score,
        canReviewLeave: u.can_review_leave,
        canViewEveningStudy: u.can_view_evening_study,
      }))
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return NextResponse.json({ success: false, error: '获取用户列表失败' }, { status: 500 });
  }
}

// PATCH /api/auth - 更新用户角色/权限
export async function PATCH(request: NextRequest) {
  try {
    const { userId, role, canPublish, canScore, canReviewLeave, canViewEveningStudy } = await request.json();

    if (!userId) {
      return NextResponse.json({ success: false, error: '用户 ID 不能为空' }, { status: 400 });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (canPublish !== undefined) {
      updates.push(`can_publish = $${paramIndex++}`);
      params.push(canPublish);
    }
    if (canScore !== undefined) {
      updates.push(`can_score = $${paramIndex++}`);
      params.push(canScore);
    }
    if (canReviewLeave !== undefined) {
      updates.push(`can_review_leave = $${paramIndex++}`);
      params.push(canReviewLeave);
    }
    if (canViewEveningStudy !== undefined) {
      updates.push(`can_view_evening_study = $${paramIndex++}`);
      params.push(canViewEveningStudy);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: '没有需要更新的字段' }, { status: 400 });
    }

    params.push(userId);
    const user = await queryOne(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (!user) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      data: {
        id: user.id,
        studentId: user.student_id,
        name: user.username,
        role: user.role,
        canPublish: user.can_publish,
        canScore: user.can_score,
        canReviewLeave: user.can_review_leave,
      }
    });
  } catch (error) {
    console.error('更新用户失败:', error);
    return NextResponse.json({ success: false, error: '更新用户失败' }, { status: 500 });
  }
}
