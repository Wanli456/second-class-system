import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST /api/auth/register - 注册
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { username, password, displayName } = await request.json();

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

    // 创建用户
    const { data, error } = await client
      .from('users')
      .insert({
        username,
        password, // 注意：实际生产环境应该加密密码
        display_name: displayName || username,
      })
      .select()
      .single();

    if (error) throw new Error(`注册失败: ${error.message}`);

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: data.id, 
        username: data.username, 
        displayName: data.display_name 
      } 
    });
  } catch (error) {
    console.error('注册失败:', error);
    return NextResponse.json({ success: false, error: '注册失败' }, { status: 500 });
  }
}

// POST /api/auth/login - 登录
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
        displayName: data.display_name 
      } 
    });
  } catch (error) {
    console.error('登录失败:', error);
    return NextResponse.json({ success: false, error: '登录失败' }, { status: 500 });
  }
}
