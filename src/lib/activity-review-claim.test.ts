import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as reviewTask, PUT as reviewSubmit } from '@/app/api/activities/review/route';
import { POST as scoringTask, PUT as scoringSubmit } from '@/app/api/scoring/route';
import { issueSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function req(url: string, method: string, body: unknown, token: string): NextRequest {
  return new NextRequest('http://localhost' + url, {
    method,
    headers: new Headers({ 'content-type': 'application/json', Authorization: `Bearer ${token}` }),
    body: JSON.stringify(body),
  });
}

async function createAdmin(name: string) {
  const suffix = `${Date.now()}-${Math.random()}`;
  const row = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role) VALUES ($1,'test',$2,'admin') RETURNING id",
    [name, `claim-${suffix}`],
  );
  if (!row) throw new Error('测试用户创建失败');
  return { id: row.id, name };
}

async function main() {
  await ensureDatabaseSchema();
  const a = await createAdmin('审核员甲');
  const b = await createAdmin('审核员乙');
  const tokenA = await issueSessionToken(a.id);
  const tokenB = await issueSessionToken(b.id);

  const sub = await queryOne<{ id: string }>(
    `INSERT INTO activity_submissions (full_name,start_time,end_time,category,level,leader_name,leader_phone)
     VALUES ('并发测试活动',$1,$2,'智','院系级','负责人','13800000000') RETURNING id`,
    ['2026-01-01 09:00:00', '2026-01-01 11:00:00'],
  );
  if (!sub) throw new Error('提交记录创建失败');

  try {
    // 甲领取审核任务
    assert.equal((await reviewTask(req('/api/activities/review', 'POST', { id: sub.id, action: 'claim' }, tokenA))).status, 200);
    // 乙不能同时领取
    const bClaim = await reviewTask(req('/api/activities/review', 'POST', { id: sub.id, action: 'claim' }, tokenB));
    const bClaimBody = await bClaim.json() as { error?: string };
    assert.equal(bClaim.status, 409);
    assert.ok(String(bClaimBody.error).includes('审核员甲'), bClaimBody.error);
    // 乙也不能抢先提交审核结果
    assert.equal((await reviewSubmit(req('/api/activities/review', 'PUT', { id: sub.id, review_status: '已通过' }, tokenB))).status, 409);
    // 乙释放（没持有，不应影响甲的领取）
    assert.equal((await reviewTask(req('/api/activities/review', 'POST', { id: sub.id, action: 'release' }, tokenB))).status, 200);
    assert.equal((await reviewSubmit(req('/api/activities/review', 'PUT', { id: sub.id, review_status: '已通过' }, tokenB))).status, 409);

    // 甲提交成功，并记录审核人
    const approved = await reviewSubmit(req('/api/activities/review', 'PUT', { id: sub.id, review_status: '已通过' }, tokenA));
    const approvedBody = await approved.json() as { success: boolean; activityId?: string };
    assert.equal(approved.status, 200, JSON.stringify(approvedBody));
    const submission = await queryOne<{ reviewed_by_name: string | null; review_claimed_by_id: string | null }>(
      'SELECT reviewed_by_name,review_claimed_by_id FROM activity_submissions WHERE id=$1', [sub.id],
    );
    assert.equal(submission?.reviewed_by_name, '审核员甲');
    assert.equal(submission?.review_claimed_by_id, null);
    const activity = await queryOne<{ reviewed_by_name: string | null; reviewed_at: string | null }>(
      'SELECT reviewed_by_name,reviewed_at FROM activities WHERE id=$1', [approvedBody.activityId],
    );
    assert.equal(activity?.reviewed_by_name, '审核员甲');
    assert.ok(activity?.reviewed_at);

    // 赋分任务：乙领取后甲不能处理
    const activityId = String(approvedBody.activityId);
    await query('UPDATE activities SET scoring_table_url=$1 WHERE id=$2', ['/uploads/scoring.xlsx', activityId]);
    assert.equal((await scoringTask(req('/api/scoring', 'POST', { id: activityId, action: 'claim' }, tokenB))).status, 200);
    const aClaim = await scoringTask(req('/api/scoring', 'POST', { id: activityId, action: 'claim' }, tokenA));
    assert.equal(aClaim.status, 409);
    assert.equal((await scoringSubmit(req('/api/scoring', 'PUT', { id: activityId }, tokenA))).status, 409);

    // 乙赋分成功，并记录赋分人
    const scored = await scoringSubmit(req('/api/scoring', 'PUT', { id: activityId }, tokenB));
    assert.equal(scored.status, 200);
    const scoredRow = await queryOne<{ scored_by_name: string | null; scored_at: string | null; scoring_claimed_by_id: string | null }>(
      'SELECT scored_by_name,scored_at,scoring_claimed_by_id FROM activities WHERE id=$1', [activityId],
    );
    assert.equal(scoredRow?.scored_by_name, '审核员乙');
    assert.ok(scoredRow?.scored_at);
    assert.equal(scoredRow?.scoring_claimed_by_id, null);
  } finally {
    await query('DELETE FROM activities WHERE full_name=$1', ['并发测试活动']);
    await query('DELETE FROM activity_submissions WHERE id=$1', [sub.id]);
    await query('DELETE FROM audit_logs WHERE actor_user_id=$1 OR actor_user_id=$2', [a.id, b.id]);
    await query('DELETE FROM users WHERE id=$1 OR id=$2', [a.id, b.id]);
  }
  console.log('review/scoring claim + attribution tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});