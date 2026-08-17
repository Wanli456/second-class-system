import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireUser } from '@/lib/auth';
import { ensureDepartmentsTable, query, queryOne } from '@/storage/database/supabase-client';

function normalizeName(value: unknown) {
  return String(value ?? '').trim();
}

function schemaError(error: unknown) {
  console.error('部门表初始化失败:', error);
  const detail = error instanceof Error ? error.message : String(error);
  return NextResponse.json(
    { success: false, error: process.env.NODE_ENV === 'production' ? '部门数据初始化失败' : detail },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  try {
    await ensureDepartmentsTable();
  } catch (error) {
    return schemaError(error);
  }

  if (new URL(request.url).searchParams.get('managed') === 'true') {
    const managed = await query<{ id: string; name: string }>('SELECT id,name FROM departments ORDER BY name');
    return NextResponse.json({ success: true, data: managed });
  }

  const rows = await query<{ name: string }>(
    `SELECT name FROM departments WHERE name <> ''
     UNION
     SELECT department AS name FROM users WHERE department IS NOT NULL AND department <> ''
     ORDER BY name`,
  );
  return NextResponse.json({ success: true, data: rows.map((row) => row.name) });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  try {
    await ensureDepartmentsTable();
  } catch (error) {
    return schemaError(error);
  }

  const body = await request.json();
  const name = normalizeName(body.name);
  if (!name) return NextResponse.json({ success: false, error: '请输入部门名称' }, { status: 400 });

  const existing = await queryOne('SELECT id FROM departments WHERE name=$1', [name]);
  if (existing) return NextResponse.json({ success: false, error: '该部门已经存在' }, { status: 400 });
  const department = await queryOne<{ id: string; name: string }>(
    'INSERT INTO departments (name) VALUES ($1) RETURNING id,name',
    [name],
  );
  return NextResponse.json({ success: true, data: department });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  try {
    await ensureDepartmentsTable();
  } catch (error) {
    return schemaError(error);
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: '缺少部门 ID' }, { status: 400 });
  const department = await queryOne<{ name: string }>('SELECT name FROM departments WHERE id=$1', [id]);
  if (!department) return NextResponse.json({ success: false, error: '部门不存在' }, { status: 404 });
  const assigned = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM users WHERE department=$1', [department.name]);
  if (Number(assigned?.count || 0) > 0) {
    return NextResponse.json({ success: false, error: '该部门仍有用户归属，不能删除' }, { status: 400 });
  }
  await query('DELETE FROM departments WHERE id=$1', [id]);
  return NextResponse.json({ success: true });
}
