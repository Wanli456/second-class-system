'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download, FileText, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/client-api';
import { formatAuditAction, formatAuditDetails, formatAuditResource } from '@/lib/audit-log-labels';
import { Button } from '@/components/ui/button';
import { formatBusinessDateTime } from '@/lib/datetime';

type GovernanceUser = { id: string; name: string; studentId: string; role: string; createdAt?: string };
type FileItem = { id: string; url: string; purpose: string; createdAt: string | null; references: Array<{ kind: string; recordId: string }>; retentionStatus: 'active' | 'due' };
type PendingJob = { id?: string; jobId?: string; url: string; status: string };
type AuditItem = { id: string; actorUserId: string | null; actorName: string | null; action: string; resourceType: string; resourceId: string | null; details: unknown; createdAt: string };
type RetentionIssue = { table: string; recordId: string; field: string; reason: string };
type PageData<T> = { items?: T[]; total?: number; page?: number; pageSize?: number };

const EXPORT_TABLES = [
  ['activities', '活动'], ['activity_submissions', '活动提交'], ['leave_requests', '请假申请'],
  ['leave_groups', '集体请假'], ['leave_slips', '假条'], ['departments', '部门'],
] as const;
const PAGE_SIZE = 10;
const TABLE_LABELS: Record<string, string> = {
  activities: '活动记录', activity_submissions: '活动提交记录', leave_requests: '请假申请记录',
  leave_slips: '假条记录', original_leave_slips: '原始假条记录', attendance_work_arrangements: '考勤安排记录',
};
const REASON_LABELS: Record<string, string> = {
  INVALID_JSON: '记录中的关联信息格式异常', UNSAFE_LEGACY_IDENTITY: '记录仍包含无法安全处理的旧身份信息',
  UNSAFE_OCR: '记录仍包含无法安全处理的识别结果', ATTACHMENT_REMAINS: '记录仍关联文件',
};

class ApiResponseError extends Error {
  constructor(message: string, readonly payload: Record<string, unknown>) { super(message); }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getRetentionIssues(value: unknown): RetentionIssue[] {
  const data = asRecord(value);
  const toIssues = (items: unknown): RetentionIssue[] => (Array.isArray(items) ? items : []).filter((item): item is RetentionIssue => {
    const record = asRecord(item);
    return typeof record?.table === 'string' && typeof record.recordId === 'string' && typeof record.field === 'string' && typeof record.reason === 'string';
  });
  const issues = toIssues(data?.unresolved);
  if (Array.isArray(data?.reviewRequired)) {
    for (const item of data.reviewRequired) issues.push(...toIssues(asRecord(item)?.unresolved));
  }
  return issues;
}

async function readApi(response: Response): Promise<Record<string, unknown>> {
  const data = asRecord(await response.json().catch(() => ({}))) || {};
  const nested = asRecord(data.data);
  if (!response.ok || data.success !== true) {
    const retentionIncomplete = data.error === 'REVIEW_REQUIRED'
      || nested?.error === 'REVIEW_REQUIRED'
      || (data.mode === 'execute' && (Array.isArray(nested?.failed) || Array.isArray(nested?.reviewRequired)));
    if (retentionIncomplete) return data;
    const message = typeof data.error === 'string' ? data.error : typeof nested?.error === 'string' ? nested.error : `请求失败（HTTP ${response.status}）`;
    throw new ApiResponseError(message, data);
  }
  return data;
}

function ensureRetentionComplete(data: Record<string, unknown>): void {
  const result = asRecord(data.data);
  const hasBatchFailure = (Array.isArray(result?.failed) && result.failed.length > 0)
    || (Array.isArray(result?.reviewRequired) && result.reviewRequired.length > 0);
  if (hasBatchFailure) {
    throw new ApiResponseError('到期清理未全部完成；已完成账号已刷新，其余账号仍保留。请先处理下面列出的记录。', data);
  }
  if (result?.complete === false || result?.error === 'REVIEW_REQUIRED') {
    throw new ApiResponseError('这次处置没有完成，账号仍保留。请先处理下面列出的记录。', data);
  }
}

function formatDate(value?: string | null): string { return formatBusinessDateTime(value); }

function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="mt-3 flex items-center justify-end gap-2 text-sm text-slate-600">
    <span>第 {Math.min(page, pages)} / {pages} 页，共 {total} 条</span>
    <Button variant="outline" size="sm" aria-label="上一页" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}><ChevronLeft className="size-4" /></Button>
    <Button variant="outline" size="sm" aria-label="下一页" onClick={() => onChange(Math.min(pages, page + 1))} disabled={page >= pages}><ChevronRight className="size-4" /></Button>
  </div>;
}

