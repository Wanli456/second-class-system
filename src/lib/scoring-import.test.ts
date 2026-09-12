import assert from 'node:assert/strict';
import {
  extractScoringRows,
  parseImportDate,
  validateScoringRows,
  type ScoringImportRow,
} from './scoring-import';

// ---------- 日期解析 ----------
assert.ok(parseImportDate('2026-05-09'));
assert.ok(parseImportDate('2026/5/9'));
assert.ok(parseImportDate('5/9/17'));
assert.ok(parseImportDate('2026年5月9日'));
assert.equal(parseImportDate(''), null);
assert.equal(parseImportDate('不是日期'), null);
assert.equal(parseImportDate('13/45/99'), null);
assert.ok(parseImportDate('2026-05-09')! < parseImportDate('2026-05-10')!);

// ---------- 模板解析：跳过标题/表头/示范数据/说明行 ----------
const matrix: unknown[][] = [
  ['成长记录补录模板'],
  ['学号', '姓名', '开始时间', '结束时间', '内容', '活动一级分类', '活动二级分类', '活动等级', '奖项内容', '学分类型', '发放学分值'],
  ['1000001', '学生1', '5/9/17', '', '五四评优获奖', '思想政治', '先进荣誉', '校级', '', '德积分', '0.01'],
  ['1000002', '学生2', '5/9/17', '6/9/17', '获得驾驶证', '工匠精神', '技能提升证书', '院系级', '一等奖', '智积分', '2'],
  ['1000003', '学生3', '5/9/17', '6/9/17', '参与运动会', '身心健康', '校园体育赛事活动', '院系级', '', '体积分', '5'],
  ['1、以上为示范数据，请勿删除，请从第 7 行开始填写'],
  ['20230001', '张三', '2026-03-01', '2026-03-02', '志愿服务', '社会责任', '公益服务', '院系级', '', '德积分', '1.5'],
  ['', '', '', '', '', '', '', '', '', '', ''],
  ['20230002', '李四', '2026-04-01', '', '参加比赛', '创新精神', '创新创业比赛', '校级', '', '智积分', '3'],
];
const rows = extractScoringRows(matrix);
assert.equal(rows.length, 2, '应只解析出说明行之后的 2 条数据：' + JSON.stringify(rows.map((r) => r.studentId)));
assert.deepEqual(validateScoringRows(rows), { ok: true, rows, issues: [] });

// ---------- 逐列校验 ----------
function row(overrides: Partial<ScoringImportRow>): ScoringImportRow {
  return {
    rowNumber: 2, studentId: '20230001', studentName: '张三',
    startTime: '2026-03-01', endTime: '2026-03-02', content: '志愿服务',
    categoryPrimary: '社会责任', categorySecondary: '公益服务', level: '院系级',
    award: '', creditType: '德积分', creditValue: '1.5', ...overrides,
  };
}
const cols = (input: ScoringImportRow) => validateScoringRows([input]).issues.map((i) => i.column);

assert.deepEqual(cols(row({})), []);
assert.deepEqual(cols(row({ studentId: 'abc' })), ['学号']);
assert.deepEqual(cols(row({ studentName: 'A1' })), ['姓名']);
assert.deepEqual(cols(row({ startTime: 'xx' })), ['开始时间']);
assert.deepEqual(cols(row({ startTime: '2026-03-05', endTime: '2026-03-01' })), ['结束时间']);
assert.deepEqual(cols(row({ level: '省级' })), ['活动等级']);
assert.deepEqual(cols(row({ creditValue: 'abc' })), ['发放学分值']);
assert.deepEqual(cols(row({ creditValue: '0' })), ['发放学分值']);
assert.deepEqual(cols(row({ creditValue: '999' })), ['发放学分值']);
// 学分类型与一级分类不匹配（德积分配"工匠精神"）
assert.deepEqual(cols(row({ creditType: '德积分', categoryPrimary: '工匠精神', categorySecondary: '技能提升证书' })), ['活动一级分类']);
// 二级分类不属于所选一级分类
assert.deepEqual(cols(row({ categoryPrimary: '思想政治', categorySecondary: '公益服务' })), ['活动二级分类']);
// 学分类型非法
assert.deepEqual(cols(row({ creditType: '体育分' })), ['学分类型']);
// 空行/无数据
assert.equal(validateScoringRows([]).ok, false);

console.log('scoring import validation tests passed');