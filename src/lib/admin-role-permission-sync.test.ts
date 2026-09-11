import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/auth/route';
import { issueSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function request(body: unknown, token: string): NextRequest {
  return new NextRequest('http://localhost/api/auth', {
    method: 'PATCH',
    headers: new Headers({ 'content-type': 'application/json', Authorization: `Bearer ${token}` }),
    body: JSON.stringify(body),
  });
}

async function readUser(id: string) {
  return queryOne<{ role: string; can_submit_original_leave: boolean; can_upload_leave: boolean }>(
    'SELECT role, can_submit_original_leave, can_upload_leave FROM users WHERE id=$1',
    [id],
  );
}

async function main() {
  await ensureDatabaseSchema();
  const token = await issueSessionToken('local-admin');
  const suffix = `${Date.now()}-${Math.random()}`;
  const created = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role) VALUES ($1,'test',$2,'student') RETURNING id",
    [`角色联动测试${suffix}`, `role-sync-${suffix}`],
  );
  if (!created) throw new Error('测试用户创建失败');
  const userId = created.id;

  try {
    // 学生 -> 部门负责人：自动获得提交原假条权限
    const promoted = await PATCH(request({ userId, role: 'leader' }, token));
    assert.equal(promoted.status, 200);
    assert.equal((await readUser(userId))?.can_submit_original_leave, true);

    // 部门负责人 -> 学生：同步收回
    const demoted = await PATCH(request({ userId, role: 'student' }, token));
    assert.equal(demoted.status, 200);
    assert.equal((await readUser(userId))?.can_submit_original_leave, false);

    // 学生 -> 班级负责人：自动获得假条上传权限
    await PATCH(request({ userId, role: 'class_leader' }, token));
    assert.equal((await readUser(userId))?.can_upload_leave, true);

    // 同一请求里显式设置优先于角色默认值
    await PATCH(request({ userId, role: 'leader', canSubmitOriginalLeave: false }, token));
    assert.equal((await readUser(userId))?.can_submit_original_leave, false);

    // 只改权限、不改角色时不应被角色默认值覆盖
    await PATCH(request({ userId, canSubmitOriginalLeave: true }, token));
    assert.equal((await readUser(userId))?.can_submit_original_leave, true);
  } finally {
    await query('DELETE FROM users WHERE id=$1', [userId]);
  }
  console.log('admin role and permission sync tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});