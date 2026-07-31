import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST /api/auth - 注册
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '用户名和密码不能为空' }, { status: 400 });
    }

    // 检查用户名是否已存在
    const { data: existing } = await client
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: '用户名已存在' }, { status: 400 });
    }

    // 创建用户，默认角色为学生
    const { data, error } = await client
      .from('users')
      .insert({
        username,
        password,
        role: 'student', // 默认角色为学生
      })
      .select()
      .single();

    if (error) throw new Error(`注册失败: ${error.message}`);

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: data.id, 
        username: data.username, 
        role: data.role,
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
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '用户名和密码不能为空' }, { status: 400 });
    }

    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle();

    if (error) throw new Error(`登录失败: ${error.message}`);

    if (!data) {
      return NextResponse.json({ success: false, error: '用户名或密码错误' }, { status: 401 });
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: data.id, 
        username: data.username, 
        role: data.role,
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
      .select('id, username, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('查询用户失败:', error);
    return NextResponse.json({ success: false, error: '查询用户失败' }, { status: 500 });
  }
}

// PATCH /api/auth - 更新用户角色
export async function PATCH(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { id, role } = await request.json();

    if (!id || !role) {
      return NextResponse.json({ success: false, error: '参数不完整' }, { status: 400 });
    }

    const validRoles = ['student', 'leader', 'publisher', 'scorer', 'admin'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ success: false, error: '无效的角色' }, { status: 400 });
    }

    const { data, error } = await client
      .from('users')
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`更新失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('更新用户失败:', error);
    return NextResponse.json({ success: false, error: '更新用户失败' }, { status: 500 });
  }
}
