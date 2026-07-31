'use client';

import Link from 'next/link';
import { FileText, UserCheck, GraduationCap, ClipboardList, Award, Send, Moon } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen">
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

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-xl font-semibold text-gray-700">请选择您的身份入口</h2>
          <p className="mt-2 text-sm text-gray-500">根据角色选择对应功能入口</p>
        </div>

        {/* 管理端入口 */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">管理端</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/admin?role=admin"
              className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
                <ClipboardList className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">管理员</h4>
              <p className="mt-1 text-xs text-gray-500">活动总表、活动审核、请假审核、全部权限</p>
            </Link>

            <Link
              href="/admin?role=publisher"
              className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Send className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">发布干事</h4>
              <p className="mt-1 text-xs text-gray-500">活动审核（含策划书、备案表查看）</p>
            </Link>

            <Link
              href="/admin?role=scorer"
              className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Award className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">赋分干事</h4>
              <p className="mt-1 text-xs text-gray-500">活动赋分管理</p>
            </Link>
          </div>
        </div>

        {/* 用户端入口 */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">用户端</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/submit"
              className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <FileText className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">活动提交</h4>
              <p className="mt-1 text-xs text-gray-500">提交活动基本信息、查看审核状态</p>
            </Link>

            <Link
              href="/submit/scoring"
              className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Award className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">赋分材料提交</h4>
              <p className="mt-1 text-xs text-gray-500">上传活动赋分表、备案表照片</p>
            </Link>

            <Link
              href="/leave"
              className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <UserCheck className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">请假申请</h4>
              <p className="mt-1 text-xs text-gray-500">提交请假申请（含请假条图片）、查看审核状态</p>
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">快捷入口</h3>
          <div className="flex flex-wrap gap-3">
            <Link href="/submit/status" className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f]">
              查询提交状态
            </Link>
            <Link href="/leave/status" className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f]">
              查询请假状态
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white py-4">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-500">
          二课活动管理系统
        </div>
      </footer>
    </div>
  );
}
