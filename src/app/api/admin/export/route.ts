import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit-log';
import { query } from '@/storage/database/supabase-client';

type ExportField = readonly [column: string, key: string];
type ExportConfig = { table: string; fields: readonly ExportField[] };

const EXPORTS = {
  activities: { table: 'activities', fields: [['id', 'id'], ['full_name', 'fullName'], ['start_time', 'startTime'], ['end_time', 'endTime'], ['registration_start_time', 'registrationStartTime'], ['registration_end_time', 'registrationEndTime'], ['category', 'category'], ['category_primary', 'categoryPrimary'], ['category_secondary', 'categorySecondary'], ['level', 'level'], ['scope_type', 'scopeType'], ['scope_name', 'scopeName'], ['status', 'status'], ['scoring_status', 'scoringStatus'], ['created_at', 'createdAt'], ['updated_at', 'updatedAt']] },
  activity_submissions: { table: 'activity_submissions', fields: [['id', 'id'], ['full_name', 'fullName'], ['start_time', 'startTime'], ['end_time', 'endTime'], ['registration_start_time', 'registrationStartTime'], ['registration_end_time', 'registrationEndTime'], ['category', 'category'], ['category_primary', 'categoryPrimary'], ['category_secondary', 'categorySecondary'], ['level', 'level'], ['scope_type', 'scopeType'], ['scope_name', 'scopeName'], ['activity_id', 'activityId'], ['review_status', 'reviewStatus'], ['created_at', 'createdAt'], ['updated_at', 'updatedAt']] },
  leave_requests: { table: 'leave_requests', fields: [['id', 'id'], ['class_name', 'className'], ['leave_type', 'leaveType'], ['activity_id', 'activityId'], ['start_time', 'startTime'], ['end_time', 'endTime'], ['review_status', 'reviewStatus'], ['created_at', 'createdAt'], ['updated_at', 'updatedAt']] },
  leave_groups: { table: 'leave_groups', fields: [['id', 'id'], ['class_name', 'className'], ['leave_type', 'leaveType'], ['activity_id', 'activityId'], ['start_time', 'startTime'], ['end_time', 'endTime'], ['review_status', 'reviewStatus'], ['created_at', 'createdAt'], ['updated_at', 'updatedAt']] },
  leave_slips: { table: 'leave_slips', fields: [['id', 'id'], ['slip_type', 'slipType'], ['leave_type', 'leaveType'], ['class_names', 'classNames'], ['start_time', 'startTime'], ['end_time', 'endTime'], ['activity_id', 'activityId'], ['review_status', 'reviewStatus'], ['reviewed_at', 'reviewedAt'], ['created_at', 'createdAt'], ['updated_at', 'updatedAt']] },
  departments: { table: 'departments', fields: [['id', 'id'], ['name', 'name'], ['created_at', 'createdAt']] },
} as const satisfies Record<string, ExportConfig>;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function parseLimit(value: string | null): number | null {
  if (value === null) return 500;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= 1000 ? limit : null;
}

function serializeValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeRow(row: Record<string, unknown>, fields: readonly ExportField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map(([column, key]) => [key, serializeValue(row[column])]));
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const protectedText = /^[\s\x00-\x1F]*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(protectedText) ? `"${protectedText.replace(/"/g, '""')}"` : protectedText;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) {
      auth.response.headers.set('Cache-Control', 'no-store');
      return auth.response;
    }
    const params = request.nextUrl.searchParams;
    const name = params.get('table') || '';
    const config = Object.hasOwn(EXPORTS, name) ? EXPORTS[name as keyof typeof EXPORTS] : null;
    const format = params.get('format') || 'json';
    const limit = parseLimit(params.get('limit'));
    if (!config || (format !== 'json' && format !== 'csv') || limit === null) return NextResponse.json({ success: false, error: '导出参数无效' }, { status: 400, headers: NO_STORE_HEADERS });

    const columns = config.fields.map(([column]) => column).join(', ');
    const rows = await query<Record<string, unknown>>(`SELECT ${columns} FROM ${config.table} ORDER BY created_at DESC LIMIT $1`, [limit]);
    const data = rows.map((row) => serializeRow(row, config.fields));
    await writeAuditLog({ actor: auth.user, action: 'export_data', resourceType: 'data_export', details: { table: name, format, limit, rowCount: data.length } });

    if (format === 'json') return NextResponse.json({ success: true, data, meta: { table: name, format, limit, maxLimit: 1000, rowCount: data.length } }, { headers: NO_STORE_HEADERS });
    const headers = config.fields.map(([, key]) => key);
    const body = [headers.join(','), ...data.map((row) => headers.map((key) => csvCell(row[key])).join(','))].join('\n');
    return new NextResponse(body, { headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` } });
  } catch {
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
