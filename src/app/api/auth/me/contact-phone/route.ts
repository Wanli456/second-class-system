import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureDatabaseSchema, withTransaction } from '@/storage/database/supabase-client';
import { validateContactPhoneInput } from '@/lib/contact-phone';
import { writeAuditLog } from '@/lib/audit-log';

/**
 * 用户自行维护联系方式。
 *
 * 背景：此前只有管理员能在用户管理界面代填手机号，人数一多非常麻烦。
 * 现在任何登录用户都可以在个人中心填写；部门负责人是必填（不允许清空）。
 */
export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requireUser(request);
    if (auth.response) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: '请求数据格式错误' }, { status: 400 });
    }

    const parsed = validateContactPhoneInput((body as { contactPhone?: unknown } | null)?.contactPhone);
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    if (auth.user!.role === 'leader' && !parsed.value) {
      return NextResponse.json({ success: false, error: '部门负责人必须填写联系方式，方便活动与请假工作联系' }, { status: 400 });
    }

    const updated = await withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        'UPDATE users SET contact_phone=$1 WHERE id=$2 RETURNING id',
        [parsed.value, auth.user!.id],
      );
      if (!result.rows[0]) throw new Error('USER_NOT_FOUND');
      await writeAuditLog(
        { actor: auth.user!, action: 'update_own_contact_phone', resourceType: 'user', resourceId: auth.user!.id },
        client,
      );
      return result.rows[0];
    });

    return NextResponse.json({ success: true, data: { id: updated.id, contactPhone: parsed.value } });
  } catch (error) {
    console.error('Failed to update own contact phone:', error);
    return NextResponse.json({ success: false, error: '联系方式保存失败' }, { status: 500 });
  }
}