import assert from 'node:assert/strict';
import { calculateUserPermissions } from './auth';

const sportsLeader = {
  id: 'user-1',
  username: '负责人',
  student_id: '20260001',
  role: 'leader',
  department: '学习竞技部',
  can_upload_leave: false,
  can_publish: false,
  can_score: false,
  can_submit_activity: false,
  can_view_submission_status: false,
  can_submit_scoring: false,
  can_register_other_college: false,
  can_review_leave: false,
  can_view_evening_study: false,
  can_start_group_leave: false,
  can_manage_attendance_work: false,
  can_query_leave: false,
  can_manage_original_leave: false,
  can_submit_original_leave: false,
  permission_overrides: JSON.stringify({ canUploadLeave: false }),
};

assert.equal(calculateUserPermissions(sportsLeader).canUploadLeave, false);

console.log('auth permission override tests passed');
