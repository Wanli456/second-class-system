import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/storage/database/supabase-client";
import { requireUser } from "@/lib/auth";

// GET /api/notifications - 获取用户通知列表
// PUT /api/notifications - 标记通知为已读
// DELETE /api/notifications - 删除通知
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
      unreadCount: parseInt(String(unreadResult?.count || 0), 10) || 0,
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

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const { notificationId, userId, deleteAll } = body;

    if (deleteAll && userId === auth.user!.id) {
      await query('DELETE FROM notifications WHERE user_id = $1', [userId]);
      return NextResponse.json({ success: true, message: '已清空通知' });
    }

    if (notificationId) {
      const deleted = await query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
        [notificationId, auth.user!.id]
      );
      if (!deleted.length) {
        return NextResponse.json({ success: false, error: '通知不存在' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: '通知已删除' });
    }

    return NextResponse.json({ success: false, error: '缺少删除参数' }, { status: 400 });
  } catch (error) {
    console.error('删除通知失败:', error);
    return NextResponse.json({ success: false, error: '删除通知失败' }, { status: 500 });
  }
}
