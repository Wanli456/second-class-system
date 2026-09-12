'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { extractScoringRows, type ScoringImportIssue, type ScoringImportRow } from '@/lib/scoring-import';

type ImportRecord = {
  id: string;
  class_name: string | null;
  file_name: string | null;
  file_url: string | null;
  status: '待人工确认' | '自动驳回' | '已确认';
  total_rows: number;
  valid_rows: number;
  issues: ScoringImportIssue[] | string;
  submitted_by_name: string | null;
  confirmed_by_name: string | null;
};

type ImportRow = {
  id: string; import_id: string; row_number: number; student_id: string; student_name: string;
  category_primary: string; category_secondary: string; level: string; credit_type: string; credit_value: string;
};

const STATUS_STYLE: Record<string, string> = {
  待人工确认: 'bg-amber-100 text-amber-700',
  自动驳回: 'bg-rose-100 text-rose-700',
  已确认: 'bg-emerald-100 text-emerald-700',
};

function readIssues(value: ImportRecord['issues']): ScoringImportIssue[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

export function ClassScoringImport() {
  const { user } = useUser();
  const canImport = hasPermission(user, 'canImportScoring');
  const canConfirm = hasPermission(user, 'canScore');

  const [className, setClassName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ScoringImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<ScoringImportIssue[]>([]);
  const [message, setMessage] = useState('');
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [rowsByImport, setRowsByImport] = useState<Record<string, ImportRow[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRecords = useCallback(async () => {
    try {
      const res = await apiFetch('/api/scoring/import');
      const data = await res.json();
      if (!data.success) return;
      setRecords(data.data || []);
      const grouped: Record<string, ImportRow[]> = {};
      for (const row of (data.rows || []) as ImportRow[]) (grouped[row.import_id] ||= []).push(row);
      setRowsByImport(grouped);
    } catch { /* 列表失败不影响提交 */ }
  }, []);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const reset = () => {
    setFile(null); setRows([]); setIssues([]); setMessage(''); setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pickFile = async (next: File | null) => {
    setError(''); setIssues([]); setMessage(''); setRows([]); setFile(next);
    if (!next) return;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await next.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
      const parsed = extractScoringRows(matrix);
      if (!parsed.length) { setError('没有解析到数据行。请从模板"示范数据"下一行开始填写，不要改动表头。'); return; }
      setRows(parsed);
    } catch {
      setError('文件解析失败，请确认是 .xlsx 格式且未被其他程序占用。');
    }
  };

  const submit = async () => {
    if (!file || !rows.length) return;
    setBusy(true); setIssues([]); setMessage(''); setError('');
    try {
      // 源文件先落盘，人工确认时需要能下载原表
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'app-files');
      formData.append('purpose', 'scoring');
      const uploadRes = await apiFetch('/api/upload', { method: 'POST', body: formData });
      const uploaded = await uploadRes.json();
      if (!uploaded.success) { setError(uploaded.error || '文件上传失败'); return; }

      const res = await apiFetch('/api/scoring/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className, fileName: file.name, fileUrl: uploaded.data?.url || null, rows }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || '提交失败'); return; }
      setIssues(data.data.issues || []);
      setMessage(data.data.status === '待人工确认'
        ? `自动审核通过：${data.data.validRows} 行，已进入人工确认队列`
        : `自动审核未通过：发现 ${(data.data.issues || []).length} 处问题，已自动驳回`);
      if (data.data.status === '待人工确认') reset();
      await loadRecords();
    } catch {
      setError('网络错误，请重试');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (id: string) => {
    if (!window.confirm('确认这份赋分表？确认后不可修改。')) return;
    setConfirmingId(id);
    try {
      const res = await apiFetch('/api/scoring/import', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.success) { window.alert(data.error || '确认失败'); return; }
      await loadRecords();
    } catch {
      window.alert('网络错误，请重试');
    } finally {
      setConfirmingId(null);
    }
  };

  if (!canImport && !canConfirm) return null;

  return (
    <div className="space-y-5">
      {canImport && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-teal-700" />
            <h3 className="text-base font-semibold text-slate-950">班级赋分表提交</h3>
          </div>
          <p className="mt-1.5 text-sm text-slate-500">
            按《二课分批量导入赋分模板（2026）》填写后上传。系统先自动审核学号、姓名、时间、分类和学分类型，通过后进入人工确认。
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">班级（可选）</span>
              <input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="例如 计算机2101"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">赋分表文件（.xlsx）</span>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="sr-only"
                onChange={(event) => void pickFile(event.target.files?.[0] || null)} />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}
                  className="h-10 shrink-0 border-slate-200 px-4 text-sm">
                  <Upload className="mr-1.5 size-4" />选择文件
                </Button>
                <span className="min-w-0 truncate text-sm text-slate-600">
                  {file ? file.name : '未选择任何文件'}
                </span>
              </div>
            </div>
          </div>

          {rows.length > 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-teal-700">
              <CheckCircle2 className="size-4" />已解析 {rows.length} 行，可以提交自动审核
            </p>
          )}
          {error && <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
          {message && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void submit()} disabled={busy || !file || !rows.length}
              className="h-10 bg-teal-700 px-5 text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Upload className="mr-1.5 size-4" />}提交并自动审核
            </Button>
            <Button type="button" variant="outline" onClick={reset} disabled={busy || (!file && !rows.length && !message && !issues.length)}
              className="h-10 border-slate-200 px-5 text-sm">
              <RotateCcw className="mr-1.5 size-4" />重新提交
            </Button>
          </div>

          {issues.length > 0 && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-rose-800">
                <AlertCircle className="size-4" />自动审核发现 {issues.length} 处问题（已自动驳回）
              </p>
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs text-rose-700">
                {issues.map((issue, index) => (
                  <li key={`${issue.rowNumber}-${issue.column}-${index}`}>第 {issue.rowNumber} 行  {issue.column}：{issue.message}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {canConfirm && records.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-base font-semibold text-slate-950">班级赋分表待确认</h3>
          <p className="mt-1.5 text-sm text-slate-500">自动审核通过的记录，需要人工确认后才算完成赋分。</p>
          <div className="mt-4 space-y-2">
            {records.map((record) => {
              const recordIssues = readIssues(record.issues);
              const expanded = expandedId === record.id;
              return (
                <div key={record.id} className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <button type="button" onClick={() => setExpandedId(expanded ? null : record.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-medium text-slate-900">{record.file_name || '未命名'}  {record.class_name || '未填班级'}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        提交人 {record.submitted_by_name || '-'}｜{record.valid_rows}/{record.total_rows} 行
                        {record.confirmed_by_name ? `｜确认人 ${record.confirmed_by_name}` : ''}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {record.file_url && (
                        <a href={record.file_url} download={record.file_name || undefined}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50">
                          <Download className="size-3.5" />下载源文件
                        </a>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[record.status] || 'bg-slate-100 text-slate-600'}`}>{record.status}</span>
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-3">
                      {recordIssues.length > 0 && (
                        <ul className="mb-3 space-y-1 text-xs text-rose-700">
                          {recordIssues.slice(0, 20).map((issue, index) => (
                            <li key={`${issue.rowNumber}-${issue.column}-${index}`}>第 {issue.rowNumber} 行  {issue.column}：{issue.message}</li>
                          ))}
                        </ul>
                      )}
                      <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full min-w-[44rem] text-left text-xs">
                          <thead className="sticky top-0 bg-slate-50 text-slate-500">
                            <tr><th className="px-2 py-1.5">行</th><th className="px-2 py-1.5">学号</th><th className="px-2 py-1.5">姓名</th><th className="px-2 py-1.5">一级分类</th><th className="px-2 py-1.5">二级分类</th><th className="px-2 py-1.5">等级</th><th className="px-2 py-1.5">学分类型</th><th className="px-2 py-1.5">学分值</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(rowsByImport[record.id] || []).map((row) => (
                              <tr key={row.id}>
                                <td className="px-2 py-1.5 text-slate-400">{row.row_number}</td>
                                <td className="px-2 py-1.5 tabular-nums">{row.student_id}</td>
                                <td className="px-2 py-1.5">{row.student_name}</td>
                                <td className="px-2 py-1.5">{row.category_primary}</td>
                                <td className="px-2 py-1.5">{row.category_secondary}</td>
                                <td className="px-2 py-1.5">{row.level}</td>
                                <td className="px-2 py-1.5">{row.credit_type}</td>
                                <td className="px-2 py-1.5 tabular-nums">{row.credit_value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {record.status === '待人工确认' && (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Button type="button" onClick={() => void confirm(record.id)} disabled={confirmingId === record.id}
                            className="h-9 bg-emerald-700 px-4 text-white hover:bg-emerald-800">
                            {confirmingId === record.id ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CheckCircle2 className="mr-1 size-4" />}确认赋分
                          </Button>
                          <span className="text-xs text-slate-500">确认后不可修改，并会写入数据治理操作日志。</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}