import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as submit, GET as readSubmission } from '@/app/api/activities/submit/route';
import { PUT as review, GET as readReview } from '@/app/api/activities/review/route';
import { GET as readActivities, PUT as updateActivity } from '@/app/api/activities/route';
import { createSessionToken, issueSessionToken } from './auth';
import { ensureDatabaseSchema, query } from '@/storage/database/supabase-client';
import { findFileReferences, detachFileReferences } from './data-retention-files';

const image = '/uploads/activity-image.png';
const replacement = '/uploads/activity-image-replaced.jpg';
const payload = { full_name: '活动图片验收', start_time: '2026-09-20 10:00:00', end_time: '2026-09-20 12:00:00',
  registration_start_time: '2026-09-10 10:00:00', registration_end_time: '2026-09-19 12:00:00',
  category: '德', category_primary: '思想政治', category_secondary: '主题学习活动', level: '院系级',
  scope_type: 'department', scope_name: '学生会', leader_ids: ['local-leader'], activity_image_url: image };
let key = 0;
let adminToken = '';
function request(url: string, body?: object, user = 'local-leader') {
  return new NextRequest('http://localhost' + url, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user === 'local-admin' ? adminToken : createSessionToken(user)}`, 'Idempotency-Key': `image-test-${++key}` },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function expect(response: Response, status = 200) {
  const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body;
}
async function run() {
  assert.equal(process.env.NODE_ENV, 'test'); assert.equal(process.env.PGDATABASE_URL, '');
  await ensureDatabaseSchema(); adminToken = await issueSessionToken('local-admin');
  // Missing images must be rejected even if the browser checks are bypassed.
  await expect(await submit(request('/api/activities/submit', { ...payload, activity_image_url: null })), 400);
  for (const url of [image, replacement]) await query('INSERT INTO upload_assets (url,uploaded_by_user_id,purpose) VALUES ($1,$2,$3)', [url, 'local-leader', 'activity']);
  await query('INSERT INTO upload_assets (url,uploaded_by_user_id,purpose) VALUES ($1,$2,$3)', ['/uploads/other-user.png', 'local-student', 'leave']);
  for (const url of ['https://example.com/image.png', '/uploads/../secret.png', '/uploads/document.pdf', '/uploads/missing.png', '/uploads/other-user.png']) {
    await expect(await submit(request('/api/activities/submit', { ...payload, activity_image_url: url })), 400);
  }
  const created = await expect(await submit(request('/api/activities/submit', payload)));
  assert.equal(created.data.activity_image_url, image);
  const id = created.data.id;
  const submitted = await expect(await readSubmission(request('/api/activities/submit?submission_id=' + id)));
  assert.ok(submitted.data.some((row: { id: string; activity_image_url: string }) => row.id === id && row.activity_image_url === image));
  const pending = await expect(await readReview(request('/api/activities/review', undefined, 'local-publisher')));
  assert.equal(pending.data.find((row: { id: string }) => row.id === id).activity_image_url, image);
  await query('INSERT INTO file_cleanup_jobs (asset_url,status) VALUES ($1,$2)', [image, 'pending_database_manual_confirmed']);
  await expect(await review(request('/api/activities/review', { id, review_status: '已通过' }, 'local-publisher')), 409);
  const unchanged = await expect(await readReview(request('/api/activities/review', undefined, 'local-publisher')));
  assert.equal(unchanged.data.find((row: { id: string }) => row.id === id).review_status, '待审核');
  await expect(await submit(request('/api/activities/submit', { ...payload, submission_id: id })), 400);
  await expect(await review(request('/api/activities/review', { id, review_status: '已驳回' }, 'local-publisher')));
  const resubmitted = await expect(await submit(request('/api/activities/submit', { ...payload, submission_id: id, activity_image_url: replacement })));
  assert.equal(resubmitted.data.activity_image_url, replacement);
  assert.equal((await findFileReferences(image)).length, 0);
  const approved = await expect(await review(request('/api/activities/review', { id, review_status: '已通过' }, 'local-publisher')));
  const activityId = approved.activityId;
  await expect(await updateActivity(request('/api/activities', { id: activityId, full_name: '图片保留验收' }, 'local-admin')));
  const activities = await expect(await readActivities(request('/api/activities?id=' + activityId, undefined, 'local-admin')));
  assert.equal(activities.data[0].activity_image_url, replacement, 'approval and unrelated edits preserve the image');
  assert.deepEqual((await findFileReferences(replacement)).map((row) => row.kind).sort(), ['activities.activity_image_url', 'activity_submissions.activity_image_url']);
  assert.equal((await detachFileReferences(replacement)).detached, 2, 'existing cleanup must detach both references');
  const legacy = await expect(await readActivities(request('/api/activities?id=' + activityId, undefined, 'local-admin')));
  assert.equal(legacy.data[0].activity_image_url, null, 'records without images remain readable');
  console.log('PASS activity image: required, trusted upload, replacement, approval, readback, retention');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
