import { calculateUserPermissions } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import { query } from '@/storage/database/supabase-client';
import { createNotification } from '@/lib/notifications';
import type { PermissionKey } from '@/lib/department-permissions';

/**
 * 通知所有拥有对应权限的成员。
 *
 * 注意：这里**不能**再按活动主办范围过滤。
 * 活动审核权限 / 活动赋分权限是独立授予的能力，持有者不一定属于该活动的主办部门或班级
 * （例如认证中心统一处理全校二课业务），所以他们同样需要收到待办通知。
 */
export async function notifyPermissionHolders(input: {
  permission: PermissionKey;
  type: string;
  title: string;
  content: string;
  relatedId: string;
}): Promise<number> {
  const users = await query<AuthUser>('SELECT * FROM users');
  const ids = [...new Set(
    users
      .filter((user) => calculateUserPermissions(user)[input.permission] === true)
      .map((user) => user.id),
  )];
  for (const id of ids) {
    await createNotification(id, input.type, input.title, input.content, input.relatedId);
  }
  return ids.length;
}