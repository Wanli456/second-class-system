import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getLeave } from '../src/app/api/leave/route';
import { createSessionToken } from '../src/lib/auth';
import { query } from '../src/storage/database/supabase-client';

async function run() {
  await query(
    `INSERT INTO leave_requests (id,student_id,class_name,student_name,leave_type,start_time,end_time,review_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      'date-boundary-test',
      'date-test',
      '计算机2101',
      '日期测试',
      '事假',
      '2026-08-28T18:30:00.000Z',
      '2026-08-28T20:30:00.000Z',
      '已通过',
    ],
  );

  const overlapCondition = `
    start_time < (($1::timestamp + INTERVAL '1 day') - INTERVAL '8 hours')
    AND end_time > ($1::timestamp - INTERVAL '8 hours')
  `;
  const day28 = await query(
    `SELECT id FROM leave_requests WHERE id=$2 AND ${overlapCondition}`,
    ['2026-08-28', 'date-boundary-test'],
  );
  const day29 = await query(
    `SELECT id FROM leave_requests WHERE id=$2 AND ${overlapCondition}`,
    ['2026-08-29', 'date-boundary-test'],
  );

  assert.deepEqual(day28, [], '中国时间 29 日的记录不应出现在 28 日查询');
  assert.equal(day29.length, 1, '中国时间 29 日的记录应出现在 29 日查询');

  const request = (date: string) => new NextRequest(`http://localhost/api/leave?class=${encodeURIComponent('计算机2101')}&date=${date}`, {
    headers: { cookie: `second_class_session=${createSessionToken('local-admin')}` },
  });
  const routeDay28 = await getLeave(request('2026-08-28'));
  const routeDay29 = await getLeave(request('2026-08-29'));
  const routeDay28Payload = await routeDay28.json() as { data?: Array<{ id: string }> };
  const routeDay29Payload = await routeDay29.json() as { data?: Array<{ id: string }> };
  assert.equal(routeDay28.status, 200);
  assert.equal(routeDay29.status, 200);
  assert.equal(routeDay28Payload.data?.some((item) => item.id === 'date-boundary-test'), false);
  assert.equal(routeDay29Payload.data?.some((item) => item.id === 'date-boundary-test'), true);
  console.log('evening study date boundary: passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
