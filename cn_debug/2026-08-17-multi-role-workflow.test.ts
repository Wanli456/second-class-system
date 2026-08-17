import assert from 'node:assert/strict';
import { NextRequest, type NextResponse } from 'next/server';
import { PATCH as patchUser } from '../src/app/api/auth/route';
import { GET as getActivities, PUT as updateActivity } from '../src/app/api/activities/route';
import { GET as getSubmission, POST as postSubmission } from '../src/app/api/activities/submit/route';
import { GET as getReview, PUT as reviewSubmission } from '../src/app/api/activities/review/route';
import { GET as getScoring, PUT as scoreActivity } from '../src/app/api/scoring/route';
import { GET as getLeave, POST as postLeave, PUT as reviewLeave } from '../src/app/api/leave/route';
import { GET as getEveningStudy } from '../src/app/api/evening-study/route';
import { GET as getNotifications } from '../src/app/api/notifications/route';
import { POST as postDepartment, DELETE as deleteDepartment } from '../src/app/api/departments/route';
import { createSessionToken } from '../src/lib/auth';
import { query, queryOne } from '../src/storage/database/supabase-client';

type Json = Record<string, unknown>;

function request(path: string, method: string, userId: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      cookie: `second_class_session=${createSessionToken(userId)}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function read(response: NextResponse) {
  return response.json() as Promise<Json>;
}

async function expectStatus(response: NextResponse, expected: number, label: string) {
  const body = await read(response);
  assert.equal(response.status, expected, `${label}: expected ${expected}, got ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function createTestUsers() {
  const suffix = Date.now();
  const users = {
    crossLeader: `ecc-cross-leader-${suffix}`,
    submitter: `ecc-submitter-${suffix}`,
    outsider: `ecc-outsider-${suffix}`,
  };
  await query(
    `INSERT INTO users (id,username,password,student_id,role,can_submit_activity,can_view_submission_status,can_submit_scoring,department,class_name)
     VALUES ($1,$2,'test123',$3,'student',true,true,true,'团委','计算机2101'),
            ($4,$5,'test123',$6,'student',true,true,true,'学生会','计算机2101'),
            ($7,$8,'test123',$9,'student',false,true,true,'宣传部','计算机2101')`,
    [users.crossLeader, '团委负责人', `910${suffix}1`, users.submitter, '联办活动提交人', `910${suffix}2`, users.outsider, '无关部门提交人', `910${suffix}3`],
  );
  return users;
}

async function notificationTypes(userId: string) {
  const response = await getNotifications(request(`/api/notifications?userId=${encodeURIComponent(userId)}`, 'GET', userId));
  const body = await expectStatus(response, 200, `${userId} notification list`);
  return (body.data as Array<{ type?: string; related_id?: string }> || []).map((item) => item);
}

async function runActivityWorkflow(users: { crossLeader: string; submitter: string; outsider: string }) {
  const suffix = Date.now();
  const scopes = [
    { type: 'department', name: '学生会' },
    { type: 'department', name: '团委' },
  ];
  const leaders = ['local-leader', users.crossLeader];
  const base = {
    start_time: '2026-08-20T10:00:00.000Z',
    end_time: '2026-08-20T11:00:00.000Z',
    category: '德育',
    level: '院系级',
    plan_file_url: '/uploads/original-plan.pdf',
    plan_file_name: '用户原策划书.pdf',
    record_file_url: '/uploads/original-record.pdf',
    record_file_name: '用户原备案表.pdf',
    scope_type: 'department',
    scope_name: '学生会',
    scope_names: scopes,
    leader_ids: leaders,
  };

  const invalidPrimary = await postSubmission(request('/api/activities/submit', 'POST', users.submitter, {
    ...base,
    full_name: `ECC-主办单位校验-${suffix}`,
    scope_names: [{ type: 'department', name: '团委' }, { type: 'department', name: '学生会' }],
    scope_type: 'department',
    scope_name: '团委',
  }));
  await expectStatus(invalidPrimary, 400, '非本部门不能作为联办活动主办单位');

  const invalidMixed = await postSubmission(request('/api/activities/submit', 'POST', users.submitter, {
    ...base,
    full_name: `ECC-混合范围校验-${suffix}`,
    scope_names: [{ type: 'department', name: '学生会' }, { type: 'class', name: '计算机2101' }],
  }));
  await expectStatus(invalidMixed, 400, '部门和班级不能混合联办');

  const studentDenied = await postSubmission(request('/api/activities/submit', 'POST', 'local-student', {
    ...base,
    full_name: `ECC-学生无权限-${suffix}`,
    leader_ids: ['local-leader'],
  }));
  await expectStatus(studentDenied, 403, '没有活动提交权限的学生不能提交活动');

  const submittedResponse = await postSubmission(request('/api/activities/submit', 'POST', users.submitter, {
    ...base,
    full_name: `ECC-联办活动-${suffix}`,
  }));
  const submitted = await expectStatus(submittedResponse, 200, '联办活动应能提交');
  const submission = submitted.data as { id: string; leader_name: string; plan_file_name: string; record_file_name: string };
  assert.ok(submission.id);
  assert.match(submission.leader_name, /本地负责人/);
  assert.match(submission.leader_name, /团委负责人/);
  assert.equal(submission.plan_file_name, '用户原策划书.pdf');
  assert.equal(submission.record_file_name, '用户原备案表.pdf');

  const reviewListResponse = await getReview(request('/api/activities/review', 'GET', 'local-publisher'));
  const reviewList = await expectStatus(reviewListResponse, 200, '活动审核员查看联办活动');
  assert.ok((reviewList.data as Array<{ id: string }>).some((item) => item.id === submission.id));

  const approvedResponse = await reviewSubmission(request('/api/activities/review', 'PUT', 'local-publisher', {
    id: submission.id,
    review_status: '已通过',
  }));
  const approved = await expectStatus(approvedResponse, 200, '活动审核通过');
  const activityId = String(approved.activityId || '');
  assert.ok(activityId);
  const activity = await queryOne<{ id: string; scoring_status: string; plan_file_name: string; record_file_name: string }>('SELECT * FROM activities WHERE id=$1', [activityId]);
  assert.equal(activity?.scoring_status, '待赋分');
  assert.equal(activity?.plan_file_name, '用户原策划书.pdf');
  assert.equal(activity?.record_file_name, '用户原备案表.pdf');

  for (const recipient of ['local-leader', users.crossLeader, users.submitter]) {
    const notices = await notificationTypes(recipient);
    assert.ok(notices.some((item) => item.type === 'activity_approved' && item.related_id === activityId), `${recipient} 应收到活动审核通过通知`);
  }

  const approvedResubmit = await postSubmission(request('/api/activities/submit', 'POST', users.submitter, {
    ...base,
    full_name: `ECC-联办活动-不应重复提交-${suffix}`,
    submission_id: submission.id,
  }));
  await expectStatus(approvedResubmit, 400, '审核通过的活动不能重新提交');

  const materialResponse = await updateActivity(request('/api/activities', 'PUT', users.crossLeader, {
    id: activityId,
    scoring_table_url: '/uploads/user-scoring.xlsx',
    scoring_table_file_name: '用户原赋分表.xlsx',
  }));
  const material = await expectStatus(materialResponse, 200, '联办单位有赋分材料权限的成员可以提交材料');
  assert.equal((material.data as { scoring_table_file_name?: string }).scoring_table_file_name, '用户原赋分表.xlsx');
  assert.equal((material.data as { scoring_material_submitter_id?: string }).scoring_material_submitter_id, users.crossLeader);

  const scoringListResponse = await getScoring(request('/api/scoring', 'GET', 'local-scorer'));
  const scoringList = await expectStatus(scoringListResponse, 200, '赋分员查看所属范围活动');
  assert.ok((scoringList.data as Array<{ id: string }>).some((item) => item.id === activityId));
  await expectStatus(await scoreActivity(request('/api/scoring', 'PUT', 'local-scorer', { id: activityId })), 200, '赋分员完成赋分');
  await expectStatus(await scoreActivity(request('/api/scoring', 'PUT', 'local-scorer', { id: activityId })), 400, '已赋分活动不能重复赋分');
  for (const recipient of ['local-leader', users.crossLeader, users.submitter]) {
    const notices = await notificationTypes(recipient);
    assert.ok(notices.some((item) => item.type === 'activity_scored' && item.related_id === activityId), `${recipient} 应收到赋分完成通知`);
  }

  const rejectedResponse = await postSubmission(request('/api/activities/submit', 'POST', users.submitter, {
    ...base,
    full_name: `ECC-联办活动-驳回重提-${suffix}`,
  }));
  const rejectedSubmission = await expectStatus(rejectedResponse, 200, '第二个联办活动应能提交');
  const rejectedId = String((rejectedSubmission.data as { id: string }).id);
  await expectStatus(await reviewSubmission(request('/api/activities/review', 'PUT', 'local-publisher', {
    id: rejectedId,
    review_status: '已驳回',
    review_note: '请补充材料',
  })), 200, '活动审核驳回');
  assert.ok((await notificationTypes(users.crossLeader)).some((item) => item.type === 'activity_rejected' && item.related_id === rejectedId));

  const resubmittedResponse = await postSubmission(request('/api/activities/submit', 'POST', users.crossLeader, {
    ...base,
    full_name: `ECC-联办活动-驳回重提-${suffix}-更新`,
    submission_id: rejectedId,
  }));
  const resubmitted = await expectStatus(resubmittedResponse, 200, '联办单位成员可以重新提交被驳回活动');
  assert.equal((resubmitted.data as { activity_submitter_id?: string }).activity_submitter_id, users.crossLeader);

  const outsiderResubmit = await postSubmission(request('/api/activities/submit', 'POST', users.outsider, {
    ...base,
    full_name: `ECC-无关部门不能重提-${suffix}`,
    submission_id: rejectedId,
  }));
  await expectStatus(outsiderResubmit, 403, '不属于联办范围的成员不能重新提交活动');

  const statusResponse = await getSubmission(request(`/api/activities/submit?target_submission_id=${encodeURIComponent(rejectedId)}`, 'GET', users.crossLeader));
  const status = await expectStatus(statusResponse, 200, '负责人查看活动提交状态');
  assert.equal((status.data as Array<{ id: string }>).length, 1);
}

type CapabilityCase = {
  field: string;
  label: string;
  on: () => Promise<NextResponse>;
  off: () => Promise<NextResponse>;
};

async function runPermissionWorkflow() {
  const studentId = 'local-student';
  const setPermission = async (field: string, value: boolean) => {
    const body: Json = { userId: studentId };
    body[field] = value;
    await expectStatus(await patchUser(request('/api/auth', 'PATCH', 'local-admin', body)), 200, `${field} permission update`);
  };
  const cases: CapabilityCase[] = [
    { field: 'canPublish', label: '活动审核', on: () => getReview(request('/api/activities/review', 'GET', studentId)), off: () => getReview(request('/api/activities/review', 'GET', studentId)) },
    { field: 'canScore', label: '活动赋分', on: () => getScoring(request('/api/scoring', 'GET', studentId)), off: () => getScoring(request('/api/scoring', 'GET', studentId)) },
    { field: 'canReviewLeave', label: '请假审核', on: () => getLeave(request('/api/leave?role=admin', 'GET', studentId)), off: () => getLeave(request('/api/leave?role=admin', 'GET', studentId)) },
    { field: 'canViewSubmissionStatus', label: '提交状态', on: () => getSubmission(request('/api/activities/submit', 'GET', studentId)), off: () => getSubmission(request('/api/activities/submit', 'GET', studentId)) },
    { field: 'canSubmitScoring', label: '赋分材料', on: () => getActivities(request('/api/activities?purpose=scoring', 'GET', studentId)), off: () => getActivities(request('/api/activities?purpose=scoring', 'GET', studentId)) },
    { field: 'canViewEveningStudy', label: '晚自习查询', on: () => getEveningStudy(request('/api/evening-study?type=attendance', 'GET', studentId)), off: () => getEveningStudy(request('/api/evening-study?type=attendance', 'GET', studentId)) },
  ];

  for (const item of cases) {
    await setPermission(item.field, false);
    await expectStatus(await item.off(), 403, `${item.label}关闭后不可访问`);
    await setPermission(item.field, true);
    const enabled = await item.on();
    assert.equal(enabled.status, 200, `${item.label}开启后应能访问`);
  }

  await setPermission('canSubmitActivity', false);
  await expectStatus(await postSubmission(request('/api/activities/submit', 'POST', studentId, {})), 403, '活动提交关闭后不可提交');
  await setPermission('canSubmitActivity', true);
  await expectStatus(await postSubmission(request('/api/activities/submit', 'POST', studentId, {})), 400, '活动提交开启后进入业务参数校验');

  await setPermission('canStartGroupLeave', false);
  const groupBody = {
    mode: 'group',
    student_ids: ['9000000001', '9000000002', '9000000003', '9000000004', '9000000005', '9000000006'],
    leave_type: '事假',
    start_time: '2026-08-21T10:00:00.000Z',
    end_time: '2026-08-21T11:00:00.000Z',
  };
  await expectStatus(await postLeave(request('/api/leave', 'POST', studentId, groupBody)), 403, '集体请假发起权限关闭后不可发起');
  await setPermission('canStartGroupLeave', true);
  const groupCreated = await expectStatus(await postLeave(request('/api/leave', 'POST', studentId, groupBody)), 200, '集体请假发起权限开启后可发起');
  const groupId = String((groupCreated.group as { id: string }).id);
  const groupRecords = groupCreated.data as Array<{ review_status: string; student_id: string }>;
  assert.equal(groupRecords.length, 6, '集体请假默认应包含本班花名册中选择的全部学生');

  const groupReview = await expectStatus(await reviewLeave(request('/api/leave', 'PUT', 'local-leave-reviewer', { group_id: groupId, review_status: '已通过' })), 200, '请假审核员整组审核集体请假');
  assert.equal((groupReview.data as Array<{ review_status: string }>).every((item) => item.review_status === '已通过'), true);
  const studentStatus = await expectStatus(await getLeave(request('/api/leave', 'GET', studentId)), 200, '集体请假成员查看自己的请假状态');
  assert.ok((studentStatus.data as Array<{ group_id?: string }>).some((item) => item.group_id === groupId));
  await expectStatus(await postLeave(request('/api/leave', 'POST', 'local-student', { ...groupBody, leave_request_id: groupRecords[0].student_id })), 404, '集体请假重新提交必须传原请假记录 ID');

  await setPermission('canViewEveningStudy', false);
}

async function runDepartmentWorkflow() {
  const name = `ECC-部门-${Date.now()}`;
  const created = await expectStatus(await postDepartment(request('/api/departments', 'POST', 'local-admin', { name })), 200, '管理员新增部门');
  const id = String((created.data as { id: string }).id);
  await expectStatus(await postDepartment(request('/api/departments', 'POST', 'local-admin', { name })), 400, '重复部门名称应被拒绝');
  await expectStatus(await deleteDepartment(request(`/api/departments?id=${encodeURIComponent(id)}`, 'DELETE', 'local-admin')), 200, '管理员删除未分配部门');
}

async function run() {
  const users = await createTestUsers();
  await runActivityWorkflow(users);
  await runPermissionWorkflow();
  await runDepartmentWorkflow();
  console.log('multi-role workflow tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
