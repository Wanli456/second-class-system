import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireUser } from '@/lib/auth';
import { query, queryOne } from '@/storage/database/supabase-client';

type NormalizedRosterStudent = { studentId: string; studentName: string };

function normalizeStudent(value: unknown): NormalizedRosterStudent | null {
  if (!value || typeof value !== 'object') return null;
  const student = value as { student_id?: unknown; student_name?: unknown };
  const studentId = String(student.student_id || '').trim();
  const studentName = String(student.student_name || '').trim();
  return studentId && studentName ? { studentId, studentName } : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get('classes') === 'true') {
    const rows = await query<{ class_name: string }>(
      `SELECT class_name FROM class_roster WHERE TRIM(class_name) <> ''
       UNION
       SELECT class_name FROM users WHERE class_name IS NOT NULL AND TRIM(class_name) <> ''
       ORDER BY class_name`,
    );
    return NextResponse.json({ success: true, data: rows.map((row) => row.class_name) });
  }
  const requestedClass = searchParams.get('class');
  const className = auth.user!.role === 'admin' && requestedClass ? requestedClass : auth.user!.class_name;
  if (!className) return NextResponse.json({ success: true, data: [] });
  const data = await query('SELECT id,class_name,student_id,student_name FROM class_roster WHERE class_name=$1 ORDER BY student_id', [className]);
  return NextResponse.json({ success: true, data, className });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const body = await request.json();
    const className = String(body.className || '').trim();
    const source: unknown[] = Array.isArray(body.students) ? body.students : [body];
    const students = [...new Map(
      source
        .map((student) => normalizeStudent(student))
        .filter((student): student is NormalizedRosterStudent => student !== null)
        .map((student) => [student.studentId, student]),
    ).values()];
    if (!className || !students.length) return NextResponse.json({ success: false, error: '请填写班级、学号和姓名' }, { status: 400 });
    const data = [];
    for (const student of students) {
      const row = await queryOne(
        `INSERT INTO class_roster (class_name,student_id,student_name) VALUES ($1,$2,$3)
         ON CONFLICT (class_name,student_id) DO UPDATE SET student_name=EXCLUDED.student_name,updated_at=NOW()
         RETURNING id,class_name,student_id,student_name`,
        [className, student.studentId, student.studentName],
      );
      if (row) data.push(row);
      await query('UPDATE users SET class_name=$1 WHERE student_id=$2', [className, student.studentId]);
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '保存花名册失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const body = await request.json();
    const id = String(body.id || '').trim();
    const student = normalizeStudent(body);
    if (!id || !student) return NextResponse.json({ success: false, error: '请填写完整的学号和姓名' }, { status: 400 });
    const data = await queryOne('UPDATE class_roster SET student_id=$1,student_name=$2,updated_at=NOW() WHERE id=$3 RETURNING id,class_name,student_id,student_name', [student.studentId, student.studentName, id]);
    if (!data) return NextResponse.json({ success: false, error: '花名册学生不存在' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '更新花名册失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: '缺少花名册记录 ID' }, { status: 400 });
  const data = await queryOne('DELETE FROM class_roster WHERE id=$1 RETURNING id', [id]);
  if (!data) return NextResponse.json({ success: false, error: '花名册学生不存在' }, { status: 404 });
  return NextResponse.json({ success: true });
}
