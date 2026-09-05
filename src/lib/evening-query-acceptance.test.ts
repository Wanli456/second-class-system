import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
type Result = { success: boolean; error?: string; data: Row[]; students?: Row[]; count?: number };
type Handler = (request: NextRequest) => Promise<Response>;
const date = '2099-06-15';
const classA = '晚自习验收甲班';
const classB = '晚自习验收乙班';
const ids = (rows: Row[]) => rows.map((row) => String(row.id)).sort();

async function run() {
  // Guard before database-dependent imports: direct execution must fail closed.
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  assert.ok(process.env.AUTH_SESSION_SECRET);
  const { ensureDatabaseSchema, query } = await import('@/storage/database/supabase-client');
  const { createSessionToken } = await import('./auth');
  const { GET: leave } = await import('@/app/api/leave-slips/route');
  const { GET: attendance } = await import('@/app/api/attendance-work/route');
  await ensureDatabaseSchema();

  async function get(handler: Handler, path: string, user?: string, status = 200) {
    const headers = user ? { authorization: `Bearer ${createSessionToken(user)}` } : undefined;
    const response = await handler(new NextRequest(`http://localhost${path}`, { headers }));
    const body = await response.json() as Result;
    assert.equal(response.status, status, `${user ?? 'anonymous'} ${path}: ${JSON.stringify(body)}`);
    assert.equal(body.success, status === 200);
    return body;
  }
  const leavePath = (className = classA, day = date, status?: string, evening = false) =>
    `/api/leave-slips?${new URLSearchParams({ class: className, date: day, ...(status ? { status } : {}), ...(evening ? { evening: '1' } : {}) })}`;
  const dutyPath = (status?: string, day = date) =>
    `/api/attendance-work?${new URLSearchParams({ date: day, ...(status ? { review_status: status } : {}) })}`;

  const users = [
    ['eq-evening', true, false, false, false, false],
    ['eq-query', false, true, false, false, false],
    ['eq-both', true, true, false, false, false],
    ['eq-review', false, false, true, false, false],
    ['eq-manager', false, false, false, true, false],
    ['eq-original', false, false, false, false, true],
    ['eq-none', false, false, false, false, false],
  ] as const;
  for (const [id, evening, canQuery, review, manage, original] of users) {
    await query(`INSERT INTO users (id, username, password, student_id, role, class_name,
      can_view_evening_study, can_query_leave, can_review_leave,
      can_manage_attendance_work, can_manage_original_leave)
      VALUES ($1,$2,$3,$4,'student',$5,$6,$7,$8,$9,$10)`,
    [id, id, 'test-only', `${id}-number`, classB, evening, canQuery, review, manage, original]);
  }

  const slips = [
    ['eq-approved', classA, '已通过', '15T18:30:00', '15T20:30:00', '14T12:00:00'],
    ['eq-pending', classA, '待查对', '14T23:30:00', '15T01:00:00', '14T12:00:00'],
    ['eq-rejected', classA, '已驳回', '15T00:00:00', '16T00:00:00', '14T12:00:00'],
    ['eq-midnight', classA, '已通过', '15T23:59:59', '16T00:00:00', '14T12:00:00'],
    ['eq-created-today', classA, '已通过', null, null, '15T12:00:00'],
    ['eq-other-class', classB, '已通过', '15T18:30:00', '15T20:30:00', '14T12:00:00'],
    ['eq-previous', classA, '已通过', '14T12:00:00', '14T23:59:59', '14T12:00:00'],
    ['eq-next-midnight', classA, '已通过', '16T00:00:00', '17T00:00:00', '16T00:00:00'],
  ] as const;
  for (const [id, className, status, start, end, created] of slips) {
    await query(`INSERT INTO leave_slips (id, class_names, applicant_user_id, slip_type,
      leave_type, start_time, end_time, created_at, review_status, activity_name,
      image_hashes, duplicate_warning)
      VALUES ($1,$2,'eq-none','手写假条','病假',$3,$4,$5,$6,NULL,$7,$8)`,
    [id, JSON.stringify([className]), start ? `2099-06-${start}` : null, end ? `2099-06-${end}` : null,
      `2099-06-${created}`, status, '["private-hash"]', '内部提示']);
    await query(`INSERT INTO leave_slip_students (id, slip_id, student_id, student_name, class_name)
      VALUES ($1,$2,$3,$4,$5)`, [id + '-student', id, id + '-number', id + '-姓名', className]);
  }

  const expectedSlips = ['eq-approved', 'eq-pending', 'eq-rejected', 'eq-midnight', 'eq-created-today'].sort();
  function checkSlips(body: Result, expected: string[]) {
    assert.deepEqual(ids(body.data), [...expected].sort());
    assert.equal(body.count, expected.length);
    assert.ok(Array.isArray(body.students));
    assert.deepEqual(ids(body.students), expected.map((id) => id + '-student').sort());
    for (const row of body.data) {
      const fixture = slips.find(([id]) => id === row.id)!;
      assert.equal(row.class_names, JSON.stringify([fixture[1]]));
      assert.equal(row.review_status, fixture[2]);
      assert.equal(row.start_time, fixture[3] ? `2099-06-${fixture[3]}` : null);
      assert.equal(row.end_time, fixture[4] ? `2099-06-${fixture[4]}` : null);
      assert.equal(row.leave_type, '病假');
      assert.equal(row.slip_type, '手写假条');
      assert.equal(row.activity_name, null);
      for (const field of ['image_hashes', 'duplicate_of_slip_id', 'duplicate_score',
        'duplicate_warning', 'original_image_similarity', 'original_image_difference_warning']) {
        assert.equal(Object.hasOwn(row, field), false, field);
      }
      const student: Row | undefined = body.students.find((item) => item.slip_id === row.id);
      assert.ok(student);
      assert.equal(student.id, row.id + '-student');
      assert.equal(student.student_id, row.id + '-number');
      assert.equal(student.student_name, row.id + '-姓名');
      assert.equal(student.class_name, fixture[1]);
    }
  }
  // Page sends no status: rejected/pending remain present for client-side classification.
  // Date contract is interval overlap; records without a start time fall back to creation date.
  checkSlips(await get(leave, leavePath(), 'eq-both'), expectedSlips);
  for (const user of ['eq-query', 'eq-original']) {
    checkSlips(await get(leave, leavePath(), user), expectedSlips);
  }
  checkSlips(await get(leave, leavePath(classA, date, undefined, true), 'eq-evening'), expectedSlips);
  await get(leave, leavePath(), 'eq-evening', 403);
  await get(leave, leavePath(classA, date, undefined, true), 'eq-none', 403);
  for (const status of ['已通过', '待查对', '已驳回']) {
    const expected = slips.filter(([id, , state]) => expectedSlips.includes(id) && state === status).map(([id]) => id);
    checkSlips(await get(leave, leavePath(classA, date, status), 'eq-both'), expected);
  }
  checkSlips(await get(leave, leavePath(classB), 'eq-both'), ['eq-other-class']);
  checkSlips(await get(leave, leavePath(classA, '2099-06-16'), 'eq-both'), ['eq-next-midnight']);
  checkSlips(await get(leave, leavePath(classA, '2099-06-17'), 'eq-both'), []);

  const duties = [
    ['eq-duty-single', '15', '15', '已通过'],
    ['eq-duty-start', '15', '17', '已通过'],
    ['eq-duty-end', '13', '15', '已通过'],
    ['eq-duty-range', '14', '16', '已通过'],
    ['eq-duty-before', '13', '14', '已通过'],
    ['eq-duty-after', '16', '17', '已通过'],
    ['eq-duty-pending', '15', '15', '待查对'],
    ['eq-duty-rejected', '15', '15', '已驳回'],
  ] as const;
  const schedules = (id: string) => JSON.stringify([
    { date, students: [id + '-当日值班'] },
    { date: '2099-06-16', students: [id + '-次日值班'] },
  ]);
  for (const [id, start, end, status] of duties) {
    await query(`INSERT INTO attendance_work_arrangements
      (id, name, start_date, end_date, review_status, student_names, schedules, created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'eq-manager')`,
    [id, id + '-安排', `2099-06-${start}`, `2099-06-${end}`, status,
      JSON.stringify([id + '-汇总名单']), schedules(id)]);
  }
  const approvedDuties = ['eq-duty-single', 'eq-duty-start', 'eq-duty-end', 'eq-duty-range'];
  function checkDuties(body: Result, expected: string[]) {
    assert.deepEqual(ids(body.data), [...expected].sort());
    for (const row of body.data) {
      const [id, start, end, status] = duties.find(([id]) => id === row.id)!;
      assert.equal(row.name, id + '-安排');
      assert.equal(row.start_date, `2099-06-${start}`);
      assert.equal(row.end_date, `2099-06-${end}`);
      assert.equal(row.review_status, status);
      // GET returns raw JSON; selecting the day's names is the page's responsibility.
      assert.equal(row.student_names, JSON.stringify([id + '-汇总名单']));
      assert.equal(row.schedules, schedules(id));
    }
  }
  checkDuties(await get(attendance, dutyPath('已通过'), 'eq-both'), approvedDuties);
  for (const status of [undefined, '已通过', '已驳回', '待查对']) {
    checkDuties(await get(attendance, dutyPath(status), 'eq-evening'), approvedDuties);
  }
  for (const user of ['eq-review', 'eq-manager']) {
    checkDuties(await get(attendance, dutyPath('已通过'), user), approvedDuties);
    checkDuties(await get(attendance, dutyPath('已驳回'), user), ['eq-duty-rejected']);
    checkDuties(await get(attendance, dutyPath('待查对'), user), ['eq-duty-pending']);
  }
  checkDuties(await get(attendance, dutyPath('已通过', '2099-06-18'), 'eq-both'), []);

  await get(leave, leavePath(), undefined, 401);
  await get(attendance, dutyPath('已通过'), undefined, 401);
  for (const user of ['eq-none', 'eq-evening', 'eq-review']) {
    const body = await get(leave, leavePath(), user, 403);
    assert.equal(body.error, '没有查看假条的权限');
  }
  for (const user of ['eq-none', 'eq-query']) {
    const body = await get(attendance, dutyPath('已通过'), user, 403);
    assert.equal(body.error, '暂无权限查看考勤工作安排');
  }
  console.log('evening query acceptance tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
