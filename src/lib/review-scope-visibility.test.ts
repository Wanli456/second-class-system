import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as listReview } from '@/app/api/activities/review/route';
import { GET as listScoring } from '@/app/api/scoring/route';
import { createSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

function get(url: string, token: string): NextRequest {
  return new NextRequest('http://localhost' + url, {
    method: 'GET',
    headers: new Headers({ Authorization: `Bearer ${token}` }),
  });
}

async function createReviewer(options: { canPublish?: boolean; canScore?: boolean }) {
  const suffix = `${Date.now()}-${Math.random()}`;
  const row = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role,department,can_publish,can_score) VALUES ($1,'test',$2,'student','其他学院',$3,$4) RETURNING id",
    [`跨部门审核${suffix}`, `scope-${suffix}`, options.canPublish ?? false, options.canScore ?? false],
  );
  if (!row) throw new Error('测试用户创建失败');
  return row.id;
}

async function main() {
  await ensureDatabaseSchema();
  const publisher = await createReviewer({ canPublish: true });
  const scorer = await createReviewer({ canScore: true });
  const tokenPublisher = createSessionToken(publisher);
  const tokenScorer = createSessionToken(scorer);
  const suffix = `${Date.now()}-${Math.random()}`;

  const submission = await queryOne<{ id: string }>(
    `INSERT INTO activity_submissions (full_name,start_time,end_time,category,level,leader_name,leader_phone,scope_type,scope_name,scope_names)
     VALUES ($1,'2026-01-01 09:00:00','2026-01-01 11:00:00','智','院系级','负责人','13800000000','department','学生会','["学生会"]') RETURNING id`,
    [`跨部门待审活动${suffix}`],
  );
  const activityId = `SCOPE-${suffix}`;
  await query(
    `INSERT INTO activities (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,scope_type,scope_name,scope_names,status,scoring_status)
     VALUES ($1,$2,'2026-01-01 09:00:00','2026-01-01 11:00:00','智','院系级','负责人','13800000000','department','学生会','["学生会"]','正常活动','待赋分')`,
    [activityId, `跨部门待赋分活动${suffix}`],
  );

  try {
    // 审核列表：部门是"其他学院"的审核员，必须能看到"学生会"主办的待审提交
    const reviewBody = await (await listReview(get('/api/activities/review', tokenPublisher))).json() as { success: boolean; data: Array<{ id: string }> };
    assert.equal(reviewBody.success, true);
    assert.ok(
      reviewBody.data.some((item) => item.id === submission?.id),
      '有审核权限的跨部门成员应当能看到其他部门主办的待审提交',
    );

    // 赋分列表：同理
    const scoringBody = await (await listScoring(get('/api/scoring?status=all', tokenScorer))).json() as { success: boolean; data: Array<{ id: string }> };
    assert.equal(scoringBody.success, true);
    assert.ok(
      scoringBody.data.some((item) => item.id === activityId),
      '有赋分权限的跨部门成员应当能看到其他部门主办的活动',
    );
  } finally {
    await query('DELETE FROM activity_submissions WHERE id=$1', [submission?.id]);
    await query('DELETE FROM activities WHERE id=$1', [activityId]);
    await query('DELETE FROM users WHERE id=$1 OR id=$2', [publisher, scorer]);
  }
  console.log('cross-department review/scoring visibility tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});