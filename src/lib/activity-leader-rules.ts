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
};

function belongsToSelectedScope(candidate: ActivityLeaderCandidate, scopes: ActivityLeaderScope[]) {
  return scopes.some((scope) => scope.type === 'department'
    ? candidate.department === scope.name
    : candidate.class_name === scope.name);
}

export function canSelectActivityLeader(candidate: ActivityLeaderCandidate, scopes: ActivityLeaderScope[]) {
  if (!scopes.length) return false;

  if (scopes[0].type === 'department') {
    return candidate.role === 'admin'
      || (candidate.role === 'leader' && belongsToSelectedScope(candidate, scopes));
  }

  return belongsToSelectedScope(candidate, scopes) && (candidate.role === 'admin'
    || candidate.can_submit_activity === true
    || candidate.can_submit_scoring === true);
}
