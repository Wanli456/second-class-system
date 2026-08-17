import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST, PUT } from '../src/app/api/evening-study/route';
import { createSessionToken } from '../src/lib/auth';

function request(method: string, body: unknown) {
  return new NextRequest('http://localhost/api/evening-study', {
    method,
    headers: { cookie: `second_class_session=${createSessionToken('local-admin')}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function run() {
  const createResponse = await POST(request('POST', {
    date: '2026-08-20',
    weekday: '星期四',
    class_name: 'ECC-晚自习测试班',
    classroom: '测试教室',
    checker_name: '本地管理员',
    checker_phone: '9000000001',
    notes: '原始备注',
  }));
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json() as { data?: { id?: string; notes?: string } };
  assert.ok(created.data?.id);

  const validResponse = await PUT(request('PUT', { id: created.data.id, notes: '更新后的备注' }));
  assert.equal(validResponse.status, 200, '合法字段应允许更新');
  const updated = await validResponse.json() as { data?: { notes?: string } };
  assert.equal(updated.data?.notes, '更新后的备注');

  const invalidFieldResponse = await PUT(request('PUT', { id: created.data.id, created_at: '2020-01-01' }));
  assert.equal(invalidFieldResponse.status, 400, '客户端不应更新 created_at 等受保护字段');

  const emptyResponse = await PUT(request('PUT', { id: created.data.id }));
  assert.equal(emptyResponse.status, 400, '没有可更新字段时应返回参数错误');

  const missingResponse = await PUT(request('PUT', { id: 'missing-evening-study-id', notes: '不存在' }));
  assert.equal(missingResponse.status, 404, '更新不存在的晚自习记录应返回 404');

  console.log('evening study PUT tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
