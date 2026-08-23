import { computeDepartmentAutoPerms, parsePermissionOverrides } from '@/lib/department-permissions';

export type ActivityLeaderScope = {
  type: 'department' | 'class';
  name: string;
};

export type ActivityLeaderCandidate = {
  role?: string | null;
  department?: string | null;
  class_name?: string | null;
  can_submit_activity?: boolean | null;
  can_submit_scoring?: boolean | null;
  permission_overrides?: string | null;
};

function belongsToSelectedScope(candidate: ActivityLeaderCandidate, scopes: ActivityLeaderScope[]) {
  return scopes.some((scope) => scope.type === 'department'
    ? candidate.department === scope.name
    : candidate.class_name === scope.name);
}

function hasSubmitOrScoringPermission(candidate: ActivityLeaderCandidate) {
  if (candidate.role === 'admin') return true;
  const overrides = parsePermissionOverrides(candidate.permission_overrides);
  if (typeof overrides.canSubmitActivity === 'boolean') return overrides.canSubmitActivity;
  if (typeof overrides.canSubmitScoring === 'boolean') return overrides.canSubmitScoring;
  const auto = computeDepartmentAutoPerms(candidate.role, candidate.department);
  return candidate.can_submit_activity === true
    || candidate.can_submit_scoring === true
    || auto.canSubmitActivity === true
    || auto.canSubmitScoring === true;
}

export function canSelectActivityLeader(candidate: ActivityLeaderCandidate, scopes: ActivityLeaderScope[]) {
  if (!scopes.length) return false;

  if (scopes[0].type === 'department') {
    return candidate.role === 'admin'
      || (candidate.role === 'leader' && belongsToSelectedScope(candidate, scopes));
  }

  return belongsToSelectedScope(candidate, scopes)
    && (candidate.role === 'admin' || hasSubmitOrScoringPermission(candidate));
}
