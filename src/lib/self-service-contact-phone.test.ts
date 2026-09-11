import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/auth/me/contact-phone/route';
import { createSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function request(userId: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/me/contact-phone', {
    method: 'PATCH',
    headers: new Headers({
      'content-type': 'application/json',
      Authorization: `Bearer ${createSessionToken(userId)}`,
    }),
    body: JSON.stringify(body),
  });
}

async function createUser(role: string) {
  const suffix = `${Date.now()}-${Math.random()}`;
  const created = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role) VALUES ($1,'test',$2,$3) RETURNING id",
    [`联系方式测试${suffix}`, `contact-${suffix}`, role],
  );
  if (!created) throw new Error('测试用户创建失败');
  return created.id;
}

async function storedPhone(id: string) {
  const row = await queryOne<{ contact_phone: string | null }>('SELECT contact_phone FROM users WHERE id=$1', [id]);
  return row?.contact_phone ?? null;
}

async function main() {
  await ensureDatabaseSchema();
  const studentId = await createUser('student');
  const leaderId = await createUser('leader');

  try {
    // 任何登录用户都可以自己填写联系方式
    const saved = await PATCH(request(studentId, { contactPhone: ' 13800000000 ' }));
    assert.equal(saved.status, 200);
    assert.equal(await storedPhone(studentId), '13800000000');

    // 微信号也可以
    assert.equal((await PATCH(request(studentId, { contactPhone: 'zhangsan_wx' }))).status, 200);
    assert.equal(await storedPhone(studentId), 'zhangsan_wx');

    // 格式不合法要拒绝，且不写库
    assert.equal((await PATCH(request(studentId, { contactPhone: '13800000000@qq.com' }))).status, 400);
    assert.equal(await storedPhone(studentId), 'zhangsan_wx');

    // 普通用户可以清空
    assert.equal((await PATCH(request(studentId, { contactPhone: '' }))).status, 200);
    assert.equal(await storedPhone(studentId), null);

    // 部门负责人必填：可以保存，但不能清空
    assert.equal((await PATCH(request(leaderId, { contactPhone: '13900000000' }))).status, 200);
    assert.equal(await storedPhone(leaderId), '13900000000');
    const cleared = await PATCH(request(leaderId, { contactPhone: '' }));
    assert.equal(cleared.status, 400);
    assert.equal(await storedPhone(leaderId), '13900000000');
  } finally {
    await query('DELETE FROM users WHERE id=$1', [studentId]);
    await query('DELETE FROM users WHERE id=$1', [leaderId]);
  }
  console.log('self service contact phone tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});