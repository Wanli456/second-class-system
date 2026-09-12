import { CATEGORY_DETAILS, CATEGORIES, LEVELS, isValidCategoryPath, type Category } from '@/lib/types';

/** 模板列（顺序与《二课分批量导入赋分模板（2026）》一致）。 */
export const SCORING_IMPORT_COLUMNS = [
  '学号', '姓名', '开始时间', '结束时间', '内容',
  '活动一级分类', '活动二级分类', '活动等级', '奖项内容', '学分类型', '发放学分值',
] as const;

export type ScoringImportColumn = typeof SCORING_IMPORT_COLUMNS[number];

/** 学分类型  顶层分类（德/智/体/美/劳）。 */
export const CREDIT_TYPES: Record<string, Category> = {
  德积分: '德',
  智积分: '智',
  体积分: '体',
  美积分: '美',
  劳积分: '劳',
};

export const MAX_CREDIT_VALUE = 100;

export type ScoringImportRow = {
  /** Excel 里的真实行号（从 1 开始），用于报错定位。 */
  rowNumber: number;
  studentId: string;
  studentName: string;
  startTime: string;
  endTime: string;
  content: string;
  categoryPrimary: string;
  categorySecondary: string;
  level: string;
  award: string;
  creditType: string;
  creditValue: string;
};

export type ScoringImportIssue = {
  rowNumber: number;
  column: string;
  message: string;
};

export type ScoringImportValidation = {
  ok: boolean;
  rows: ScoringImportRow[];
  issues: ScoringImportIssue[];
};

const STUDENT_ID_PATTERN = /^[0-9]{4,20}$/;
const NAME_PATTERN = /^[\u4e00-\u9fa5]{2,6}$/;
const DATE_PATTERN = /^(\d{4}[-/年])?(\d{1,2})[-/月](\d{1,2})日?$/;

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u00a0/g, ' ').trim();
}

/** 解析日期：接受 2026-05-09 / 2026/5/9 / 5/9/17 / 2026年5月9日 等 */
export function parseImportDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.replace(/[年月]/g, '-').replace(/日/g, '').replace(/\//g, '-');
  const parts = normalized.split('-').map((part) => part.trim()).filter(Boolean);
  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isFinite(n) || !Number.isInteger(n))) return null;

  let year: number;
  let month: number;
  let day: number;
  if (parts.length === 2) {
    [year, month, day] = [2000, numbers[0], numbers[1]];
  } else if (parts.length === 3) {
    if (numbers[0] > 31) [year, month, day] = numbers;
    else [year, month, day] = [2000 + numbers[2], numbers[0], numbers[1]];
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}
/** 把模板二维数组映射成待校验的行。 */
export function extractScoringRows(matrix: unknown[][]): ScoringImportRow[] {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => text(cell) === '学号'));
  if (headerIndex < 0) return [];
  // 模板里示范数据在表头下面，用请从第 N 行开始填写这行做分隔；没有就紧跟表头。
  let dataStart = headerIndex + 1;
  for (let i = headerIndex + 1; i < Math.min(matrix.length, headerIndex + 12); i += 1) {
    const joined = matrix[i].map(text).join('');
    if (joined.includes('示范数据') || joined.includes('请从第')) { dataStart = i + 1; break; }
  }
  const rows: ScoringImportRow[] = [];
  for (let i = dataStart; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const cells = SCORING_IMPORT_COLUMNS.map((_, index) => text(row[index]));
    if (cells.every((cell) => !cell)) continue; // 整行空  跳过
    rows.push({
      rowNumber: i + 1,
      studentId: cells[0],
      studentName: cells[1],
      startTime: cells[2],
      endTime: cells[3],
      content: cells[4],
      categoryPrimary: cells[5],
      categorySecondary: cells[6],
      level: cells[7],
      award: cells[8],
      creditType: cells[9],
      creditValue: cells[10],
    });
  }
  return rows;
}