export default function AdminGovernance({ users, onUsersRefresh }: { users: GovernanceUser[]; onUsersRefresh: () => Promise<void> }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [filePage, setFilePage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [fileTotal, setFileTotal] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [retention, setRetention] = useState<Record<string, unknown> | null>(null);
  const [reviewIssues, setReviewIssues] = useState<RetentionIssue[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [exportTable, setExportTable] = useState('activities');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadFiles = useCallback(async (page: number) => {
    const data = await readApi(await apiFetch(`/api/admin/files?page=${page}&pageSize=${PAGE_SIZE}`));
    const payload = (asRecord(data.data) || {}) as PageData<FileItem> & { pendingJobs?: PendingJob[] };
    setFiles(payload.items || []); setFileTotal(payload.total || 0); setFilePage(payload.page || page); setPendingJobs(payload.pendingJobs || []);
  }, []);

  const loadAudits = useCallback(async (page: number) => {
    const data = await readApi(await apiFetch(`/api/admin/audit-logs?page=${page}&pageSize=${PAGE_SIZE}`));
    const payload = (asRecord(data.data) || {}) as PageData<AuditItem>;
    setAudits(payload.items || []); setAuditTotal(payload.total || 0); setAuditPage(payload.page || page);
  }, []);

  const loadRetention = useCallback(async () => {
    const data = await readApi(await apiFetch('/api/admin/data-retention', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview', limit: 50 }) }));
    setRetention((data.data || null) as Record<string, unknown> | null);
  }, []);

  const refresh = useCallback(async () => {
    setError(''); setReviewIssues([]);
    try { await Promise.all([loadFiles(1), loadAudits(1), loadRetention()]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '治理数据加载失败'); }
  }, [loadAudits, loadFiles, loadRetention]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setStatus(''); setReviewIssues([]);
    try { await action(); setStatus(success); }
    catch (cause) {
      if (cause instanceof ApiResponseError) setReviewIssues(getRetentionIssues(cause.payload.data));
      setError(cause instanceof Error ? cause.message : '操作失败');
    } finally { setBusy(false); }
  };

  const graduate = () => {
    if (!selectedUser || !confirm('确认对选中的账号执行毕业处置？账号会删除，个人信息会清理，业务事实保留。')) return;
    void run(async () => {
      const data = await readApi(await apiFetch('/api/admin/data-retention', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'graduation', targetId: selectedUser, confirm: true }) }));
      ensureRetentionComplete(data); setSelectedUser(''); await onUsersRefresh(); await refresh();
    }, '毕业处置完成');
  };

  const executeRetention = () => {
    if (!confirm('确认执行当前到期账号清理？管理员账号会自动跳过。')) return;
    void run(async () => {
      try {
        const data = await readApi(await apiFetch('/api/admin/data-retention', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'execute', confirm: true, limit: 50 }) }));
        ensureRetentionComplete(data);
      } finally {
        await onUsersRefresh();
        await refresh();
      }
    }, '到期清理执行完成');
  };

  const deleteFile = (url: string) => {
    if (!confirm(`请确认要删除文件：\n${url}`) || !confirm(`再次确认永久删除同一文件：\n${url}`)) return;
    void run(async () => {
      try {
        await readApi(await apiFetch(`/api/admin/files/${encodeURIComponent(url)}?confirm=true&detachReferences=true`, { method: 'DELETE' }));
      } finally {
        await loadFiles(filePage); await loadAudits(auditPage);
      }
    }, '文件删除请求已完成');
  };

  const downloadExport = (format: 'json' | 'csv') => {
    void run(async () => {
      const response = await apiFetch(`/api/admin/export?table=${exportTable}&format=${format}&limit=1000`);
      if (!response.ok) await readApi(response);
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `${exportTable}.${format}`; link.click(); URL.revokeObjectURL(url); await loadAudits(auditPage);
    }, `已导出${format.toUpperCase()}数据`);
  };

  const graduateUsers = users.filter(user => user.role !== 'admin');
  const previewUsers = Array.isArray(retention?.users) ? retention.users.length : 0;
  const skippedAdmins = Array.isArray(retention?.skippedAdmins) ? retention.skippedAdmins.length : 0;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">数据治理</h2><p className="mt-1 text-sm text-slate-500">管理员毕业处置、保留期清理、数据导出和文件管理。生产环境当前未启用自动清理。</p></div><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}><RefreshCw className="size-4" />刷新</Button></div>
      {error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
      {reviewIssues.length > 0 && <div role="alert" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"><p className="font-semibold">账号仍保留，处置预检未通过。请先处理这些记录：</p><ul className="mt-2 list-disc space-y-1 pl-5">{reviewIssues.map((issue) => <li key={`${issue.table}-${issue.recordId}-${issue.field}`}>{TABLE_LABELS[issue.table] || issue.table}「{issue.recordId}」的 {issue.field}：{REASON_LABELS[issue.reason] || '需要人工核对'}</li>)}</ul></div>}
      {status && <p role="status" className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</p>}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><h3 className="font-semibold text-slate-900">手动毕业处置</h3><p className="mt-1 text-xs text-slate-600">保留入口；不依赖毕业状态。管理员账号不会列入普通处置名单。</p><div className="mt-3 flex gap-2"><select aria-label="选择毕业处置账号" value={selectedUser} onChange={e => setSelectedUser(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm"><option value="">选择账号</option>{graduateUsers.map(user => <option key={user.id} value={user.id}>{user.name || '未命名'} · {user.studentId || user.id}</option>)}</select><Button variant="destructive" onClick={graduate} disabled={!selectedUser || busy}>处置</Button></div></div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4"><h3 className="font-semibold text-slate-900">注册满四年清理</h3><p className="mt-1 text-xs text-slate-600">当前预览：{previewUsers} 个到期账号，跳过管理员 {skippedAdmins} 个。生产环境是否启用需以后端配置为准。</p><div className="mt-3 flex gap-2"><Button variant="outline" onClick={() => void run(loadRetention, '预览已刷新')} disabled={busy}>刷新预览</Button><Button onClick={executeRetention} disabled={busy || previewUsers === 0}>执行到期清理</Button></div></div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex items-center gap-2"><Download className="size-4 text-teal-700" /><h2 className="font-semibold text-slate-950">管理员数据导出</h2></div><p className="mt-1 text-sm text-slate-500">仅导出系统允许的业务字段，最多 1000 条；导出动作会写入操作日志。</p><div className="mt-3 flex flex-wrap gap-2"><select value={exportTable} onChange={e => setExportTable(e.target.value)} aria-label="选择导出数据表" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">{EXPORT_TABLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="outline" onClick={() => downloadExport('json')} disabled={busy}>导出 JSON</Button><Button variant="outline" onClick={() => downloadExport('csv')} disabled={busy}>导出 CSV</Button></div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex items-center gap-2"><FileText className="size-4 text-teal-700" /><h2 className="font-semibold text-slate-950">文件管理</h2></div><p className="mt-1 text-sm text-slate-500">这里管理本机 `uploads` 文件；它不是 `app-files` 对象存储。删除操作需要两次确认，备份仍按独立保留期管理。</p><div className="mt-4 space-y-2">{files.map(file => <div key={file.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{file.url}</p><p className="text-xs text-slate-500">{file.purpose} · {formatDate(file.createdAt)} · {file.references.length ? `${file.references.length} 条引用` : '无引用'} · {file.retentionStatus === 'due' ? '已到期' : '未到期'}</p></div><Button variant="destructive" size="sm" onClick={() => deleteFile(file.url)} disabled={busy}><Trash2 className="size-3.5" />删除文件</Button></div>)}{pendingJobs.map(job => <div key={job.id || job.jobId || job.url} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-medium text-amber-950">文件删除待完成</p><p className="truncate text-xs text-amber-800">{job.url} · 状态：{job.status}</p></div><Button variant="outline" size="sm" onClick={() => deleteFile(job.url)} disabled={busy}><RotateCcw className="size-3.5" />重试删除</Button></div>)}{files.length === 0 && pendingJobs.length === 0 && <p className="py-6 text-center text-sm text-slate-500">暂无文件或后端暂未返回文件数据。</p>}</div><Pager page={filePage} total={fileTotal} pageSize={PAGE_SIZE} onChange={(page) => void run(() => loadFiles(page), '文件列表已更新')} /></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><h2 className="font-semibold text-slate-950">操作日志</h2><p className="mt-1 text-sm text-slate-500">记录操作人、动作、目标资源和处理结果。</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[68rem] text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="px-2 py-2">时间</th><th className="px-2 py-2">操作人</th><th className="px-2 py-2">动作</th><th className="px-2 py-2">资源</th><th className="px-2 py-2">详情</th></tr></thead><tbody className="divide-y divide-slate-100">{audits.map(item => <tr key={item.id} className="align-top"><td className="whitespace-nowrap px-2 py-2 text-slate-500">{formatDate(item.createdAt)}</td><td className="whitespace-nowrap px-2 py-2 font-medium text-slate-800">{item.actorName || item.actorUserId || '系统'}</td><td className="whitespace-nowrap px-2 py-2 font-medium text-slate-800">{formatAuditAction(item.action)}</td><td className="whitespace-nowrap px-2 py-2 text-slate-600">{formatAuditResource(item.resourceType, item.resourceId)}</td><td className="max-w-xl whitespace-normal break-words px-2 py-2 text-slate-500">{formatAuditDetails(item.details) || '—'}</td></tr>)}</tbody></table>{audits.length === 0 && <p className="py-6 text-center text-sm text-slate-500">暂无日志。</p>}</div><Pager page={auditPage} total={auditTotal} pageSize={PAGE_SIZE} onChange={(page) => void run(() => loadAudits(page), '日志列表已更新')} /></section>
  </div>;
}
