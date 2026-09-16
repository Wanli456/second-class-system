import assert from 'node:assert/strict';
import { workbookToPreviewSheets } from './excel-preview';

const decodeCell = (address: string) => {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) throw new Error(`Invalid address: ${address}`);
  const column = match[1].split('').reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0) - 1;
  return { c: column, r: Number(match[2]) - 1 };
};

const sheets = workbookToPreviewSheets({
  SheetNames: ['赋分表'],
  Sheets: {
    赋分表: {
      A1: { v: '姓名' },
      K17: { v: '张三' },
      '!ref': 'A1:XEZ27',
    },
  },
}, { decode_cell: decodeCell });

assert.equal(sheets.length, 1);
assert.deepEqual(sheets[0], {
  name: '赋分表',
  startRow: 0,
  startColumn: 0,
  rowCount: 17,
  columnCount: 11,
  cells: { '0:0': '姓名', '16:10': '张三' },
});

const merged = workbookToPreviewSheets({
  SheetNames: ['合并'],
  Sheets: {
    合并: {
      C3: { v: '标题' },
      '!merges': [{ s: { r: 2, c: 2 }, e: { r: 2, c: 5 } }],
    },
  },
}, { decode_cell: decodeCell });

assert.equal(merged[0].columnCount, 4);
assert.equal(merged[0].cells['2:2'], '标题');

console.log('excel preview range tests passed');
