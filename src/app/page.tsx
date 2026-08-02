'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClipboardList, Send, Award, FileText, UserCheck, Moon, Lock, LogOut, Key, ArrowLeft,
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
                    href="/admin?role=publisher&tab=submissions"
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
                    href="/admin?role=leave_reviewer&tab=leaves"
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

              {/* 赋分材料提交 */}
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
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">二课活动管理系统</h1>
              <p className="text-xs text-gray-500">University Second Classroom Activity Management</p>
            </div>
          </div>
          <button
            onClick={() => setShowLoginModal(true)}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
          >
            登录/注册
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* 欢迎区域 */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            欢迎使用二课活动管理系统
          </h2>
          <p className="mt-3 text-gray-500">
            第二课堂活动管理与请假申请平台
          </p>
        </div>

        {/* 功能入口 */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* 活动提交 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Send className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-gray-900">活动提交</h3>
            <p className="mt-2 text-sm text-gray-500">提交活动基本信息，等待审核</p>
            <Link
              href="/submit"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline"
            >
              进入 <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* 请假申请 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-gray-900">请假申请</h3>
            <p className="mt-2 text-sm text-gray-500">提交请假申请，上传请假条</p>
            <Link
              href="/leave"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline"
            >
              进入 <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* 请假状态查询 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
              <FileCheck className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-gray-900">请假状态查询</h3>
            <p className="mt-2 text-sm text-gray-500">查询请假申请审核状态</p>
            <Link
              href="/leave/status"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline"
            >
              进入 <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        {/* 登录提示 */}
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-900">更多功能需要登录</h4>
              <p className="mt-1 text-sm text-amber-700">
                登录后可以使用活动审核、活动赋分、提交状态查询、晚自习请假查询等功能
              </p>
              <button
                onClick={() => setShowLoginModal(true)}
                className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                立即登录
              </button>
            </div>
          </div>
        </div>
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
