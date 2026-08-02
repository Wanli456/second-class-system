import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/storage/database/supabase-client";
import { requireUser } from "@/lib/auth";

// GET /api/notifications - 获取用户通知列表
// PUT /api/notifications - 标记通知为已读
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId || userId !== auth.user!.id) {
      return NextResponse.json({ success: false, error: "缺少用户 ID" }, { status: 400 });
    }

    // 获取用户的所有通知，按时间倒序
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );

    // 获取未读数量
    const unreadResult = await queryOne(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = 'false'`,
      [userId]
    );

    return NextResponse.json({
      success: true,
      data: result,
      unreadCount: parseInt(unreadResult.count) || 0,
    });
  } catch (error) {
    console.error("获取通知失败:", error);
    return NextResponse.json({ success: false, error: "获取通知失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const { notificationId, userId, markAllRead } = body;

    if (markAllRead && userId === auth.user!.id) {
      // 标记所有通知为已读
      await query(
        `UPDATE notifications SET is_read = 'true' WHERE user_id = $1 AND is_read = 'false'`,
        [userId]
      );
      return NextResponse.json({ success: true, message: "已全部标记为已读" });
    }

    if (notificationId) {
      // 标记单个通知为已读
      await query(
        `UPDATE notifications SET is_read = 'true' WHERE id = $1 AND user_id = $2`,
        [notificationId, auth.user!.id]
      );
      return NextResponse.json({ success: true, message: "已标记为已读" });
    }

    return NextResponse.json({ success: false, error: "缺少参数" }, { status: 400 });
  } catch (error) {
    console.error("标记已读失败:", error);
    return NextResponse.json({ success: false, error: "标记已读失败" }, { status: 500 });
  }
}

// 创建通知的辅助函数（供其他 API 调用）
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  content: string,
  relatedId?: string
) {
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

