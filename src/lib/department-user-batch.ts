import { isDepartmentAutoPermission, type PermissionKey } from '@/lib/department-permissions';
import {
  canManageTargetUser,
  getEditablePermissionKeys,
  type DepartmentUserIdentity,
  type DepartmentUserManagementDepartment,
  type DepartmentUserTarget,
} from '@/lib/department-user-management';

/** 单次批量设置的人数上限，避免一次请求改动过多账号。 */
export const BATCH_PERMISSION_USER_LIMIT = 200;

export type BatchPermissionChange = { key: PermissionKey; value: boolean };

export type BatchPermissionUpdate = {
  userId: string;
  changes: BatchPermissionChange[];
};

export type BatchPermissionPlan =
  | { ok: true; updates: BatchPermissionUpdate[]; skippedUserIds: string[] }
  | { ok: false; error: string };

/**
 * 计算批量权限更新的落库计划。
 *
 * 规则：
 * - 只允许修改当前管理范围可编辑的权限键；
 * - 部门自动授予的权限对目标用户不可编辑，会被跳过而不是报错；
 * - 任何人都不能批量改动自己或管理员账号（由 canManageTargetUser 保证）。
 */
export function buildBatchPermissionPlan(input: {
  manager: DepartmentUserIdentity;
  managedDepartment: DepartmentUserManagementDepartment;
  targets: DepartmentUserTarget[];
  permissions: Record<string, unknown>;
}): BatchPermissionPlan {
  const requested = Object.entries(input.permissions);
  if (!requested.length) return { ok: false, error: '请选择要批量设置的权限' };
  const invalid = requested.find(([, value]) => typeof value !== 'boolean');
  if (invalid) return { ok: false, error: '权限取值必须是布尔值' };

  const seen = new Set<string>();
  const targets = input.targets.filter((target) => {
    if (!target || typeof target.id !== 'string' || !target.id || seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });
  if (!targets.length) return { ok: false, error: '请选择要批量设置的用户' };
  if (targets.length > BATCH_PERMISSION_USER_LIMIT) {
    return { ok: false, error: `单次最多批量设置 ${BATCH_PERMISSION_USER_LIMIT} 个用户` };
  }
  if (targets.some((target) => !canManageTargetUser(input.manager, target, input.managedDepartment))) {
    return { ok: false, error: '所选用户中包含无权管理的账号' };
  }

  const updates: BatchPermissionUpdate[] = [];
  const skippedUserIds: string[] = [];
  for (const target of targets) {
    const editable = new Set(getEditablePermissionKeys(input.manager, target, input.managedDepartment));
    const changes = requested
      // 部门自动授予的权限改了也不生效，直接跳过，避免出现关了但还是有权限的假象。
      .filter(([key]) => editable.has(key as PermissionKey) && !isDepartmentAutoPermission(target, key as PermissionKey))
      .map(([key, value]) => ({ key: key as PermissionKey, value: value as boolean }));
    if (changes.length) updates.push({ userId: target.id, changes });
    else skippedUserIds.push(target.id);
  }
  if (!updates.length) return { ok: false, error: '所选权限对这些用户都不可修改（可能已由部门自动授予）' };
  return { ok: true, updates, skippedUserIds };
}