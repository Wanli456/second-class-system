import assert from 'node:assert/strict';
import { getBusinessDate, getDayRangeForBusinessDate } from './business-time';

assert.equal(getBusinessDate(new Date('2026-08-24T15:59:59.999Z')), '2026-08-24');
assert.equal(getBusinessDate(new Date('2026-08-24T16:00:00.000Z')), '2026-08-25');

// 假条起止时间按本地墙钟入库，日过滤边界也必须是本地墙钟的零点。
assert.deepEqual(getDayRangeForBusinessDate('2026-08-25'), {
  start: '2026-08-25T00:00:00',
  end: '2026-08-26T00:00:00',
});
assert.deepEqual(getDayRangeForBusinessDate('2026-12-31'), {
  start: '2026-12-31T00:00:00',
  end: '2027-01-01T00:00:00',
});

assert.throws(() => getDayRangeForBusinessDate('2026/08/25'), /日期格式无效/);
assert.throws(() => getDayRangeForBusinessDate('2026-02-30'), /日期格式无效/);

console.log('business time tests passed');
