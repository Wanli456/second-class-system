import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { DELETE as deleteUser } from '../src/app/api/auth/route';
import { createSessionToken } from '../src/lib/auth';
import { query, queryOne } from '../src/storage/database/supabase-client';

const adminId = 'local-admin';
const deletedUserId = `snapshot-test-${Date.now()}`;
const deletedStudentId = `990${Date.now()}`;

async function run() {
await query(
  `INSERT INTO users (id,username,password,student_id,role,department,class_name)
   VALUES ($1,$2,$3,$4,'student',$5,$6)`,
  [deletedUserId, '待删除提交人', 'test123', deletedStudentId, '测试部门', '测试班级'],
);

await query(
  `INSERT INTO activity_submissions
   (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,activity_submitter_id,review_status)
   VALUES ($1,'快照测试提交','2026-08-17T09:00:00Z','2026-08-17T10:00:00Z','德','院系级','负责人','10086',$2,'待审核')`,
  [`submission-${deletedUserId}`, deletedUserId],
);

await query(
  `INSERT INTO activities
   (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,activity_submitter_id,status)
   VALUES ($1,'快照测试活动','2026-08-17T09:00:00Z','2026-08-17T10:00:00Z','德','院系级','负责人','10086',$2,'正常活动')`,
  [`activity-${deletedUserId}`, deletedUserId],
);

await query(
  `INSERT INTO leave_requests
   (id,student_id,class_name,student_name,leave_type,applicant_user_id,start_time,end_time)
   VALUES ($1,'9900000000','测试班级','待删除提交人','事假',$2,'2026-08-17T09:00:00Z','2026-08-17T10:00:00Z')`,
  [`leave-${deletedUserId}`, deletedUserId],
);

await query(
  `INSERT INTO leave_groups
   (id,class_name,applicant_user_id,leave_type,start_time,end_time)
   VALUES ($1,'测试班级',$2,'活动公假','2026-08-17T09:00:00Z','2026-08-17T10:00:00Z')`,
  [`group-${deletedUserId}`, deletedUserId],
);

const request = new NextRequest(`http://localhost/api/auth?id=${encodeURIComponent(deletedUserId)}`, {
  method: 'DELETE',
  headers: { cookie: `second_class_session=${createSessionToken(adminId)}` },
});
const response = await deleteUser(request);
assert.equal(response.status, 200);

assert.equal(await queryOne('SELECT id FROM users WHERE id=$1', [deletedUserId]), null);
const submission = await queryOne('SELECT activity_submitter_name,activity_submitter_student_id FROM activity_submissions WHERE id=$1', [`submission-${deletedUserId}`]);
const activity = await queryOne('SELECT activity_submitter_name,activity_submitter_student_id FROM activities WHERE id=$1', [`activity-${deletedUserId}`]);
const leave = await queryOne('SELECT applicant_name,applicant_student_id FROM leave_requests WHERE id=$1', [`leave-${deletedUserId}`]);
const group = await queryOne('SELECT applicant_name,applicant_student_id FROM leave_groups WHERE id=$1', [`group-${deletedUserId}`]);

assert.deepEqual(submission, { activity_submitter_name: '待删除提交人', activity_submitter_student_id: deletedStudentId });
assert.deepEqual(activity, { activity_submitter_name: '待删除提交人', activity_submitter_student_id: deletedStudentId });
assert.deepEqual(leave, { applicant_name: '待删除提交人', applicant_student_id: deletedStudentId });
assert.deepEqual(group, { applicant_name: '待删除提交人', applicant_student_id: deletedStudentId });

console.log('history snapshot tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
