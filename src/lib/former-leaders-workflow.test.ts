import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as listCandidates } from '@/app/api/activities/leader-candidates/route';
import { GET as getRoster, POST as createRoster, PUT as updateRoster } from '@/app/api/former-leaders/route';
import { POST as submit } from '@/app/api/activities/submit/route';
import { PUT as review } from '@/app/api/activities/review/route';
import { createSessionToken, issueSessionToken } from './auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

let adminToken = '';
const IMAGE_URL = '/uploads/former-leaders-workflow.png';

function jsonRequest(url: string, body: Record<string, unknown>, user: string, method: 'POST' | 'PUT' = 'POST', key = ''): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${user === 'local-admin' ? adminToken : createSessionToken(user)}` };
  if (key) headers['Idempotency-Key'] = key;
  return new NextRequest(`http://localhost${url}`, { method, headers, body: JSON.stringify(body) });
}

function getRequest(url: string, user: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { headers: { Authorization: `Bearer ${user === 'local-admin' ? adminToken : createSessionToken(user)}` } });
}

async function body(response: Response) {
  const json = (await response.json()) as { success?: boolean; data: Record<string, unknown>; error?: string };
  return { status: response.status, json };
}

async function expectStatus(response: Response, status: number, label: string) {
  const result = await body(response);
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.json)}`);
  return result.json;
}

const basePayload = {
  full_name: '往届负责人验收活动', start_time: '2026-09-20 10:00:00', end_time: '2026-09-20 12:00:00',
  registration_start_time: '2026-09-10 10:00:00', registration_end_time: '2026-09-19 12:00:00',
  category: '德', category_primary: '思想政治', category_secondary: '主题学习活动', level: '院系级',
  scope_type: 'department', scope_name: '学生会', scope_names: [{ type: 'department', name: '学生会' }],
  leader_ids: ['local-leader'], activity_image_url: IMAGE_URL,
};

async function run() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  await ensureDatabaseSchema();
  await query('INSERT INTO upload_assets (url,uploaded_by_user_id,purpose) VALUES ($1,$2,$3)', [IMAGE_URL, 'local-leader', 'activity']);
  adminToken = await issueSessionToken('local-admin');

  // ---- 名册管理权限：非管理员全部拒绝（验收场景 6）----
  await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { name: '王往届', department: '学生会' }, 'local-leader')), 403, '非管理员建档');
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: 'x', action: 'set_active', active: false }, 'local-leader', 'PUT')), 403, '非管理员停用');
  await expectStatus(await getRoster(getRequest('/api/former-leaders', 'local-leader')), 403, '非管理员查询名册');

  // ---- 管理员建档：必填校验 + 同部门同学号防重 ----
  await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { name: '', department: '学生会' }, 'local-admin')), 400, '缺少姓名');
  const wang = await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { name: '王往届', department: '学生会', student_id: '8000000001', contact_phone: '13811110001' }, 'local-admin')), 200, '建档王往届');
  const wangId = String(wang.data.id);
  await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { name: '假名', department: '学生会', student_id: '8000000001' }, 'local-admin')), 400, '同部门同学号重复建档');
  const li = await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { name: '李往届', department: '学生会' }, 'local-admin')), 200, '建档李往届（无学号）');
  const liId = String(li.data.id);
  const zhao = await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { name: '赵往届', department: '学习竞技部' }, 'local-admin')), 200, '建档其他部门');
  const zhaoId = String(zhao.data.id);

  // ---- 候选接口：权限 + 部门范围（验收场景 1、6）----
  await expectStatus(await listCandidates(getRequest('/api/activities/leader-candidates?scope_names=' + encodeURIComponent(JSON.stringify([{ type: 'department', name: '学生会' }])), 'local-student')), 403, '无提交权限者查候选');
  const studentUnion = await expectStatus(await listCandidates(getRequest('/api/activities/leader-candidates?scope_names=' + encodeURIComponent(JSON.stringify([{ type: 'department', name: '学生会' }])), 'local-leader')), 200, '学生会候选');
  const formerList = (studentUnion.data.former ?? []) as Array<Record<string, string>>;
  assert.ok(formerList.some((item) => item.id === wangId && item.linkStatus === 'unregistered'), '学生会候选包含未注册往届负责人');
  assert.ok(formerList.every((item) => item.id !== zhaoId), '其他部门往届负责人不进入候选');
  const sportsUnion = await expectStatus(await listCandidates(getRequest('/api/activities/leader-candidates?scope_names=' + encodeURIComponent(JSON.stringify([{ type: 'department', name: '学习竞技部' }])), 'local-admin')), 200, '跨部门候选隔离');
  assert.equal((((sportsUnion.data.former ?? []) as Array<Record<string, string>>).some((item) => item.id === wangId)), false, '学生会名册不进入竞技部候选');
  console.log('PASS roster permissions, dedupe and candidate scoping');

  // ---- 提交：现任与往届混选（验收场景 2），伪造/跨部门/重复选择被拒（场景 6）----
  const submitted = await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, former_leader_ids: [wangId, liId] }, 'local-leader', 'POST', 'former-key-1')), 200, '混选提交');
  const submissionId = String(submitted.data.id);
  assert.deepEqual(JSON.parse(String(submitted.data.leader_ids)), ['local-leader'], 'leader_ids 只含真实用户');
  const details = JSON.parse(String(submitted.data.leader_details)) as Array<Record<string, unknown>>;
  assert.equal(details.filter((item) => item.source === 'former').length, 2, '快照包含两条往届记录');
  assert.ok(details.filter((item) => item.source === 'former').every((item) => item.rosterId), '往届快照带名册 ID');
  assert.equal(String(submitted.data.leader_name).includes('王往届'), true, 'leader_name 含往届姓名');
  await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, former_leader_ids: ['not-a-roster-id'] }, 'local-leader', 'POST', 'former-key-2')), 400, '伪造名册 ID');
  await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, former_leader_ids: [zhaoId] }, 'local-leader', 'POST', 'former-key-3')), 400, '跨部门选择名册');
  const deduped = await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, former_leader_ids: [wangId, wangId] }, 'local-leader', 'POST', 'former-key-4')), 200, '重复选择同一名册静默去重');
  assert.equal((JSON.parse(String(deduped.data.leader_details)) as Array<Record<string, unknown>>).filter((item) => item.source === 'former').length, 1, '重复 ID 只保留一条');
  await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, leader_ids: [wangId] }, 'local-leader', 'POST', 'former-key-5')), 400, '名册 ID 混入 leader_ids');

  // ---- 全部选择往届负责人（验收场景 2）----
  const allFormer = await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, full_name: '往届负责人验收活动-全往届', leader_ids: [], former_leader_ids: [wangId] }, 'local-leader', 'POST', 'former-key-6')), 200, '全往届提交');
  assert.deepEqual(JSON.parse(String(allFormer.data.leader_ids)), [], '全往届时 leader_ids 为空');
  console.log('PASS submit with former leaders: mixed, all-former, forgery rejected');

  // ---- 审核 → 总表保留完整负责人信息（场景 2、7）----
  await expectStatus(await review(jsonRequest('/api/activities/review', { id: submissionId, review_status: '已通过' }, 'local-publisher', 'PUT')), 200, '审核通过');
  const activityId = String((await queryOne('SELECT activity_id FROM activity_submissions WHERE id=$1', [submissionId]))?.activity_id);
  const activityDetails = JSON.parse(String((await queryOne('SELECT leader_details FROM activities WHERE id=$1', [activityId]))?.leader_details)) as Array<Record<string, unknown>>;
  assert.equal(activityDetails.filter((item) => item.source === 'former').length, 2, '总表快照保留往届负责人');

  // ---- 停用：新任务不能选，原任务重提保留（场景 2、5）----
  // 先在停用前建一条包含李往届的任务，停用后驳回并重提，验证原快照可沿用。
  const liSubmission = await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, full_name: '往届负责人验收活动-李往届任务', leader_ids: [], former_leader_ids: [liId] }, 'local-leader', 'POST', 'former-key-6b')), 200, '含李往届任务提交');
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: liId, action: 'set_active', active: false }, 'local-admin', 'PUT')), 200, '停用李往届');
  await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, full_name: '往届负责人验收活动-停用后', former_leader_ids: [liId] }, 'local-leader', 'POST', 'former-key-7')), 400, '停用名册不能用于新活动');
  const rejected = await expectStatus(await review(jsonRequest('/api/activities/review', { id: String(liSubmission.data.id), review_status: '已驳回', review_note: '请补充' }, 'local-publisher', 'PUT')), 200, '驳回重提前驳回');
  assert.ok(rejected);
  const resubmitted = await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, submission_id: String(liSubmission.data.id), leader_ids: [], former_leader_ids: [liId] }, 'local-leader', 'POST', 'former-key-8')), 200, '重提保留已停用的原负责人');
  const resubmitDetails = JSON.parse(String(resubmitted.data.leader_details)) as Array<Record<string, unknown>>;
  assert.ok(resubmitDetails.some((item) => item.rosterId === liId && item.source === 'former'), '重提恢复已停用原负责人快照');
  // 已停用且不在原快照中的名册记录，重提时同样不能新增。
  const zhou = await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { name: '周往届', department: '学生会' }, 'local-admin')), 200, '建档周往届');
  const zhouId = String(zhou.data.id);
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: zhouId, action: 'set_active', active: false }, 'local-admin', 'PUT')), 200, '停用周往届');
  await expectStatus(await submit(jsonRequest('/api/activities/submit', { ...basePayload, submission_id: String(liSubmission.data.id), leader_ids: [], former_leader_ids: [liId, zhouId] }, 'local-leader', 'POST', 'former-key-9')), 400, '重提不能新增已停用名册');
  console.log('PASS deactivation and resubmit snapshot retention');

  // ---- 注册关联：待确认、确认、解除（场景 3、5）----
  const wangAccount = await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { name: '本地学生', department: '学生会', student_id: '9000000006' }, 'local-admin')), 200, '建档与已注册学号相同');
  const wangAccountId = String(wangAccount.data.id);
  const roster = await expectStatus(await getRoster(getRequest('/api/former-leaders', 'local-admin')), 200, '查询名册');
  const pending = (roster.data.pending ?? []) as Array<Record<string, string>>;
  assert.ok(pending.some((item) => item.id === wangAccountId && item.userId === 'local-student'), '按学号提示待确认关联');
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: wangAccountId, action: 'link', linked_user_id: 'local-student' }, 'local-leader', 'PUT')), 403, '非管理员确认关联');
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: wangAccountId, action: 'link', linked_user_id: 'no-such-user' }, 'local-admin', 'PUT')), 400, '关联不存在账号');
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: wangAccountId, action: 'link', linked_user_id: 'local-student' }, 'local-admin', 'PUT')), 200, '确认关联');
  const afterLink = await expectStatus(await listCandidates(getRequest('/api/activities/leader-candidates?scope_names=' + encodeURIComponent(JSON.stringify([{ type: 'department', name: '学生会' }])), 'local-leader')), 200, '关联后候选');
  const afterLinkFormer = (afterLink.data.former ?? []) as Array<Record<string, string>>;
  assert.equal(afterLinkFormer.filter((item) => item.id === wangAccountId).length, 1, '已关联名册仍按名册显示一次');
  assert.equal(afterLinkFormer.find((item) => item.id === wangAccountId)?.linkStatus, 'linked', '关联状态标记');
  // 并发关联同一条名册：只允许一个成功，另一个收到 409。
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: wangAccountId, action: 'unlink' }, 'local-admin', 'PUT')), 200, '解除关联');
  // 并发关联同一行到同一账号是幂等的；不变量是该账号只挂在一条名册记录上。
  const [first, second] = await Promise.all([
    updateRoster(jsonRequest('/api/former-leaders', { id: wangAccountId, action: 'link', linked_user_id: 'local-student' }, 'local-admin', 'PUT')),
    updateRoster(jsonRequest('/api/former-leaders', { id: wangAccountId, action: 'link', linked_user_id: 'local-student' }, 'local-admin', 'PUT')),
  ]);
  assert.ok([first.status, second.status].every((status) => status === 200), '同账号重复确认幂等成功');
  assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM former_activity_leaders WHERE linked_user_id=$1', ['local-student']))?.count), 1, '一个账号只关联一条名册');
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: wangAccountId, action: 'unlink' }, 'local-admin', 'PUT')), 200, '再次解除关联');
  await expectStatus(await updateRoster(jsonRequest('/api/former-leaders', { id: wangAccountId, action: 'link', linked_user_id: 'local-student' }, 'local-admin', 'PUT')), 200, '重新关联需再次核实');
  // 关联不改变账号角色与权限
  assert.equal((await queryOne('SELECT role, department FROM users WHERE id=$1', ['local-student']))?.role, 'student', '关联不提升账号角色');
  console.log('PASS registration link: pending, confirm, concurrent, unlink, no permission change');

  // ---- 批量新增：成功/重复跳过/坏行仅该行失败 ----
  await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { rows: [{ name: '甲', department: '学生会' }] }, 'local-leader')), 403, '非管理员批量建档');
  await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { rows: [] }, 'local-admin')), 400, '空批量');
  const batch = await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { rows: [
    { name: '钱往届', department: '学生会', student_id: '8000000002', contact_phone: '13822220002' },
    { name: '孙往届', department: '学生会' },
    { name: '假名', department: '学生会', student_id: '8000000001' },
    { name: '缺部门' },
  ] }, 'local-admin')), 200, '批量建档');
  const batchResults = (batch.data.results ?? []) as Array<Record<string, unknown>>;
  assert.equal(batchResults.filter((r) => r.status === 'created').length, 2, '批量新建 2 条');
  assert.equal(batchResults.filter((r) => r.status === 'duplicate').length, 1, '同部门同学号在批量中判重');
  assert.equal(batchResults.filter((r) => r.status === 'error').length, 1, '缺部门的行报错');
  const rosterAfterBatch = await expectStatus(await getRoster(getRequest('/api/former-leaders', 'local-admin')), 200, '批量后查询名册');
  const rosterNames = ((rosterAfterBatch.data.rows ?? []) as Array<Record<string, unknown>>).map((r) => String(r.name));
  assert.ok(rosterNames.includes('钱往届') && rosterNames.includes('孙往届'), '批量记录已入库');
  // 批量内部同部门同学号出现两次只建一条
  const batchDup = await expectStatus(await createRoster(jsonRequest('/api/former-leaders', { rows: [
    { name: '周往届二', department: '学生会', student_id: '8000000003' },
    { name: '周往届三', department: '学生会', student_id: '8000000003' },
  ] }, 'local-admin')), 200, '批量内部重复');
  const dupResults = (batchDup.data.results ?? []) as Array<Record<string, unknown>>;
  assert.equal(dupResults.filter((r) => r.status === 'created').length, 1, '批量内部重复只建一条');
  assert.equal(dupResults.filter((r) => r.status === 'duplicate').length, 1, '批量内部重复标记为 duplicate');
  console.log('PASS batch create: permission, empty, mixed results, in-batch dedupe');

  // ---- 操作日志 ----
  const logCount = Number((await queryOne("SELECT COUNT(*) AS count FROM audit_logs WHERE action LIKE 'former_leader%'", []))?.count);
  assert.ok(logCount >= 5, `名册操作已写审计日志（当前 ${logCount} 条）`);
  console.log('PASS audit logs for roster operations');

  console.log('former leaders workflow tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
