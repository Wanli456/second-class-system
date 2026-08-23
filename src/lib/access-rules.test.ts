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

// 部门负责人自动权限：学习竞技部默认拥有考勤工作/临时请假权限，
// 即使数据库原始 can_* 未勾选也应放行。
const deptLeader = {
  role: 'leader',
  department: '学习竞技部',
  class_name: '计算机2101',
  can_start_group_leave: false,
  can_manage_attendance_work: false,
};
assert.equal(canStartGroupLeave(deptLeader), true);
assert.equal(canManageAttendanceWork(deptLeader), true);

// 第二课堂认证中心负责人：自动拥有活动提交/赋分材料权限（通过 scope 权限函数验证）。
assert.equal(canManageAttendanceWork({ role: 'leader', department: '第二课堂认证中心', can_manage_attendance_work: false }), false);

// 管理员手动覆盖权限：显式关闭自动权限后，应以覆盖值为准。
const overriddenDeptLeader = {
  role: 'leader',
  department: '学习竞技部',
  class_name: '计算机2101',
  can_start_group_leave: false,
  permission_overrides: JSON.stringify({ canStartGroupLeave: false }),
};
assert.equal(canStartGroupLeave(overriddenDeptLeader), false);

console.log('access rules tests passed');
