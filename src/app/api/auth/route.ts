import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST /api/auth - 注册
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { studentId, name, password } = await request.json();

    if (!studentId || !name || !password) {
      return NextResponse.json({ success: false, error: '学号、姓名和密码不能为空' }, { status: 400 });
    }

    // 检查学号是否已存在
    const { data: existing } = await client
      .from('users')
      .select('id')
      .eq('student_id', studentId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: '该学号已注册' }, { status: 400 });
    }

    // 创建用户，默认角色为学生，默认无权限
    const { data, error } = await client
      .from('users')
      .insert({
        username: name,
        password,
        student_id: studentId,
        role: 'student',
        can_publish: false,
        can_score: false,
      })
      .select()
      .single();

    if (error) throw new Error(`注册失败: ${error.message}`);

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: data.id, 
        studentId: data.student_id,
        name: data.username,
        role: data.role,
        canPublish: data.can_publish,
        canScore: data.can_score,
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
    const client = getSupabaseClient();
    const { studentId, name, password } = await request.json();

    if (!studentId || !name || !password) {
      return NextResponse.json({ success: false, error: '学号、姓名和密码不能为空' }, { status: 400 });
    }

    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('student_id', studentId)
      .eq('username', name)
      .eq('password', password)
      .maybeSingle();

    if (error) throw new Error(`登录失败: ${error.message}`);

    if (!data) {
      return NextResponse.json({ success: false, error: '学号、姓名或密码错误' }, { status: 401 });
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: data.id, 
        studentId: data.student_id,
        name: data.username, 
        role: data.role,
        canPublish: data.can_publish,
        canScore: data.can_score,
      } 
    });
  } catch (error) {
    console.error('登录失败:', error);
    return NextResponse.json({ success: false, error: '登录失败' }, { status: 500 });
  }
}

// GET /api/auth - 获取用户列表（需要管理员权限）
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const adminToken = searchParams.get('admin');
    
    // 简单验证管理员权限
    if (adminToken !== 'true') {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { data, error } = await client
      .from('users')
      .select('id, username, student_id, role, can_publish, can_score, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ 
      success: true, 
      data: (data || []).map(u => ({
        id: u.id,
        studentId: u.student_id,
        name: u.username,
        role: u.role,
        canPublish: u.can_publish,
        canScore: u.can_score,
        createdAt: u.created_at,
      }))
    });
  } catch (error) {
    console.error('查询用户失败:', error);
    return NextResponse.json({ success: false, error: '查询用户失败' }, { status: 500 });
  }
}

// PATCH /api/auth - 更新用户角色、权限或密码
export async function PATCH(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { id, role, canPublish, canScore, password, oldPassword } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '参数不完整' }, { status: 400 });
    }

    // 修改密码（需要验证旧密码）
    if (password !== undefined) {
      if (!oldPassword) {
        return NextResponse.json({ success: false, error: '请输入旧密码' }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ success: false, error: '新密码长度至少6位' }, { status: 400 });
      }
      
      // 验证旧密码
      const { data: userData, error: verifyError } = await client
        .from('users')
        .select('password')
        .eq('id', id)
        .single();
      
      if (verifyError || !userData) {
        return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
      }
      
      if (userData.password !== oldPassword) {
        return NextResponse.json({ success: false, error: '旧密码错误' }, { status: 400 });
      }
      
      const { error } = await client
        .from('users')
        .update({ password })
        .eq('id', id);
      if (error) throw new Error(`修改密码失败: ${error.message}`);
      return NextResponse.json({ success: true, message: '密码修改成功' });
    }

    // 更新角色和权限
    const validRoles = ['student', 'leader', 'admin'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ success: false, error: '无效的角色' }, { status: 400 });
    }

    const updateData: any = {};
    if (role !== undefined) updateData.role = role;
    if (canPublish !== undefined) updateData.can_publish = canPublish;
    if (canScore !== undefined) updateData.can_score = canScore;

    const { data, error } = await client
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`更新失败: ${error.message}`);

    return NextResponse.json({ 
      success: true, 
      data: {
        id: data.id,
        studentId: data.student_id,
        name: data.username,
        role: data.role,
        canPublish: data.can_publish,
        canScore: data.can_score,
      }
    });
  } catch (error) {
    console.error('更新用户失败:', error);
    return NextResponse.json({ success: false, error: '更新用户失败' }, { status: 500 });
  }
}

// DELETE /api/auth - 删除用户
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少用户ID' }, { status: 400 });
    }

    const { error } = await client
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除用户失败:', error);
    return NextResponse.json({ success: false, error: '删除用户失败' }, { status: 500 });
  }
}
