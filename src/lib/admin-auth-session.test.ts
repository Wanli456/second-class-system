import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, PUT } from '@/app/api/auth/route';
import { getSessionUser, issueSessionToken, readSessionToken, revokeAdminSession } from './auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function request(url: string, method: string, body?: unknown, token?: string): NextRequest {
  return new NextRequest(url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

function sessionToken(response: Response): string {
  const token = response.headers.get('set-cookie')?.match(/second_class_session=([^;]+)/)?.[1];
  assert.ok(token, '登录必须写入 second_class_session');
  return token;
}

async function login(studentId: string, name: string, password: string): Promise<string> {
  const response = await PUT(request('http://localhost/api/auth', 'PUT', { studentId, name, password }));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  return sessionToken(response);
}

async function run(): Promise<void> {
  assert.equal(process.env.NODE_ENV, 'test');
  await ensureDatabaseSchema();
  const firstLogin = await login('9000000001', '本地管理员', 'test123');
  const secondLogin = await login('9000000001', '本地管理员', 'test123');
  assert.equal((await GET(request('http://localhost/api/auth?me=true', 'GET', undefined, firstLogin))).status, 401, '第二次管理员登录必须使首个令牌失效');
  assert.equal((await GET(request('http://localhost/api/auth?me=true', 'GET', undefined, secondLogin))).status, 200, '第二次管理员登录令牌必须可用');
  await DELETE(request('http://localhost/api/auth', 'DELETE', undefined, firstLogin));
  assert.equal((await GET(request('http://localhost/api/auth?me=true', 'GET', undefined, secondLogin))).status, 200, '旧注销不能撤销新管理员会话');
  await DELETE(request('http://localhost/api/auth', 'DELETE', undefined, secondLogin));
  assert.equal((await GET(request('http://localhost/api/auth?me=true', 'GET', undefined, secondLogin))).status, 401, '当前注销必须撤销管理员会话');
  const thirdLogin = await login('9000000001', '本地管理员', 'test123');
  const passwordUpdate = await PATCH(request('http://localhost/api/auth', 'PATCH', { id: 'local-admin', oldPassword: 'test123', password: 'test456' }, thirdLogin));
  assert.equal(passwordUpdate.status, 200, JSON.stringify(await passwordUpdate.json()));
  assert.equal(await getSessionUser(request('http://localhost/api/auth', 'GET', undefined, thirdLogin)), null, '密码修改必须撤销管理员会话');
  assert.ok(await queryOne('SELECT id FROM audit_logs WHERE action=$1 AND resource_id=$2', ['update_user', 'local-admin']), '密码修改必须记录审计');
  await query(`INSERT INTO users (id,username,password,student_id,role) VALUES ($1,$2,$3,$4,'admin')`, ['admin-auth-session-2', '会话管理员二号', 'test123', '9000000099']);
  const roleToken = await login('9000000099', '会话管理员二号', 'test123');
  const operatorToken = await login('9000000001', '本地管理员', 'test456');
  const roleUpdate = await PATCH(request('http://localhost/api/auth', 'PATCH', { id: 'admin-auth-session-2', role: 'leader' }, operatorToken));
  assert.equal(roleUpdate.status, 200, JSON.stringify(await roleUpdate.json()));
  assert.equal(await getSessionUser(request('http://localhost/api/auth', 'GET', undefined, roleToken)), null, '角色修改必须撤销管理员会话');
  assert.ok(await queryOne('SELECT id FROM audit_logs WHERE action=$1 AND resource_id=$2', ['update_user', 'admin-auth-session-2']), '角色修改必须记录审计');
  const oldToken = await issueSessionToken('local-admin');
  const newToken = await issueSessionToken('local-admin');
  await revokeAdminSession('local-admin', readSessionToken(oldToken)!.sessionId!);
  assert.ok(await getSessionUser(request('http://localhost/api/auth', 'GET', undefined, newToken)), '旧注销条件不能撤销新会话');
  const studentToken = await login('9000000006', '本地学生', 'test123');
  assert.ok(await getSessionUser(request('http://localhost/api/auth', 'GET', undefined, studentToken)), '普通用户登录保持兼容');
  console.log('admin authentication session tests passed');
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
