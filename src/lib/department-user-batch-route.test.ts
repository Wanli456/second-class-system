import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PUT } from '@/app/api/department-users/route';
import { createSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function request(userId: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/department-users', {
    method: 'PUT',
    headers: new Headers({
      'content-type': 'application/json',
      Authorization: `Bearer ${createSessionToken(userId)}`,
    }),
    body: JSON.stringify(body),
  });
}

async function createUser(role: string, department: string | null) {
  const suffix = `${Date.now()}-${Math.random()}`;
  const created = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role,department) VALUES ($1,'test',$2,$3,$4) RETURNING id",
    [`批量权限测试${suffix}`, `batch-${suffix}`, role, department],
  );
  if (!created) throw new Error('测试用户创建失败');
  return created.id;
}

async function flags(id: string) {
  return queryOne<{ can_publish: boolean; can_score: boolean }>(
    'SELECT can_publish, can_score FROM users WHERE id=$1',
    [id],
  );
}

async function main() {
  await ensureDatabaseSchema();
  const managerId = await createUser('leader', '第二课堂认证中心');
  const studentA = await createUser('student', '第二课堂认证中心');
  const studentB = await createUser('student', '第二课堂认证中心');
  const outsider = await createUser('student', '其他学院');
  const adminId = await createUser('admin', '第二课堂认证中心');

  try {
    // 一次性给多个成员开启活动审核与赋分权限
    const response = await PUT(request(managerId, {
      userIds: [studentA, studentB],
      department: '第二课堂认证中心',
      permissions: { canPublish: true, canScore: true },
    }));
    const body = await response.json() as { success: boolean; data?: { updatedCount: number; users: unknown[] } };
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.data?.updatedCount, 2);
    assert.deepEqual(await flags(studentA), { can_publish: true, can_score: true });
    assert.deepEqual(await flags(studentB), { can_publish: true, can_score: true });

    // 批量关闭
    const disable = await PUT(request(managerId, {
      userIds: [studentA, studentB],
      department: '第二课堂认证中心',
      permissions: { canScore: false },
    }));
    assert.equal(disable.status, 200);
    assert.deepEqual(await flags(studentA), { can_publish: true, can_score: false });

    // 越权用户与管理员都要拒绝，且不能写库
    assert.equal((await PUT(request(managerId, {
      userIds: [outsider], department: '第二课堂认证中心', permissions: { canPublish: true },
    }))).status, 400);
    assert.equal((await PUT(request(managerId, {
      userIds: [adminId], department: '第二课堂认证中心', permissions: { canPublish: true },
    }))).status, 400);
    assert.deepEqual(await flags(outsider), { can_publish: false, can_score: false });
    assert.deepEqual(await flags(adminId), { can_publish: false, can_score: false });

    // 空用户列表与非法权限值
    assert.equal((await PUT(request(managerId, {
      userIds: [], department: '第二课堂认证中心', permissions: { canPublish: true },
    }))).status, 400);
    assert.equal((await PUT(request(managerId, {
      userIds: [studentA], department: '第二课堂认证中心', permissions: { canPublish: 'yes' },
    }))).status, 400);
  } finally {
    for (const id of [managerId, studentA, studentB, outsider, adminId]) {
      await query('DELETE FROM audit_logs WHERE resource_id=$1', [id]);
      await query('DELETE FROM users WHERE id=$1', [id]);
    }
  }
  console.log('batch department permission route tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});