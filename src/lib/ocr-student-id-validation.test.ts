import assert from 'node:assert/strict';
import { selectStudentIdAfterRosterLookup } from './ocr-student-id-validation';

// OCR correctly reads 李广的学号，但"虚拟2531"与花名册中的完整班级名不一致，
// 查询没有候选记录时，已识别的学号也必须保留给人工核对。
assert.equal(selectStudentIdAfterRosterLookup('2505141139', []), '2505141139');

// OCR 没有给出学号时，仍只允许用唯一的花名册候选自动补全。
assert.equal(selectStudentIdAfterRosterLookup('', ['2505141139']), '2505141139');
assert.equal(selectStudentIdAfterRosterLookup('', ['2505141139', '2505141999']), '');

console.log('ocr-student-id-validation tests passed');
