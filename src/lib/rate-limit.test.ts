import assert from 'node:assert/strict';
import { checkRateLimit } from './rate-limit';

const key = `rate-limit-test-${Date.now()}-${Math.random()}`;
assert.equal(checkRateLimit(key, 2, 1000, 100).allowed, true);
assert.equal(checkRateLimit(key, 2, 1000, 200).allowed, true);
assert.equal(checkRateLimit(key, 2, 1000, 300).allowed, false);
assert.equal(checkRateLimit(key, 2, 1000, 1200).allowed, true);
console.log('rate limit tests passed');
