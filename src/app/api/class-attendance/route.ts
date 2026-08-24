import { NextRequest, NextResponse } from 'next/server';
import {
  summarizeClassAttendance,
  type ApprovedLeaveStudent,
  type ClassRosterStudent,
  type RecordedClassAttendance,
} from '@/lib/class-attendance-summary';
import { uniqueLookup } from '@/lib/unique-lookup';
import { query } from '@/storage/database/supabase-client';

interface AttendanceDateRow {
  class_name: string | null;
  total_count: number | null;
  present_count: number | null;
}
interface UserRosterStudent extends ClassRosterStudent {
  username: string | null;
  contact_phone: string | null;
}

interface NamedRosterStudent extends ClassRosterStudent {
  student_name: string | null;
}

interface AttendanceWorkRow {
  start_date: string | null;
  end_date: string | null;
  student_names: unknown;
  schedules: unknown;
}

interface AttendanceScheduleRow {
  id: string | null;
  class_name: string | null;
  checker_name: string | null;
  checker_phone: string | null;
}

function businessToday(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nextDate(value: string): string {
  const parsed = new Date(value + 'T00:00:00.000Z');
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseNames(value: unknown): string[] {
  const parsed = parseJson(value);
  if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof parsed === 'string') return parsed.split(/[,，、\r\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalized(value: string | null): string {
  return value?.trim() || '';
}

function lookupKey(value: string | null): string {
  return normalized(value).replace(/\s+/g, '');
}

function attendanceWorkerNames(rows: AttendanceWorkRow[], requestedDate: string): Set<string> {
  const names = new Set<string>();

  for (const row of rows) {
    const schedules = parseJson(row.schedules);
    const scheduleItems = Array.isArray(schedules) ? schedules : [];
    let matchedDate = false;

    for (const item of scheduleItems) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as { date?: unknown; students?: unknown; student_names?: unknown };
      if (String(candidate.date || '').trim() !== requestedDate) continue;
      matchedDate = true;
      parseNames(candidate.students ?? candidate.student_names).forEach((name) => names.add(name));
    }

    // 兼容旧版“整周统一名单”：安排只有周一起始日，但起止日期覆盖整周。
    if (!matchedDate && scheduleItems.length === 1 && row.start_date && row.end_date && row.start_date !== row.end_date && row.start_date <= requestedDate && row.end_date >= requestedDate) {
      parseNames(row.student_names).forEach((name) => names.add(name));
    }
  }

  return names;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestedDate = new URL(request.url).searchParams.get('date')?.trim() || businessToday();
  if (!isValidDate(requestedDate)) {
    return NextResponse.json({ success: false, error: '日期格式无效，应为 YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const followingDate = nextDate(requestedDate);
    const [roster, users, approvedLeaves, attendance, attendanceWork, attendanceSchedules] = await Promise.all([
      query<NamedRosterStudent>(
        'SELECT class_name, student_id, student_name FROM class_roster WHERE class_name IS NOT NULL AND class_name <> \'\' AND student_id IS NOT NULL AND student_id <> \'\'',
      ),
      query<UserRosterStudent>(
        'SELECT class_name, student_id, username, contact_phone FROM users WHERE class_name IS NOT NULL AND class_name <> \'\' AND student_id IS NOT NULL AND student_id <> \'\'',
      ),
      query<ApprovedLeaveStudent>(
        'SELECT students.class_name, students.student_id FROM leave_slip_students students INNER JOIN leave_slips slips ON slips.id = students.slip_id WHERE slips.review_status = \'已通过\' AND COALESCE(slips.start_time, slips.created_at) < $2 AND COALESCE(slips.end_time, slips.start_time, slips.created_at) >= $1',
        [requestedDate + 'T00:00:00.000Z', followingDate + 'T00:00:00.000Z'],
      ),
      query<AttendanceDateRow>(
        'SELECT class_name, total_count, present_count FROM evening_study_attendance WHERE date = $1 ORDER BY class_name, created_at DESC',
        [requestedDate],
      ),
      query<AttendanceWorkRow>(
        "SELECT start_date, end_date, student_names, schedules FROM attendance_work_arrangements WHERE review_status = '已通过' AND start_date <= $1 AND end_date >= $1",
        [requestedDate],
      ),
      query<AttendanceScheduleRow>(
        'SELECT id, class_name, checker_name, checker_phone FROM evening_study_schedules WHERE date = $1',
        [requestedDate],
      ),
    ]);

    const workerNames = attendanceWorkerNames(attendanceWork, requestedDate);
    const workerNameKeys = new Set([...workerNames].map(lookupKey).filter(Boolean));
    const rosterKeys = new Set<string>();
    roster.forEach((student) => {
      const classKey = lookupKey(student.class_name);
      const studentKey = lookupKey(student.student_id);
      if (classKey && studentKey) rosterKeys.add(`${classKey}:${studentKey}`);
    });
    // 同名时不猜测身份：重复姓名从索引中剔除，须填写学号才能计入考勤。
    const usersByName = uniqueLookup(users, (user) => lookupKey(user.username));
    const usersByPhone = uniqueLookup(users, (user) => lookupKey(user.contact_phone));
    const usersByStudentId = uniqueLookup(users, (user) => lookupKey(user.student_id));
    const rosterByName = uniqueLookup(roster, (student) => lookupKey(student.student_name));
    const rosterByStudentId = uniqueLookup(roster, (student) => lookupKey(student.student_id));

    const findWorker = (name: string | null, phone: string | null): ClassRosterStudent | null => {
      const nameKey = lookupKey(name);
      const phoneKey = lookupKey(phone);
      // 学号是唯一身份标识，优先于姓名；姓名和手机号只在全库唯一时可用。
      const candidates: Array<ClassRosterStudent | undefined> = [
        usersByStudentId.get(nameKey),
        rosterByStudentId.get(nameKey),
        usersByPhone.get(phoneKey),
        usersByName.get(nameKey),
        rosterByName.get(nameKey),
      ];
      return candidates.find((candidate): candidate is ClassRosterStudent => Boolean(
        candidate?.class_name
        && candidate.student_id
        && rosterKeys.has(lookupKey(candidate.class_name) + ':' + lookupKey(candidate.student_id)),
      )) || null;
    };
    const attendanceWorkers: ClassRosterStudent[] = [];
    const attendanceWorkerIdsByClass = new Map<string, Set<string>>();
    const addWorker = (worker: ClassRosterStudent | null, fallbackClassName: string | null, fallbackId: string): void => {
      const className = worker?.class_name || fallbackClassName;
      const studentId = worker?.student_id || fallbackId;
      if (!className || !studentId || !rosterKeys.has(`${lookupKey(className)}:${lookupKey(studentId)}`)) return;
      attendanceWorkers.push({ class_name: className, student_id: studentId });
      const workerIds = attendanceWorkerIdsByClass.get(className) ?? new Set<string>();
      workerIds.add(studentId);
      attendanceWorkerIdsByClass.set(className, workerIds);
    };

    workerNames.forEach((name) => {
      const worker = findWorker(name, null);
      addWorker(worker, null, '');
    });
    attendanceSchedules.forEach((schedule) => {
      const checkerKey = lookupKey(schedule.checker_name) || lookupKey(schedule.checker_phone);
      if (!checkerKey) return;
      addWorker(
        findWorker(schedule.checker_name, schedule.checker_phone),
        schedule.class_name,
        'attendance-schedule:' + (schedule.id || checkerKey),
      );
    });

    const data = summarizeClassAttendance(
      roster,
      approvedLeaves,
      attendance as RecordedClassAttendance[],
      attendanceWorkers,
    ).map((row) => ({
      ...row,
      attendance_worker_count: attendanceWorkerIdsByClass.get(row.class_name)?.size ?? 0,
    }));

    return NextResponse.json({ success: true, date: requestedDate, data });
  } catch (error) {
    console.error('班级考勤统计查询失败:', error);
    return NextResponse.json({ success: false, error: '班级考勤统计暂时无法加载' }, { status: 500 });
  }
}
