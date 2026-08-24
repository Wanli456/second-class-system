'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Search } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { FilePreviewLink } from '@/components/FilePreviewDialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
  original_slip_id: string | null;
  created_at: string;
}
interface SlipStudent { id: string; slip_id: string; student_id: string; student_name: string; class_name: string; }
function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [value];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

export default function LeaveSlipQueryPage() {
  return <React.Suspense fallback={<AuthLoadingScreen />}><LeaveSlipQueryContent /></React.Suspense>;
}

function LeaveSlipQueryContent() {
  const { user, initialized } = useUser();
  const searchParams = useSearchParams();
  const [keyword, setKeyword] = useState(() => searchParams.get('keyword')?.trim() || '');
  const [status, setStatus] = useState('');
  const [className, setClassName] = useState('');
  const [slips, setSlips] = useState<Slip[]>([]);
  const [students, setStudents] = useState<SlipStudent[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const canAccess = hasPermission(user, 'canQueryLeave');
  const canCompare = hasPermission(user, 'canManageOriginalLeave');
  const canReview = hasPermission(user, 'canReviewLeave');
  const canViewRecords = canAccess;

  const studentsBySlip = useMemo(() => {
    const map = new Map<string, SlipStudent[]>();
    for (const student of students) {
      const list = map.get(student.slip_id) || [];
      list.push(student);
      map.set(student.slip_id, list);
    }
    return map;
  }, [students]);

  const search = async () => {
    if (!canViewRecords) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (status) params.set('status', status);
      if (className.trim()) params.set('class', className.trim());

      const slipRes = await apiFetch(`/api/leave-slips?${params.toString()}`);
      const slipData = await slipRes.json();
      if (!slipData.success) throw new Error(slipData.error || '查询失败');
      setSlips(slipData.data || []);
      setStudents(slipData.students || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : '查询失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialized && user && canViewRecords && !searched) void search();
  }, [initialized, user, canViewRecords, searched]);

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><div className="rounded-xl border bg-white p-6 text-center"><h2 className="font-semibold">请先登录</h2><p className="mt-2 text-sm text-slate-500">登录后才能查询。</p><Link href="/login?redirect=/leave-slip/query" className="mt-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;
  if (!canViewRecords) {
    return <DashboardLayout user={user} title="假条查看与对比" activeNavHref="/leave-slip/records"><div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><AlertCircle className="mx-auto size-6 text-amber-600" /><h2 className="mt-3 font-semibold text-amber-900">当前账号没有假条查看权限</h2><p className="mt-2 text-sm text-amber-800">请联系系统管理员授予 `canQueryLeave` 权限。</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout user={user} title="假条查看与对比" activeNavHref="/leave-slip/records">
      <div className="mx-auto w-full max-w-6xl">
        <Link href="/leave-slip/records" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="size-4" />返回假条查看与对比</Link>
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase text-teal-700">假条管理</p>
          <h2 className="mt-2 text-2xl font-bold text-balance text-slate-950">查询全部假条</h2>
          <p className="mt-2 max-w-2xl text-sm text-pretty text-slate-600">这里统一查询系统内每一张已提交假条，包括班级负责人上传、临时请假和活动公假；可按班级、学生姓名、学号、活动名称和审核状态筛选。已归档的活动方原假条可在“对比假条”中与其关联假条核对。</p>
          <nav className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white p-1" aria-label="假条查看与对比功能">
            <Link href="/leave-slip/query" aria-current="page" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">查看假条</Link>
            {canCompare ? <Link href="/leave-slip/records/compare" className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">对比假条</Link> : null}
          </nav>
        </header>

        <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_140px_140px_auto]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="班级 / 姓名 / 学号 / 活动名称" />
          </label>
          <input value={className} onChange={(event) => setClassName(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600" placeholder="班级精确筛选" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600">
            <option value="">全部状态</option>
            <option value="待查对">待查对</option>
            <option value="已通过">已通过</option>
            <option value="已驳回">已驳回</option>
          </select>
          <Button type="button" onClick={() => void search()} disabled={loading} className="h-10 bg-slate-950 px-5 hover:bg-slate-800">{loading ? '查询中...' : '搜索'}</Button>
        </div>

        <div className="items-start">
          <section aria-label="全部已提交假条">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-950">
              <span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">1</span>
              全部已提交假条（{slips.length}）
            </h3>
            <div className="space-y-4">
              {slips.length === 0 && searched ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-400">没有匹配的假条。请调整班级、姓名、学号、活动名称或状态后重试。</div> : null}
              {slips.map((slip) => {
                const rows = studentsBySlip.get(slip.id) || [];
                const classNames = parseJsonArray(slip.class_names);
                return (
                  <article key={slip.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">{slip.slip_type}</span>
                      <span className={cn('rounded-md border px-2 py-1 text-xs font-medium', slip.review_status === '已通过' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : slip.review_status === '已驳回' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>{slip.review_status}</span>
                      {slip.original_slip_id && <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">已关联原假条</span>}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{classNames.join('、')} · {slip.leave_type}</p>
                    <p className="mt-1 text-sm text-slate-600">上传人：{slip.applicant_name || '-'}（{slip.applicant_student_id || '-'}）</p>
                    {slip.activity_name && <p className="mt-1 text-sm text-slate-600">活动：{slip.activity_name}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rows.map((row) => <span key={row.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">{row.student_name}（{row.student_id}）</span>)}
                    </div>
                    {slip.leave_image_url && <div className="mt-3"><FilePreviewLink url={slip.leave_image_url} fileName={slip.leave_image_name} label="查看假条图片" className="text-xs text-teal-700" /></div>}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
