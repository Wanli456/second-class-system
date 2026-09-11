import { query, queryOne } from '@/storage/database/supabase-client';
import { processEmailDeliveries } from '@/lib/email-delivery';

/** 写入站内通知；若该用户绑定了邮箱，同时入队一封邮件。 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  content: string,
  relatedId?: string,
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, content, related_id) VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, content, relatedId || null],
    );
    const user = await queryOne<{ email: string | null }>('SELECT email FROM users WHERE id=$1', [userId]);
    if (user?.email) {
      await query(
        'INSERT INTO email_deliveries (user_id, recipient_email, subject, content) VALUES ($1, $2, $3, $4)',
        [userId, user.email, title, content],
      );
    }
    // 邮件失败只影响邮件本身，不能把已经写入的站内通知当成失败。
    try {
      await processEmailDeliveries(5);
    } catch (error) {
      console.error('邮件投递失败:', error);
    }
    return true;
  } catch (error) {
    console.error('创建通知失败:', error);
    return false;
  }
}

/**
 * 任务被处理后，把相关待处理通知的内容改成处理结果，并标记为已处理。
 *
 * 这样同一个待办如果别人先处理了，通知里会直接显示已由 XXX 处理，
 * 不用再点进去看。
 */
export async function resolveNotifications(input: {
  relatedIds: Array<string | null | undefined>;
  types: string[];
  title: string;
  content: string;
}): Promise<void> {
  const ids = [...new Set(input.relatedIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length || !input.types.length) return;
  const idPlaceholders = ids.map((_, index) => '$' + (index + 1)).join(',');
  const typePlaceholders = input.types.map((_, index) => '$' + (ids.length + index + 1)).join(',');
  const titleIndex = ids.length + input.types.length + 1;
  const contentIndex = titleIndex + 1;
  try {
    await query(
      `UPDATE notifications SET title=$${titleIndex}, content=$${contentIndex}, status='已处理'
       WHERE related_id IN (${idPlaceholders}) AND type IN (${typePlaceholders})`,
      [...ids, ...input.types, input.title, input.content],
    );
  } catch (error) {
    console.error('更新通知状态失败:', error);
  }
}