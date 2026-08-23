/**
 * 部门负责人自动权限组。
 *
 * 与后端 src/lib/auth.ts 共用同一份配置，前端在拿不到后端
 * calculateUserPermissions 计算结果的场景下，用本函数把“部门自动权限”
 * 合并到数据库原始 can_* 字段上。
 *
 * 规则：
 * - admin 角色直接拥有全部权限
 * - leader 角色按 department 自动获得该部门默认权限组
 * - 其他情况只认数据库原始 can_* 字段（管理员手动勾选）
 */

export type PermissionKey =
  | 'canPublish'
  | 'canScore'
  | 'canSubmitActivity'
  | 'canViewSubmissionStatus'
  | 'canSubmitScoring'
  | 'canReviewLeave'
  | 'canViewEveningStudy'
  | 'canStartGroupLeave'
  | 'canManageAttendanceWork'
  | 'canUploadLeave'
  | 'canQueryLeave'
  | 'canManageOriginalLeave';

export const DEPARTMENT_AUTO_PERMISSIONS: Record<string, Partial<Record<PermissionKey, boolean>>> = {
  // 注意：部门名称必须与用户管理/前端文案一致，否则自动权限不会命中。
  学习竞技部: {
    canUploadLeave: true,
    canStartGroupLeave: true,
    canReviewLeave: true,
    canQueryLeave: true,
    canManageOriginalLeave: true,
    canManageAttendanceWork: true,
    canViewEveningStudy: true,
  },
  第二课堂认证中心: {
    canPublish: true,
    canScore: true,
    canSubmitScoring: true,
    canViewSubmissionStatus: true,
    canSubmitActivity: true,
  },
};

/**
 * 解析 users.permission_overrides 存的 JSON：{"canUploadLeave": false}。
 * 管理员对某个部门负责人做的“手动覆盖”会记录在这里，优先级高于部门自动权限。
 */
export function parsePermissionOverrides(
  value: string | null | undefined,
): Partial<Record<PermissionKey, boolean>> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Partial<Record<PermissionKey, boolean>> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'boolean') result[key as PermissionKey] = val;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * 计算“部门负责人自动权限”部分（不含 admin 是否 all-true）。
 */
export function computeDepartmentAutoPerms(
  role: string | null | undefined,
  department: string | null | undefined,
): Partial<Record<PermissionKey, boolean>> {
  if (role !== 'leader') return {};
  const dept = (department || '').trim();
  return DEPARTMENT_AUTO_PERMISSIONS[dept] || {};
}

export interface PermissionUser {
  role?: string | null;
  department?: string | null;
  permissionOverrides?: string | null;
  canPublish?: boolean | null;
  canScore?: boolean | null;
  canSubmitActivity?: boolean | null;
  canViewSubmissionStatus?: boolean | null;
  canSubmitScoring?: boolean | null;
  canReviewLeave?: boolean | null;
  canViewEveningStudy?: boolean | null;
  canStartGroupLeave?: boolean | null;
  canManageAttendanceWork?: boolean | null;
  canUploadLeave?: boolean | null;
  canQueryLeave?: boolean | null;
  canManageOriginalLeave?: boolean | null;
}

/**
 * 判断某个权限是否对该用户开放：
 * admin → true；否则 “管理员手动覆盖” > “部门自动权限” > “数据库手动勾选”。
 */
export function hasPermission(user: PermissionUser | null | undefined, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const overrides = parsePermissionOverrides(user.permissionOverrides);
  if (typeof overrides[key] === 'boolean') return overrides[key]!;
  const auto = computeDepartmentAutoPerms(user.role, user.department);
  if (auto[key]) return true;
  return Boolean(user[key]);
}

/**
 * 判断某个权限是否由“部门自动权限”提供（仅用于管理端展示）。
 */
export function isDepartmentAutoPermission(
  user: PermissionUser | null | undefined,
  key: PermissionKey,
): boolean {
  if (!user) return false;
  return computeDepartmentAutoPerms(user.role, user.department)[key] === true;
}

/**
 * 判断某个权限是否存在管理员手动覆盖（在 permission_overrides 里显式记录）。
 */
export function hasPermissionOverride(
  user: PermissionUser | null | undefined,
  key: PermissionKey,
): boolean {
  if (!user) return false;
  return typeof parsePermissionOverrides(user.permissionOverrides)[key] === 'boolean';
}

/**
 * 返回用户通过“部门自动权限”获得的所有权限 key（仅用于管理端展示）。
 */
export function getDepartmentAutoPermissionKeys(user: PermissionUser | null | undefined): PermissionKey[] {
  if (!user) return [];
  return (Object.keys(computeDepartmentAutoPerms(user.role, user.department)) as PermissionKey[]).filter(
    (key) => computeDepartmentAutoPerms(user.role, user.department)[key] === true,
  );
}
