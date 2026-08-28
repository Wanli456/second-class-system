const WEEKDAYS = new Set(['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']);
const DISCIPLINE_STATUSES = new Set(['优秀', '良好', '一般', '较差']);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function date(value: unknown): string {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return '';
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return parsed.toISOString().slice(0, 10) === candidate ? candidate : '';
}

function integer(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function validateEveningSchedule(data: Record<string, unknown>): string | null {
  if (!date(data.date)) return '日期必须是有效的 YYYY-MM-DD';
  if (!WEEKDAYS.has(text(data.weekday))) return '星期取值不正确';
  if (!text(data.class_name) || !text(data.classroom)) return '班级和教室不能为空';
  return null;
}

export function validateEveningAttendance(data: Record<string, unknown>): { error: string | null; absentCount: number | null } {
  if (!text(data.schedule_id) || !date(data.date) || !text(data.class_name) || !text(data.checker_name)) {
    return { error: '考勤安排、日期、班级和检查人员不能为空', absentCount: null };
  }
  const totalCount = integer(data.total_count);
  const presentCount = integer(data.present_count);
  const absentCount = data.absent_count === undefined || data.absent_count === null
    ? (totalCount !== null && presentCount !== null ? totalCount - presentCount : null)
    : integer(data.absent_count);
  if (totalCount === null || presentCount === null || absentCount === null) {
    return { error: '人数必须是非负整数', absentCount: null };
  }
  if (totalCount < 1 || presentCount > totalCount || absentCount > totalCount || presentCount + absentCount !== totalCount) {
    return { error: '应到、实到和缺勤人数不一致', absentCount: null };
  }
  if (!DISCIPLINE_STATUSES.has(text(data.discipline_status || '良好'))) return { error: '纪律状况取值不正确', absentCount: null };
  return { error: null, absentCount };
}
