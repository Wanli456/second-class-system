'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClipboardList, Send, Award, FileText, UserCheck, Moon, Lock, LogOut, Key, ArrowLeft, ArrowUpRight,
  LayoutDashboard, Users, FileCheck,
} from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { DashboardLayout } from '@/components/DashboardLayout';

interface User {
  id: string;
  username: string;
  name: string;
  studentId?: string;
  role: string;
  canPublish?: boolean;
  canScore?: boolean;
  canReviewLeave?: boolean;
  canViewEveningStudy?: boolean;
}

function getButtonState(user: User | null, requiredRole: string): 'active' | 'grayed' | 'locked' {
  if (!user) return 'locked';
  if (user.role === 'admin') return 'active';
  if (requiredRole === 'admin') return 'grayed';
  if (requiredRole === 'publisher') return user.canPublish ? 'active' : 'grayed';
  if (requiredRole === 'scorer') return user.canScore ? 'active' : 'grayed';
  if (requiredRole === 'leave_reviewer') return user.canReviewLeave ? 'active' : 'grayed';
  return 'grayed';
}

function getLeaderButtonState(user: User | null): 'active' | 'grayed' | 'locked' {
  if (!user) return 'locked';
  if (user.role === 'admin' || user.role === 'publisher' || user.canPublish || user.canScore) return 'active';
  if (user.role === 'leader') return 'active';
  return 'grayed';
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 管理员自动拥有所有权限
        if (parsed.role === 'admin') {
          parsed.canPublish = true;
          parsed.canScore = true;
          parsed.canReviewLeave = true;
          parsed.canViewEveningStudy = true;
        }
        setUser(parsed);
      } catch {}
    }
  }, []);

  const handleLoginSuccess = (u: User) => {
    setUser(u);
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  const handleChangePassword = async () => {
    if (!oldPassword) {
      setPasswordMessage('请输入旧密码');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('两次密码不一致');
      return;
    }
    try {
      const res = await fetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user!.id, password: newPassword, oldPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordMessage('密码修改成功');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordMessage('');
        }, 1500);
      } else {
        setPasswordMessage(data.error || '修改失败');
      }
    } catch {
      setPasswordMessage('网络错误');
    }
  };

  const handleRoleClick = (_role: string) => {
    setShowLoginModal(true);
  };

  const adminState = getButtonState(user, 'admin');
  const publisherState = getButtonState(user, 'publisher');
  const scorerState = getButtonState(user, 'scorer');
  const leaveReviewerState = getButtonState(user, 'leave_reviewer');
  const leaderState = getLeaderButtonState(user);

  // 修改密码页面
  if (showPasswordModal) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <button
              onClick={() => { setShowPasswordModal(false); setPasswordMessage(''); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}
              className="flex items-center gap-1 text-sm text-teal-600 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              返回首页
            </button>
            <h1 className="text-lg font-bold text-gray-900">修改密码</h1>
            <div className="w-20" />
          </div>
        </header>

        <main className="mx-auto max-w-md px-6 py-12">
          <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
                <Key className="h-6 w-6 text-teal-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">修改密码</h2>
              <p className="mt-1 text-sm text-gray-500">欢迎，{user?.name}</p>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">旧密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  placeholder="请输入旧密码"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  placeholder="请输入新密码（至少 6 位）"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  placeholder="请再次输入新密码"
                  required
                  minLength={6}
                />
              </div>

              {passwordMessage && (
                <p className={`text-sm ${passwordMessage.includes('成功') ? 'text-green-600' : 'text-red-600'}`}>
                  {passwordMessage}
                </p>
              )}

              <button
                type="submit"
                className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700"
              >
                确认修改
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // 已登录用户 - 使用 DashboardLayout
  if (user) {
    return (
      <DashboardLayout user={user} onLogout={handleLogout} title="首页">
        <div className="space-y-6">
          {/* 欢迎区域 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  欢迎，{user.name}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  当前角色：
                  <span className="font-medium text-teal-600">
                    {user.role === 'admin' ? '管理员' : user.role === 'leader' ? '活动负责人' : '学生'}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell userId={user.id} />
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <Key className="h-4 w-4" />
                  修改密码
                </button>
              </div>
            </div>
          </div>

          {/* 管理端入口 */}
          {(user.role === 'admin' || user.canPublish || user.canScore || user.canReviewLeave) && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">管理端</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* 管理员 */}
                {user.role === 'admin' && (
                  <Link
                    href="/admin?role=admin&tab=activities"
                    className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-teal-500 hover:shadow-md"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <h4 className="font-semibold text-gray-900">活动总表</h4>
                    <p className="mt-1 text-xs text-gray-500">活动管理、审核、赋分、用户管理</p>
                  </Link>
                )}

                {/* 发布活动 */}
                {(user.role === 'admin' || user.canPublish) && (
                  <Link
                    href="/admin?role=publisher&tab=review"
                    className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-teal-500 hover:shadow-md"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <FileCheck className="h-5 w-5" />
                    </div>
                    <h4 className="font-semibold text-gray-900">活动审核</h4>
                    <p className="mt-1 text-xs text-gray-500">审核活动提交（含策划书、备案表）</p>
                  </Link>
                )}

                {/* 活动赋分 */}
                {(user.role === 'admin' || user.canScore) && (
                  <Link
                    href="/admin?role=scorer&tab=scoring"
                    className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-teal-500 hover:shadow-md"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <Award className="h-5 w-5" />
                    </div>
                    <h4 className="font-semibold text-gray-900">活动赋分</h4>
                    <p className="mt-1 text-xs text-gray-500">活动赋分管理</p>
                  </Link>
                )}

                {/* 请假审核 */}
                {(user.role === 'admin' || user.canReviewLeave) && (
                  <Link
                    href="/admin?role=leave_reviewer&tab=leave"
                    className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-teal-500 hover:shadow-md"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <h4 className="font-semibold text-gray-900">请假审核</h4>
                    <p className="mt-1 text-xs text-gray-500">审核请假申请（含请假条截图）</p>
                  </Link>
                )}

                {/* 用户管理 */}
                {user.role === 'admin' && (
                  <Link
                    href="/admin?role=admin&tab=users"
                    className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-teal-500 hover:shadow-md"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <h4 className="font-semibold text-gray-900">用户管理</h4>
                    <p className="mt-1 text-xs text-gray-500">权限管理、角色分配</p>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* 用户端入口 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">用户端</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* 活动提交 */}
              {(user.role === 'admin' || user.role === 'leader' || user.canPublish) && (
                <Link
                  href="/submit"
                  className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-teal-500 hover:shadow-md"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Send className="h-5 w-5" />
                  </div>
                  <h4 className="font-semibold text-gray-900">活动提交</h4>
                  <p className="mt-1 text-xs text-gray-500">提交活动基本信息、查看审核状态</p>
                </Link>
              )}

              {/* 赋分材料提交 */}
              {(user.role === 'admin' || user.role === 'leader' || user.canScore) && (
                <Link
                  href="/submit/scoring"
                  className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-teal-500 hover:shadow-md"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Award className="h-5 w-5" />
                  </div>
                  <h4 className="font-semibold text-gray-900">赋分材料提交</h4>
                  <p className="mt-1 text-xs text-gray-500">上传活动赋分表、备案表照片</p>
                </Link>
              )}

              {/* 请假申请 */}
              <Link
                href="/leave"
                className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-teal-500 hover:shadow-md"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <FileText className="h-5 w-5" />
                </div>
                <h4 className="font-semibold text-gray-900">请假申请</h4>
                <p className="mt-1 text-xs text-gray-500">提交请假申请（含请假条图片）</p>
              </Link>
            </div>
          </div>

          {/* 快捷查询 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">快捷查询</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* 提交状态查询 */}
              <Link
                href="/submit/status"
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-teal-500 hover:bg-gray-50"
              >
                <FileCheck className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">提交状态查询</span>
              </Link>

              {/* 请假状态查询 */}
              <Link
                href="/leave/status"
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-teal-500 hover:bg-gray-50"
              >
                <FileText className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">请假状态查询</span>
              </Link>

              {/* 晚自习请假查询 */}
              {user.canViewEveningStudy && (
                <Link
                  href="/evening-study"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-teal-500 hover:bg-gray-50"
                >
                  <Moon className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">晚自习请假查询</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // 未登录用户 - 显示公开首页
  return (
    <div className="min-h-screen bg-[#f5f7f6] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
              <ClipboardList className="h-5 w-5" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-950 sm:text-lg">二课活动管理系统</h1>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Activity Operations</p>
            </div>
          </div>
          <button
            onClick={() => setShowLoginModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 sm:px-4"
          >
            登录 / 注册
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
              第二课堂工作入口
            </div>
            <h2 className="max-w-2xl text-4xl font-bold leading-[1.12] tracking-tight text-slate-950 sm:text-5xl">
              让活动提交、请假与赋分，
              <span className="block text-teal-700">在一个工作台完成。</span>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              二课活动管理与请假申请平台，为学生、活动负责人和管理人员提供清晰的业务入口。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowLoginModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              >
                进入工作台
                <ArrowUpRight className="h-4 w-4" />
              </button>
              <Link
                href="/leave"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-teal-500 hover:text-teal-700"
              >
                直接提交请假
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.45)] sm:p-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Quick access</p>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950">常用入口</h3>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <LayoutDashboard className="h-4 w-4" />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { href: '/submit', label: '活动提交', detail: '负责人提交活动信息', icon: Send, tone: 'text-emerald-700 bg-emerald-50' },
                { href: '/leave', label: '请假申请', detail: '提交请假信息与请假条', icon: FileText, tone: 'text-sky-700 bg-sky-50' },
                { href: '/leave/status', label: '请假状态查询', detail: '查看审核处理状态', icon: FileCheck, tone: 'text-slate-700 bg-slate-100' },
              ].map(({ href, label, detail, icon: Icon, tone }) => (
                <Link key={href} href={href} className="group flex items-center gap-3 py-4 transition-colors first:pt-5 last:pb-1 hover:text-teal-700">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{label}</span>
                    <span className="mt-1 block text-xs text-slate-500">{detail}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-teal-600" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-14 border-t border-slate-200 pt-8">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Access guide</p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950">按角色进入对应功能</h3>
            </div>
            <p className="text-sm text-slate-500">登录后将根据权限显示管理菜单</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              { label: '学生', detail: '请假申请、状态查询', icon: UserCheck, tone: 'bg-sky-50 text-sky-700' },
              { label: '活动负责人', detail: '活动提交、赋分材料', icon: Send, tone: 'bg-emerald-50 text-emerald-700' },
              { label: '管理人员', detail: '审核、赋分、活动管理', icon: Users, tone: 'bg-amber-50 text-amber-700' },
            ].map(({ label, detail, icon: Icon, tone }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{detail}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h4 className="font-semibold text-amber-950">更多管理功能需要登录</h4>
              <p className="mt-1 text-sm leading-6 text-amber-800">活动审核、活动赋分、提交状态和晚自习查询会按账号权限开放。</p>
            </div>
          </div>
          <button
            onClick={() => setShowLoginModal(true)}
            className="shrink-0 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            立即登录
          </button>
        </section>
      </main>

      {/* 登录弹窗 */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}

function LoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (user: User) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: isLogin ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          name,
          password,
        }),
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('user', JSON.stringify(data.data));
        onSuccess(data.data);
      } else {
        setError(data.error || (isLogin ? '登录失败' : '注册失败'));
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {isLogin ? '账号登录' : '注册账号'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">学号</label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="请输入学号"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">姓名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="请输入姓名"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="请输入密码"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : isLogin ? '登录' : '注册'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-sm text-teal-600 hover:underline"
          >
            {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
