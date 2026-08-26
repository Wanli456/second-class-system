import assert from 'node:assert/strict';
import { detectFileKindFromBytes, getUploadContentType, getUploadFileKind } from './upload-file-validation';

assert.equal(getUploadFileKind('备案表.jpg'), 'image');
assert.equal(getUploadFileKind('备案表.JPEG'), 'image');
assert.equal(getUploadFileKind('活动赋分表.docx'), 'document');
assert.equal(getUploadFileKind('活动赋分表.xlsx'), 'document');
assert.equal(getUploadFileKind('archive.zip'), null);
assert.equal(getUploadContentType('备案表.jpg', ''), 'image/jpeg');
assert.equal(getUploadContentType('活动赋分表.docx', ''), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

assert.equal(detectFileKindFromBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image');
assert.equal(detectFileKindFromBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image');
assert.equal(detectFileKindFromBytes(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])), 'document');
assert.equal(detectFileKindFromBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04])), 'document');
assert.equal(detectFileKindFromBytes(Buffer.from('学号,姓名,班级\n1001,张三,计算机2101'), 'students.csv'), 'document');
// 伪装成图片的可执行文件：扩展名可以随便改，但文件头对不上就要识别出来。
assert.equal(detectFileKindFromBytes(Buffer.from([0x4d, 0x5a, 0x90, 0x00])), null);

assert.equal(detectFileKindFromBytes(Buffer.from('a,b\n1,2'), 'data.csv'), 'document');
assert.equal(detectFileKindFromBytes(Buffer.from('not a pdf'), 'data.pdf'), null);

console.log('upload-file-validation tests passed');
