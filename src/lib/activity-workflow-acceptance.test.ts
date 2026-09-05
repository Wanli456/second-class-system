import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as submit } from '@/app/api/activities/submit/route';
import { PUT as review } from '@/app/api/activities/review/route';
import { POST as create, PUT as update, DELETE as remove } from '@/app/api/activities/route';
import { PUT as score } from '@/app/api/scoring/route';
import { createSessionToken } from './auth';
import { ensureDatabaseSchema, queryOne } from '@/storage/database/supabase-client';

function request(body: Record<string, unknown>, user = 'local-leader', key = 'acceptance-key') {
  return new NextRequest('http://localhost/api/activities', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${createSessionToken(user)}`, 'Idempotency-Key': key },
    body: JSON.stringify(body) });
}

const payload = { full_name: '验收活动-并发提交', start_time: '2026-09-20 10:00:00', end_time: '2026-09-20 12:00:00',
  registration_start_time: '2026-09-10 10:00:00', registration_end_time: '2026-09-19 12:00:00',
  category: '德', category_primary: '思想政治', category_secondary: '主题学习', level: '院系级',
  scope_type: 'department', scope_name: '学生会', leader_ids: ['local-leader'] };

async function expectStatus(response: Response, status: number) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

async function expectSingleWinner(responses: Response[]) {
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  const loser = responses.find((response) => response.status !== 200)!;
  assert.ok([400, 409].includes(loser.status));
  assert.match((await loser.json()).error, /已处理|已完成赋分|状态已被其他操作更新/);
}

async function run() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  await ensureDatabaseSchema();
  await expectStatus(await submit(request(payload, 'local-student')), 403);
  await expectStatus(await submit(request(payload, 'local-leader', '')), 400);
  const responses = await Promise.all([submit(request(payload)), submit(request(payload))]);
  const submissions = await Promise.all(responses.map((response) => expectStatus(response, 200)));
  const id = submissions[0].data.id;
  assert.equal(submissions[1].data.id, id);
  assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM activity_submissions WHERE idempotency_key=$1', ['acceptance-key']))?.count), 1);
  console.log('PASS concurrent submit: 200/200, one submission', id);
  await expectStatus(await review(request({ id, review_status: '已通过' }, 'local-student')), 403);
  await expectStatus(await review(request({ id, review_status: '已驳回', review_note: '请补充材料' }, 'local-publisher')), 200);
  await expectStatus(await review(request({ id, review_status: '已通过' }, 'local-publisher')), 400);
  await expectStatus(await submit(request({ ...payload, submission_id: id, full_name: '验收活动-重提' }, 'local-leader', 'acceptance-resubmit')), 200);
  assert.equal((await queryOne('SELECT review_status FROM activity_submissions WHERE id=$1', [id]))?.review_status, '待审核');
  const reviewed = await Promise.all([review(request({ id, review_status: '已通过' }, 'local-publisher')), review(request({ id, review_status: '已通过' }, 'local-publisher'))]);
  await expectSingleWinner(reviewed);
  const approved = await (reviewed.find((response) => response.status === 200)!).json();
  const activityId = approved.activityId;
  assert.ok(activityId);
  assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM activities WHERE full_name=$1', ['验收活动-重提']))?.count), 1);
  assert.equal((await queryOne('SELECT activity_id FROM activity_submissions WHERE id=$1', [id]))?.activity_id, activityId);
  console.log('PASS rejection/resubmit/concurrent approval:', reviewed.map((response) => response.status), 'one activity', activityId);
  await expectStatus(await score(request({ id: activityId }, 'local-scorer')), 400);
  await expectStatus(await update(request({ id: activityId, scoring_table_url: '/uploads/acceptance.xlsx' })), 200);
  const scored = await Promise.all([score(request({ id: activityId }, 'local-scorer')), score(request({ id: activityId }, 'local-scorer'))]);
  await expectSingleWinner(scored);
  assert.equal((await queryOne('SELECT scoring_status FROM activities WHERE id=$1', [activityId]))?.scoring_status, '已赋分');
  await expectStatus(await score(request({ id: activityId }, 'local-scorer')), 400);
  await expectStatus(await update(request({ id: activityId, scoring_table_url: '/uploads/replaced.xlsx' })), 400);
  await expectStatus(await submit(request({ ...payload, submission_id: id }, 'local-leader', 'acceptance-after-approval')), 400);
  console.log('PASS scoring materials/concurrent scoring:', scored.map((response) => response.status), 'repeated scoring and replacement: 400');
  await expectStatus(await remove(new NextRequest(`http://localhost/api/activities?id=${activityId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${createSessionToken('local-admin')}` } })), 200);
  assert.equal((await queryOne('SELECT status FROM activities WHERE id=$1', [activityId]))?.status, '活动取消');
  const canceled = await expectStatus(await score(request({ id: activityId }, 'local-scorer')), 400);
  assert.equal(canceled.error, '仅正常活动可以进行赋分');
  console.log('PASS linked activity deletion preserves history and cancels activity');
  const standalone = await expectStatus(await create(request({ ...payload, full_name: '验收活动-无关联', level: '校级', leader_name: '本地负责人', leader_phone: '9000000005' }, 'local-admin')), 200);
  const standaloneId = standalone.data.id;
  await expectStatus(await update(request({ id: standaloneId, scoring_table_url: '/uploads/acceptance.xlsx' })), 400);
  await expectStatus(await update(request({ id: standaloneId, scoring_table_url: '/uploads/acceptance.xlsx', record_photo_url: '/uploads/acceptance.png' })), 200);
  await expectStatus(await score(request({ id: standaloneId }, 'local-scorer')), 200);
  await expectStatus(await remove(new NextRequest(`http://localhost/api/activities?id=${standaloneId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${createSessionToken('local-admin')}` } })), 200);
  assert.equal(await queryOne('SELECT id FROM activities WHERE id=$1', [standaloneId]), null);
  console.log('PASS school-level materials validation and unlinked activity deletion', standaloneId);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
