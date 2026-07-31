'use client';

import Link from 'next/link';
import { BookOpen, FileText, ClipboardList, UserCheck, GraduationCap } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">二课活动管理系统</h1>
              <p className="text-sm text-blue-200">第二课堂活动管理与请假申请</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-xl font-semibold text-gray-700">请选择您的身份入口</h2>
          <p className="mt-2 text-sm text-gray-500">根据角色选择对应功能入口</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* 管理员入口 */}
          <Link
            href="/admin"
            className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
              <ClipboardList className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-[#1e3a5f]">管理员</h3>
            <p className="mt-2 text-sm text-gray-500">
              查看编辑活动总表、审核活动提交、管理请假申请
            </p>
          </Link>

          {/* 活动负责人入口 */}
          <Link
            href="/submit"
            className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-[#1e3a5f]">活动负责人</h3>
            <p className="mt-2 text-sm text-gray-500">
              提交活动信息、查看提交审核状态
            </p>
          </Link>

          {/* 学生入口 */}
          <Link
            href="/leave"
            className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <UserCheck className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-[#1e3a5f]">学生</h3>
            <p className="mt-2 text-sm text-gray-500">
              提交请假申请、查看请假审核状态
            </p>
          </Link>
        </div>

        {/* Quick Links */}
        <div className="mt-10 rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-700">快捷入口</h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/submit/status"
              className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
            >
              查询提交状态
            </Link>
            <Link
              href="/leave/status"
              className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
            >
              查询请假状态
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-500">
          二课活动管理系统
        </div>
      </footer>
    </div>
  );
}
