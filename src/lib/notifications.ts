import { query } from "@/storage/database/supabase-client";

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  content: string,
  relatedId?: string
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, content, related_id) VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, content, relatedId || null]
    );
    return true;
  } catch (error) {
    console.error("创建通知失败:", error);
    return false;
  }
}
