import assert from 'node:assert/strict';
import { canOpenAdminTab } from '../src/lib/business-rules';

const reviewer = { role: 'student', can_publish: true, can_score: false, can_review_leave: false } as const;
const scorer = { role: 'leader', can_publish: false, can_score: true, can_review_leave: false } as const;
const leaveReviewer = { role: 'student', can_publish: false, can_score: false, can_review_leave: true } as const;
const admin = { role: 'admin', can_publish: false, can_score: false, can_review_leave: false } as const;

assert.equal(canOpenAdminTab(reviewer, 'review'), true);
assert.equal(canOpenAdminTab(reviewer, 'scoring'), false);
assert.equal(canOpenAdminTab(scorer, 'scoring'), true);
assert.equal(canOpenAdminTab(leaveReviewer, 'leave'), true);
assert.equal(canOpenAdminTab(leaveReviewer, 'activities'), false);
assert.equal(canOpenAdminTab(admin, 'activities'), true);
assert.equal(canOpenAdminTab(reviewer, 'users'), false);

console.log('admin tab access: ok');
