import type { AuthUser } from '@/lib/auth';
import { computeDepartmentAutoPerms, parsePermissionOverrides, type PermissionKey } from '@/lib/department-permissions';
import type { DatabaseClient } from '@/storage/database/supabase-client';
import { getBusinessDate } from './business-time';

export type ActivityScope = 'department' | 'class';

export type AdminWorkspaceTab = 'activities' | 'review' | 'scoring' | 'leave' | 'users';

export interface ActivityScopeAssignment {
  type: ActivityScope;
  name: string;
}

export function getBusinessYearMonth(date = new Date()): string {
  return getBusinessDate(date).slice(0, 7).replace('-', '');
}

export function formatActivityId(yearMonth: string, sequence: number): string {
  if (!/^\d{6}$/.test(yearMonth) || !Number.isInteger(sequence) || sequence < 1) {
    throw new Error('活动编号参数无效');
  }
  return `EK${yearMonth}${String(sequence).padStart(3, '0')}`;
}

export async function nextActivityId(client: DatabaseClient, date = new Date()): Promise<string> {
  const yearMonth = getBusinessYearMonth(date);
  const existingIds = await client.query<{ id: string }>('SELECT id FROM activities WHERE id LIKE $1', [`EK${yearMonth}%`]);
  const maxExistingSequence = existingIds.rows.reduce((max, row) => {
    const match = /^EK\d{6}(\d+)$/.exec(row.id);
    const sequence = match ? Number(match[1]) : 0;
    return Number.isInteger(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  await client.query(
    `INSERT INTO activity_id_counters (year_month,next_number) VALUES ($1,$2)
     ON CONFLICT (year_month) DO NOTHING`,
    [yearMonth, maxExistingSequence + 1],
  );
  const counter = await client.query<{ next_number: number }>(
    `UPDATE activity_id_counters SET next_number=next_number+1
     WHERE year_month=$1 RETURNING next_number`,
    [yearMonth],
  );
  const nextNumber = Number(counter.rows[0]?.next_number);
  if (!Number.isInteger(nextNumber) || nextNumber < 2) throw new Error('活动编号计数器初始化失败');
  return formatActivityId(yearMonth, nextNumber - 1);
}

export function normalizeIds(value: unknown): string[] {
  let values: unknown[] = [];
  if (Array.isArray(value)) values = value;
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      values = Array.isArray(parsed) ? parsed : value.split(',');
    } catch {
      values = value.split(',');
    }
  }
  return [...new Set(values.map((id) => String(id).trim()).filter(Boolean))];
}

export function serializeIds(ids: string[]) {
  return JSON.stringify([...new Set(ids)].filter(Boolean));
}

export function normalizeScopes(value: unknown, legacyType?: string | null, legacyName?: string | null): ActivityScopeAssignment[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  const scopes = Array.isArray(parsed)
    ? parsed.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as { type?: unknown; name?: unknown };
        return candidate.type === 'department' || candidate.type === 'class'
          ? [{ type: candidate.type, name: String(candidate.name || '').trim() } as ActivityScopeAssignment]
          : [];
      })
    : [];
  if (scopes.length) return dedupeScopes(scopes);
  if ((legacyType === 'department' || legacyType === 'class') && legacyName?.trim()) {
    return [{ type: legacyType, name: legacyName.trim() }];
  }
  return [];
}

export function serializeScopes(scopes: ActivityScopeAssignment[]) {
  return JSON.stringify(dedupeScopes(scopes).filter((scope) => scope.name));
}

export function getActivityScopes(row: { scope_names?: unknown; scope_type?: string | null; scope_name?: string | null }) {
  return normalizeScopes(row.scope_names, row.scope_type, row.scope_name);
}

export function formatActivityScopes(row: { scope_names?: unknown; scope_type?: string | null; scope_name?: string | null }) {
  const scopes = getActivityScopes(row);
  const host = scopes[0];
  if (!host) return '-';
  const hostLabel = `主办单位：${host.name}`;
  const coHosts = scopes.slice(1).map((scope) => scope.name);
  return coHosts.length ? `${hostLabel}；联办单位：${coHosts.join('、')}` : hostLabel;
}

export function validateScopes(scopes: ActivityScopeAssignment[]) {
  const normalized = dedupeScopes(scopes).filter((scope) => scope.name);
  if (!normalized.length) return { valid: false, error: '至少选择一个活动所属部门或班级' };
  if (new Set(normalized.map((scope) => scope.type)).size > 1) return { valid: false, error: '活动只能联办多个部门或多个班级，不能混合选择' };
  return { valid: true, error: null };
}

