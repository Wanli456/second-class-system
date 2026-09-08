import type { DatabaseClient } from '@/storage/database/supabase-client';

export class ActivityImageError extends Error {}

export async function requireActivityImage(client: DatabaseClient, value: unknown, user: { id: string; role: string }): Promise<string> {
  if (typeof value !== 'string' || !/^\/uploads\/[\w.-]+\.(?:jpe?g|png|gif|webp|bmp)$/i.test(value)) {
    throw new ActivityImageError('请上传活动图片（JPG、PNG、GIF、WebP 或 BMP）');
  }
  // 与文件清理共用行锁，避免在清理已选中文件时创建新的业务引用。
  const asset = (await client.query<{ uploaded_by_user_id: string | null; purpose: string }>(
    'SELECT uploaded_by_user_id,purpose FROM upload_assets WHERE url=$1 FOR UPDATE', [value],
  )).rows[0];
  if (!asset || !['activity', 'admin'].includes(asset.purpose) || (user.role !== 'admin' && asset.uploaded_by_user_id !== user.id)) {
    throw new ActivityImageError('活动图片无效，请使用本人上传的活动图片');
  }
  if ((await client.query('SELECT id FROM file_cleanup_jobs WHERE asset_url=$1', [value])).rows.length) {
    throw new ActivityImageError('活动图片正在清理，请重新上传');
  }
  return value;
}
