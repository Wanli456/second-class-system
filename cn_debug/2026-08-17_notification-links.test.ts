import assert from 'node:assert/strict';
import { getNotificationHref, getNotificationTargetLabel } from '../src/lib/notification-links';
import { includeApplicantStudent } from '../src/lib/business-rules';

assert.equal(
  getNotificationHref({ type: 'leave_approved', related_id: 'leave-1' }),
  '/leave/status?requestId=leave-1',
);
assert.equal(
  getNotificationHref({ type: 'activity_approved', related_id: 'EK202608001' }),
  '/submit/status?activityId=EK202608001',
);
assert.equal(
  getNotificationHref({ type: 'activity_rejected', related_id: 'submission-1' }),
  '/submit/status?submissionId=submission-1',
);
assert.equal(
  getNotificationHref({ type: 'activity_scored', related_id: 'EK202608001' }),
  '/submit/scoring?activityId=EK202608001',
);
assert.equal(
  getNotificationHref({ type: 'activity_rejected', related_id: 'submission/1' }),
  '/submit/status?submissionId=submission%2F1',
);
assert.equal(getNotificationTargetLabel('leave_approved'), '查看请假记录');
assert.equal(getNotificationTargetLabel('activity_approved'), '查看活动记录');
assert.equal(getNotificationTargetLabel('activity_rejected'), '查看活动提交');
assert.equal(getNotificationTargetLabel('activity_scored'), '查看赋分记录');
assert.equal(getNotificationTargetLabel('unknown'), null);
assert.equal(getNotificationHref({ type: 'unknown', related_id: 'record-1' }), null);
assert.equal(getNotificationHref({ type: 'activity_approved', related_id: null }), null);
assert.deepEqual(includeApplicantStudent(['student-2', 'student-2'], 'student-1'), ['student-2', 'student-1']);
assert.deepEqual(includeApplicantStudent(['student-1'], 'student-1'), ['student-1']);

console.log('notification link tests passed');
