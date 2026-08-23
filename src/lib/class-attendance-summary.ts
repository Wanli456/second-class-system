export interface ClassRosterStudent {
  class_name: string | null;
  student_id: string | null;
}
export interface ApprovedLeaveStudent {
  class_name: string | null;
  student_id: string | null;
}

export interface RecordedClassAttendance {
  class_name: string | null;
  total_count: number | null;
  present_count: number | null;
}

export type PresentCountSource = 'recorded' | 'auto';

export interface ClassAttendanceSummary {
  class_name: string;
  expected_count: number;
  present_count: number;
  leave_count: number;
  present_source: PresentCountSource;
}

function normalized(value: string | null): string {
  return value?.trim() || '';
}

function addStudent(
  target: Map<string, Set<string>>,
  className: string | null,
  studentId: string | null,
): void {
  const normalizedClassName = normalized(className);
  const normalizedStudentId = normalized(studentId);
  if (!normalizedClassName || !normalizedStudentId) return;

  const students = target.get(normalizedClassName) ?? new Set<string>();
  students.add(normalizedStudentId);
  target.set(normalizedClassName, students);
}

function safeCount(value: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function summarizeClassAttendance(
  roster: ClassRosterStudent[],
  approvedLeaves: ApprovedLeaveStudent[],
  recordedAttendance: RecordedClassAttendance[],
  attendanceWorkers: ClassRosterStudent[] = [],
): ClassAttendanceSummary[] {
  const rosterByClass = new Map<string, Set<string>>();
  roster.forEach((student) => addStudent(rosterByClass, student.class_name, student.student_id));

  const leaveByClass = new Map<string, Set<string>>();
  approvedLeaves.forEach((student) => addStudent(leaveByClass, student.class_name, student.student_id));

  const workerByClass = new Map<string, Set<string>>();
  attendanceWorkers.forEach((student) => addStudent(workerByClass, student.class_name, student.student_id));

  const recordedByClass = new Map<string, RecordedClassAttendance>();
  recordedAttendance.forEach((attendance) => {
    const className = normalized(attendance.class_name);
    if (className && !recordedByClass.has(className)) recordedByClass.set(className, attendance);
  });

  const classNames = new Set<string>([
    ...rosterByClass.keys(),
    ...leaveByClass.keys(),
    ...recordedByClass.keys(),
  ]);

  return [...classNames].sort((left, right) => left.localeCompare(right, 'zh-CN')).map((className) => {
    const expectedCount = rosterByClass.get(className)?.size ?? 0;
    const rosterIds = rosterByClass.get(className) ?? new Set<string>();
    const leaveCount = leaveByClass.get(className)?.size ?? 0;
    const attendanceWorkerCount = [...(workerByClass.get(className) ?? new Set<string>())].filter((studentId) => rosterIds.has(studentId)).length;
    const recorded = recordedByClass.get(className);

    if (recorded) {
      return {
        class_name: className,
        expected_count: expectedCount,
        present_count: safeCount(recorded.present_count),
        leave_count: leaveCount,
        present_source: 'recorded' as const,
      };
    }

    return {
      class_name: className,
      expected_count: expectedCount,
      present_count: Math.max(0, expectedCount - leaveCount - attendanceWorkerCount),
      leave_count: leaveCount,
      present_source: 'auto' as const,
    };
  });
}
