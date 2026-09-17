'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';

interface RosterRow {
  id: string;
  name: string;
  department: string;
  studentId: string;
  contactPhone: string;
  active: boolean;
  linkedUserId: string;
  linkedUsername: string;
  linkedStudentId: string;
}

interface PendingLink {
  id: string;
  name: string;
  rosterStudentId: string;
  userId: string;
  username: string;
  userStudentId: string;
}

type RosterResponse = { success?: boolean; data?: { rows?: RosterRow[]; pending?: PendingLink[] }; error?: string };

async function callApi(url: string, method: string, body?: unknown) {
  const response = await apiFetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return (await response.json()) as RosterResponse & { warning?: string };
}

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

// 往届负责人名册：与真实账号列表分开维护；关联只保存映射，不授予任何权限。
export default function FormerLeadersManager() {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [pending, setPending] = useState<PendingLink[]>([]);
  const [draft, setDraft] = useState({ name: '', department: '', studentId: '', contactPhone: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: '', department: '', studentId: '', contactPhone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchSummary, setBatchSummary] = useState<{ created: number; duplicate: number; errors: string[] } | null>(null);

  function parseBatchText(value: string) {
    return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const cells = line.split(/[，,\t]/).map((cell) => cell.trim());
      return { name: cells[0] || '', department: cells[1] || '', student_id: cells[2] || '', contact_phone: cells[3] || '' };
    });
  }

  async function downloadTemplate() {
    // 与项目其他 Excel 模板（部门权限导入）同一模式：填写表 + 填写示例表。
    try {
      const XLSX = await import('xlsx');
      const headers = ['姓名', '部门', '学号', '联系电话'];
      const cols = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }));
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...Array.from({ length: 20 }, () => headers.map(() => ''))]);
      sheet['!cols'] = cols;
      const example = XLSX.utils.aoa_to_sheet([headers, ['张三', '学生会'], ['李四', '学生会', '8000000010', '13800000000']]);
      example['!cols'] = cols;
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, '名册填写');
      XLSX.utils.book_append_sheet(workbook, example, '填写示例');
      XLSX.writeFile(workbook, '往届负责人名册模板.xlsx');
    } catch (err) {
      alert(err instanceof Error ? err.message : '模板下载失败');
    }
  }

  const submitBatch = async () => {
    const rows = parseBatchText(batchText);
    if (!rows.length) { setBatchSummary({ created: 0, duplicate: 0, errors: ['没有可导入的内容：请按“姓名，部门，学号，电话”每行填写一条'] }); return; }
    setBusy(true);
    setBatchSummary(null);
    try {
      const result = await callApi('/api/former-leaders', 'POST', { rows });
      if (result.success === false) throw new Error(result.error || '批量导入失败');
      const payload = (result as { data?: { createdCount?: number; results?: Array<Record<string, unknown>> } }).data;
      const rows_ = payload?.results || [];
      const errors = rows_.filter((row) => row.status !== 'created')
        .map((row) => `第 ${Number(row.index) + 1} 行「${row.name || '未填写'}」：${row.status === 'duplicate' ? '重复，已跳过' : '失败'}${row.reason ? `（${row.reason}）` : ''}`);
      const created = Number(payload?.createdCount || 0);
      setBatchSummary({ created, duplicate: rows_.filter((row) => row.status === 'duplicate').length, errors });
      if (created > 0) { setBatchText(''); await refresh(); }
    } catch (err) {
      alert(err instanceof Error ? err.message : '批量导入失败');
    } finally { setBusy(false); }
  };

  const refresh = useCallback(async () => {
    try {
      const data = (await (await apiFetch('/api/former-leaders')).json()) as RosterResponse;
      if (data.success === false) throw new Error(data.error || '读取名册失败');
      setRows(data.data?.rows || []);
      setPending(data.data?.pending || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取名册失败');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = async (action: () => Promise<RosterResponse & { warning?: string }>, after?: () => void) => {
    setBusy(true);
    try {
      const result = await action();
      if (result.success === false) throw new Error(result.error || '操作失败');
      if (result.warning) alert(result.warning);
      after?.();
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    } finally { setBusy(false); }
  };

  const pendingFor = (row: RosterRow) => pending.find((item) => item.id === row.id);

  const startEdit = (row: RosterRow) => { setEditingId(row.id); setEditDraft({ name: row.name, department: row.department, studentId: row.studentId, contactPhone: row.contactPhone }); };

  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">往届负责人名册</h3>
        <p className="mt-1 text-xs text-slate-500">与真实账号分开维护，仅供部门活动选择负责人署名；名册记录不产生登录能力或权限。填写学号便于本人注册后准确关联。</p>
      </div>
      {pending.length > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">{pending.length} 条待确认关联</span>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <label className="text-xs font-medium text-slate-600">姓名 *<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} /></label>
      <label className="text-xs font-medium text-slate-600">所属部门 *<input value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} className={inputClass} /></label>
      <label className="text-xs font-medium text-slate-600">学号（可选）<input value={draft.studentId} onChange={(e) => setDraft({ ...draft, studentId: e.target.value })} className={inputClass} /></label>
      <label className="text-xs font-medium text-slate-600">联系电话（可选）<input value={draft.contactPhone} onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })} className={inputClass} /></label>
      <button
        disabled={busy || !draft.name.trim() || !draft.department.trim()}
        onClick={() => { void mutate(async () => callApi('/api/former-leaders', 'POST', { name: draft.name, department: draft.department, student_id: draft.studentId, contact_phone: draft.contactPhone }), () => setDraft({ name: '', department: '', studentId: '', contactPhone: '' })); }}
        className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
      >新增名册</button>
    </div>

    <div className="mt-3">
      <button type="button" aria-expanded={batchOpen} onClick={() => setBatchOpen((open) => !open)} className="text-xs font-medium text-teal-700 hover:underline">批量新增（粘贴多行，一次导入）</button>
      {batchOpen && <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <textarea
          rows={6}
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          aria-label="批量名册内容"
          placeholder={'每行一条：姓名，部门，学号，电话（学号、电话可省略）\n张三，学生会\n李四，学生会，8000000010，13800000000'}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || !batchText.trim()} onClick={() => { void submitBatch(); }} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-600 disabled:opacity-50">批量导入</button>
          <button type="button" onClick={() => { void downloadTemplate(); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">下载模板（Excel）</button>
          <span className="text-xs text-slate-500">每行一条：姓名，部门，学号（可选），电话（可选）；支持中文/英文逗号或 Tab 分隔（从 Excel 复制即可），单次最多 200 条，重复和有问题的行会单独提示、不影响其他行。</span>
        </div>
        {batchSummary && <div className="mt-2 text-xs">
          <p className={batchSummary.created > 0 ? 'font-medium text-emerald-700' : 'text-slate-500'}>本次成功新增 {batchSummary.created} 条{batchSummary.duplicate ? `，重复跳过 ${batchSummary.duplicate} 条` : ''}。</p>
          {batchSummary.errors.length > 0 && <ul className="mt-1 list-inside list-disc text-amber-700">{batchSummary.errors.slice(0, 20).map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>}
      </div>}
    </div>

    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">往届负责人名册列表，窄屏可横向滚动查看全部列</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
            <th className="px-3 py-2 font-medium">姓名</th>
            <th className="px-3 py-2 font-medium">部门</th>
            <th className="px-3 py-2 font-medium">学号</th>
            <th className="px-3 py-2 font-medium">联系电话</th>
            <th className="px-3 py-2 font-medium">状态</th>
            <th className="px-3 py-2 font-medium">关联账号</th>
            <th className="px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const awaiting = pendingFor(row);
            return <tr key={row.id} className="border-b border-slate-100">
              {editingId === row.id
                ? <td colSpan={7} className="px-3 py-2">
                  <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-5 lg:items-end">
                    <label className="text-xs text-slate-600">姓名<input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className={inputClass} /></label>
                    <label className="text-xs text-slate-600">部门<input value={editDraft.department} onChange={(e) => setEditDraft({ ...editDraft, department: e.target.value })} className={inputClass} /></label>
                    <label className="text-xs text-slate-600">学号<input value={editDraft.studentId} onChange={(e) => setEditDraft({ ...editDraft, studentId: e.target.value })} className={inputClass} /></label>
                    <label className="text-xs text-slate-600">电话<input value={editDraft.contactPhone} onChange={(e) => setEditDraft({ ...editDraft, contactPhone: e.target.value })} className={inputClass} /></label>
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => { void mutate(() => callApi('/api/former-leaders', 'PUT', { id: row.id, action: 'update', name: editDraft.name, department: editDraft.department, student_id: editDraft.studentId, contact_phone: editDraft.contactPhone }), () => setEditingId(null)); }} className="rounded-md bg-teal-700 px-3 py-1.5 text-xs text-white disabled:opacity-50">保存</button>
                      <button onClick={() => setEditingId(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600">取消</button>
                    </div>
                  </div>
                </td>
                : <>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                  <td className="px-3 py-2 text-slate-600">{row.department}</td>
                  <td className="px-3 py-2 text-slate-600">{row.studentId || '未填写'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.contactPhone || '未填写'}</td>
                  <td className="px-3 py-2"><span className={row.active ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700' : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500'}>{row.active ? '启用' : '已停用'}</span></td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.linkedUserId
                      ? <span>{row.linkedUsername}（{row.linkedStudentId}）</span>
                      : awaiting ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">待确认关联：{awaiting.username}（{awaiting.userStudentId}）</span>
                        : <span className="text-xs text-slate-400">未关联</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <button disabled={busy} onClick={() => startEdit(row)} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 disabled:opacity-50">编辑</button>
                      <button disabled={busy} onClick={() => { if (!window.confirm(row.active ? `停用「${row.name}」后不能用于新活动，既有活动记录不受影响，确认停用？` : `恢复「${row.name}」用于新活动？`)) return; void mutate(() => callApi('/api/former-leaders', 'PUT', { id: row.id, action: 'set_active', active: !row.active })); }} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 disabled:opacity-50">{row.active ? '停用' : '恢复'}</button>
                      {awaiting && !row.linkedUserId && <button disabled={busy} onClick={() => { if (!window.confirm(`确认将名册「${row.name}（${row.studentId}）」与账号「${awaiting.username}（${awaiting.userStudentId}）」关联？关联不改变账号角色与权限。`)) return; void mutate(() => callApi('/api/former-leaders', 'PUT', { id: row.id, action: 'link', linked_user_id: awaiting.userId })); }} className="rounded-md bg-teal-700 px-2 py-1.5 text-white disabled:opacity-50">确认关联</button>}
                      {row.linkedUserId && <button disabled={busy} onClick={() => { if (!window.confirm(`解除「${row.name}」与账号「${row.linkedUsername}」的关联？重新关联需再次核实。`)) return; void mutate(() => callApi('/api/former-leaders', 'PUT', { id: row.id, action: 'unlink' })); }} className="rounded-md border border-amber-200 px-2 py-1 text-amber-700 disabled:opacity-50">解除关联</button>}
                    </div>
                  </td>
                </>}
            </tr>;
          })}
          {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">暂无名册记录</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}
