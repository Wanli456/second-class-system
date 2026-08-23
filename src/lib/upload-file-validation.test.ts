import assert from 'node:assert/strict';
import { getUploadContentType, getUploadFileKind } from './upload-file-validation';

assert.equal(getUploadFileKind('备案表.jpg'), 'image');
assert.equal(getUploadFileKind('备案表.JPEG'), 'image');
assert.equal(getUploadFileKind('活动赋分表.docx'), 'document');
assert.equal(getUploadFileKind('活动赋分表.xlsx'), 'document');
assert.equal(getUploadFileKind('archive.zip'), null);
assert.equal(getUploadContentType('备案表.jpg', ''), 'image/jpeg');
assert.equal(getUploadContentType('活动赋分表.docx', ''), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

console.log('upload-file-validation tests passed');
