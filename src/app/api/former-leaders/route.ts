import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/storage/database/supabase-client';
import { writeAuditLog } from '@/lib/audit-log';

type RosterRow = {
  id: string;
  name: string;
  department: string;
  student_id: string | null;
  contact_phone: string | null;
  active: boolean;
  linked_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function nullIfEmpty(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed || null;
}

function serializeRow(row: RosterRow, linked?: { username: string; student_id: string } | null) {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    studentId: row.student_id || '',
    contactPhone: row.contact_phone || '',
    active: row.active,
    linkedUserId: row.linked_user_id,
    linkedUsername: linked?.username || '',
    linkedStudentId: linked?.student_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findDuplicate(department: string, studentId: string, excludeId?: string) {
  return queryOne<{ id: string }>(
    'SELECT id FROM former_activity_leaders WHERE department=$1 AND student_id=$2 AND id<>$3',
    [department, studentId, excludeId || ''],
  );
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  try {
    const rows = await query<RosterRow>('SELECT * FROM former_activity_leaders ORDER BY department, created_at DESC');
    const linkedIds = [...new Set(rows.map((row) => row.linked_user_id).filter(Boolean))] as string[];
    const placeholders = linkedIds.map((_, index) => `$${index + 1}`).join(',');
    const linkedUsers = linkedIds.length
      ? await query<{ id: string; username: string; student_id: string }>(`SELECT id, username, student_id FROM users WHERE id IN (${placeholders})`, linkedIds)
      : [];
    const byId = new Map(linkedUsers.map((user) => [user.id, user]));
    // 按学号提示待确认关联：名册有学号、尚未确认关联、但已有同学号的注册账号。
    const studentIds = [...new Set(rows.map((row) => row.student_id).filter((value): value is string => Boolean(value) && !rows.some((row) => row.linked_user_id && row.student_id === value)))];
    const pendingPlaceholders = studentIds.map((_, index) => `$${index + 1}`).join(',');
    const matchedUsers = studentIds.length
      ? await query<{ id: string; username: string; student_id: string }>(`SELECT id, username, student_id FROM users WHERE student_id IN (${pendingPlaceholders})`, studentIds)
      : [];
    const userByStudentId = new Map(matchedUsers.map((user) => [user.student_id, user]));
    const pending = rows
      .filter((row) => !row.linked_user_id && row.student_id && userByStudentId.has(row.student_id))
      .map((row) => {
        const user = userByStudentId.get(row.student_id!)!;
        return { id: row.id, name: row.name, rosterStudentId: row.student_id, userId: user.id, username: user.username, userStudentId: user.student_id };
      });
    return NextResponse.json({ success: true, data: { rows: rows.map((row) => serializeRow(row, row.linked_user_id ? byId.get(row.linked_user_id) : null)), pending } });
  } catch (err) {
    console.error('读取往届负责人名册失败:', err);
    return NextResponse.json({ success: false, error: '读取往届负责人名册失败，请稍后重试' }, { status: 500 });
  }
}

type CreateOutcome =
  | { status: 'created'; data: ReturnType<typeof serializeRow>; warning?: string }
  | { status: 'duplicate'; reason: string }
  | { status: 'error'; reason: string };

async function createRosterRow(actor: { id: string; username?: string; student_id?: string }, raw: Record<string, unknown>): Promise<CreateOutcome> {
  const name = text(raw.name);
  const department = text(raw.department);
  const studentId = nullIfEmpty(raw.student_id);
  const contactPhone = nullIfEmpty(raw.contact_phone);
  if (!name || !department) return { status: 'error', reason: '姓名与所属部门为必填项' };
  if (studentId && (await findDuplicate(department, studentId))) {
    return { status: 'duplicate', reason: '该部门已存在相同学号的往届负责人记录' };
  }
  const duplicateName = studentId ? null : await queryOne<{ id: string }>(
    'SELECT id FROM former_activity_leaders WHERE department=$1 AND name=$2 AND student_id IS NULL',
    [department, name],
  );
  const row = (await query<RosterRow>(
    'INSERT INTO former_activity_leaders (name, department, student_id, contact_phone) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, department, studentId, contactPhone],
  ))[0];
  await writeAuditLog({ actor, action: 'former_leader_create', resourceType: 'former_activity_leaders', resourceId: row.id, details: { department, hasStudentId: Boolean(studentId) } });
  return {
    status: 'created',
    data: serializeRow(row),
    ...(duplicateName ? { warning: '同部门已有同名且未填学号的往届负责人，请核实是否为同一人' } : {}),
  };
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  const actor = auth.user!;
  try {
    const body = await request.json();
    if (Array.isArray(body.rows)) {
      // 批量建档：逐行独立处理，单行失败不影响其他行；批内同键重复直接判重。
      const rawRows = body.rows;
      if (!rawRows.length || !rawRows.every((row: unknown) => row && typeof row === 'object' && !Array.isArray(row))) {
        return NextResponse.json({ success: false, error: '批量内容为空或格式无效' }, { status: 400 });
      }
      if (rawRows.length > 200) return NextResponse.json({ success: false, error: '单次批量不超过 200 条' }, { status: 400 });
      const seenKeys = new Set<string>();
      const keyOf = (department: string, studentId: string | null, name: string) => studentId ? `${department}|${studentId}` : `${department}|name:${name}`;
      const results: Array<Record<string, unknown>> = [];
      let createdCount = 0;
      for (const [index, raw] of (rawRows as Record<string, unknown>[]).entries()) {
        const name = text(raw.name);
        const department = text(raw.department);
        const studentId = nullIfEmpty(raw.student_id);
        const batchKey = department ? keyOf(department, studentId, name) : '';
        if (batchKey && seenKeys.has(batchKey)) {
          results.push({ index, name, department, status: 'duplicate', reason: '批量内容与前面的行重复' });
          continue;
        }
        const outcome = await createRosterRow(actor, raw);
        if (outcome.status === 'created') {
          if (batchKey) seenKeys.add(batchKey);
          results.push({ index, name, department, status: 'created', id: outcome.data.id, ...(outcome.warning ? { warning: outcome.warning } : {}) });
          createdCount += 1;
        } else {
          results.push({ index, name, department, status: outcome.status, reason: outcome.reason });
        }
      }
      return NextResponse.json({ success: true, data: { createdCount, results } });
    }
    const outcome = await createRosterRow(actor, body);
    if (outcome.status === 'created') return NextResponse.json({ success: true, data: outcome.data, ...(outcome.warning ? { warning: outcome.warning } : {}) });
    return NextResponse.json({ success: false, error: outcome.status === 'duplicate' ? outcome.reason : outcome.reason }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '建档失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  const actor = auth.user!;
  try {
    const body = await request.json();
    const id = text(body.id);
    const action = text(body.action);
    if (!id || !['update', 'set_active', 'link', 'unlink'].includes(action)) {
      return NextResponse.json({ success: false, error: '缺少记录 ID 或操作类型' }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      const row = (await client.query<RosterRow>('SELECT * FROM former_activity_leaders WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) return { status: 404, error: '名册记录不存在' as string | undefined };

      if (action === 'update') {
        const name = text(body.name) || row.name;
        const department = text(body.department) || row.department;
        const studentId = body.student_id === undefined ? row.student_id : nullIfEmpty(body.student_id);
        const contactPhone = body.contact_phone === undefined ? row.contact_phone : nullIfEmpty(body.contact_phone);
        if (!name || !department) return { status: 400, error: '姓名与所属部门为必填项' };
        if (studentId && (await findDuplicate(department, studentId, id))) {
          return { status: 400, error: '该部门已存在相同学号的往届负责人记录' };
        }
        const updated = (await client.query<RosterRow>(
          'UPDATE former_activity_leaders SET name=$1, department=$2, student_id=$3, contact_phone=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
          [name, department, studentId, contactPhone, id],
        )).rows[0];
        await writeAuditLog({ actor, action: 'former_leader_update', resourceType: 'former_activity_leaders', resourceId: id, details: { department } }, client);
        return { status: 200, data: serializeRow(updated) };
      }

      if (action === 'set_active') {
        if (typeof body.active !== 'boolean') return { status: 400, error: '缺少启停状态' };
        const updated = (await client.query<RosterRow>(
          'UPDATE former_activity_leaders SET active=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
          [body.active, id],
        )).rows[0];
        await writeAuditLog({ actor, action: 'former_leader_set_active', resourceType: 'former_activity_leaders', resourceId: id, details: { active: body.active } }, client);
        return { status: 200, data: serializeRow(updated) };
      }

      if (action === 'link') {
        const linkedUserId = text(body.linked_user_id);
        if (!linkedUserId) return { status: 400, error: '缺少要关联的账号' };
        const user = (await client.query<{ id: string; username: string; student_id: string; role: string }>(
          'SELECT id, username, student_id, role FROM users WHERE id=$1', [linkedUserId],
        )).rows[0];
        if (!user) return { status: 400, error: '要关联的账号不存在' };
        // 只凭同名不能绑定：名册资料必须与账号的姓名、学号完全一致，不一致先纠正资料。
        if (!row.student_id || row.student_id !== user.student_id || row.name !== user.username) {
          return { status: 400, error: '名册与账号的姓名或学号不一致，请先核实并纠正资料后再关联' };
        }
        const takenByOther = (await client.query<{ id: string }>(
          'SELECT id FROM former_activity_leaders WHERE linked_user_id=$1 AND id<>$2', [linkedUserId, id],
        )).rows[0];
        if (takenByOther) return { status: 400, error: '该账号已关联其他名册记录' };
        // 条件更新保证并发确认只成功一次。
        const updated = (await client.query<RosterRow>(
          'UPDATE former_activity_leaders SET linked_user_id=$1, updated_at=NOW() WHERE id=$2 AND (linked_user_id IS NULL OR linked_user_id=$1) RETURNING *',
          [linkedUserId, id],
        )).rows[0];
        if (!updated) return { status: 409, error: '该名册记录刚被其他操作更新，请刷新后重试' };
        await writeAuditLog({ actor, action: 'former_leader_link', resourceType: 'former_activity_leaders', resourceId: id, details: { linkedUserId } }, client);
        return { status: 200, data: serializeRow(updated, user) };
      }

      // unlink
      const updated = (await client.query<RosterRow>(
        'UPDATE former_activity_leaders SET linked_user_id=NULL, updated_at=NOW() WHERE id=$1 AND linked_user_id IS NOT NULL RETURNING *', [id],
      )).rows[0];
      if (!updated) return { status: 400, error: '该记录当前没有关联账号' };
      await writeAuditLog({ actor, action: 'former_leader_unlink', resourceType: 'former_activity_leaders', resourceId: id }, client);
      return { status: 200, data: serializeRow(updated) };
    });

    if (result.status !== 200) {
      return NextResponse.json({ success: false, error: result.error || '操作失败' }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '操作失败' }, { status: 500 });
  }
}
