'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AlertCircle, FileSearch, GitCompareArrows } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';

export default function LeaveSlipRecordsPage() {
  return <Suspense fallback={<AuthLoadingScreen />}><LeaveSlipRecordsContent /></Suspense>;
}

function LeaveSlipRecordsContent() {
  const { user, initialized } = useUser();
  const searchParams = useSearchParams();
  const canQuery = hasPermission(user, 'canQueryLeave');
  const canCompare = hasPermission(user, 'canManageOriginalLeave');
  const queryKeyword = searchParams.get('keyword')?.trim();
  const viewHref = queryKeyword ? `/leave-slip/query?keyword=${encodeURIComponent(queryKeyword)}` : '/leave-slip/query';

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><div className="rounded-xl border bg-white p-6 text-center"><h2 className="font-semibold">请先登录</h2><p className="mt-2 text-sm text-slate-500">登录后才能查看假条记录。</p><Link href="/login?redirect=/leave-slip/records" className="mt-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;

  return (
    <DashboardLayout user={user} title="假条查看与对比" activeNavHref="/leave-slip/records">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">
          <p className="text-xs font-semibold uppercase text-teal-700">假条管理</p>
          <h1 className="mt-2 text-balance text-2xl font-bold text-slate-950">假条查看与对比</h1>
          <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-slate-600">在同一个功能区查看班级负责人上传的假条，或集中核对、维护活动方归档的原假条。两个操作仍分别按对应权限开放。</p>
        </header>

        {!canQuery && !canCompare ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><AlertCircle className="mx-auto size-6 text-amber-600" /><h2 className="mt-3 font-semibold text-amber-900">当前账号没有查看权限</h2><p className="mt-2 text-sm text-amber-800">请联系系统管理员授予假条查看权限或假条对比权限。</p></div> : <div className="grid gap-5 lg:grid-cols-2">
          {canQuery && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><FileSearch className="size-5" /></div>
            <h2 className="mt-4 text-balance text-xl font-semibold text-slate-950">查看假条</h2>
            <p className="mt-2 text-pretty text-sm leading-6 text-slate-600">按班级、姓名、学号、活动名称和状态查询已上传的假条，查看学生信息、假条图片和原假条关联状态。</p>
            <Link href={viewHref} className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">查看假条</Link>
          </section>}
          {canCompare && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex size-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><GitCompareArrows className="size-5" /></div>
            <h2 className="mt-4 text-balance text-xl font-semibold text-slate-950">对比假条</h2>
            <p className="mt-2 text-pretty text-sm leading-6 text-slate-600">将同一条记录的班级负责人上传假条与活动方归档原假条左右并排，核对学生、班级、活动和图片；需要修改原件时可继续进入维护。</p>
            <Link href="/leave-slip/records/compare" className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">对比假条</Link>
          </section>}
        </div>}
      </div>
    </DashboardLayout>
  );
}
