import assert from 'node:assert/strict';
import { canManageAttendanceWork, canStartGroupLeave } from './business-rules';

const baseUser = {
  role: 'student',
  class_name: '计算机2101',
  can_start_group_leave: false,
  can_manage_attendance_work: false,
};

assert.equal(canStartGroupLeave(baseUser), false);
assert.equal(canStartGroupLeave({ ...baseUser, can_start_group_leave: true }), true);

assert.equal(canManageAttendanceWork(baseUser), false);
assert.equal(canManageAttendanceWork({ ...baseUser, can_manage_attendance_work: true }), true);
assert.equal(canManageAttendanceWork({ ...baseUser, role: 'admin' }), true);

console.log('access rules tests passed');
