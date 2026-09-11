import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as claimTask, PUT as reviewSlip } from '@/app/api/leave-slips/review/route';
import { createSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function req(method: string, body: unknown, token: string): NextRequest {
  return new NextRequest('http://localhost/api/leave-slips/review', {
    method,
    headers: new Headers({ 'content-type': 'application/json', Authorization: `Bearer ${token}` }),
    body: JSON.stringify(body),
  });
}

async function createReviewer(name: string) {
  const suffix = `${Date.now()}-${Math.random()}`;
  const row = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role,can_review_leave) VALUES ($1,'test',$2,'student',true) RETURNING id",
    [name, `leave-claim-${suffix}`],
  );
  if (!row) throw new Error('测试用户创建失败');
  return { id: row.id, name };
}

async function main() {
  await ensureDatabaseSchema();
  const a = await createReviewer('查对员甲');
  const b = await createReviewer('查对员乙');
  const tokenA = createSessionToken(a.id);
  const tokenB = createSessionToken(b.id);

  const slip = await queryOne<{ id: string }>(
    `INSERT INTO leave_slips (applicant_user_id, applicant_name, review_status, class_names) VALUES ('someone-else','测试申请人','待查对','[]') RETURNING id`,
  );
  if (!slip) throw new Error('假条创建失败');

  try {
    // 甲领取
    assert.equal((await claimTask(req('POST', { id: slip.id, action: 'claim' }, tokenA))).status, 200);
    // 乙不能同时领取
    const bClaim = await claimTask(req('POST', { id: slip.id, action: 'claim' }, tokenB));
    const bBody = await bClaim.json() as { error?: string };
    assert.equal(bClaim.status, 409);
    assert.ok(String(bBody.error).includes('查对员甲'), bBody.error);
    // 乙不能抢先提交查对结果
    assert.equal((await reviewSlip(req('PUT', { id: slip.id, review_status: '已通过' }, tokenB))).status, 409);
    // 甲提交成功，记录查对人并释放领取
    const approved = await reviewSlip(req('PUT', { id: slip.id, review_status: '已通过' }, tokenA));
    assert.equal(approved.status, 200);
    const row = await queryOne<{ review_status: string; reviewed_by_name: string | null; review_claimed_by_id: string | null }>(
      'SELECT review_status,reviewed_by_name,review_claimed_by_id FROM leave_slips WHERE id=$1', [slip.id],
    );
    assert.equal(row?.review_status, '已通过');
    assert.equal(row?.reviewed_by_name, '查对员甲');
    assert.equal(row?.review_claimed_by_id, null);
    // 已处理的假条不能再领取
    assert.equal((await claimTask(req('POST', { id: slip.id, action: 'claim' }, tokenB))).status, 409);
  } finally {
    await query('DELETE FROM leave_slips WHERE id=$1', [slip.id]);
    await query('DELETE FROM users WHERE id=$1 OR id=$2', [a.id, b.id]);
  }
  console.log('leave slip claim tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});