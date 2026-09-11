import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PUT } from '@/app/api/admin/user-permissions/route';
import { createSessionToken, issueSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function request(body: unknown, token: string): NextRequest {
  return new NextRequest('http://localhost/api/auth', {
    method: 'PUT',
    headers: new Headers({ 'content-type': 'application/json', Authorization: `Bearer ${token}` }),
    body: JSON.stringify(body),
  });
}

async function createUser(role: string, department: string | null) {
  const suffix = `${Date.now()}-${Math.random()}`;
  const created = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role,department) VALUES ($1,'test',$2,$3,$4) RETURNING id",
    [`批量权限${suffix}`, `admin-batch-${suffix}`, role, department],
  );
  if (!created) throw new Error('测试用户创建失败');
  return created.id;
}

async function row(id: string) {
  return queryOne<{ can_publish: boolean; can_score: boolean; can_submit_original_leave: boolean; permission_overrides: string | null }>(
    'SELECT can_publish,can_score,can_submit_original_leave,permission_overrides FROM users WHERE id=$1',
    [id],
  );
}

async function main() {
  await ensureDatabaseSchema();
  const adminToken = await issueSessionToken('local-admin');
  const studentA = await createUser('student', '学生会');
  const studentB = await createUser('class_leader', '学生会');
  const autoLeader = await createUser('leader', '学习竞技部');
  const otherAdmin = await createUser('admin', '学生会');

  try {
    // 一次给多个用户开启活动审核与赋分权限
    const ok = await PUT(request({ userIds: [studentA, studentB], permissions: { canPublish: true, canScore: true } }, adminToken));
    const body = await ok.json() as { success: boolean; data?: { updatedCount: number } };
    assert.equal(ok.status, 200, JSON.stringify(body));
    assert.equal(body.data?.updatedCount, 2);
    assert.equal((await row(studentA))?.can_publish, true);
    assert.equal((await row(studentA))?.can_score, true);
    assert.equal((await row(studentB))?.can_publish, true);
    assert.equal((await row(studentB))?.can_score, true);

    // 批量关闭
    assert.equal((await PUT(request({ userIds: [studentA, studentB], permissions: { canScore: false } }, adminToken))).status, 200);
    assert.equal((await row(studentA))?.can_score, false);
    assert.equal((await row(studentB))?.can_score, false);

    // 部门自动权限：部门负责人(学习竞技部)的提交原假条由部门自动授予，
    // 批量关闭必须写成 permission_overrides 覆盖，而不是直接改列。
    const autoResult = await PUT(request({ userIds: [autoLeader], permissions: { canSubmitOriginalLeave: false } }, adminToken));
    const autoBody = await autoResult.json() as { success: boolean; data?: { users: Array<{ canSubmitOriginalLeave: boolean }> } };
    assert.equal(autoResult.status, 200, JSON.stringify(autoBody));
    const leaderRow = await row(autoLeader);
    assert.equal(leaderRow?.permission_overrides, '{"canSubmitOriginalLeave":false}');
    assert.equal(leaderRow?.can_submit_original_leave, false);
    assert.equal(autoBody.data?.users[0]?.canSubmitOriginalLeave, false);

    // 参数校验
    assert.equal((await PUT(request({ userIds: [], permissions: { canPublish: true } }, adminToken))).status, 400);
    assert.equal((await PUT(request({ userIds: [studentA], permissions: {} }, adminToken))).status, 400);
    assert.equal((await PUT(request({ userIds: [studentA], permissions: { notAPermission: true } }, adminToken))).status, 400);
    assert.equal((await PUT(request({ userIds: [studentA], permissions: { canPublish: 'yes' } }, adminToken))).status, 400);
    assert.equal((await PUT(request({ userIds: ['does-not-exist'], permissions: { canPublish: true } }, adminToken))).status, 400);
    // 非管理员不能批量改权限
    assert.equal((await PUT(request({ userIds: [studentA], permissions: { canPublish: true } }, createSessionToken(studentB)))).status, 403);

    // 校验失败时不应写库
    assert.deepEqual(await row(otherAdmin), { can_publish: false, can_score: false, can_submit_original_leave: false, permission_overrides: null });
  } finally {
    for (const id of [studentA, studentB, autoLeader, otherAdmin]) {
      await query('DELETE FROM audit_logs WHERE resource_id=$1', [id]);
      await query('DELETE FROM users WHERE id=$1', [id]);
    }
  }
  console.log('admin batch permission tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});