import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getEveningStudy } from '@/app/api/evening-study/route';
import { GET as getLeaveSlips, POST as submitLeaveSlip } from '@/app/api/leave-slips/route';
import { PUT as reviewLeaveSlip } from '@/app/api/leave-slips/review/route';
import { createSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

type Json = Record<string, unknown>;

function request(url: string, method: string, userId?: string, json?: unknown, key?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (userId) headers.set('authorization', `Bearer ${createSessionToken(userId)}`);
  if (key) headers.set('Idempotency-Key', key);
  return new NextRequest(url, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
}

async function responseJson(response: Response): Promise<Json> {
  return await response.json() as Json;
}

function payload() {
  return {
    slip_type: '手写假条', leave_type: '病假', counselor_signature: true,
    students: [{ student_id: '9000000006', student_name: '本地学生', class_name: '计算机2101' }],
    start_time: '2026-09-06T18:30:00', end_time: '2026-09-06T21:30:00',
    images: [{ url: '/uploads/leave-workflow-acceptance.png', name: 'leave.png' }],
  };
}

async function submit(key: string) {
  const response = await submitLeaveSlip(request('http://localhost/api/leave-slips', 'POST', 'local-admin', payload(), key));
  assert.equal(response.status, 200);
  const result = await responseJson(response);
  assert.equal(result.success, true);
  return String((result.data as Json).id);
}

async function run(): Promise<void> {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  await ensureDatabaseSchema();

  assert.equal((await submitLeaveSlip(request('http://localhost/api/leave-slips', 'POST', undefined, payload(), 'leave-acceptance-anon'))).status, 401);
  assert.equal((await submitLeaveSlip(request('http://localhost/api/leave-slips', 'POST', 'local-student', payload(), 'leave-acceptance-denied'))).status, 403);

  const approvedId = await submit('leave-acceptance-approved');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM leave_slips WHERE idempotency_key=$1', ['leave-acceptance-approved']))?.count, 1);
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM leave_slip_students WHERE slip_id=$1', [approvedId]))?.count, 1);
  const repeated = await submitLeaveSlip(request('http://localhost/api/leave-slips', 'POST', 'local-admin', payload(), 'leave-acceptance-approved'));
  assert.equal(repeated.status, 200);
  const repeatedBody = await responseJson(repeated);
  assert.equal(String((repeatedBody.data as Json).id), approvedId);
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM leave_slips WHERE idempotency_key=$1', ['leave-acceptance-approved']))?.count, 1);
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM leave_slip_students WHERE slip_id=$1', [approvedId]))?.count, 1);

  assert.equal((await reviewLeaveSlip(request('http://localhost/api/leave-slips/review', 'PUT', 'local-student', { id: approvedId, review_status: '已通过' }))).status, 403);
  assert.equal((await reviewLeaveSlip(request('http://localhost/api/leave-slips/review', 'PUT', 'local-leave-reviewer', { id: approvedId, review_status: '已通过', review_note: '材料符合' }))).status, 200);
  assert.equal((await queryOne<{ review_status: string }>('SELECT review_status FROM leave_slips WHERE id=$1', [approvedId]))?.review_status, '已通过');

  const rejectedId = await submit('leave-acceptance-rejected');
  assert.equal((await reviewLeaveSlip(request('http://localhost/api/leave-slips/review', 'PUT', 'local-leave-reviewer', { id: rejectedId, review_status: '已驳回', review_note: '缺少材料' }))).status, 200);
  assert.equal((await queryOne<{ review_status: string }>('SELECT review_status FROM leave_slips WHERE id=$1', [rejectedId]))?.review_status, '已驳回');

  await query(`INSERT INTO users (id, username, password, student_id, role, can_review_leave, class_name) VALUES ($1,$2,$3,$4,$5,true,$6)`, ['leave-acceptance-reviewer-2', '第二查对员', 'test123', '9000000098', 'student', '计算机2101']);
  const concurrentId = await submit('leave-acceptance-concurrent');
  const concurrent = await Promise.all([
    reviewLeaveSlip(request('http://localhost/api/leave-slips/review', 'PUT', 'local-leave-reviewer', { id: concurrentId, review_status: '已通过' })),
    reviewLeaveSlip(request('http://localhost/api/leave-slips/review', 'PUT', 'leave-acceptance-reviewer-2', { id: concurrentId, review_status: '已驳回' })),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
  const winningIndex = concurrent.findIndex((response) => response.status === 200);
  const winningResponse = concurrent[winningIndex]!;
  const expectedWinner = [
    { review_status: '已通过', reviewed_by_user_id: 'local-leave-reviewer' },
    { review_status: '已驳回', reviewed_by_user_id: 'leave-acceptance-reviewer-2' },
  ][winningIndex]!;
  const winningData = (await responseJson(winningResponse)).data as Json;
  const finalConcurrent = await queryOne<{ review_status: string; reviewed_by_user_id: string }>('SELECT review_status, reviewed_by_user_id FROM leave_slips WHERE id=$1', [concurrentId]);
  assert.equal(winningData.review_status, expectedWinner.review_status);
  assert.equal(winningData.reviewed_by_user_id, expectedWinner.reviewed_by_user_id);
  assert.equal(finalConcurrent?.review_status, expectedWinner.review_status);
  assert.equal(finalConcurrent?.reviewed_by_user_id, expectedWinner.reviewed_by_user_id);
  assert.equal((await reviewLeaveSlip(request('http://localhost/api/leave-slips/review', 'PUT', 'local-leave-reviewer', { id: concurrentId, review_status: '已通过' }))).status, 409);

  const status = await getLeaveSlips(request('http://localhost/api/leave-slips?status=%E5%B7%B2%E9%80%9A%E8%BF%87', 'GET', 'local-admin'));
  assert.equal(status.status, 200);
  assert.ok(((await responseJson(status)).data as Json[]).some((slip) => slip.id === approvedId && slip.review_status === '已通过'));

  await query(`INSERT INTO evening_study_schedules (id, date, weekday, class_name, classroom) VALUES ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10)`, ['leave-acceptance-evening-1', '2026-09-06', '星期日', '计算机2101', 'A101', 'leave-acceptance-evening-2', '2026-09-06', '星期日', '软件2101', 'B201']);
  await query(`INSERT INTO evening_study_attendance (schedule_id, date, class_name, total_count, present_count, absent_count, checker_name) VALUES ($1,$2,$3,$4,$5,$6,$7)`, ['leave-acceptance-evening-1', '2026-09-06', '计算机2101', 30, 29, 1, '本地管理员']);
  assert.equal((await getEveningStudy(request('http://localhost/api/evening-study?type=attendance', 'GET', 'local-student'))).status, 403);
  const attendance = await getEveningStudy(request('http://localhost/api/evening-study?type=attendance&class=%E8%AE%A1%E7%AE%97%E6%9C%BA2101', 'GET', 'local-admin'));
  assert.equal(attendance.status, 200);
  assert.equal(((await responseJson(attendance)).data as Json[]).length, 1);
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM evening_study_attendance WHERE class_name=$1', ['计算机2101']))?.count, 1);
  const schedules = await getEveningStudy(request('http://localhost/api/evening-study?date=2026-09-06', 'GET', 'local-admin'));
  assert.equal(schedules.status, 200);
  assert.deepEqual(((await responseJson(schedules)).data as Json[]).map((item) => item.class_name).sort(), ['计算机2101', '软件2101']);
  console.log('leave workflow acceptance tests passed');
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
