import { NextRequest, NextResponse } from 'next/server';
import {
  summarizeClassAttendance,
  type ApprovedLeaveStudent,
  type ClassRosterStudent,
  type RecordedClassAttendance,
} from '@/lib/class-attendance-summary';
import { query } from '@/storage/database/supabase-client';

interface AttendanceDateRow {
  class_name: string | null;
  total_count: number | null;
  present_count: number | null;
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestedDate = new URL(request.url).searchParams.get('date')?.trim() || businessToday();
  if (!isValidDate(requestedDate)) {
    return NextResponse.json({ success: false, error: '日期格式无效，应为 YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const followingDate = nextDate(requestedDate);
    const [roster, users, approvedLeaves, attendance] = await Promise.all([
      query<ClassRosterStudent>(
        'SELECT class_name, student_id FROM class_roster WHERE class_name IS NOT NULL AND class_name <> \'\' AND student_id IS NOT NULL AND student_id <> \'\'',
      ),
      query<ClassRosterStudent>(
        'SELECT class_name, student_id FROM users WHERE class_name IS NOT NULL AND class_name <> \'\' AND student_id IS NOT NULL AND student_id <> \'\'',
      ),
      query<ApprovedLeaveStudent>(
        'SELECT students.class_name, students.student_id FROM leave_slip_students students INNER JOIN leave_slips slips ON slips.id = students.slip_id WHERE slips.review_status = \'已通过\' AND COALESCE(slips.start_time, slips.created_at) < $2 AND COALESCE(slips.end_time, slips.start_time, slips.created_at) >= $1',
        [requestedDate + 'T00:00:00.000Z', followingDate + 'T00:00:00.000Z'],
      ),
      query<AttendanceDateRow>(
        'SELECT class_name, total_count, present_count FROM evening_study_attendance WHERE date = $1 ORDER BY class_name, created_at DESC',
        [requestedDate],
      ),
    ]);

    const data = summarizeClassAttendance(
      [...roster, ...users],
      approvedLeaves,
      attendance as RecordedClassAttendance[],
    );

    return NextResponse.json({ success: true, date: requestedDate, data });
  } catch (error) {
    console.error('班级考勤统计查询失败:', error);
    return NextResponse.json({ success: false, error: '班级考勤统计暂时无法加载' }, { status: 500 });
  }
}
