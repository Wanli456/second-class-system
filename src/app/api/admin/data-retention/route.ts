import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { disposeRegisteredUser, previewDataRetention, runDataRetention } from '@/lib/data-retention';
import { ensureDatabaseSchema } from '@/storage/database/supabase-client';

type RetentionAction = 'preview' | 'execute' | 'graduation';

function parseAction(value: unknown): RetentionAction | null {
  if (value === undefined || value === 'preview') return 'preview';
  return value === 'execute' || value === 'graduation' ? value : null;
}

function parseLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  await ensureDatabaseSchema();

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求 JSON 格式无效' }, { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    return NextResponse.json({ success: false, error: '请求体必须是 JSON 对象' }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;
  const action = parseAction(body.action);
  if (!action) return NextResponse.json({ success: false, error: '不支持的清理操作' }, { status: 400 });

  if (action === 'preview') {
    const data = await previewDataRetention({ limit: parseLimit(body.limit) });
    return NextResponse.json({ success: true, mode: 'preview', data });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ success: false, error: '执行清理必须显式传入 confirm=true' }, { status: 400 });
  }

  const actor = { id: auth.user!.id, username: auth.user!.username, role: auth.user!.role };
  if (action === 'graduation') {
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
    if (!targetId) return NextResponse.json({ success: false, error: '毕业处置需要 targetId' }, { status: 400 });
    const data = await disposeRegisteredUser(actor, targetId, 'graduation');
    const status = data.error === 'LAST_ADMIN' || data.error === 'REVIEW_REQUIRED' ? 409 : data.error ? 500 : 200;
    return NextResponse.json({ success: !data.error, mode: 'graduation', data }, { status });
  }

  const data = await runDataRetention({ actor, limit: parseLimit(body.limit) });
  const incomplete = data.failed.length > 0 || data.reviewRequired.length > 0;
  return NextResponse.json({ success: !incomplete, mode: 'execute', data }, { status: data.failed.length ? 500 : incomplete ? 409 : 200 });
}
