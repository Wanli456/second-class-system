'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Pencil, RefreshCw, XCircle } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { STATUS_COLORS } from '@/lib/types';
import { useUser } from '@/contexts/UserContext';
import { FilePreviewLink } from '@/components/FilePreviewDialog';

interface LeaveRecord { id: string; student_id: string; student_name: string; class_name: string; leave_type: string; activity_name: string | null; activity_id?: string | null; start_time: string; end_time: string; leave_image_url: string | null; leave_image_name?: string | null; review_status: string; review_note: string | null; group_id?: string | null; applicant_user_id?: string | null; created_at: string; }

function formatTime(value: string) { return value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未填写'; }
function StatusIcon({ status }: { status: string }) { if (status === '已通过') return <CheckCircle2 className="h-3.5 w-3.5" />; if (status === '已驳回') return <XCircle className="h-3.5 w-3.5" />; return <Clock className="h-3.5 w-3.5" />; }

export default function LeaveStatusPage() {
  const { user, initialized } = useUser();
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [targetRequestId, setTargetRequestId] = useState<string | null>(null);
  const [queryReady, setQueryReady] = useState(false);

  const load = async (recordId = targetRequestId) => {
    setLoading(true);
    try {
      const endpoint = recordId ? `/api/leave?id=${encodeURIComponent(recordId)}` : '/api/leave';
      const response = await apiFetch(endpoint);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '查询失败');
      setLeaves(data.data || []);
      setLoaded(true);
    } catch (error) { alert(error instanceof Error ? error.message : '查询失败'); } finally { setLoading(false); }
  };
  useEffect(() => {
    setTargetRequestId(new URLSearchParams(window.location.search).get('requestId'));
    setQueryReady(true);
  }, []);
  useEffect(() => { if (initialized && user && queryReady) void load(targetRequestId); }, [initialized, queryReady, targetRequestId, user]);
  useEffect(() => {
    if (!loaded || !targetRequestId) return;
    document.getElementById(`leave-record-${targetRequestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loaded, targetRequestId]);

  const groups = useMemo(() => {
    const result: Array<{ key: string; records: LeaveRecord[] }> = [];
    const map = new Map<string, LeaveRecord[]>();
    for (const leave of leaves) { const key = leave.group_id || leave.id; const group = map.get(key) || []; group.push(leave); map.set(key, group); }
    map.forEach((records, key) => result.push({ key, records }));
    return result;
  }, [leaves]);

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-screen items-center justify-center p-4"><div className="rounded-lg border bg-white p-6 text-center"><h2 className="font-semibold">请先登录</h2><p className="my-4 text-sm text-gray-500">登录后才能查看自己的请假状态。</p><Link href="/login?redirect=/leave/status" className="rounded-md bg-teal-700 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;

  return <DashboardLayout title="请假状态查询" user={user}><div className="mx-auto max-w-3xl space-y-4">
    <div className="flex items-center justify-between rounded-lg border bg-white p-4"><div><h2 className="font-semibold">我的请假记录</h2><p className="mt-1 text-sm text-gray-500">账号：{user.name || user.username}（{user.studentId}）</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm text-gray-600"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</button></div>
    {!loaded || loading ? <div className="py-10 text-center text-sm text-gray-400">查询中...</div> : groups.length === 0 ? <div className="rounded-lg border border-dashed bg-white py-12 text-center text-sm text-gray-400">暂无请假记录</div> : groups.map(({ key, records }) => {
      const first = records[0]; const isGroup = Boolean(first.group_id); const approved = records.every((item) => item.review_status === '已通过'); const status = records.some((item) => item.review_status === '待审核') ? '待审核' : records.some((item) => item.review_status === '已驳回') ? '已驳回' : '已通过';
      const isTarget = records.some((record) => record.id === targetRequestId);
      const canResubmit = !approved && (
        first.group_id
          ? first.applicant_user_id === user.id
          : first.applicant_user_id
            ? first.applicant_user_id === user.id
            : first.student_id === user.studentId
      );
      return <div id={`leave-record-${isTarget ? targetRequestId : key}`} key={key} className={`rounded-lg border bg-white p-4 shadow-sm ${isTarget ? 'border-teal-500 ring-2 ring-teal-100' : ''}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded border px-2 py-1 text-xs">{isGroup ? '集体请假' : first.leave_type}</span>{first.activity_name && <span className="text-sm text-gray-600">活动：{first.activity_name}</span>}</div><p className="mt-2 text-sm text-gray-500">请假时间：{formatTime(first.start_time)} 至 {formatTime(first.end_time)}</p><p className="text-xs text-gray-400">提交时间：{formatTime(first.created_at)}</p></div><span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}><StatusIcon status={status} />{status}</span></div>
        {isGroup && <div className="mt-3 rounded-md bg-gray-50 p-3"><p className="mb-2 text-xs font-medium text-gray-600">{first.class_name}，共 {records.length} 名学生</p><div className="flex flex-wrap gap-2">{records.map((item) => <span key={item.id} className="rounded border bg-white px-2 py-1 text-xs text-gray-600">{item.student_name}（{item.student_id}）</span>)}</div></div>}
        {first.leave_image_url && <div className="mt-3"><FilePreviewLink url={first.leave_image_url} fileName={first.leave_image_name} label="请假条" className="text-xs text-teal-700" /></div>}
        {first.review_note && <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">审核备注：{first.review_note}</p>}
        {canResubmit && <div className="mt-3 border-t pt-3"><Link href={`/leave?requestId=${encodeURIComponent(first.id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-teal-700"><Pencil className="h-3.5 w-3.5" />重新提交</Link></div>}
      </div>;
    })}
  </div></DashboardLayout>;
}
