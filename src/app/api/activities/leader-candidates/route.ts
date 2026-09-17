import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { canSelectActivityLeader } from '@/lib/activity-leader-rules';
import { hasAnyScopePermission, normalizeScopes } from '@/lib/business-rules';
import { query } from '@/storage/database/supabase-client';

type CandidateUser = {
  id: string;
  username: string;
  student_id: string;
  contact_phone: string | null;
  role: string;
  department: string | null;
  class_name: string | null;
  can_submit_activity: boolean;
  can_submit_scoring: boolean;
  permission_overrides: string | null;
};

type RosterRow = {
  id: string;
  name: string;
  student_id: string | null;
  contact_phone: string | null;
  active: boolean;
  linked_user_id: string | null;
};

export type LeaderCandidate = {
  key: string;
  type: 'user' | 'former';
  id: string;
  name: string;
  studentId: string;
  contactPhone: string | null;
  linkStatus?: 'unregistered' | 'pending' | 'linked';
};

// 活动负责人候选：主办/联办部门范围内的合格注册用户 + 启用的往届名册记录。
// 只返回选择负责人所需的必要字段，不开放完整名册或账号目录。
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'submitActivity');
  if (auth.response) return auth.response;
  const user = auth.user!;
  let scopes: ReturnType<typeof normalizeScopes> = [];
  try {
    scopes = normalizeScopes(JSON.parse(request.nextUrl.searchParams.get('scope_names') || '[]'));
  } catch {
    return NextResponse.json({ success: false, error: '主办或联办部门参数无效' }, { status: 400 });
  }
  if (!scopes.length || !hasAnyScopePermission(user, 'submitActivity', scopes)) {
    return NextResponse.json({ success: false, error: '你没有该部门或班级的活动提交权限' }, { status: 403 });
  }

  const departmentNames = scopes.filter((scope) => scope.type === 'department').map((scope) => scope.name);
  const classNames = scopes.filter((scope) => scope.type === 'class').map((scope) => scope.name);
  const params = [...departmentNames, ...classNames];
  const placeholders = params.map((_, index) => `$${index + 1}`).join(',');
  const conditions = [
    departmentNames.length ? `department IN (${departmentNames.map((_, index) => `$${index + 1}`).join(',')})` : '',
    classNames.length ? `class_name IN (${classNames.map((_, index) => `$${departmentNames.length + index + 1}`).join(',')})` : '',
  ].filter(Boolean);
  const users = (await query<CandidateUser>(
    `SELECT id, username, student_id, contact_phone, role, department, class_name, can_submit_activity, can_submit_scoring, permission_overrides FROM users WHERE ${conditions.join(' OR ')}`,
    params,
  )).filter((candidate) => canSelectActivityLeader(candidate, scopes));

  // 第一版名册只覆盖部门活动；包含班级单位时名册部分为空。
  const roster = departmentNames.length
    ? await query<RosterRow>(
      `SELECT id, name, student_id, contact_phone, active, linked_user_id FROM former_activity_leaders WHERE active=true AND department IN (${departmentNames.map((_, index) => `$${index + 1}`).join(',')})`,
      departmentNames,
    )
    : [];

  // 已确认关联：账号符合负责人资格时只按真实账号显示一次；否则仍按名册资料显示。
  const linkedIds = [...new Set(roster.map((row) => row.linked_user_id).filter(Boolean))] as string[];
  const registeredAccounts = linkedIds.length
    ? await query<{ id: string }>(`SELECT id FROM users WHERE id IN (${linkedIds.map((_, index) => `$${index + 1}`).join(',')})`, linkedIds)
    : [];
  const qualifyingUserIds = new Set(users.map((candidate) => candidate.id));
  const registeredById = new Set(registeredAccounts.map((account) => account.id));
  const skipRosterIds = new Set(roster.filter((row) => row.linked_user_id && qualifyingUserIds.has(row.linked_user_id)).map((row) => row.id));

  // 未确认关联但已存在同学号注册账号的名册记录标记为“待关联”。
  const unlinkedStudentIds = [...new Set(roster.filter((row) => !row.linked_user_id && row.student_id).map((row) => row.student_id!))];
  const pendingAccounts = unlinkedStudentIds.length
    ? await query<{ student_id: string }>(`SELECT student_id FROM users WHERE student_id IN (${unlinkedStudentIds.map((_, index) => `$${index + 1}`).join(',')})`, unlinkedStudentIds)
    : [];
  const registeredStudentIds = new Set(pendingAccounts.map((account) => account.student_id));

  const userCandidates: LeaderCandidate[] = users.map((candidate) => ({
    key: `user:${candidate.id}`,
    type: 'user' as const,
    id: candidate.id,
    name: candidate.username,
    studentId: candidate.student_id || '未填写',
    contactPhone: candidate.contact_phone || null,
  }));

  const formerCandidates: LeaderCandidate[] = roster
    .filter((row) => !skipRosterIds.has(row.id))
    .map((row) => ({
      key: `former:${row.id}`,
      type: 'former' as const,
      id: row.id,
      name: row.name,
      studentId: row.student_id || '未填写',
      contactPhone: row.contact_phone || null,
      linkStatus: row.linked_user_id && registeredById.has(row.linked_user_id)
        ? 'linked' as const
        : row.student_id && registeredStudentIds.has(row.student_id) ? 'pending' as const : 'unregistered' as const,
    }));

  return NextResponse.json({ success: true, data: { users: userCandidates, former: formerCandidates } });
}
