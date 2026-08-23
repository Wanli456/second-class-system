'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Award,
  ChevronRight,
  ClipboardList,
  FileCheck,
  FileText,
  Key,
  LayoutDashboard,
  Lock,
  LogIn,
  Moon,
  Send,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';

interface User {
  id: string;
  username?: string;
  name?: string;
  studentId?: string;
  role: string;
  canPublish?: boolean;
  canScore?: boolean;
  canSubmitActivity?: boolean;
  canViewSubmissionStatus?: boolean;
  canSubmitScoring?: boolean;
  canReviewLeave?: boolean;
  canViewEveningStudy?: boolean;
  canStartGroupLeave?: boolean;
  canManageAttendanceWork?: boolean;
  canUploadLeave?: boolean;
  canQueryLeave?: boolean;
  canManageOriginalLeave?: boolean;
  department?: string | null;
  permissionOverrides?: string | null;
}

interface PortalEntry {
  href: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  show: boolean;
}

export default function Home() {
  const { user: globalUser, initialized, setUser: setGlobalUser } = useUser();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const user = globalUser
    ? {
        ...globalUser,
        ...(globalUser.role === 'admin'
          ? {
              canPublish: true,
              canScore: true,
              canSubmitActivity: true,
              canViewSubmissionStatus: true,
              canSubmitScoring: true,
              canReviewLeave: true,
              canViewEveningStudy: true,
              canStartGroupLeave: true,
              canManageAttendanceWork: true,
              canUploadLeave: true,
              canQueryLeave: true,
              canManageOriginalLeave: true,
            }
          : {}),
      }
    : null;

  const handleLoginSuccess = (nextUser: User) => {
    setGlobalUser(nextUser);
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setGlobalUser(null);
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
      const res = await apiFetch('/api/auth', {
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

  if (!initialized) {
    return <AuthLoadingScreen />;
  }

  if (showPasswordModal) {
    return (
      <div className="min-h-dvh bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <button
              onClick={() => { setShowPasswordModal(false); setPasswordMessage(''); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}
              className="flex items-center gap-1 text-sm text-teal-700 hover:underline"
            >
              返回首页
            </button>
            <h1 className="text-lg font-bold text-slate-950">修改密码</h1>
            <div className="w-20" />
          </div>
        </header>

        <main className="mx-auto max-w-md px-6 py-12">
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-teal-50">
                <Key className="size-6 text-teal-700" />
              </div>
              <h2 className="text-balance text-lg font-bold text-slate-950">修改密码</h2>
              <p className="mt-1 text-sm text-slate-500">欢迎，{user?.name}</p>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">旧密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  placeholder="请输入旧密码"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  placeholder="请输入新密码（至少 6 位）"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  placeholder="请再次输入新密码"
                  required
                  minLength={6}
                />
              </div>

              {passwordMessage && (
                <p className={cn('text-sm', passwordMessage.includes('成功') ? 'text-emerald-600' : 'text-rose-600')}>
                  {passwordMessage}
                </p>
              )}

              <button
                type="submit"
                className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-800"
              >
                确认修改
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  if (user) {
    const isAdmin = user.role === 'admin';

    // 第二课堂认证中心：活动申报、审核、赋分、提交进度。
    const certificationEntries: PortalEntry[] = [
      { href: '/admin?role=admin&tab=activities', label: '活动总表', detail: '活动管理、审核、赋分、用户管理', icon: ClipboardList, tone: 'bg-teal-50 text-teal-700', show: isAdmin },
      { href: '/admin?role=admin&tab=review', label: '活动审核', detail: '审核活动提交（含策划书、备案表）', icon: FileCheck, tone: 'bg-indigo-50 text-indigo-700', show: hasPermission(user, 'canPublish') },
      { href: '/admin?role=admin&tab=scoring', label: '活动赋分', detail: '活动赋分管理', icon: Award, tone: 'bg-orange-50 text-orange-700', show: hasPermission(user, 'canScore') },
      { href: '/admin?role=admin&tab=users', label: '用户管理', detail: '权限管理、角色分配', icon: Users, tone: 'bg-rose-50 text-rose-700', show: isAdmin },
      { href: '/submit', label: '活动提交', detail: '提交活动基本信息、查看审核状态', icon: Send, tone: 'bg-emerald-50 text-emerald-700', show: hasPermission(user, 'canSubmitActivity') },
      { href: '/submit/status', label: '提交状态', detail: '查询活动提交进度和结果', icon: FileCheck, tone: 'bg-slate-100 text-slate-700', show: hasPermission(user, 'canViewSubmissionStatus') },
      { href: '/submit/scoring', label: '赋分材料', detail: '上传活动赋分表、备案表照片', icon: Award, tone: 'bg-amber-50 text-amber-700', show: hasPermission(user, 'canSubmitScoring') },
    ].filter((entry) => entry.show);

    // 学习竞技部：假条、晚自习、考勤工作安排。
    const departmentEntries: PortalEntry[] = [
      { href: '/leave-slip/mine', label: '我的假条', detail: '查看与自己相关的假条记录', icon: FileCheck, tone: 'bg-sky-50 text-sky-700', show: true },
      { href: '/leave-slip/upload', label: '假条上传', detail: '统一上传本班假条', icon: FileText, tone: 'bg-cyan-50 text-cyan-700', show: hasPermission(user, 'canUploadLeave') },
      { href: '/leave-slip/temporary', label: '临时请假', detail: '提交临时请假，自动审核通过', icon: Send, tone: 'bg-emerald-50 text-emerald-700', show: hasPermission(user, 'canStartGroupLeave') },
      { href: '/leave-slip/review', label: '假条查对', detail: '人工查对请假条', icon: UserCheck, tone: 'bg-amber-50 text-amber-700', show: hasPermission(user, 'canReviewLeave') },
      { href: '/leave-slip/query', label: '假条查询', detail: '按班级/姓名/日期搜索', icon: Moon, tone: 'bg-slate-100 text-slate-700', show: hasPermission(user, 'canQueryLeave') },
      { href: '/leave-slip/originals', label: '原假条', detail: '管理活动原假条', icon: FileCheck, tone: 'bg-slate-100 text-slate-700', show: hasPermission(user, 'canManageOriginalLeave') },
      { href: '/attendance-work', label: '考勤工作安排', detail: '按周提交和查对考勤工作安排', icon: ClipboardList, tone: 'bg-teal-50 text-teal-700', show: hasPermission(user, 'canManageAttendanceWork') || hasPermission(user, 'canReviewLeave') },
      { href: '/evening-study', label: '晚自习查询', detail: '查看晚自习请假与考勤安排', icon: Moon, tone: 'bg-indigo-50 text-indigo-700', show: hasPermission(user, 'canViewEveningStudy') || hasPermission(user, 'canQueryLeave') },
    ].filter((entry) => entry.show);

    type EntryWithGroup = PortalEntry & { group: string };
    const visibleEntries: EntryWithGroup[] = [
      ...certificationEntries.map((entry) => ({ ...entry, group: '第二课堂认证中心' })),
      ...departmentEntries.map((entry) => ({ ...entry, group: '学习竞技部' })),
    ];

    // 常用入口：按当前角色权限挑选最常用的功能。
    const departmentUserEntry: EntryWithGroup = {
      href: '/department-users',
      label: '部门用户管理',
      detail: '设置本部门成员与业务权限',
      icon: Users,
      tone: 'bg-indigo-50 text-indigo-700',
      show: true,
      group: user.department || '部门管理',
    };
    const visibleEntriesWithDepartment = user.role === 'leader' && (user.department === '学习竞技部' || user.department === '第二课堂认证中心')
      ? [...visibleEntries, departmentUserEntry]
      : visibleEntries;

    const quickHrefs = Array.from(new Set([
      '/leave-slip/mine',
      ...(hasPermission(user, 'canUploadLeave') ? ['/leave-slip/upload'] : []),
      ...(hasPermission(user, 'canStartGroupLeave') ? ['/leave-slip/temporary'] : []),
      ...(hasPermission(user, 'canManageAttendanceWork') || hasPermission(user, 'canReviewLeave') ? ['/attendance-work'] : []),
      ...(hasPermission(user, 'canReviewLeave') ? ['/leave-slip/review'] : []),
      ...(hasPermission(user, 'canQueryLeave') ? ['/leave-slip/query'] : []),
      ...(hasPermission(user, 'canViewEveningStudy') || hasPermission(user, 'canQueryLeave') ? ['/evening-study'] : []),
      ...(hasPermission(user, 'canSubmitActivity') ? ['/submit'] : []),
      ...(hasPermission(user, 'canViewSubmissionStatus') ? ['/submit/status'] : []),
      ...(hasPermission(user, 'canSubmitScoring') ? ['/submit/scoring'] : []),
      ...(hasPermission(user, 'canPublish') ? ['/admin?role=admin&tab=review'] : []),
      ...(hasPermission(user, 'canScore') ? ['/admin?role=admin&tab=scoring'] : []),
      ...(isAdmin ? ['/admin?role=admin&tab=activities', '/admin?role=admin&tab=users'] : []),
    ]));

    const quickEntries: EntryWithGroup[] = quickHrefs
      .map((href) => visibleEntriesWithDepartment.find((entry) => entry.href === href))
      .filter((entry): entry is EntryWithGroup => Boolean(entry))
      .slice(0, 6);
    const restEntries = visibleEntriesWithDepartment.filter((entry) => !quickEntries.some((quick) => quick.href === entry.href));

    const renderEntryCard = (entry: EntryWithGroup) => (
      <Link key={entry.href} href={entry.href} className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-teal-600 hover:bg-teal-50/20 sm:p-5">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', entry.tone)}>
          <entry.icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-950">{entry.label}</span>
          <span className="mt-1 block text-pretty text-xs leading-5 text-slate-500">{entry.detail}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 self-center text-slate-300 transition-colors group-hover:text-teal-700" />
      </Link>
    );

    return (
      <DashboardLayout user={user} onLogout={handleLogout} title="首页">
        <div className="space-y-8">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold text-teal-700">今日工作台</p>
                <h2 className="text-balance text-xl font-semibold text-slate-950">欢迎，{user.name}</h2>
                <p className="mt-1 text-pretty text-sm text-slate-500">
                  当前角色：
                  <span className="font-medium text-teal-700">
                    {user.role === 'admin' ? '系统管理员' : user.role === 'leader' ? '部门负责人' : user.role === 'class_leader' ? '班级负责人' : '学生'}
                  </span>
                  ，以下是当前账号可用功能。
                </p>
              </div>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Key className="size-4" />
                修改密码
              </button>
            </div>
          </section>

          {quickEntries.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-balance text-base font-semibold text-slate-950">常用功能</h3>
                <span className="text-xs tabular-nums text-slate-400">{quickEntries.length} 个</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {quickEntries.map(renderEntryCard)}
              </div>
            </section>
          )}

          {restEntries.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-balance text-base font-semibold text-slate-950">全部功能</h3>
                <span className="text-xs tabular-nums text-slate-400">{restEntries.length} 个</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {restEntries.map(renderEntryCard)}
              </div>
            </section>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
              <ClipboardList className="size-5" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="text-balance text-base font-bold text-slate-950 sm:text-lg">二课活动管理系统</h1>
              <p className="mt-0.5 text-xs font-medium text-slate-400">Activity Operations</p>
            </div>
          </div>
          <button
            onClick={() => setShowLoginModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 sm:px-4"
          >
            登录 / 注册
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-start">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
              <span className="size-1.5 rounded-full bg-teal-600" />
              第二课堂工作入口
            </div>
            <h2 className="max-w-2xl text-balance text-3xl font-bold leading-[1.16] text-slate-950 sm:text-4xl">
              让活动提交、请假与赋分，在一个工作台完成。
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-slate-600">
              二课活动管理与请假申请平台，为学生、活动负责人和管理人员提供清晰的业务入口。
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowLoginModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              >
                进入工作台
              </button>
              <Link
                href="/login?redirect=/leave-slip/temporary"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-teal-600 hover:text-teal-700"
              >
                提交临时请假
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                { title: '第二课堂认证中心', detail: '活动提交、审核、赋分、状态查询', icon: ShieldCheck },
                { title: '学习竞技部', detail: '假条、临时请假、晚自习查询、考勤工作安排', icon: UserCheck },
              ].map(({ title, detail, icon: Icon }) => (
                <div key={title} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{title}</span>
                    <span className="mt-1 block text-pretty text-xs leading-5 text-slate-500">{detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-5">
              <div>
                <p className="text-xs font-semibold text-teal-700">公开入口</p>
                <h3 className="mt-2 text-balance text-xl font-bold text-slate-950">请假服务</h3>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <LayoutDashboard className="size-5" />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { href: '/login', label: '登录 / 注册', detail: '登录后按角色进入对应功能', icon: LogIn },
                { href: '/login?redirect=/leave-slip/mine', label: '我的假条', detail: '登录后查看与自己相关的假条记录', icon: FileCheck },
              ].map(({ href, label, detail, icon: Icon }) => (
                <Link key={href} href={href} className="group flex items-center gap-3 py-4 transition-colors first:pt-5 last:pb-1 hover:text-teal-700">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{label}</span>
                    <span className="mt-1 block text-pretty text-xs leading-5 text-slate-500">{detail}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-14 border-t border-slate-200 pt-8">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold text-slate-400">权限说明</p>
              <h3 className="mt-2 text-balance text-xl font-bold text-slate-950">按角色进入对应功能</h3>
            </div>
            <p className="text-sm text-slate-500">登录后将根据权限显示管理菜单</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              { label: '学生', detail: '请假申请、状态查询', icon: UserCheck },
              { label: '活动负责人', detail: '活动提交、赋分材料', icon: Send },
              { label: '管理人员', detail: '审核、赋分、活动管理', icon: Users },
            ].map(({ label, detail, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{detail}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <h4 className="text-balance font-semibold text-amber-950">更多管理功能需要登录</h4>
              <p className="mt-1 text-pretty text-sm leading-6 text-amber-800">活动审核、活动赋分、提交状态和晚自习查询会按账号权限开放。</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-balance text-lg font-semibold text-slate-950">
            {isLogin ? '账号登录' : '注册账号'}
          </h3>
          <button onClick={onClose} aria-label="关闭登录窗口" className="text-slate-400 hover:text-slate-600">
            <LogIn className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">学号</label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              placeholder="请输入学号"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">姓名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              placeholder="请输入姓名"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              placeholder="请输入密码"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            {loading ? '处理中...' : isLogin ? '登录' : '注册'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-sm text-teal-700 hover:underline"
          >
            {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
