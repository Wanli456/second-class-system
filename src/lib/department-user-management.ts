import type { PermissionKey } from '@/lib/department-permissions';

export const DEPARTMENT_USER_MANAGEMENT = {
  学习竞技部: {
    permissionKeys: [
      'canUploadLeave',
      'canStartGroupLeave',
      'canReviewLeave',
      'canQueryLeave',
      'canManageOriginalLeave',
      'canManageAttendanceWork',
      'canViewEveningStudy',
    ] as PermissionKey[],
  },
  第二课堂认证中心: {
    permissionKeys: [
      'canPublish',
      'canScore',
      'canSubmitScoring',
      'canViewSubmissionStatus',
      'canSubmitActivity',
    ] as PermissionKey[],
  },
} as const;

export type DepartmentUserManagementDepartment = keyof typeof DEPARTMENT_USER_MANAGEMENT;

export interface DepartmentUserIdentity {
  id?: string | null;
  role?: string | null;
  department?: string | null;
}

export interface DepartmentUserTarget extends DepartmentUserIdentity {
  id: string;
}

export interface ManagedUserScope {
  department: DepartmentUserManagementDepartment;
}

function normalizedDepartment(department: string | null | undefined) {
  return (department || '').trim();
}

export function getManagedUserScope(user: DepartmentUserIdentity | null | undefined): ManagedUserScope | null {
  if (!user || user.role !== 'leader') return null;
  const department = normalizedDepartment(user.department) as DepartmentUserManagementDepartment;
  if (!(department in DEPARTMENT_USER_MANAGEMENT)) return null;
  return { department };
}

export function isDepartmentUserManager(user: DepartmentUserIdentity | null | undefined) {
  return getManagedUserScope(user) !== null;
}

export function canManageTargetUser(
  manager: DepartmentUserIdentity | null | undefined,
  target: DepartmentUserTarget | null | undefined,
) {
  const scope = getManagedUserScope(manager);
  if (!scope || !target || !target.id || target.id === manager?.id || target.role === 'admin') return false;

  const targetDepartment = normalizedDepartment(target.department);
  if (scope.department === '学习竞技部') {
    return targetDepartment === scope.department && (target.role === 'class_leader' || target.role === 'student');
  }

  // 认证中心可管理本部门成员，也可给其他部门负责人授予认证中心业务权限。
  return (
    (targetDepartment === scope.department && (target.role === 'class_leader' || target.role === 'student')) ||
    (target.role === 'leader' && Boolean(targetDepartment) && targetDepartment !== scope.department)
  );
}

export function getEditablePermissionKeys(
  manager: DepartmentUserIdentity | null | undefined,
  target?: DepartmentUserTarget | null,
): PermissionKey[] {
  const scope = getManagedUserScope(manager);
  if (!scope || (target && !canManageTargetUser(manager, target))) return [];
  return [...DEPARTMENT_USER_MANAGEMENT[scope.department].permissionKeys];
}
