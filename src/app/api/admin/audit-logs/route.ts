import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { sanitizeAuditDetails } from '@/lib/audit-log';
import { query } from '@/storage/database/supabase-client';

type AuditLogRow = { id: string; actor_user_id: string | null; actor_name: string | null; actor_username: string | null; actor_student_id: string | null; action: string; resource_type: string; resource_id: string | null; details: unknown; created_at: Date | string };

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function parsePage(value: string | null, fallback: number, max: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= max ? parsed : null;
}

function safeResourceId(value: string | null): string | null {
  return value?.startsWith('/uploads/') ? null : value;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) {
      auth.response.headers.set('Cache-Control', 'no-store');
      return auth.response;
    }
    const params = request.nextUrl.searchParams;
    const page = parsePage(params.get('page'), 1, 100000);
    const pageSize = parsePage(params.get('pageSize'), 50, 100);
    if (page === null || pageSize === null) return NextResponse.json({ success: false, error: '分页参数无效' }, { status: 400, headers: NO_STORE_HEADERS });

    const filters = [['action', 'action'], ['resourceType', 'resource_type'], ['resourceId', 'resource_id']] as const;
    const clauses: string[] = [];
    const values: unknown[] = [];
    for (const [parameter, column] of filters) {
      const value = params.get(parameter);
      if (value === null || value === '') continue;
      if (value.length > 100) return NextResponse.json({ success: false, error: '筛选参数无效' }, { status: 400, headers: NO_STORE_HEADERS });
      values.push(value);
      clauses.push(`${column}=$${values.length}`);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const countRows = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM audit_logs a${where}`, values);
    values.push(pageSize, (page - 1) * pageSize);
    const rows = await query<AuditLogRow>(`SELECT a.id, a.actor_user_id, a.actor_name, u.username AS actor_username, u.student_id AS actor_student_id, a.action, a.resource_type, a.resource_id, a.details, a.created_at FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id${where} ORDER BY a.created_at DESC, a.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return NextResponse.json({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          actorUserId: row.actor_user_id,
          actorName: row.actor_name || (row.actor_username ? `${row.actor_username}${row.actor_student_id ? `（${row.actor_student_id}）` : ''}` : null),
          action: row.action,
          resourceType: row.resource_type,
          resourceId: safeResourceId(row.resource_id),
          details: sanitizeAuditDetails(row.details),
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        })),
        page,
        pageSize,
        total: Number(countRows[0]?.count || 0),
      },
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ success: false, error: '获取审计日志失败' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
