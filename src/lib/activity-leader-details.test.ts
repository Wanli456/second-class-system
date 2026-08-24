import assert from 'node:assert/strict';
import {
  getActivityLeaderDetails,
  serializeActivityLeaderDetails,
  type ActivityLeaderDetail,
} from './activity-leader-details';

const leaders: ActivityLeaderDetail[] = [
  { id: 'leader-1', name: '甲', studentId: '10001', contactPhone: '13800000001' },
  { id: 'leader-2', name: '乙', studentId: '10002', contactPhone: '微信乙' },
];

assert.deepEqual(getActivityLeaderDetails({ leader_details: serializeActivityLeaderDetails(leaders) }), leaders);

const legacy = getActivityLeaderDetails({ leader_name: '甲、乙', leader_phone: '旧字段', leader_ids: '["leader-1","leader-2"]' }, [
  { id: 'leader-1', username: '甲', student_id: '10001' },
  { id: 'leader-2', username: '乙', student_id: '10002' },
]);
assert.deepEqual(legacy, [
  { id: 'leader-1', name: '甲', studentId: '10001', contactPhone: null },
  { id: 'leader-2', name: '乙', studentId: '10002', contactPhone: null },
]);

// leader_phone 是联系电话，不是学号；没有 leader_ids（无法关联用户记录）时不应把电话误标为学号。
assert.deepEqual(getActivityLeaderDetails({ leader_name: '丙', leader_phone: '13800000003', leader_details: '[]' }), [
  { id: '', name: '丙', studentId: '未填写', contactPhone: '13800000003' },
]);

console.log('activity leader details tests passed');
