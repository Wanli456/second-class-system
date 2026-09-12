import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from '@/app/api/scoring/import/route';
import { createSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function req(method: string, body: unknown, token: string, url = '/api/scoring/import'): NextRequest {
  return new NextRequest('http://localhost' + url, {
    method,
    headers: new Headers({ 'content-type': 'application/json', Authorization: `Bearer ${token}` }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createUser(name: string, flags: { canImportScoring?: boolean; canScore?: boolean }) {
  const suffix = `${Date.now()}-${Math.random()}`;
  const row = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role,can_import_scoring,can_score) VALUES ($1,'test',$2,'student',$3,$4) RETURNING id",
    [name, `import-${suffix}`, flags.canImportScoring ?? false, flags.canScore ?? false],
  );
  if (!row) throw new Error('测试用户创建失败');
  return row.id;
}

const goodRow = {
  rowNumber: 7, studentId: '20230001', studentName: '张三', startTime: '2026-03-01', endTime: '2026-03-02',
  content: '志愿服务', categoryPrimary: '社会责任', categorySecondary: '公益服务', level: '院系级',
  award: '', creditType: '德积分', creditValue: '1.5',
};

async function main() {
  await ensureDatabaseSchema();
  const submitter = await createUser('导入提交人', { canImportScoring: true });
  const outsider = await createUser('无关用户', {});
  const scorer = await createUser('赋分确认人', { canScore: true });
  const tokenSubmitter = createSessionToken(submitter);
  const tokenOutsider = createSessionToken(outsider);
  const tokenScorer = createSessionToken(scorer);
  let importId = '';

  try {
    // 没有提交权限  403
    assert.equal((await POST(req('POST', { rows: [goodRow] }, tokenOutsider))).status, 403);

    // 合法数据  待人工确认
    const okRes = await POST(req('POST', { className: '计算机2101', fileName: 't.xlsx', rows: [goodRow] }, tokenSubmitter));
    const okBody = await okRes.json() as { data: { id: string; status: string; issues: unknown[] } };
    assert.equal(okRes.status, 200, JSON.stringify(okBody));
    assert.equal(okBody.data.status, '待人工确认');
    assert.equal(okBody.data.issues.length, 0);
    importId = okBody.data.id;
    const savedRows = await query('SELECT * FROM scoring_import_rows WHERE import_id=$1', [importId]);
    assert.equal(savedRows.length, 1);

    // 非法数据  自动驳回，并给出明细
    const badRes = await POST(req('POST', {
      rows: [goodRow, { ...goodRow, rowNumber: 8, studentId: 'abc' }, { ...goodRow, rowNumber: 9, creditType: '德积分', categoryPrimary: '工匠精神', categorySecondary: '技能提升证书' }],
    }, tokenSubmitter));
    const badBody = await badRes.json() as { data: { status: string; issues: Array<{ rowNumber: number; column: string }> } };
    assert.equal(badBody.data.status, '自动驳回');
    assert.ok(badBody.data.issues.length >= 2, JSON.stringify(badBody.data.issues));
    assert.ok(badBody.data.issues.every((issue) => issue.rowNumber > 0 && issue.column));

    // 提交人只能看自己的
    const mine = await (await GET(req('GET', undefined, tokenSubmitter))).json() as { data: Array<{ id: string }> };
    assert.ok(mine.data.some((item) => item.id === importId));
    assert.equal(mine.data.filter((item) => !item.id).length, 0);

    // 无确认权限  403
    assert.equal((await PUT(req('PUT', { id: importId }, tokenSubmitter))).status, 403);

    // 自动驳回的记录不能确认
    const rejectedList = await (await GET(req('GET', undefined, tokenScorer))).json() as { data: Array<{ id: string; status: string }> };
    const rejected = rejectedList.data.find((item) => item.status === '自动驳回');
    assert.ok(rejected);
    assert.equal((await PUT(req('PUT', { id: rejected!.id }, tokenScorer))).status, 400);

    // 人工确认
    const confirmed = await PUT(req('PUT', { id: importId }, tokenScorer));
    assert.equal(confirmed.status, 200);
    const after = await queryOne<{ status: string; confirmed_by_name: string | null }>(
      'SELECT status,confirmed_by_name FROM scoring_imports WHERE id=$1', [importId],
    );
    assert.equal(after?.status, '已确认');
    assert.equal(after?.confirmed_by_name, '赋分确认人');
    // 已确认记录不能被同名重提交覆盖
    assert.equal((await POST(req('POST', { className: '计算机2101', fileName: 't.xlsx', rows: [goodRow] }, tokenSubmitter))).status, 409);
    // 重复确认  409
    assert.equal((await PUT(req('PUT', { id: importId }, tokenScorer))).status, 409);
  } finally {
    await query('DELETE FROM scoring_import_rows WHERE import_id IN (SELECT id FROM scoring_imports WHERE submitted_by_id=$1)', [submitter]);
    await query('DELETE FROM scoring_imports WHERE submitted_by_id=$1', [submitter]);
    await query('DELETE FROM audit_logs WHERE actor_user_id=$1 OR actor_user_id=$2', [submitter, scorer]);
    await query('DELETE FROM users WHERE id=$1 OR id=$2 OR id=$3', [submitter, outsider, scorer]);
  }
  console.log('scoring import route tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
