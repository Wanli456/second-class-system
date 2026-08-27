'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { PageErrorDialog } from '@/components/PageErrorDialog';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Slip {
  id: string;
  slip_type: string;
  leave_type: string;
  class_names: string;
  start_time: string | null;
  end_time: string | null;
  activity_name: string | null;
  applicant_name: string | null;
  applicant_student_id: string | null;
  leave_image_url: string | null;
  leave_image_name: string | null;
  review_status: string;
  review_note: string | null;
  is_late: boolean;
  created_at: string;
}
interface SlipStudent { id: string; slip_id: string; student_id: string; student_name: string; class_name: string; }

function parseClasses(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : [value]; } catch { return [value]; }
}

export default function MyLeaveSlipsPage() {
  const { user, initialized } = useUser();
  const [slips, setSlips] = useState<Slip[]>([]);
  const [students, setStudents] = useState<SlipStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const studentsBySlip = useMemo(() => {
    const map = new Map<string, SlipStudent[]>();
    for (const student of students) {
      const list = map.get(student.slip_id) || [];
      list.push(student);
      map.set(student.slip_id, list);
    }
    return map;
  }, [students]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/leave-slips?self=1');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '查询失败');
      setSlips(data.data || []);
      setStudents(data.students || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (initialized && user) void load();
  }, [initialized, user]);

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><div className="rounded-xl border bg-white p-6 text-center"><h2 className="font-semibold">请先登录</h2><p className="mt-2 text-sm text-slate-500">登录后查看与你相关的假条。</p><Link href="/login?redirect=/leave-slip/mine" className="mt-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;

  return (
    <DashboardLayout user={user} title="我的假条" activeNavHref="/leave-slip/mine">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">假条管理</p>
            <h2 className="mt-2 text-2xl font-bold text-balance text-slate-950">我的假条</h2>
            <p className="mt-2 text-sm text-pretty text-slate-600">查看所有与你相关的假条（你上传的，或名单里有你的）。</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? '刷新中...' : '刷新'}</Button>
        </header>

        <div className="space-y-4">
          {!loading && slips.length === 0 && !error ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-400">暂无与你相关的假条</div> : null}
          {slips.map((slip) => {
            const rows = studentsBySlip.get(slip.id) || [];
            return (
              <article key={slip.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">{slip.slip_type}</span>
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">{slip.leave_type}</span>
                  {slip.is_late && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">迟到上传</span>}
                  <span className={cn('rounded-md border px-2 py-1 text-xs font-medium', slip.review_status === '已通过' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : slip.review_status === '已驳回' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>{slip.review_status}</span>
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm text-slate-900"><FileText className="mt-0.5 size-4 shrink-0 text-slate-400" />班级：{parseClasses(slip.class_names).join('、')}</p>
                <p className="mt-1 text-sm text-slate-600">时间：{slip.start_time ? slip.start_time.replace('T', ' ') : '-'} 至 {slip.end_time ? slip.end_time.replace('T', ' ') : '-'}</p>
                {slip.activity_name && <p className="mt-1 text-sm text-slate-600">活动：{slip.activity_name}</p>}
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">名单（{rows.length} 人）</p>
                  <div className="flex flex-wrap gap-2">{rows.map((row) => <span key={row.id} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">{row.student_name}（{row.student_id}）· {row.class_name}</span>)}</div>
                </div>
                {slip.review_note && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">审核意见：{slip.review_note}</p>}
              </article>
            );
          })}
        </div>
      </div>

      <PageErrorDialog open={Boolean(error)} message={error} onClose={() => setError('')} />
    </DashboardLayout>
  );
}