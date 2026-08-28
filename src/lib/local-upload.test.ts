import assert from 'node:assert/strict';
import { safeUploadFileName } from './local-upload';

assert.equal(safeUploadFileName('1700000000-ab12cd.jpg'), '1700000000-ab12cd.jpg');
assert.equal(safeUploadFileName('../secret.txt'), null);
assert.equal(safeUploadFileName(''), null);

console.log('local upload tests passed');
