import assert from 'node:assert/strict';
import { parseLeaveSlipArray } from './leave-slip-array';

assert.deepEqual(parseLeaveSlipArray(null), []);
assert.deepEqual(parseLeaveSlipArray('["计科一班", "计科二班"]'), ['计科一班', '计科二班']);
assert.deepEqual(parseLeaveSlipArray('计科一班, 计科二班'), ['计科一班', '计科二班']);
assert.deepEqual(parseLeaveSlipArray('{invalid'), ['{invalid']);
