import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:5000';

type AccountKey = 'admin' | 'publisher' | 'scorer' | 'leaveReviewer' | 'leader' | 'student';
type Account = { studentId: string; name: string; password: string };
type Session = Account & { key: AccountKey; token: string; userId: string };
type ApiResult = { status: number; body: Record<string, unknown> };

const accounts: Record<AccountKey, Account> = {
  admin: { studentId: '9000000001', name: '\u672c\u5730\u7ba1\u7406\u5458', password: 'test123' },
  publisher: { studentId: '9000000002', name: '\u672c\u5730\u53d1\u5e03\u5e72\u4e8b', password: 'test123' },
  scorer: { studentId: '9000000003', name: '\u672c\u5730\u8d4b\u5206\u5e72\u4e8b', password: 'test123' },
  leaveReviewer: { studentId: '9000000004', name: '\u672c\u5730\u8bf7\u5047\u5ba1\u6838\u5458', password: 'test123' },
  leader: { studentId: '9000000005', name: '\u672c\u5730\u8d1f\u8d23\u4eba', password: 'test123' },
  student: { studentId: '9000000006', name: '\u672c\u5730\u5b66\u751f', password: 'test123' },
};

async function request(session: Session | null, path: string, method = 'GET', body?: unknown): Promise<ApiResult> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

async function login(key: AccountKey): Promise<Session> {
  const account = accounts[key];
  const result = await request(null, '/api/auth', 'PUT', account);
  assert.equal(result.status, 200, `${key} login should succeed: ${JSON.stringify(result.body)}`);
  const data = result.body.data as { sessionToken?: string; id?: string } | undefined;
  assert.ok(data?.sessionToken, `${key} login should return a session token`);
  assert.ok(data?.id, `${key} login should return a user id`);
  return { ...account, key, token: data.sessionToken, userId: data.id };
}

async function expectStatus(session: Session | null, path: string, expected: number, label: string, method = 'GET', body?: unknown) {
  const result = await request(session, path, method, body);
  assert.equal(result.status, expected, `${label}: expected ${expected}, got ${result.status}: ${JSON.stringify(result.body)}`);
  return result;
}

