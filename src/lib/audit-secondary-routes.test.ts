import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as createDepartment, DELETE as deleteDepartment } from '@/app/api/departments/route';
import { POST as createRoster, PUT as updateRoster, DELETE as deleteRoster } from '@/app/api/class-roster/route';
import { POST as replaceDepartmentRoster } from '@/app/api/department-class-roster/route';
import { PUT as updateNotification, DELETE as deleteNotification } from '@/app/api/notifications/route';
import { POST as createEvening, PUT as updateEvening, DELETE as deleteEvening } from '@/app/api/evening-study/route';
import { issueSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

const admin = () => issueSessionToken('local-admin');
function request(url: string, method: string, body?: unknown, token?: string, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function count(action: string) {
  const row = await queryOne<{ count: string }>('SELECT COUNT(*) AS count FROM audit_logs WHERE action=$1', [action]);
  return Number(row?.count || 0);
}
async function expectStatus(response: Response, status = 200) {
  assert.equal(response.status, status, JSON.stringify(await response.json()));
}

async function run(): Promise<void> {
  await ensureDatabaseSchema();
  await query('CREATE UNIQUE INDEX IF NOT EXISTS evening_study_schedules_idempotency_key_idx ON evening_study_schedules (idempotency_key)');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS evening_study_attendance_idempotency_key_idx ON evening_study_attendance (idempotency_key)');
  await query('DELETE FROM audit_logs');
  const token = await admin();
  const suffix = Date.now().toString();

  await expectStatus(await createDepartment(request('/api/departments', 'POST', { name: `审计部${suffix}` }, token)));
  assert.equal(await count('create_department'), 1);
  await expectStatus(await createDepartment(request('/api/departments', 'POST', {}, token)), 400);
  assert.equal(await count('create_department'), 1);
  const department = await queryOne<{ id: string }>('SELECT id FROM departments WHERE name=$1', [`审计部${suffix}`]);
  assert.ok(department);
  await expectStatus(await deleteDepartment(request(`/api/departments?id=${department.id}`, 'DELETE', undefined, token)));
  assert.equal(await count('delete_department'), 1);

  await expectStatus(await createRoster(request('/api/class-roster', 'POST', { className: `审计班${suffix}`, students: [{ studentId: `sid-${suffix}`, studentName: '测试学生' }] }, token)));
  assert.equal(await count('create_class_roster'), 1);
  const roster = await queryOne<{ id: string }>('SELECT id FROM class_roster WHERE student_id=$1', [`sid-${suffix}`]);
  assert.ok(roster);
  await expectStatus(await updateRoster(request('/api/class-roster', 'PUT', { id: roster.id, studentId: `sid2-${suffix}`, studentName: '测试学生二' }, token)));
  assert.equal(await count('update_class_roster'), 1);
  await expectStatus(await deleteRoster(request(`/api/class-roster?id=${roster.id}`, 'DELETE', undefined, token)));
  assert.equal(await count('delete_class_roster'), 1);

  await expectStatus(await replaceDepartmentRoster(request('/api/department-class-roster', 'POST', { className: `审计班${suffix}`, students: [{ studentId: `dept-sid-${suffix}`, studentName: '测试学生' }] }, token)));
  assert.equal(await count('replace_department_class_roster'), 1);
  await expectStatus(await replaceDepartmentRoster(request('/api/department-class-roster', 'POST', { className: `审计班${suffix}`, students: [] }, token)), 400);
  assert.equal(await count('replace_department_class_roster'), 1);

  await query('INSERT INTO notifications (user_id,type,title,content,is_read) VALUES ($1,$2,$3,$4,$5)', ['local-admin', 'audit-test', '测试通知', '测试内容', false]);
  const notification = await queryOne<{ id: string }>('SELECT id FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', ['local-admin']);
  assert.ok(notification);
  await expectStatus(await updateNotification(request('/api/notifications', 'PUT', { notificationId: notification.id }, token)));
  assert.equal(await count('mark_notification_read'), 1);
  await expectStatus(await updateNotification(request('/api/notifications', 'PUT', { notificationId: notification.id, userId: 'local-admin' }, token)));
  assert.equal(await count('mark_notification_read'), 1);
  await expectStatus(await deleteNotification(request('/api/notifications', 'DELETE', { notificationId: notification.id }, token)));
  assert.equal(await count('delete_notification'), 1);

  await expectStatus(await createEvening(request('/api/evening-study', 'POST', { type: 'schedule', date: '2099-01-01', weekday: '星期五', class_name: `审计班${suffix}`, classroom: '测试教室', checker_name: '测试人', checker_phone: '123', notes: '', }, token, { 'Idempotency-Key': `schedule-${suffix}` })));
  assert.equal(await count('create_evening_study_schedule'), 1);
  await expectStatus(await createEvening(request('/api/evening-study', 'POST', { type: 'schedule', date: '2099-01-01', weekday: '星期五', class_name: `审计班${suffix}`, classroom: '测试教室', checker_name: '测试人', checker_phone: '123', notes: '', }, token, { 'Idempotency-Key': `schedule-${suffix}` })));
  assert.equal(await count('create_evening_study_schedule'), 1);
  const schedule = await queryOne<{ id: string }>('SELECT id FROM evening_study_schedules WHERE class_name=$1', [`审计班${suffix}`]);
  assert.ok(schedule);
  await expectStatus(await createEvening(request('/api/evening-study', 'POST', { type: 'attendance', schedule_id: schedule.id, date: '2099-01-01', class_name: `审计班${suffix}`, total_count: 10, present_count: 9, discipline_status: '良好', notes: '', checker_name: '测试人' }, token, { 'Idempotency-Key': `attendance-${suffix}` })));
  assert.equal(await count('create_evening_study_attendance'), 1);
  await expectStatus(await updateEvening(request('/api/evening-study', 'PUT', { id: schedule.id, notes: '更新' }, token)));
  assert.equal(await count('update_evening_study_schedule'), 1);
  await expectStatus(await deleteEvening(request(`/api/evening-study?id=${schedule.id}`, 'DELETE', undefined, token)), 409);
  assert.equal(await count('delete_evening_study_schedule'), 0);
  await expectStatus(await createEvening(request('/api/evening-study', 'POST', { type: 'schedule', date: '2099-01-02', weekday: '星期六', class_name: `审计班${suffix}`, classroom: '测试教室', checker_name: '测试人', checker_phone: '123', notes: '', }, token, { 'Idempotency-Key': `schedule-delete-${suffix}` })));
  const deletableSchedule = await queryOne<{ id: string }>('SELECT id FROM evening_study_schedules WHERE date=$1', ['2099-01-02']);
  assert.ok(deletableSchedule);
  await expectStatus(await deleteEvening(request(`/api/evening-study?id=${deletableSchedule.id}`, 'DELETE', undefined, token)));
  assert.equal(await count('delete_evening_study_schedule'), 1);

  const beforeDenied = await count('create_department');
  await expectStatus(await createDepartment(request('/api/departments', 'POST', { name: `拒绝部${suffix}` })), 401);
  assert.equal(await count('create_department'), beforeDenied);
  const auditRows = await query<{ details: unknown }>('SELECT details FROM audit_logs');
  assert.ok(auditRows.every((row) => !JSON.stringify(row.details).includes('测试学生')));
  assert.ok(auditRows.every((row) => !JSON.stringify(row.details).includes('123')));
  console.log('secondary route audit success/rejection/count tests passed');
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
