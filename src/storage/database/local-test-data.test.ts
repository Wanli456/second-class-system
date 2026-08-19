import assert from 'node:assert/strict';
import { ensureDatabaseSchema, query } from './supabase-client';

async function run(): Promise<void> {
  await ensureDatabaseSchema();

  const activities = await query<{ id: string; scoring_status: string; status: string }>(
    "SELECT id, scoring_status, status FROM activities WHERE id LIKE 'EK202608%' ORDER BY id",
  );
  assert.equal(activities.length, 4);
  assert.ok(activities.some((activity) => activity.scoring_status === '待赋分'));
  assert.ok(activities.some((activity) => activity.scoring_status === '已赋分'));
  assert.ok(activities.some((activity) => activity.status === '活动取消'));

  const submissions = await query<{ review_status: string }>(
    "SELECT review_status FROM activity_submissions WHERE leader_phone LIKE '1390000%'",
  );
  assert.deepEqual(new Set(submissions.map((submission) => submission.review_status)), new Set(['待审核', '已通过', '已驳回']));

  const leaveGroups = await query<{ id: string }>(
    "SELECT id FROM leave_groups WHERE class_name='计算机2101' AND applicant_user_id='local-leader'",
  );
  assert.equal(leaveGroups.length, 1);

  const groupMembers = await query<{ student_id: string }>(
    'SELECT student_id FROM leave_group_members WHERE group_id=$1 ORDER BY student_id',
    [leaveGroups[0].id],
  );
  assert.deepEqual(groupMembers.map((member) => member.student_id), ['9000000005', '9000000006', '9000000007']);

  console.log('local test data checks passed');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
