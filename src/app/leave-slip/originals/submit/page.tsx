'use client';

import Link from 'next/link';
import { FileCheck, Send } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';

export default function SubmitOriginalLeavePage() {
  const { user, initialized, setUser } = useUser();

  if (!initialized) return <AuthLoadingScreen />;

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <DashboardLayout user={user} onLogout={handleLogout} title="提交原假条">
      {user && hasPermission(user, 'canManageOriginalLeave') ? (
        <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Send className="size-5" /></span>
            <div>
              <h2 className="text-balance text-lg font-semibold text-slate-950">提交原假条</h2>
              <p className="mt-1 text-pretty text-sm leading-6 text-slate-500">请从原假条维护区选择“新增原假条”完成提交；提交后可在维护区查询和修正归档信息。</p>
            </div>
          </div>
          <Link href="/leave-slip/originals" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800">
            <FileCheck className="size-4" />
            前往提交原假条
          </Link>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-balance text-lg font-semibold text-slate-950">无权提交原假条</h2>
          <p className="mt-2 text-pretty text-sm leading-6 text-slate-500">请使用已授予原假条管理权限的账号登录。</p>
        </section>
      )}
    </DashboardLayout>
  );
}
