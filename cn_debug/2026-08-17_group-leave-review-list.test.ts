import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getLeave, POST as postLeave } from '../src/app/api/leave/route';
import { createSessionToken } from '../src/lib/auth';

function request(url: string, method: string, userId: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      cookie: `second_class_session=${createSessionToken(userId)}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function run() {
  const createdResponse = await postLeave(request('http://localhost/api/leave', 'POST', 'local-leader', {
    mode: 'group',
    student_ids: ['9000000005', '9000000006'],
    leave_type: '事假',
    start_time: '2026-08-18T10:00:00.000Z',
    end_time: '2026-08-18T11:00:00.000Z',
  }));
  assert.equal(createdResponse.status, 200);

  const reviewResponse = await getLeave(request('http://localhost/api/leave?role=admin', 'GET', 'local-admin'));
  assert.equal(reviewResponse.status, 200, '请假审核应能读取集体请假列表');
  const payload = await reviewResponse.json() as { success: boolean; groups: Array<{ member_count: number }> };
  assert.equal(payload.success, true);
  assert.equal(payload.groups.length, 1);
  assert.equal(payload.groups[0].member_count, 2);

  console.log('group leave review list: ok');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
