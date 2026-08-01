import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';

// GET /api/activities - 获取活动列表（管理员/负责人）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const level = searchParams.get('level');
    const keyword = searchParams.get('keyword');
    const leader_phone = searchParams.get('leader_phone');

    let sql = 'SELECT * FROM activities WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (category) {
      sql += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    if (status) {
      sql += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (level) {
      sql += ` AND level = $${paramIndex++}`;
      params.push(level);
    }
    if (keyword) {
      sql += ` AND full_name ILIKE $${paramIndex++}`;
      params.push(`%${keyword}%`);
    }
    if (leader_phone) {
      sql += ` AND leader_phone = $${paramIndex++}`;
      params.push(leader_phone);
    }

    sql += ' ORDER BY created_at DESC';

    const data = await query(sql, params);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/activities - 管理员创建活动
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { full_name, start_time, end_time, category, level, plan_file_url, record_file_url, leader_name, leader_phone, status } = body;

    if (!full_name || !start_time || !end_time || !category || !level || !leader_name || !leader_phone) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 });
    }

    // 生成活动ID: EK + 年月 + 序号
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `EK${yearMonth}`;

    const existing = await query(
      `SELECT id FROM activities WHERE id LIKE $1 ORDER BY id DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let seq = 1;
    if (existing && existing.length > 0) {
      const lastId = existing[0].id;
      const lastSeq = parseInt(lastId.slice(-3), 10);
      seq = lastSeq + 1;
    }
    const id = `${prefix}${String(seq).padStart(3, '0')}`;

    const data = await queryOne(
      `INSERT INTO activities (id, full_name, start_time, end_time, category, level, plan_file_url, record_file_url, leader_name, leader_phone, status, scoring_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '待赋分')
       RETURNING *`,
      [id, full_name, start_time, end_time, category, level, plan_file_url || null, record_file_url || null, leader_name, leader_phone, status || '正常活动']
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/activities - 管理员更新活动（不能修改ID）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    }

    // 禁止修改ID
    delete updates.id;

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = $${paramIndex++}`);
      params.push(value);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const data = await queryOne(
      `UPDATE activities SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/activities - 管理员删除活动
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    }

    await query('DELETE FROM activities WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
