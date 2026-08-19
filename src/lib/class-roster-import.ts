import * as XLSX from 'xlsx';

export interface RosterImportStudent {
  className: string;
  studentId: string;
  studentName: string;
}

export interface RosterImportResult {
  students: RosterImportStudent[];
  errors: string[];
}

const HEADER_ALIASES = {
  className: ['班级', '班级名称', '所在班级', '所属班级', 'class', 'classname', 'class_name'],
  studentId: ['学号', '学生学号', '学籍号', 'studentid', 'student_id', 'studentno', 'studentnumber', 'id'],
  studentName: ['姓名', '学生姓名', 'name', 'studentname', 'student_name'],
} as const;

function normalizeCell(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown) {
  return normalizeCell(value).toLowerCase().replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '');
}

function findHeaderIndex(row: unknown[], aliases: readonly string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
  return row.findIndex((cell) => {
    const header = normalizeHeader(cell);
    return normalizedAliases.some((alias) => header === alias || (alias.length > 1 && header.startsWith(alias)));
  });
}

function findHeaderRow(rows: unknown[][]) {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const row = rows[index] || [];
    const hasStudentId = findHeaderIndex(row, HEADER_ALIASES.studentId) >= 0;
    const hasStudentName = findHeaderIndex(row, HEADER_ALIASES.studentName) >= 0;
    if (hasStudentId && hasStudentName) return index;
  }
  return -1;
}

function addStudent(students: RosterImportStudent[], errors: string[], rowNumber: number, className: string, studentId: string, studentName: string) {
  if (!className || !studentId || !studentName) {
    errors.push(`第 ${rowNumber} 行缺少班级、学号或姓名`);
    return;
  }
  students.push({ className, studentId, studentName });
}

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string, students: RosterImportStudent[], errors: string[]) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  const headerRowIndex = findHeaderRow(rows);
  const fallbackClassName = sheetName.trim();

  if (headerRowIndex >= 0) {
    const headers = rows[headerRowIndex] || [];
    const classIndex = findHeaderIndex(headers, HEADER_ALIASES.className);
    const studentIdIndex = findHeaderIndex(headers, HEADER_ALIASES.studentId);
    const studentNameIndex = findHeaderIndex(headers, HEADER_ALIASES.studentName);
    let lastClassName = fallbackClassName;
    rows.slice(headerRowIndex + 1).forEach((row, index) => {
      if (!row.some((cell) => normalizeCell(cell))) return;
      const currentClassName = classIndex >= 0 ? normalizeCell(row[classIndex]) : '';
      if (currentClassName) lastClassName = currentClassName;
      addStudent(students, errors, headerRowIndex + index + 2, lastClassName, normalizeCell(row[studentIdIndex]), normalizeCell(row[studentNameIndex]));
    });
    return;
  }

  const dataRows = rows.filter((row) => row.some((cell) => normalizeCell(cell)));
  dataRows.forEach((row, index) => {
    if (row.length >= 3) {
      addStudent(students, errors, index + 1, normalizeCell(row[0]), normalizeCell(row[1]), normalizeCell(row[2]));
      return;
    }
    addStudent(students, errors, index + 1, fallbackClassName, normalizeCell(row[0]), normalizeCell(row[1]));
  });
}

export function parseRosterWorkbook(buffer: ArrayBuffer): RosterImportResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellText: true, cellDates: false });
  const students: RosterImportStudent[] = [];
  const errors: string[] = [];
  workbook.SheetNames.forEach((sheetName) => parseSheet(workbook.Sheets[sheetName], sheetName, students, errors));

  const deduped = [...new Map(students.map((student) => [`${student.className}:${student.studentId}`, student])).values()];
  return { students: deduped, errors };
}
