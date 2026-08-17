import assert from 'node:assert/strict';
import { canResubmitGroupLeave, canStartGroupLeave, includeApplicantStudent, selectAllClassStudents } from '../src/lib/business-rules';

const members = [
  { student_id: '1001' },
  { student_id: '1002' },
  { student_id: '1003' },
];

assert.deepEqual(selectAllClassStudents(members, '1001'), ['1001', '1002', '1003']);
assert.deepEqual(selectAllClassStudents(members, '9999'), ['1001', '1002', '1003', '9999']);
assert.deepEqual(includeApplicantStudent(['1001', '1003'], '1001'), ['1001', '1003']);
assert.equal(canStartGroupLeave({ role: 'student', class_name: '计算机2101', can_start_group_leave: true } as never), true);
assert.equal(canStartGroupLeave({ role: 'student', class_name: '计算机2101', can_start_group_leave: false } as never), false);
assert.equal(canResubmitGroupLeave('captain', { applicant_user_id: 'captain', review_status: '已驳回' }), true);
assert.equal(canResubmitGroupLeave('member', { applicant_user_id: 'captain', review_status: '已驳回' }), false);

console.log('group leave selection tests passed');
