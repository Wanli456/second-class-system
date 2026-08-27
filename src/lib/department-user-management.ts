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
    // 部门负责人统一由学习竞技部维护：无论归属哪个部门（含管理员后来归入的其他部门），
    // 学竞界面都可见可管理，便于收回身份与维护联系方式。
    if (target.role === 'leader') return true;
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

// 角色分配策略：部门用户管理里只有学习竞技部可以设定角色，
// 学习竞技部可把学生晋升为部门负责人（部门自动权限随身份生效）。
export function canAssignManagedRole(
  department: DepartmentUserManagementDepartment,
  role: string,
): boolean {
  if (department !== '学习竞技部') return false;
  return role === 'student' || role === 'class_leader' || role === 'leader';
}
