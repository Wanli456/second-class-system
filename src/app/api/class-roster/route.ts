import { NextRequest, NextResponse } from 'next/server';
import { calculateUserPermissions, requirePermission, requireUser } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne, withTransaction } from '@/storage/database/supabase-client';

type NormalizedRosterStudent = { className: string; studentId: string; studentName: string };

function normalizeStudent(value: unknown): NormalizedRosterStudent | null {
  if (!value || typeof value !== 'object') return null;
  const student = value as {
    class_name?: unknown;
    className?: unknown;
    student_id?: unknown;
    studentId?: unknown;
    student_name?: unknown;
    studentName?: unknown;
  };
  const firstText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
  const className = firstText(student.class_name, student.className);
  const studentId = firstText(student.student_id, student.studentId);
  const studentName = firstText(student.student_name, student.studentName);
  return studentId && studentName ? { className, studentId, studentName } : null;
}

export async function GET(request: NextRequest) {
  await ensureDatabaseSchema();
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const searchParams = new URL(request.url).searchParams;
  const permissions = calculateUserPermissions(auth.user!);
  if (searchParams.get('classes') === 'true') {
    if (!permissions.canSubmitActivity) return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
    const rows = await query<{ class_name: string }>(
      `SELECT class_name FROM class_roster WHERE class_name <> ''
       UNION
       SELECT class_name FROM users WHERE class_name IS NOT NULL AND class_name <> ''
       ORDER BY class_name`,
    );
    return NextResponse.json({ success: true, data: rows.map((row) => row.class_name) });
  }
  if (!permissions.canStartGroupLeave) return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  const requestedClass = searchParams.get('class');
  const className = auth.user!.role === 'admin' && requestedClass ? requestedClass : auth.user!.class_name;
  if (!className) return NextResponse.json({ success: true, data: [] });
  const data = await query('SELECT id,class_name,student_id,student_name FROM class_roster WHERE class_name=$1 ORDER BY student_id', [className]);
  return NextResponse.json({ success: true, data, className });
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const body = await request.json();
    const defaultClassName = String(body.className || '').trim();
    const source: unknown[] = Array.isArray(body.students) ? body.students : [body];
    const students = [...new Map(
      source
        .map((student) => normalizeStudent(student))
        .filter((student): student is NormalizedRosterStudent => student !== null)
        .map((student) => ({ ...student, className: student.className || defaultClassName }))
        .filter((student) => student.className)
        .map((student) => [`${student.className}\u0000${student.studentId}`, student]),
    ).values()];
    if (!students.length) return NextResponse.json({ success: false, error: '请提供班级、学号和姓名' }, { status: 400 });
    const data = await withTransaction(async (client) => {
      // 同一批学号的校验和写入必须串行，避免并发请求把同一学号同时分配到两个班级。
      const lockKeys = [...new Set(students.map((student) => student.studentId))].sort();
      for (const lockKey of lockKeys) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
      }
      const rows: Record<string, unknown>[] = [];
      for (const student of students) {
        const conflict = await client.query<{ class_name: string }>(
          'SELECT class_name FROM class_roster WHERE student_id=$1 AND class_name<>$2 LIMIT 1',
          [student.studentId, student.className],
        );
        if (conflict.rows.length) {
          throw new Error(`学号 ${student.studentId} 已属于班级 ${conflict.rows[0].class_name}`);
        }
        const inserted = await client.query(
          `INSERT INTO class_roster (class_name,student_id,student_name) VALUES ($1,$2,$3)
           ON CONFLICT (class_name,student_id) DO UPDATE SET student_name=EXCLUDED.student_name,updated_at=NOW()
           RETURNING id,class_name,student_id,student_name`,
          [student.className, student.studentId, student.studentName],
        );
        if (inserted.rows[0]) rows.push(inserted.rows[0]);
        await client.query('UPDATE users SET class_name=$1 WHERE student_id=$2', [student.className, student.studentId]);
      }
      return rows;
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '保存花名册失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const body = await request.json();
    const id = String(body.id || '').trim();
    const student = normalizeStudent(body);
    if (!id || !student) return NextResponse.json({ success: false, error: '请填写完整的学号和姓名' }, { status: 400 });
    const current = await queryOne<{ class_name: string }>('SELECT class_name FROM class_roster WHERE id=$1', [id]);
    if (!current) return NextResponse.json({ success: false, error: '花名册学生不存在' }, { status: 404 });
    const existing = await queryOne<{ class_name: string }>('SELECT class_name FROM class_roster WHERE student_id=$1 AND class_name<>$2 AND id<>$3 LIMIT 1', [student.studentId, current.class_name, id]);
    if (existing) {
      return NextResponse.json({ success: false, error: `学号 ${student.studentId} 已属于班级 ${existing.class_name}` }, { status: 409 });
    }
    const data = await queryOne('UPDATE class_roster SET student_id=$1,student_name=$2,updated_at=NOW() WHERE id=$3 RETURNING id,class_name,student_id,student_name', [student.studentId, student.studentName, id]);
    if (!data) return NextResponse.json({ success: false, error: '花名册学生不存在' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '更新花名册失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  await ensureDatabaseSchema();
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: '缺少花名册记录 ID' }, { status: 400 });
  const data = await queryOne('DELETE FROM class_roster WHERE id=$1 RETURNING id', [id]);
  if (!data) return NextResponse.json({ success: false, error: '花名册学生不存在' }, { status: 404 });
  return NextResponse.json({ success: true });
}