async function run() {
  const sessions = Object.fromEntries(
    await Promise.all((Object.keys(accounts) as AccountKey[]).map(async (key) => [key, await login(key)])),
  ) as Record<AccountKey, Session>;

  for (const [key, session] of Object.entries(sessions) as Array<[AccountKey, Session]>) {
    const me = await expectStatus(session, '/api/auth?me=true', 200, `${key} current user`);
    const data = me.body.data as { role?: string; name?: string; studentId?: string };
    assert.equal(data.name, session.name, `${key} current user should preserve the name`);
    assert.equal(data.studentId, session.studentId, `${key} current user should preserve the student id`);
    assert.ok(data.role, `${key} current user should expose a normalized role`);
  }

  const accessMatrix: Array<{ key: AccountKey; path: string; expected: number; label: string; method?: string; body?: unknown }> = [
    { key: 'admin', path: '/api/activities', expected: 200, label: 'admin activity table' },
    { key: 'student', path: '/api/activities?purpose=leave', expected: 200, label: 'student activity options for leave' },
    { key: 'leader', path: '/api/activities?purpose=scoring', expected: 200, label: 'leader activity options for scoring materials' },
    { key: 'publisher', path: '/api/activities/review', expected: 200, label: 'publisher activity review' },
    { key: 'scorer', path: '/api/scoring', expected: 200, label: 'scorer scoring list' },
    { key: 'leaveReviewer', path: '/api/leave?role=admin', expected: 200, label: 'leave reviewer leave review' },
    { key: 'admin', path: '/api/auth', expected: 200, label: 'admin user management' },
    { key: 'leader', path: '/api/activities/submit', expected: 200, label: 'leader submission status' },
    { key: 'leader', path: '/api/activities/submit?submission_id=missing', expected: 200, label: 'leader activity submission access' },
    { key: 'student', path: '/api/leave', expected: 200, label: 'student leave status' },
    { key: 'admin', path: '/api/evening-study', expected: 200, label: 'admin evening study access' },
    { key: 'leader', path: '/api/leave', method: 'POST', body: { mode: 'group', leave_type: '\u4e8b\u5047', start_time: '2026-08-17T10:00:00.000Z', end_time: '2026-08-17T11:00:00.000Z', student_ids: ['9999999999'] }, expected: 400, label: 'leader group leave roster validation after permission' },
    { key: 'leader', path: '/api/activities', method: 'PUT', body: { id: 'missing', scoring_table_url: '/uploads/ecc-test.png' }, expected: 404, label: 'leader scoring material permission' },
  ];

  for (const item of accessMatrix) {
    await expectStatus(sessions[item.key], item.path, item.expected, item.label, item.method, item.body);
  }

  const deniedMatrix: Array<{ key: AccountKey; path: string; label: string; method?: string; body?: unknown }> = [
    { key: 'publisher', path: '/api/activities', label: 'publisher activity table must be denied' },
    { key: 'student', path: '/api/activities?purpose=unknown', label: 'student unknown activity query must be denied' },
    { key: 'publisher', path: '/api/activities?purpose=scoring', label: 'publisher scoring activity query must be denied' },
    { key: 'publisher', path: '/api/scoring', label: 'publisher scoring must be denied' },
    { key: 'publisher', path: '/api/leave?role=admin', label: 'publisher leave review must be denied' },
    { key: 'scorer', path: '/api/activities/review', label: 'scorer activity review must be denied' },
    { key: 'scorer', path: '/api/leave?role=admin', label: 'scorer leave review must be denied' },
    { key: 'leaveReviewer', path: '/api/activities/review', label: 'leave reviewer activity review must be denied' },
    { key: 'leaveReviewer', path: '/api/scoring', label: 'leave reviewer scoring must be denied' },
    { key: 'student', path: '/api/activities/submit', label: 'student submission status must be denied' },
    { key: 'student', path: '/api/activities/submit?submission_id=missing', label: 'student activity submission must be denied' },
    { key: 'student', path: '/api/evening-study', label: 'student evening study must be denied' },
    { key: 'student', path: '/api/activities', label: 'student activity table must be denied' },
    { key: 'student', path: '/api/activities', method: 'PUT', body: { id: 'missing', scoring_table_url: '/uploads/ecc-test.png' }, label: 'student scoring material must be denied' },
    { key: 'student', path: '/api/leave', method: 'POST', body: { mode: 'group', leave_type: '\u4e8b\u5047', start_time: '2026-08-17T10:00:00.000Z', end_time: '2026-08-17T11:00:00.000Z', student_ids: [] }, label: 'student group leave must be denied' },
    { key: 'student', path: '/api/departments', method: 'POST', body: { name: 'ECC unauthorized department' }, label: 'student department management must be denied' },
  ];

  for (const item of deniedMatrix) {
    await expectStatus(sessions[item.key], item.path, 403, item.label, item.method, item.body);
  }

  const roleChange = await expectStatus(sessions.admin, '/api/auth', 400, 'last admin cannot be downgraded', 'PATCH', { userId: 'local-admin', role: 'student' });
  assert.match(String(roleChange.body.error), /最后一个管理员/);

  const temporaryDepartment = `ECC-temp-${Date.now()}`;
  const createdDepartment = await expectStatus(sessions.admin, '/api/departments', 200, 'admin can create department', 'POST', { name: temporaryDepartment });
  const department = createdDepartment.body.data as { id?: string; name?: string };
  assert.equal(department.name, temporaryDepartment);
  assert.ok(department.id);
  await expectStatus(sessions.admin, `/api/departments?id=${encodeURIComponent(department.id)}`, 200, 'admin can delete temporary department', 'DELETE');

  await expectStatus(sessions.admin, '/api/auth', 200, 'admin can grant a capability', 'PATCH', { userId: 'local-student', canViewEveningStudy: true });
  await expectStatus(sessions.student, '/api/evening-study', 200, 'student sees newly granted evening study capability');
  await expectStatus(sessions.admin, '/api/auth', 200, 'admin can revoke a capability', 'PATCH', { userId: 'local-student', canViewEveningStudy: false });
  await expectStatus(sessions.student, '/api/evening-study', 403, 'student loses revoked evening study capability');

  console.log('ECC multi-user API regression: passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