/** 逐行校验；只要有一行不合格，整份就不通过。 */
export function validateScoringRows(rows: ScoringImportRow[]): ScoringImportValidation {
  const issues: ScoringImportIssue[] = [];
  const push = (rowNumber: number, column: ScoringImportColumn, message: string) => {
    issues.push({ rowNumber, column, message });
  };

  if (!rows.length) {
    return { ok: false, rows, issues: [{ rowNumber: 0, column: '学号', message: '没有解析到任何数据行，请确认从演示数据下一行开始填写' }] };
  }

  for (const row of rows) {
    // 学号
    if (!row.studentId) push(row.rowNumber, '学号', '不能为空');
    else if (!STUDENT_ID_PATTERN.test(row.studentId)) push(row.rowNumber, '学号', `「${row.studentId}」不像学号（应为 4-20 位数字）`);

    // 姓名
    if (!row.studentName) push(row.rowNumber, '姓名', '不能为空');
    else if (!NAME_PATTERN.test(row.studentName)) push(row.rowNumber, '姓名', `「${row.studentName}」不像姓名（应为 2-6 个汉字）`);

    // 时间
    const start = parseImportDate(row.startTime);
    if (!row.startTime) push(row.rowNumber, '开始时间', '不能为空');
    else if (!start) push(row.rowNumber, '开始时间', `「${row.startTime}」不是有效日期`);
    if (row.endTime) {
      const end = parseImportDate(row.endTime);
      if (!end) push(row.rowNumber, '结束时间', `「${row.endTime}」不是有效日期`);
      else if (start && end < start) push(row.rowNumber, '结束时间', '结束时间不能早于开始时间');
    }

    // 活动等级
    if (!row.level) push(row.rowNumber, '活动等级', '不能为空');
    else if (!(LEVELS as readonly string[]).includes(row.level)) push(row.rowNumber, '活动等级', `「${row.level}」无效（只能是 ${LEVELS.join(' / ')}）`);

    // 学分类型
    const category = CREDIT_TYPES[row.creditType];
    if (!row.creditType) push(row.rowNumber, '学分类型', '不能为空');
    else if (!category) push(row.rowNumber, '学分类型', `「${row.creditType}」无效（只能是 ${Object.keys(CREDIT_TYPES).join(' / ')}）`);

    // 一二级分类：先各自存在，再校验三者自洽（是否属于对应积分）
    if (!row.categoryPrimary) push(row.rowNumber, '活动一级分类', '不能为空');
    if (!row.categorySecondary) push(row.rowNumber, '活动二级分类', '不能为空');
    if (category && row.categoryPrimary && row.categorySecondary) {
      const detail = CATEGORY_DETAILS[category];
      if (!detail[row.categoryPrimary]) {
        push(row.rowNumber, '活动一级分类', `「${row.categoryPrimary}」不属于「${row.creditType}」（可选：${Object.keys(detail).join('、')}）`);
      } else if (!detail[row.categoryPrimary].includes(row.categorySecondary)) {
        push(row.rowNumber, '活动二级分类', `「${row.categorySecondary}」不属于「${row.categoryPrimary}」（可选：${detail[row.categoryPrimary].join('、')}）`);
      } else if (!isValidCategoryPath(category, row.categoryPrimary, row.categorySecondary)) {
        push(row.rowNumber, '活动二级分类', '分类组合与学分类型不匹配');
      }
    }

    // 学分值
    const credit = Number(row.creditValue);
    if (!row.creditValue) push(row.rowNumber, '发放学分值', '不能为空');
    else if (!Number.isFinite(credit)) push(row.rowNumber, '发放学分值', `「${row.creditValue}」不是数字`);
    else if (credit <= 0) push(row.rowNumber, '发放学分值', '必须大于 0');
    else if (credit > MAX_CREDIT_VALUE) push(row.rowNumber, '发放学分值', `超过上限 ${MAX_CREDIT_VALUE}`);
  }

  return { ok: issues.length === 0, rows, issues };
}

/** 供前端下拉使用的分类选项。 */
export function categoryOptions(category: Category) {
  return Object.entries(CATEGORY_DETAILS[category]).map(([primary, secondaries]) => ({ primary, secondaries }));
}

export { CATEGORIES };