import assert from 'node:assert/strict';
import { normalizeDateTimeInput } from './datetime';

// datetime-local 的原生值（分钟精度）
assert.equal(normalizeDateTimeInput('2026-08-27T20:00'), '2026-08-27T20:00:00');
// 兼容空格分隔（OCR 预填）
assert.equal(normalizeDateTimeInput('2026-08-27 20:30'), '2026-08-27T20:30:00');
// 已带秒的保持秒
assert.equal(normalizeDateTimeInput('2026-08-27T20:00:30'), '2026-08-27T20:00:30');
// 非字符串 / 空值 / 垃圾值一律拒绝
assert.equal(normalizeDateTimeInput(null), null);
assert.equal(normalizeDateTimeInput(undefined), null);
assert.equal(normalizeDateTimeInput(20260827), null);
assert.equal(normalizeDateTimeInput('2026/08/27 20:00'), null);
assert.equal(normalizeDateTimeInput('abc'), null);
assert.equal(normalizeDateTimeInput(''), null);
assert.equal(normalizeDateTimeInput('2026-08-27T25:00'), null);
// 归一化后同格式可按字典序比较时间先后
assert.ok(normalizeDateTimeInput('2026-08-28T08:00')! > normalizeDateTimeInput('2026-08-27T20:00')!);

console.log('datetime input normalization tests passed');
