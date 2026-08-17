import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PATCH as patchUser } from '../src/app/api/auth/route';
import { GET as getLeave, POST as postLeave, PUT as reviewLeave } from '../src/app/api/leave/route';
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
  const passwordResponse = await patchUser(request('http://localhost/api/auth', 'PATCH', 'local-admin', {
    userId: 'local-student',
    password: 'updated-test-password',
  }));
  assert.equal(passwordResponse.status, 200, '管理员应能重置用户密码');

  const createResponse = await postLeave(request('http://localhost/api/leave', 'POST', 'local-leader', {
    mode: 'group',
    student_ids: ['9000000005', '9000000006'],
    leave_type: '事假',
    leave_image_url: '/uploads/group-leave.png',
    leave_image_name: 'group-leave.png',
    start_time: '2026-08-17T10:00:00.000Z',
    end_time: '2026-08-17T11:00:00.000Z',
  }));
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json() as { success: boolean; group: { id: string }; data: Array<{ id: string }> };
  assert.equal(created.success, true);
  assert.equal(created.data.length, 2);

  const reviewResponse = await reviewLeave(request('http://localhost/api/leave', 'PUT', 'local-admin', {
    group_id: created.group.id,
    review_status: '已驳回',
    review_note: '材料待补充',
  }));
  assert.equal(reviewResponse.status, 200);

  const memberStatusResponse = await getLeave(request('http://localhost/api/leave', 'GET', 'local-student'));
  assert.equal(memberStatusResponse.status, 200);
  const memberStatus = await memberStatusResponse.json() as { success: boolean; data: Array<{ group_id?: string | null; review_status: string }> };
  assert.equal(memberStatus.success, true);
  const visibleGroupRecords = memberStatus.data.filter((item) => item.group_id === created.group.id);
  assert.equal(visibleGroupRecords.length, 2, '集体请假成员应能看到完整的集体假记录');

  const nonOwnerResubmit = await postLeave(request('http://localhost/api/leave', 'POST', 'local-student', {
    leave_request_id: created.data[1].id,
    student_ids: ['9000000005', '9000000006'],
    leave_type: '事假',
    leave_image_url: '/uploads/group-leave.png',
    leave_image_name: 'group-leave.png',
    start_time: '2026-08-17T10:00:00.000Z',
    end_time: '2026-08-17T11:00:00.000Z',
  }));
  assert.equal(nonOwnerResubmit.status, 403, '非发起成员不得重新提交集体请假');

  console.log('group leave API tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
