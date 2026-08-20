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

assert.deepEqual(getActivityLeaderDetails({ leader_name: '丙', leader_phone: '10003', leader_details: '[]' }), [
  { id: '', name: '丙', studentId: '10003', contactPhone: null },
]);

console.log('activity leader details tests passed');
