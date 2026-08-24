import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { query } from '@/storage/database/supabase-client';

type RosterStudentInput = {
  studentId?: unknown;
  studentName?: unknown;
};

type RosterStudent = {
  id: string;
  class_name: string;
  student_id: string;
  student_name: string;
};

function canManageClassRoster(user: { role?: string | null; department?: string | null }) {
  return user.role === 'admin' || (user.role === 'leader' && user.department?.trim() === '学习竞技部');
}

async function requireClassRosterManager(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth;
  if (canManageClassRoster(auth.user!)) return auth;
  return {
    user: null,
    response: NextResponse.json({ success: false, error: '仅管理员或学习竞技部部门负责人可维护班级花名册' }, { status: 403 }),
  };
}

function normalizeStudents(value: unknown) {
  if (!Array.isArray(value)) return [];
  const uniqueStudents = new Map<string, { studentId: string; studentName: string }>();
  for (const rawStudent of value) {
    const student = rawStudent as RosterStudentInput;
    const studentId = String(student.studentId || '').trim();
    const studentName = String(student.studentName || '').trim();
    if (!studentId || !studentName) continue;
    uniqueStudents.set(studentId, { studentId, studentName });
  }
  return [...uniqueStudents.values()];
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireClassRosterManager(request);
    if (auth.response) return auth.response;

    const className = new URL(request.url).searchParams.get('className')?.trim() || '';
    if (!className) return NextResponse.json({ success: false, error: '请先输入班级名称' }, { status: 400 });
    const data = await query<RosterStudent>(
      'SELECT id, class_name, student_id, student_name FROM class_roster WHERE class_name=$1 ORDER BY student_id',
      [className],
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '读取班级花名册失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireClassRosterManager(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const className = String(body.className || '').trim();
    const students = normalizeStudents(body.students);
    if (!className) return NextResponse.json({ success: false, error: '请填写班级名称' }, { status: 400 });
    if (!students.length) return NextResponse.json({ success: false, error: '请至少填写一名学号和姓名完整的学生' }, { status: 400 });
    if (students.length > 500) return NextResponse.json({ success: false, error: '单次最多保存 500 名学生' }, { status: 400 });

    await query('DELETE FROM class_roster WHERE class_name=$1', [className]);
    const placeholders = students.map((_, index) => `($${index * 3 + 1},$${index * 3 + 2},$${index * 3 + 3})`).join(',');
    const values = students.flatMap((student) => [className, student.studentId, student.studentName]);
    await query(`INSERT INTO class_roster (class_name, student_id, student_name) VALUES ${placeholders}`, values);
    return NextResponse.json({ success: true, count: students.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '保存班级花名册失败' }, { status: 500 });
  }
}
