import assert from 'node:assert/strict';
import { readIdempotencyKey, scopeIdempotencyKey } from './idempotency';

assert.equal(readIdempotencyKey(new Headers({ 'Idempotency-Key': '  request-1  ' })), 'request-1');
assert.equal(readIdempotencyKey(new Headers()), null);
assert.equal(readIdempotencyKey(new Headers({ 'Idempotency-Key': 'bad key' })), null);
assert.equal(readIdempotencyKey(new Headers({ 'Idempotency-Key': 'x'.repeat(129) })), null);
assert.equal(scopeIdempotencyKey('user-1', 'request-1'), 'user-1:request-1');

console.log('idempotency tests passed');
