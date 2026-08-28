import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { lockTransactionKey, query, withTransaction } from '@/storage/database/supabase-client';

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

class ClassRosterConflictError extends Error {}

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
  if (!Array.isArray(value)) return { students: [], incompleteRows: [], duplicateStudentIds: [] };
  const students: { studentId: string; studentName: string }[] = [];
  const studentIds = new Set<string>();
  const incompleteRows: number[] = [];
  const duplicateStudentIds: string[] = [];
  for (const [index, rawStudent] of value.entries()) {
    const student = rawStudent as RosterStudentInput;
    const studentId = String(student.studentId || '').trim();
    const studentName = String(student.studentName || '').trim();
    if (!studentId || !studentName) {
      incompleteRows.push(index + 1);
      continue;
    }
    if (studentIds.has(studentId)) {
      duplicateStudentIds.push(studentId);
      continue;
    }
    studentIds.add(studentId);
    students.push({ studentId, studentName });
  }
  return { students, incompleteRows, duplicateStudentIds };
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
    const normalized = normalizeStudents(body.students);
    const { students } = normalized;
    if (!className) return NextResponse.json({ success: false, error: '请填写班级名称' }, { status: 400 });
    if (normalized.incompleteRows.length) {
      return NextResponse.json({ success: false, error: `第 ${normalized.incompleteRows.join('、')} 行学号或姓名不完整` }, { status: 400 });
    }
    if (normalized.duplicateStudentIds.length) {
      return NextResponse.json({ success: false, error: `同一请求存在重复学号：${[...new Set(normalized.duplicateStudentIds)].join('、')}` }, { status: 400 });
    }
    if (!students.length) return NextResponse.json({ success: false, error: '请至少填写一名学号和姓名完整的学生' }, { status: 400 });
    if (students.length > 500) return NextResponse.json({ success: false, error: '单次最多保存 500 名学生' }, { status: 400 });

    const placeholders = students.map((_, index) => `($${index * 3 + 1},$${index * 3 + 2},$${index * 3 + 3})`).join(',');
    const values = students.flatMap((student) => [className, student.studentId, student.studentName]);
    await withTransaction(async (client) => {
      // 同一班级和同一批学号的写入必须串行，避免并发覆盖或跨班重复。
      const lockKeys = [className, ...students.map((student) => student.studentId)].sort();
      for (const lockKey of lockKeys) {
        await lockTransactionKey(client, lockKey);
      }
      const conflictResult = await client.query(
        'SELECT student_id, class_name FROM class_roster WHERE student_id = ANY($1::text[]) AND class_name <> $2',
        [students.map((student) => student.studentId), className],
      );
      const conflicts = conflictResult.rows as Array<{ student_id: string; class_name: string }>;
      if (conflicts.length) {
        const conflictText = conflicts.map((row) => `${row.student_id}（${row.class_name}）`).join('、');
        throw new ClassRosterConflictError(`学号已属于其他班级：${conflictText}`);
      }
      await client.query('DELETE FROM class_roster WHERE class_name=$1', [className]);
      await client.query(`INSERT INTO class_roster (class_name, student_id, student_name) VALUES ${placeholders}`, values);
    });
    return NextResponse.json({ success: true, count: students.length });
  } catch (error) {
    const status = error instanceof ClassRosterConflictError ? 409 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '保存班级花名册失败' }, { status });
  }
}
