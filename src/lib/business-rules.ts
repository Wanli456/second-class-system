import { randomUUID } from 'crypto';
import type { AuthUser } from '@/lib/auth';
import { computeDepartmentAutoPerms, parsePermissionOverrides, type PermissionKey } from '@/lib/department-permissions';

export type ActivityScope = 'department' | 'class';

export type AdminWorkspaceTab = 'activities' | 'review' | 'scoring' | 'leave' | 'users';

export interface ActivityScopeAssignment {
  type: ActivityScope;
  name: string;
}

export function newActivityId() {
  const now = new Date();
  const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `EK${month}${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

export function normalizeIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value.split(',').map((id) => id.trim()).filter(Boolean);
    }
  }
  return [];
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

export function canStartGroupLeave(user: Pick<AuthUser, 'role' | 'department' | 'can_start_group_leave' | 'class_name'>) {
  return Boolean(user.class_name) && hasEffectivePermission(user, 'canStartGroupLeave');
}

export function canManageAttendanceWork(user: Pick<AuthUser, 'role' | 'department' | 'can_manage_attendance_work'>) {
  return hasEffectivePermission(user, 'canManageAttendanceWork');
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

export function canResubmitGroupLeave(
  userId: string,
  group: { applicant_user_id?: string | null; review_status?: string | null },
) {
  return group.applicant_user_id === userId && group.review_status !== '已通过';
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

export function includeApplicantStudent(studentIds: string[], applicantStudentId: string | null | undefined) {
  return [...new Set([...studentIds, applicantStudentId || ''].filter(Boolean))];
}

export function selectAllClassStudents(
  classMembers: Array<{ student_id: string }>,
  applicantStudentId: string | null | undefined,
) {
  return includeApplicantStudent(classMembers.map((member) => member.student_id), applicantStudentId);
}

type ScopedUser = Pick<AuthUser, 'role' | 'department' | 'class_name'>;

export function userScope(user: ScopedUser, scopeType: ActivityScope, scopeName: string | null | undefined) {
  if (user.role === 'admin') return true;
  if (!scopeName) return false;
  return scopeType === 'class'
    ? user.class_name === scopeName
    : user.department === scopeName;
}

export function hasScopePermission(user: AuthUser, permission: 'submitActivity' | 'submitScoring', scopeType: ActivityScope, scopeName: string | null | undefined) {
  const key = permission === 'submitActivity' ? 'canSubmitActivity' : 'canSubmitScoring';
  return hasEffectivePermission(user, key) && userScope(user, scopeType, scopeName);
}

export function parseDateOnly(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
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
