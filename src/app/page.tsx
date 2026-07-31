'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClipboardList, Send, Award, FileText, UserCheck, Moon, Lock, LogOut, Key, ArrowLeft,
} from 'lucide-react';

interface User {
  id: string;
  username: string;
  name: string;
  studentId?: string;
  role: string;
  canPublish?: boolean;
  canScore?: boolean;
}

function getButtonState(user: User | null, requiredRole: string): 'active' | 'grayed' | 'locked' {
  if (!user) return 'locked';
  if (user.role === 'admin') return 'active';
  if (requiredRole === 'admin') return 'grayed';
  if (requiredRole === 'publisher') return user.canPublish ? 'active' : 'grayed';
  if (requiredRole === 'scorer') return user.canScore ? 'active' : 'grayed';
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
      try { setUser(JSON.parse(saved)); } catch {}
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
      setPasswordMessage('新密码至少6位');
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
  const leaderState = getLeaderButtonState(user);

  // 修改密码页面
  if (showPasswordModal) {
    return (
      <div className="min-h-screen bg-[#f5f5f0]">
        <header className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <button
              onClick={() => { setShowPasswordModal(false); setPasswordMessage(''); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}
              className="flex items-center gap-1 text-sm text-[#1e3a5f] hover:underline"
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
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#1e3a5f]/10">
                <Key className="h-6 w-6 text-[#1e3a5f]" />
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="请输入新密码（至少6位）"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="请再次输入新密码"
                  required
                  minLength={6}
                />
              </div>

              {passwordMessage && (
                <p className={`text-sm ${passwordMessage.includes('成功') ? 'text-green-500' : 'text-red-500'}`}>
                  {passwordMessage}
                </p>
              )}

              <button
                type="submit"
                className="w-full rounded-lg bg-[#1e3a5f] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4f7f]"
              >
                确认修改
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e3a5f] text-white">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1e3a5f]">二课活动管理系统</h1>
              <p className="text-xs text-gray-500">第二课堂活动管理平台</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-gray-600">欢迎，{user.name}</span>
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <Key className="h-4 w-4" />
                  修改密码
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <LogOut className="h-4 w-4" />
                  退出
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4f7f]"
              >
                登录/注册
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* 欢迎区域 */}
        <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#1e3a5f]">
            {user ? `欢迎，${user.name}` : '欢迎使用二课活动管理系统'}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {user
              ? `当前角色：${user.role === 'admin' ? '管理员' : user.role === 'publisher' ? '发布干事' : user.role === 'scorer' ? '赋分干事' : user.role === 'leader' ? '活动负责人' : '学生'}`
              : '请选择身份入口开始使用，或登录/注册账号'}
          </p>
        </div>

        <div className="mb-8 text-center">
          <h2 className="text-xl font-semibold text-gray-700">请选择您的身份入口</h2>
          <p className="mt-2 text-sm text-gray-500">根据角色选择对应功能入口</p>
        </div>

        {/* 管理端入口 */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            管理端
            {!user && <span className="text-xs text-amber-500 normal-case">（需登录）</span>}
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* 管理员 */}
            <Link
              href={adminState === 'active' ? "/admin?role=admin" : "#"}
              onClick={(e) => {
                if (adminState === 'locked') { e.preventDefault(); handleRoleClick('admin'); }
                if (adminState === 'grayed') { e.preventDefault(); }
              }}
              className={`group rounded-lg border p-5 shadow-sm transition-all ${
                adminState === 'active'
                  ? 'border-gray-200 bg-white hover:border-[#1e3a5f] hover:shadow-md'
                  : adminState === 'grayed'
                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white relative'
              }`}
            >
              {adminState === 'locked' && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
                <ClipboardList className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900">管理员</h4>
              <p className="mt-1 text-xs text-gray-500">活动总表、活动审核、请假审核、全部权限</p>
              {adminState === 'grayed' && <p className="mt-1 text-xs text-gray-400">（无此权限）</p>}
            </Link>

            {/* 发布活动 */}
            <Link
              href={publisherState === 'active' ? "/admin?role=admin&tab=review" : "#"}
              onClick={(e) => {
                if (publisherState === 'locked') { e.preventDefault(); handleRoleClick('publisher'); }
                if (publisherState === 'grayed') { e.preventDefault(); }
              }}
              className={`group rounded-lg border p-5 shadow-sm transition-all ${
                publisherState === 'active'
                  ? 'border-gray-200 bg-white hover:border-[#1e3a5f] hover:shadow-md'
                  : publisherState === 'grayed'
                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white relative'
              }`}
            >
              {publisherState === 'locked' && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Send className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900">发布活动</h4>
              <p className="mt-1 text-xs text-gray-500">活动审核（含策划书、备案表查看）</p>
              {publisherState === 'grayed' && <p className="mt-1 text-xs text-gray-400">（无此权限）</p>}
            </Link>

            {/* 赋分干事 */}
            <Link
              href={scorerState === 'active' ? "/admin?role=admin&tab=scoring" : "#"}
              onClick={(e) => {
                if (scorerState === 'locked') { e.preventDefault(); handleRoleClick('scorer'); }
                if (scorerState === 'grayed') { e.preventDefault(); }
              }}
              className={`group rounded-lg border p-5 shadow-sm transition-all ${
                scorerState === 'active'
                  ? 'border-gray-200 bg-white hover:border-[#1e3a5f] hover:shadow-md'
                  : scorerState === 'grayed'
                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white relative'
              }`}
            >
              {scorerState === 'locked' && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Award className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900">活动赋分</h4>
              <p className="mt-1 text-xs text-gray-500">活动赋分管理</p>
              {scorerState === 'grayed' && <p className="mt-1 text-xs text-gray-400">（无此权限）</p>}
            </Link>
          </div>
        </div>

        {/* 用户端入口 */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            用户端
            {!user && <span className="text-xs text-amber-500 normal-case">（部分功能需登录）</span>}
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* 活动提交 */}
            <Link
              href={leaderState === 'active' ? "/submit" : "#"}
              onClick={(e) => {
                if (leaderState === 'locked') { e.preventDefault(); handleRoleClick('leader'); }
                if (leaderState === 'grayed') { e.preventDefault(); }
              }}
              className={`group rounded-lg border p-5 shadow-sm transition-all ${
                leaderState === 'active'
                  ? 'border-gray-200 bg-white hover:border-[#1e3a5f] hover:shadow-md'
                  : leaderState === 'grayed'
                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white relative'
              }`}
            >
              {leaderState === 'locked' && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <FileText className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900">活动提交</h4>
              <p className="mt-1 text-xs text-gray-500">提交活动基本信息、查看审核状态</p>
              {leaderState === 'grayed' && <p className="mt-1 text-xs text-gray-400">（无此权限）</p>}
            </Link>

            {/* 赋分材料提交 */}
            <Link
              href={leaderState === 'active' ? "/submit/scoring" : "#"}
              onClick={(e) => {
                if (leaderState === 'locked') { e.preventDefault(); handleRoleClick('leader'); }
                if (leaderState === 'grayed') { e.preventDefault(); }
              }}
              className={`group rounded-lg border p-5 shadow-sm transition-all ${
                leaderState === 'active'
                  ? 'border-gray-200 bg-white hover:border-[#1e3a5f] hover:shadow-md'
                  : leaderState === 'grayed'
                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white relative'
              }`}
            >
              {leaderState === 'locked' && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Award className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900">赋分材料提交</h4>
              <p className="mt-1 text-xs text-gray-500">上传活动赋分表、备案表照片</p>
              {leaderState === 'grayed' && <p className="mt-1 text-xs text-gray-400">（无此权限）</p>}
            </Link>

            {/* 请假申请 - 所有人可用 */}
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

        {/* 快捷查询 */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">快捷查询</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* 提交状态查询 - 需要登录 */}
            <Link
              href={user ? "/submit/status" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); handleRoleClick('leader'); } }}
              className={`flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors ${
                user ? 'hover:border-[#1e3a5f] hover:bg-gray-50' : 'relative opacity-50 cursor-not-allowed'
              }`}
            >
              {!user && <Lock className="h-4 w-4 text-gray-400" />}
              <FileText className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700">提交状态查询</span>
            </Link>

            {/* 请假状态查询 - 所有人可用 */}
            <Link
              href="/leave/status"
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-[#1e3a5f] hover:bg-gray-50 transition-colors"
            >
              <UserCheck className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700">请假状态查询</span>
            </Link>

            {/* 晚自习请假查询 - 需要登录 */}
            <Link
              href={user ? "/evening-study" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); setShowLoginModal(true); } }}
              className={`flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors ${
                user ? 'hover:border-[#1e3a5f] hover:bg-gray-50' : 'relative opacity-50 cursor-not-allowed'
              }`}
            >
              {!user && <Lock className="h-4 w-4 text-gray-400" />}
              <Moon className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700">晚自习请假查询</span>
            </Link>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
              placeholder="请输入密码"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#1e3a5f] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4f7f] disabled:opacity-50"
          >
            {loading ? '处理中...' : isLogin ? '登录' : '注册'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-sm text-[#1e3a5f] hover:underline"
          >
            {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
        </div>
      </div>
    </div>
  );
}