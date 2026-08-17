import { randomUUID } from 'crypto';
import type { AuthUser } from '@/lib/auth';

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
  return getActivityScopes(row)
    .map((scope) => `${scope.type === 'class' ? '班级' : '部门'}：${scope.name}`)
    .join('、') || '-';
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

export function canStartGroupLeave(user: Pick<AuthUser, 'role' | 'can_start_group_leave' | 'class_name'>) {
  return Boolean(user.class_name) && (user.role === 'admin' || user.can_start_group_leave);
}

export function canOpenAdminTab(
  user: Pick<AuthUser, 'role' | 'can_publish' | 'can_score' | 'can_review_leave'>,
  tab: string | null | undefined,
) {
  if (user.role === 'admin') return true;
  switch (tab) {
    case 'review': return user.can_publish;
    case 'scoring': return user.can_score;
    case 'leave': return user.can_review_leave;
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
  const allowed = permission === 'submitActivity' ? user.can_submit_activity : user.can_submit_scoring;
  return (user.role === 'admin' || allowed) && scopeMatchesUser(user, scopes);
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
  const allowed = permission === 'submitActivity' ? user.can_submit_activity : user.can_submit_scoring;
  return (user.role === 'admin' || allowed) && userScope(user, scopeType, scopeName);
}

export function parseDateOnly(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
