import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseRosterWorkbook } from './class-roster-import';

function workbookBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  });
  const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

const decoratedHeaders = parseRosterWorkbook(workbookBuffer({ 花名册: [
  ['导入说明：以下为本次班级名单'],
  ['所在班级（必填）', '学生学号_必填', '学生姓名（必填）'],
  ['计算机2104', '004', '赵六'],
] }));
assert.deepEqual(decoratedHeaders.students, [{ className: '计算机2104', studentId: '004', studentName: '赵六' }]);

const mergedClassColumn = parseRosterWorkbook(workbookBuffer({ 计算机2105: [
  ['班级名称', '学籍号', '姓名'],
  ['计算机2105', '005', '钱七'],
  ['', '006', '孙八'],
] }));
assert.deepEqual(mergedClassColumn.students, [
  { className: '计算机2105', studentId: '005', studentName: '钱七' },
  { className: '计算机2105', studentId: '006', studentName: '孙八' },
]);

console.log('class-roster-import tests passed');
