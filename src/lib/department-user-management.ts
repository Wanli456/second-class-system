import type { PermissionKey } from '@/lib/department-permissions';

export const DEPARTMENT_USER_MANAGEMENT = {
  学习竞技部: {
    permissionKeys: [
      'canUploadLeave',
      'canStartGroupLeave',
      'canReviewLeave',
      'canQueryLeave',
      'canSubmitOriginalLeave',
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
      'canRegisterOtherCollege',
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

export function getManagedUserScope(
  user: DepartmentUserIdentity | null | undefined,
  managedDepartment?: DepartmentUserManagementDepartment,
): ManagedUserScope | null {
  if (!user || (user.role !== 'leader' && user.role !== 'admin')) return null;

  const userDepartment = normalizedDepartment(user.department) as DepartmentUserManagementDepartment;
  const department = managedDepartment || userDepartment;
  if (!(department in DEPARTMENT_USER_MANAGEMENT)) return null;

  if (user.role === 'admin') return { department };
  return userDepartment === department ? { department } : null;
}

export function isDepartmentUserManager(user: DepartmentUserIdentity | null | undefined) {
  return getManagedUserScope(user) !== null;
}

export function canManageTargetUser(
  manager: DepartmentUserIdentity | null | undefined,
  target: DepartmentUserTarget | null | undefined,
  managedDepartment?: DepartmentUserManagementDepartment,
) {
  const scope = getManagedUserScope(manager, managedDepartment);
  if (!scope || !target || !target.id || target.id === manager?.id || target.role === 'admin') return false;

  const targetDepartment = normalizedDepartment(target.department);
  if (scope.department === '学习竞技部') {
    // 学习竞技部负责维护班级负责人；目标学生不需要属于学习竞技部。
    return target.role === 'class_leader' || target.role === 'student';
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
  managedDepartment?: DepartmentUserManagementDepartment,
): PermissionKey[] {
  const scope = getManagedUserScope(manager, managedDepartment);
  if (!scope || (target && !canManageTargetUser(manager, target, managedDepartment))) return [];
  return [...DEPARTMENT_USER_MANAGEMENT[scope.department].permissionKeys];
}
