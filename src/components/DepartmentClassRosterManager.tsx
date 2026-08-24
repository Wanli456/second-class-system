'use client';

import { ChangeEvent, useState } from 'react';
import * as XLSX from 'xlsx';
import { BookOpen, Loader2, Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

type RosterStudent = { studentId: string; studentName: string };

function parseRosterText(value: string): RosterStudent[] {
  const students = new Map<string, RosterStudent>();
  for (const line of value.split(/\r?\n/)) {
    const [studentId = '', studentName = ''] = line.trim().split(/[，,\t]+/).map((item) => item.trim());
    if (studentId && studentName) students.set(studentId, { studentId, studentName });
  }
  return [...students.values()];
}

function findColumn(row: unknown[], names: string[]) {
  return row.findIndex((value) => names.includes(String(value || '').trim()));
}

function parseWorkbook(file: File): Promise<{ className: string; students: RosterStudent[] }> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const header = rows[0] || [];
    const classIndex = findColumn(header, ['班级', '班级名称', 'class_name']);
    const studentIdIndex = findColumn(header, ['学号', '学籍号', 'student_id']);
    const studentNameIndex = findColumn(header, ['姓名', '学生姓名', 'student_name']);
    if (classIndex < 0 || studentIdIndex < 0 || studentNameIndex < 0) throw new Error('Excel 需要包含“班级、学号、姓名”三列');
    const className = String(rows.slice(1).find((row) => row[classIndex])?.[classIndex] || '').trim();
    const students = rows.slice(1).flatMap((row) => {
      const studentId = String(row[studentIdIndex] || '').trim();
      const studentName = String(row[studentNameIndex] || '').trim();
      return studentId && studentName ? [{ studentId, studentName }] : [];
    });
    if (!className || !students.length) throw new Error('Excel 中未找到完整的班级、学号和姓名数据');
    return { className, students };
  });
}

export function DepartmentClassRosterManager() {
  const [className, setClassName] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadRoster = async () => {
    setError('');
    setMessage('');
    const normalizedClassName = className.trim();
    if (!normalizedClassName) return setError('请先输入班级名称');
    setLoading(true);
    try {
      const response = await fetch('/api/department-class-roster?className=' + encodeURIComponent(normalizedClassName));
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '读取花名册失败');
      const students = (payload.data as Array<{ student_id: string; student_name: string }>).map((student) => ({ studentId: student.student_id, studentName: student.student_name }));
      setContent(students.map((student) => `${student.studentId},${student.studentName}`).join('\n'));
      setMessage(students.length ? `已加载 ${students.length} 名学生，可修改后保存。` : '该班级暂无花名册，可直接录入后保存。');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取花名册失败');
    } finally {
      setLoading(false);
    }
  };

  const saveRoster = async () => {
    setError('');
    setMessage('');
    const normalizedClassName = className.trim();
    const students = parseRosterText(content);
    if (!normalizedClassName) return setError('请先输入班级名称');
    if (!students.length) return setError('请按“学号,姓名”格式至少填写一名学生');
    setSaving(true);
    try {
      const response = await fetch('/api/department-class-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className: normalizedClassName, students }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '保存花名册失败');
      setMessage(`已保存 ${payload.count} 名学生的花名册。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存花名册失败');
    } finally {
      setSaving(false);
    }
  };

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    try {
      const parsed = await parseWorkbook(file);
      setClassName(parsed.className);
      setContent(parsed.students.map((student) => `${student.studentId},${student.studentName}`).join('\n'));
      setMessage(`已从 Excel 读取 ${parsed.students.length} 名学生，请确认后保存。`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入 Excel 失败');
    }
  };

  return <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-xs font-semibold text-amber-700"><BookOpen className="size-4" />班级花名册</div><h2 className="mt-1 text-lg font-semibold text-slate-950">维护班级学生名单</h2><p className="mt-1 text-pretty text-sm text-slate-500">用于请假识别、名单校验与考勤人数统计。保存时仅覆盖当前填写班级的花名册。</p></div>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div><label className="text-sm font-medium text-slate-700">查看或手动录入的班级</label><input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="例如：计算机2101" className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /><Button type="button" variant="outline" onClick={() => void loadRoster()} disabled={loading} className="mt-2 w-full">{loading ? <Loader2 className="size-4 animate-spin" /> : <BookOpen className="size-4" />}查看花名册</Button><p className="mt-2 text-xs text-slate-500">手动录入或查看已有成员时填写；Excel 导入会自动识别班级。</p></div>
      <div><label className="text-sm font-medium text-slate-700">批量录入（学号,姓名）</label><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={'例如：\n20250101,张三\n20250102,李四'} className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /><div className="mt-3 flex flex-wrap gap-2"><Button type="button" onClick={() => void saveRoster()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存花名册</Button><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"><Upload className="size-4" />导入 Excel<input type="file" accept=".xlsx,.xls" className="sr-only" onChange={(event) => void importExcel(event)} /></label></div></div>
    </div>
    {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    {message && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
  </section>;
}
