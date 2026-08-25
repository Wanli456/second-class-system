import assert from 'node:assert/strict';
import { getBusinessDate, getUtcDayRangeForBusinessDate } from './business-time';

assert.equal(getBusinessDate(new Date('2026-08-24T15:59:59.999Z')), '2026-08-24');
assert.equal(getBusinessDate(new Date('2026-08-24T16:00:00.000Z')), '2026-08-25');

assert.deepEqual(getUtcDayRangeForBusinessDate('2026-08-25'), {
  start: '2026-08-24T16:00:00.000Z',
  end: '2026-08-25T16:00:00.000Z',
});

assert.throws(() => getUtcDayRangeForBusinessDate('2026/08/25'), /日期格式无效/);

console.log('business time tests passed');
