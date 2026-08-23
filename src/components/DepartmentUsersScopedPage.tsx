'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DepartmentUsersPage from '@/app/department-users/page';

type Department = '学习竞技部' | '第二课堂认证中心';

type DepartmentUsersScopedPageProps = {
  department: Department;
  title: string;
};

type StoredUser = {
  role?: unknown;
  department?: unknown;
};

export function DepartmentUsersScopedPage({ department, title }: DepartmentUsersScopedPageProps) {
  const [accessChecked, setAccessChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    document.title = title;
    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
      setAccessChecked(true);
      return;
    }

    try {
      const user = JSON.parse(rawUser) as StoredUser;
      setAllowed(user.role === 'leader' && user.department === department);
    } catch {
      setAllowed(false);
    } finally {
      setAccessChecked(true);
    }
  }, [department, title]);

  if (!accessChecked) {
    return <main className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-500">正在确认页面权限...</main>;
  }

  if (!allowed) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">无权访问该部门页面</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">此页面仅供{department}部门负责人使用，请使用对应账号登录。</p>
          <Link href="/" className="mt-6 inline-flex rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800">返回首页</Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-teal-700">{department}专属页面</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">仅管理本部门成员、班级负责人及本部门业务权限。</p>
        </div>
      </header>
      <DepartmentUsersPage />
    </div>
  );
}
