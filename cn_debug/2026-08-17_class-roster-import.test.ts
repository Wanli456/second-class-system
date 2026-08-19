import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseRosterWorkbook } from '../src/lib/class-roster-import';

function workbookBuffer(sheets: Record<string, unknown[][]>) {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name));
  const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

const unified = parseRosterWorkbook(workbookBuffer({ 全院花名册: [['班级', '学号', '姓名'], ['计算机2101', '001', '张三']] }));
assert.deepEqual(unified.students, [{ className: '计算机2101', studentId: '001', studentName: '张三' }]);

const sheets = parseRosterWorkbook(workbookBuffer({ 计算机2102: [['学号', '姓名'], ['002', '李四']] }));
assert.deepEqual(sheets.students, [{ className: '计算机2102', studentId: '002', studentName: '李四' }]);

const multipleSheets = parseRosterWorkbook(workbookBuffer({
  计算机2102: [['学号', '姓名'], ['002', '李四']],
  计算机2103: [['班级', '学号', '姓名'], ['计算机2103', '003', '王五']],
}));
assert.deepEqual(multipleSheets.students, [
  { className: '计算机2102', studentId: '002', studentName: '李四' },
  { className: '计算机2103', studentId: '003', studentName: '王五' },
]);

const invalid = parseRosterWorkbook(workbookBuffer({ 计算机2103: [['学号', '姓名'], ['', '王五']] }));
assert.equal(invalid.students.length, 0);
assert.equal(invalid.errors.length, 1);

console.log('class-roster-import tests passed');
