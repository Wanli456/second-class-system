import { NextRequest, NextResponse } from 'next/server';
import { calculateUserPermissions, requireUser } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne, withTransaction } from '@/storage/database/supabase-client';
import { validateScoringRows, type ScoringImportRow } from '@/lib/scoring-import';
import { writeAuditLog } from '@/lib/audit-log';

const IMPORT_STATUS = { pending: '待人工确认', rejected: '自动驳回', confirmed: '已确认' } as const;

function toRow(input: unknown, index: number): ScoringImportRow | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());
  return {
    rowNumber: Number(raw.rowNumber) || index + 1,
    studentId: text(raw.studentId),
    studentName: text(raw.studentName),
    startTime: text(raw.startTime),
    endTime: text(raw.endTime),
    content: text(raw.content),
    categoryPrimary: text(raw.categoryPrimary),
    categorySecondary: text(raw.categorySecondary),
    level: text(raw.level),
    award: text(raw.award),
    creditType: text(raw.creditType),
    creditValue: text(raw.creditValue),
  };
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const permissions = calculateUserPermissions(auth.user!);
    if (!permissions.canImportScoring) {
      return NextResponse.json({ success: false, error: '暂无班级赋分表提交权限' }, { status: 403 });
    }

    const body = await request.json();
    const className = String(body.className || '').trim();
    const fileName = String(body.fileName || '').trim() || null;
    const rawRows: unknown[] = Array.isArray(body.rows) ? body.rows : [];
    if (!rawRows.length) return NextResponse.json({ success: false, error: '表格里没有数据行' }, { status: 400 });
    if (rawRows.length > 2000) return NextResponse.json({ success: false, error: '单次最多导入 2000 行' }, { status: 400 });

    // 服务端重新校验，不信任客户端传来的结论
    const rows = rawRows.map(toRow).filter((row): row is ScoringImportRow => Boolean(row));
    const validation = validateScoringRows(rows);
    const issues = validation.issues.slice(0, 200);
    const status = validation.ok ? IMPORT_STATUS.pending : IMPORT_STATUS.rejected;

    const created = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO scoring_imports (class_name,file_name,status,total_rows,valid_rows,issues,submitted_by_id,submitted_by_name)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING id`,
        [className || null, fileName, status, rows.length, validation.ok ? rows.length : 0, JSON.stringify(issues), auth.user!.id, auth.user!.username],
      );
      const importId = inserted.rows[0].id;
      for (const row of rows) {
        await client.query(
          `INSERT INTO scoring_import_rows (import_id,row_number,student_id,student_name,start_time,end_time,content,category_primary,category_secondary,level,award,credit_type,credit_value)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [importId, row.rowNumber, row.studentId, row.studentName, row.startTime, row.endTime, row.content,
            row.categoryPrimary, row.categorySecondary, row.level, row.award, row.creditType,
            Number.isFinite(Number(row.creditValue)) ? Number(row.creditValue) : null],
        );
      }
      await writeAuditLog({
        actor: auth.user,
        action: validation.ok ? 'import_class_scoring' : 'reject_class_scoring',
        resourceType: 'scoring_import',
        resourceId: importId,
        details: { fileName: fileName || '未命名', rowCount: rows.length, issueCount: issues.length, status },
      }, client);
      return importId;
    });

    return NextResponse.json({
      success: true,
      data: { id: created, status, totalRows: rows.length, validRows: validation.ok ? rows.length : 0, issues },
    });
  } catch (error) {
    console.error('导入班级赋分表失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '导入失败' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const permissions = calculateUserPermissions(auth.user!);
    const isConfirmer = permissions.canScore;
    if (!permissions.canImportScoring && !isConfirmer) {
      return NextResponse.json({ success: false, error: '暂无查看权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    // 提交人只看自己的记录；赋分员看全部
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (id) { params.push(id); clauses.push(`id=$${params.length}`); }
    if (status) { params.push(status); clauses.push(`status=$${params.length}`); }
    if (!isConfirmer) { params.push(auth.user!.id); clauses.push(`submitted_by_id=$${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const imports = await query(`SELECT * FROM scoring_imports ${where} ORDER BY created_at DESC LIMIT 100`, params);
    const ids = imports.map((item) => String((item as { id: string }).id));
    const rows = ids.length
      ? await query(`SELECT * FROM scoring_import_rows WHERE import_id IN (${ids.map((_, index) => `$${index + 1}`).join(',')}) ORDER BY row_number`, ids)
      : [];
    return NextResponse.json({ success: true, data: imports, rows });
  } catch (error) {
    console.error('获取班级赋分表记录失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '获取失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const permissions = calculateUserPermissions(auth.user!);
    if (!permissions.canScore) {
      return NextResponse.json({ success: false, error: '暂无赋分确认权限' }, { status: 403 });
    }
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: '缺少记录 ID' }, { status: 400 });

    const target = await queryOne<{ id: string; status: string; valid_rows: number }>(
      'SELECT id,status,valid_rows FROM scoring_imports WHERE id=$1', [id],
    );
    if (!target) return NextResponse.json({ success: false, error: '记录不存在' }, { status: 404 });
    if (target.status === IMPORT_STATUS.rejected) {
      return NextResponse.json({ success: false, error: '该表未通过自动审核，不能确认赋分' }, { status: 400 });
    }
    if (target.status === IMPORT_STATUS.confirmed) {
      return NextResponse.json({ success: false, error: '该表已确认赋分，不能重复操作' }, { status: 409 });
    }

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE scoring_imports SET status=$1,confirmed_by_id=$2,confirmed_by_name=$3,confirmed_at=NOW()
         WHERE id=$4 AND status=$5 RETURNING *`,
        [IMPORT_STATUS.confirmed, auth.user!.id, auth.user!.username, id, IMPORT_STATUS.pending],
      );
      const row = result.rows[0] || null;
      if (row) {
        await writeAuditLog({
          actor: auth.user, action: 'confirm_class_scoring', resourceType: 'scoring_import', resourceId: id,
          details: { confirmedRows: target.valid_rows },
        }, client);
      }
      return row;
    });
    if (!updated) return NextResponse.json({ success: false, error: '状态已变化，请刷新后重试' }, { status: 409 });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('确认班级赋分失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '确认失败' }, { status: 500 });
  }
}