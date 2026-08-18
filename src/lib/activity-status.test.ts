import assert from 'node:assert/strict';
import { mergeActivityStatusRecords } from './activity-status';

const submission = {
  id: 'submission-1',
  full_name: '测试活动',
  start_time: '2026-08-18T12:00:00.000Z',
  end_time: '2026-08-19T12:00:00.000Z',
  category: '智',
  level: '校级',
  leader_name: '负责人',
  leader_phone: '10001',
  scope_type: 'department',
  scope_name: '学生会',
  scope_names: '[{"type":"department","name":"学生会"}]',
  review_status: '已通过',
  activity_id: 'activity-1',
};

const activity = {
  id: 'activity-1',
  full_name: submission.full_name,
  start_time: submission.start_time,
  end_time: submission.end_time,
  category: submission.category,
  level: submission.level,
  leader_name: submission.leader_name,
  leader_phone: submission.leader_phone,
  scope_type: submission.scope_type,
  scope_name: submission.scope_name,
  scope_names: submission.scope_names,
  status: '正常活动',
};

const merged = mergeActivityStatusRecords([submission], [activity]);
assert.equal(merged.length, 1, '审核通过后只应显示正式活动记录');
assert.equal(merged[0]?.source, 'activity');

const pendingMerged = mergeActivityStatusRecords([{ ...submission, id: 'submission-pending', review_status: '待审核' }], [activity]);
assert.equal(pendingMerged.length, 2, '待审核提交不应被误合并');

console.log('activity status merge tests passed');