export function validateHostingScope(user: ScopedUser, scopes: ActivityScopeAssignment[]) {
  const validation = validateScopes(scopes);
  if (!validation.valid) return validation;
  const host = scopes[0];
  const ownsHost = host.type === 'department'
    ? user.department === host.name
    : user.class_name === host.name;
  if (!ownsHost) {
    return { valid: false, error: '主办单位必须是你所属的部门或班级' };
  }
  return { valid: true, error: null };
}

type RawPermissionUser = Pick<AuthUser,
  | 'role'
  | 'department'
  | 'permission_overrides'
  | 'can_publish'
  | 'can_score'
  | 'can_submit_activity'
  | 'can_view_submission_status'
  | 'can_submit_scoring'
  | 'can_register_other_college'
  | 'can_review_leave'
  | 'can_view_evening_study'
  | 'can_start_group_leave'
  | 'can_manage_attendance_work'
  | 'can_upload_leave'
  | 'can_query_leave'
  | 'can_manage_original_leave'
  | 'can_submit_original_leave'
>;

const RAW_PERMISSION_FIELD: Record<PermissionKey, keyof RawPermissionUser> = {
  canPublish: 'can_publish',
  canScore: 'can_score',
  canSubmitActivity: 'can_submit_activity',
  canViewSubmissionStatus: 'can_view_submission_status',
  canSubmitScoring: 'can_submit_scoring',
  canRegisterOtherCollege: 'can_register_other_college',
  canReviewLeave: 'can_review_leave',
  canViewEveningStudy: 'can_view_evening_study',
  canStartGroupLeave: 'can_start_group_leave',
  canManageAttendanceWork: 'can_manage_attendance_work',
  canUploadLeave: 'can_upload_leave',
  canQueryLeave: 'can_query_leave',
  canManageOriginalLeave: 'can_manage_original_leave',
  canSubmitOriginalLeave: 'can_submit_original_leave',
};

function hasEffectivePermission(user: Partial<RawPermissionUser>, key: PermissionKey): boolean {
  if (user.role === 'admin') return true;
  const overrides = parsePermissionOverrides(user.permission_overrides);
  if (typeof overrides[key] === 'boolean') return overrides[key]!;
  const auto = computeDepartmentAutoPerms(user.role, user.department);
  if (auto[key]) return true;
  return Boolean(user[RAW_PERMISSION_FIELD[key]]);
}

export function canOpenAdminTab(
  user: Pick<AuthUser, 'role' | 'department' | 'can_publish' | 'can_score' | 'can_review_leave'>,
  tab: string | null | undefined,
) {
  if (user.role === 'admin') return true;
  switch (tab) {
    case 'review': return hasEffectivePermission(user, 'canPublish');
    case 'scoring': return hasEffectivePermission(user, 'canScore');
    case 'leave': return hasEffectivePermission(user, 'canReviewLeave');
    default: return false;
  }
}

export function scopeMatchesUser(user: ScopedUser, scopes: ActivityScopeAssignment[]) {
  if (user.role === 'admin') return true;
  return scopes.some((scope) => userScope(user, scope.type, scope.name));
}

export function hasAnyScopePermission(user: AuthUser, permission: 'submitActivity' | 'submitScoring', scopes: ActivityScopeAssignment[]) {
  const key = permission === 'submitActivity' ? 'canSubmitActivity' : 'canSubmitScoring';
  return hasEffectivePermission(user, key) && scopeMatchesUser(user, scopes);
}

function dedupeScopes(scopes: ActivityScopeAssignment[]) {
  return [...new Map(scopes.map((scope) => [`${scope.type}:${scope.name}`, scope])).values()];
}

type ScopedUser = Pick<AuthUser, 'role' | 'department' | 'class_name'>;

export function userScope(user: ScopedUser, scopeType: ActivityScope, scopeName: string | null | undefined) {
  if (user.role === 'admin') return true;
  if (!scopeName) return false;
  return scopeType === 'class'
    ? user.class_name === scopeName
    : user.department === scopeName;
}

export function validateActivityTimes(input: {
  start_time: unknown;
  end_time: unknown;
  registration_start_time: unknown;
  registration_end_time: unknown;
}): { valid: boolean; error?: string } {
  const start = new Date(String(input.start_time)).getTime();
  const end = new Date(String(input.end_time)).getTime();
  const registrationStart = new Date(String(input.registration_start_time)).getTime();
  const registrationEnd = new Date(String(input.registration_end_time)).getTime();
  if ([start, end, registrationStart, registrationEnd].some((value) => Number.isNaN(value))) {
    return { valid: false, error: '活动时间格式不正确' };
  }
  if (end <= start) return { valid: false, error: '活动结束时间必须晚于开始时间' };
  if (registrationStart > registrationEnd) return { valid: false, error: '活动报名开始时间不能晚于报名结束时间' };
  if (registrationEnd > start) return { valid: false, error: '活动报名结束时间不能晚于活动开始时间' };
  return { valid: true };
}
