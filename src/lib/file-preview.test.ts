import assert from 'node:assert/strict';
import { previewKind } from './file-preview';

assert.equal(previewKind('活动照片.JPG', '/uploads/unknown'), 'image');
assert.equal(previewKind('备案表.pdf', '/uploads/unknown'), 'pdf');
assert.equal(previewKind('活动策划书.docx', '/uploads/unknown'), 'word');
assert.equal(previewKind('赋分表.xls', '/uploads/unknown'), 'excel');
assert.equal(previewKind(null, '/uploads/赋分表.XLSX?download=1'), 'excel');
assert.equal(previewKind('材料.zip', '/uploads/material.bin'), 'unsupported');

console.log('file preview kind tests passed');
