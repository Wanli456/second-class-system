import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureDatabaseSchema, withTransaction } from '@/storage/database/supabase-client';
import { writeAuditLog } from '@/lib/audit-log';

/**
 * 用户自行维护通知邮箱（只允许 QQ 邮箱）。
 *
 * QQQQ 的送达率最高，免费 SMTP 也最省事；部门负责人强制要求填写。
 */
export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requireUser(request);
    if (auth.response) return auth.response;

    const { email } = await request.json();
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) {
      if (auth.user!.role === 'leader') {
        return NextResponse.json({ success: false, error: '部门负责人必须填写通知邮箱，方便接收审核与赋分通知' }, { status: 400 });
      }
      await withTransaction(async (client) => {
        await client.query('UPDATE users SET email=NULL WHERE id=$1', [auth.user!.id]);
        await writeAuditLog({ actor: auth.user!, action: 'update_own_email', resourceType: 'user', resourceId: auth.user!.id }, client);
      });
      return NextResponse.json({ success: true, data: { email: null } });
    }
    if (!/^[0-9a-z._-]+@qq\.com$/.test(normalized)) {
      return NextResponse.json({ success: false, error: '请填写 QQ 邮箱地址（例如 123456789@qq.com）' }, { status: 400 });
    }

    try {
      await withTransaction(async (client) => {
        const updated = await client.query<{ id: string }>(
          'UPDATE users SET email=$1 WHERE id=$2 RETURNING id',
          [normalized, auth.user!.id],
        );
        if (!updated.rows[0]) throw new Error('USER_NOT_FOUND');
        await writeAuditLog({ actor: auth.user!, action: 'update_own_email', resourceType: 'user', resourceId: auth.user!.id }, client);
      });
    } catch (error) {
      if (error instanceof Error && /unique|users_email_unique_idx/i.test(error.message)) {
        return NextResponse.json({ success: false, error: '该邮箱已被其他账号绑定' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ success: true, data: { email: normalized } });
  } catch (error) {
    console.error('Failed to update own email:', error);
    return NextResponse.json({ success: false, error: '邮箱保存失败' }, { status: 500 });
  }
}