import assert from 'node:assert/strict';
import { getBusinessYearMonth, formatActivityId } from './business-rules';
import { getActivityDeletionAction } from './activity-deletion';

assert.equal(getBusinessYearMonth(new Date('2026-08-31T16:30:00.000Z')), '202609');
assert.equal(getBusinessYearMonth(new Date('2026-08-25T12:00:00.000Z')), '202608');
assert.equal(formatActivityId('202608', 1), 'EK202608001');
assert.equal(formatActivityId('202608', 12), 'EK202608012');
assert.equal(formatActivityId('202608', 1000), 'EK2026081000');
assert.equal(getActivityDeletionAction(0), 'delete');
assert.equal(getActivityDeletionAction(1), 'cancel');

console.log('activity rule tests passed');
