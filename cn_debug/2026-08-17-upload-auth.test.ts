import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as uploadFile } from '../src/app/api/upload/route';
import { createSessionToken } from '../src/lib/auth';

async function readStatus(request: NextRequest) {
  const response = await uploadFile(request);
  const body = await response.json() as { success?: boolean; error?: string };
  return { status: response.status, body };
}

async function run() {
  const unauthenticated = await readStatus(new NextRequest('http://localhost/api/upload', { method: 'POST' }));
  assert.equal(unauthenticated.status, 401, '未登录不能调用文件上传接口');

  const emptyForm = new FormData();
  const authenticated = await readStatus(new NextRequest('http://localhost/api/upload', {
    method: 'POST',
    headers: { cookie: `second_class_session=${createSessionToken('local-student')}` },
    body: emptyForm,
  }));
  assert.equal(authenticated.status, 400, '已登录请求应进入文件参数校验');
  assert.equal(authenticated.body.error, '缺少文件');

  console.log('upload auth test passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
