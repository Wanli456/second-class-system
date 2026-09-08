import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST as submitActivity } from '@/app/api/activities/submit/route';
import { POST as registerOtherCollege } from '@/app/api/other-college-registrations/route';
import { DELETE as deleteLeaveSlip, POST as createLeaveSlip, PUT as updateLeaveSlip } from '@/app/api/leave-slips/route';
import { DELETE as deleteOriginalLeaveSlip, POST as createOriginalLeaveSlip } from '@/app/api/leave-slips/originals/route';
import { POST as createAttendanceWork, PUT as updateAttendanceWork } from '@/app/api/attendance-work/route';
import { createSessionToken, issueSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

const routes = [
  'src/app/api/activities/submit/route.ts',
  'src/app/api/other-college-registrations/route.ts',
  'src/app/api/leave-slips/route.ts',
  'src/app/api/leave-slips/originals/route.ts',
  'src/app/api/attendance-work/route.ts',
];

let adminToken = '';

function request(url: string, method: string, body?: unknown, userId = 'local-admin', key?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json', Authorization: `Bearer ${userId === 'local-admin' ? adminToken : createSessionToken(userId)}` });
  if (key) headers.set('Idempotency-Key', key);
  return new NextRequest(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function expectStatus(response: Response, status = 200): Promise<Record<string, unknown>> {
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

async function auditCount(action: string): Promise<number> {
  return Number((await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM audit_logs WHERE action=$1', [action]))?.count || 0);
}

async function expectCreatedAndReplay(
  action: string,
  create: () => Promise<Response>,
  replay: () => Promise<Response>,
): Promise<Record<string, unknown>> {
  const before = await auditCount(action);
  const created = await expectStatus(await create());
  assert.equal(await auditCount(action), before + 1, `${action} should log one successful write`);
  await expectStatus(await replay());
  assert.equal(await auditCount(action), before + 1, `${action} replay must not log again`);
  return created;
}

function activityPayload(suffix: string): Record<string, unknown> {
  return {
    full_name: `核心审计活动-${suffix}`,
    activity_image_url: '/uploads/core-audit-activity.png',
    start_time: '2099-09-20 10:00:00', end_time: '2099-09-20 12:00:00',
    registration_start_time: '2099-09-10 10:00:00', registration_end_time: '2099-09-19 12:00:00',
    category: '德', category_primary: '思想政治', category_secondary: '主题学习活动', level: '院系级',
    scope_type: 'department', scope_name: '学生会', leader_ids: ['local-leader'],
  };
}

function leavePayload(): Record<string, unknown> {
  return {
    slip_type: '手写假条', leave_type: '病假', counselor_signature: true,
    students: [{ student_id: '9000000001', student_name: '本地管理员', class_name: '计算机2101' }],
    start_time: '2099-09-06T18:30:00', end_time: '2099-09-06T21:30:00',
    images: [{ url: '/uploads/core-audit-leave.png', name: 'core-audit-leave.png' }],
  };
}

async function run(): Promise<void> {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  for (const route of routes) {
    const source = readFileSync(path.join(process.cwd(), route), 'utf8');
    assert.match(source, /writeAuditLog\(/, `${route} source coverage: audit write`);
    assert.match(source, /withTransaction\(/, `${route} source coverage: transaction`);
  }
  await ensureDatabaseSchema();
  await query('INSERT INTO upload_assets (url,uploaded_by_user_id,purpose) VALUES ($1,$2,$3)', ['/uploads/core-audit-activity.png', 'local-leader', 'activity']);
  adminToken = await issueSessionToken('local-admin');
  const suffix = 'core-audit';

  const deniedActivity = await auditCount('create_activity_submission');
  await expectStatus(await submitActivity(request('/api/activities/submit', 'POST', activityPayload(suffix), 'local-student', `denied-${suffix}`)), 403);
  assert.equal(await auditCount('create_activity_submission'), deniedActivity, 'permission denial must not audit');
  await expectCreatedAndReplay(
    'create_activity_submission',
    () => submitActivity(request('/api/activities/submit', 'POST', activityPayload(suffix), 'local-leader', `activity-${suffix}`)),
    () => submitActivity(request('/api/activities/submit', 'POST', activityPayload(suffix), 'local-leader', `activity-${suffix}`)),
  );

  const otherPayload = {
    fullName: `核心审计外院活动-${suffix}`, organizer: '智能制造学院', category: '智',
    startTime: '2099-09-21 10:00:00', endTime: '2099-09-21 12:00:00', leaderName: '不应审计姓名', contactPhone: '13800000000',
    scoringTableUrl: '/uploads/core-audit-score.xlsx', scoringTableFileName: 'core-audit-score.xlsx',
    recordPhotoUrl: '/uploads/core-audit-record.png', recordPhotoFileName: 'core-audit-record.png',
  };
  const deniedOther = await auditCount('create_other_college_registration');
  await expectStatus(await registerOtherCollege(request('/api/other-college-registrations', 'POST', otherPayload, 'local-student', `denied-other-${suffix}`)), 403);
  assert.equal(await auditCount('create_other_college_registration'), deniedOther, 'permission denial must not audit');
  await expectCreatedAndReplay(
    'create_other_college_registration',
    () => registerOtherCollege(request('/api/other-college-registrations', 'POST', otherPayload, 'local-admin', `other-${suffix}`)),
    () => registerOtherCollege(request('/api/other-college-registrations', 'POST', otherPayload, 'local-admin', `other-${suffix}`)),
  );

  const deniedLeave = await auditCount('create_leave_slip');
  await expectStatus(await createLeaveSlip(request('/api/leave-slips', 'POST', leavePayload(), 'local-student', `denied-leave-${suffix}`)), 403);
  assert.equal(await auditCount('create_leave_slip'), deniedLeave, 'permission denial must not audit');
  const leave = await expectCreatedAndReplay(
    'create_leave_slip',
    () => createLeaveSlip(request('/api/leave-slips', 'POST', leavePayload(), 'local-admin', `leave-${suffix}`)),
    () => createLeaveSlip(request('/api/leave-slips', 'POST', leavePayload(), 'local-admin', `leave-${suffix}`)),
  );
  const leaveId = String((leave.data as Record<string, unknown>).id);
  const noChangeLeave = await auditCount('update_leave_slip');
  await expectStatus(await updateLeaveSlip(request('/api/leave-slips', 'PUT', { id: leaveId, leave_type: '病假', start_time: '2099-09-06T18:30:00', end_time: '2099-09-06T21:30:00' })));
  assert.equal(await auditCount('update_leave_slip'), noChangeLeave, 'unchanged leave PUT must not audit');
  const noDeleteLeave = await auditCount('delete_leave_slip');
  await expectStatus(await deleteLeaveSlip(request('/api/leave-slips?id=missing-core-audit-leave', 'DELETE')), 200);
  assert.equal(await auditCount('delete_leave_slip'), noDeleteLeave, 'missing leave DELETE must not audit');
  await expectStatus(await deleteLeaveSlip(request(`/api/leave-slips?id=${leaveId}`, 'DELETE')));
  assert.equal(await auditCount('delete_leave_slip'), noDeleteLeave + 1, 'deleted leave must audit once');

  const originalPayload = {
    activity_id: 'EK202608001', activity_name: '校园人工智能创新周', class_names: ['计算机2101'], student_names: ['不应审计姓名'],
    start_time: '2099-09-06T18:30:00', end_time: '2099-09-06T21:30:00',
    images: [{ url: '/uploads/core-audit-original.png', name: 'core-audit-original.png' }], notes: '不应审计备注', ocr_names: ['不应审计姓名'],
  };
  const deniedOriginal = await auditCount('create_original_leave_slip');
  await expectStatus(await createOriginalLeaveSlip(request('/api/leave-slips/originals', 'POST', originalPayload, 'local-student', `denied-original-${suffix}`)), 403);
  assert.equal(await auditCount('create_original_leave_slip'), deniedOriginal, 'permission denial must not audit');
  const original = await expectCreatedAndReplay(
    'create_original_leave_slip',
    () => createOriginalLeaveSlip(request('/api/leave-slips/originals', 'POST', originalPayload, 'local-admin', `original-${suffix}`)),
    () => createOriginalLeaveSlip(request('/api/leave-slips/originals', 'POST', originalPayload, 'local-admin', `original-${suffix}`)),
  );
  const originalId = String((original.data as Record<string, unknown>).id);
  const noDeleteOriginal = await auditCount('delete_original_leave_slip');
  await expectStatus(await deleteOriginalLeaveSlip(request('/api/leave-slips/originals?id=missing-core-audit-original', 'DELETE')), 200);
  assert.equal(await auditCount('delete_original_leave_slip'), noDeleteOriginal, 'missing original DELETE must not audit');
  await expectStatus(await deleteOriginalLeaveSlip(request(`/api/leave-slips/originals?id=${originalId}`, 'DELETE')));
  assert.equal(await auditCount('delete_original_leave_slip'), noDeleteOriginal + 1, 'deleted original must audit once');

  const attendancePayload = {
    name: `核心审计考勤-${suffix}`, week_start_date: '2099-09-06',
    schedules: [{ weekday: '星期一', students: ['不应审计姓名'] }],
    images: [{ url: '/uploads/core-audit-attendance.png', name: 'core-audit-attendance.png' }],
  };
  const deniedAttendance = await auditCount('create_attendance_work');
  await expectStatus(await createAttendanceWork(request('/api/attendance-work', 'POST', attendancePayload, 'local-student', `denied-attendance-${suffix}`)), 403);
  assert.equal(await auditCount('create_attendance_work'), deniedAttendance, 'permission denial must not audit');
  const attendance = await expectCreatedAndReplay(
    'create_attendance_work',
    () => createAttendanceWork(request('/api/attendance-work', 'POST', attendancePayload, 'local-admin', `attendance-${suffix}`)),
    () => createAttendanceWork(request('/api/attendance-work', 'POST', attendancePayload, 'local-admin', `attendance-${suffix}`)),
  );
  const attendanceId = String((attendance.data as Record<string, unknown>).id);
  const attendanceUpdatePayload = { id: attendanceId, ...attendancePayload };
  await expectStatus(await updateAttendanceWork(request('/api/attendance-work', 'PUT', attendanceUpdatePayload, 'local-admin')));
  const noChangeAttendance = await auditCount('update_attendance_work');
  await expectStatus(await updateAttendanceWork(request('/api/attendance-work', 'PUT', attendanceUpdatePayload, 'local-admin')));
  assert.equal(await auditCount('update_attendance_work'), noChangeAttendance, 'unchanged attendance PUT must not audit');
  const reviewedBefore = await auditCount('review_attendance_work');
  await expectStatus(await updateAttendanceWork(request('/api/attendance-work', 'PUT', { id: attendanceId, review_status: '已通过', review_note: '不应审计备注' }, 'local-leave-reviewer')));
  assert.equal(await auditCount('review_attendance_work'), reviewedBefore + 1, 'attendance review must audit once');
  await expectStatus(await updateAttendanceWork(request('/api/attendance-work', 'PUT', { id: attendanceId, review_status: '已通过', review_note: '不应审计备注' }, 'local-leave-reviewer')), 400);
  assert.equal(await auditCount('review_attendance_work'), reviewedBefore + 1, 'same-state attendance review must not audit');

  const auditRows = await query<{ details: unknown }>('SELECT details FROM audit_logs WHERE action LIKE $1', ['%attendance_work%']);
  const serializedAudit = JSON.stringify(auditRows);
  assert.doesNotMatch(serializedAudit, /不应审计姓名|13800000000|不应审计备注|core-audit-(score|record|original|attendance)\.png/);
  console.log('core route audit dynamic success/replay/rejection/no-op tests passed');
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
