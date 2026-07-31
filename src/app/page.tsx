'use client';

import Link from 'next/link';
import { FileText, UserCheck, GraduationCap, ClipboardList, Award, Send, Moon, LogIn, LogOut, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface User {
  id: string;
  name: string;
  studentId?: string;
  role?: string;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingRole, setPendingRole] = useState<string>('');

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  // 需要登录才能访问的角色
  const requireAuthRoles = ['admin', 'publisher', 'scorer'];

  const handleRoleClick = (role: string) => {
    if (requireAuthRoles.includes(role) && !user) {
      setPendingRole(role);
      setShowLoginModal(true);
    }
  };

  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
    setShowLoginModal(false);
    // 跳转到对应角色页面
    window.location.href = `/admin?role=${pendingRole}`;
  };

  return (
    <div className="min-h-screen">
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-8 w-8" />
              <div>
                <h1 className="text-2xl font-bold">二课活动管理系统</h1>
                <p className="text-sm text-blue-200">第二课堂活动管理与请假申请</p>
              </div>
            </div>
            <div>
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-blue-200">欢迎，{user.name}</span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    退出
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  登录/注册
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        {/* 访客提示 */}
        {!user && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <UserCheck className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">访客模式</p>
                <p className="text-sm text-blue-700 mt-1">
                  您可以浏览学生端功能。如需使用管理功能，请先 <Link href="/login" className="underline font-medium">登录</Link>。
                </p>
              </div>
            </div>
          </div>
        )}

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
            <Link
              href={user ? "/admin?role=admin" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); handleRoleClick('admin'); } }}
              className={`group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md ${!user ? 'relative' : ''}`}
            >
              {!user && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
                <ClipboardList className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">管理员</h4>
              <p className="mt-1 text-xs text-gray-500">活动总表、活动审核、请假审核、全部权限</p>
            </Link>

            <Link
              href={user ? "/admin?role=publisher" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); handleRoleClick('publisher'); } }}
              className={`group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md ${!user ? 'relative' : ''}`}
            >
              {!user && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Send className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">发布干事</h4>
              <p className="mt-1 text-xs text-gray-500">活动审核（含策划书、备案表查看）</p>
            </Link>

            <Link
              href={user ? "/admin?role=scorer" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); handleRoleClick('scorer'); } }}
              className={`group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md ${!user ? 'relative' : ''}`}
            >
              {!user && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
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
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            用户端
            {!user && <span className="text-xs text-amber-500 normal-case">（部分功能需登录）</span>}
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href={user ? "/submit" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); handleRoleClick('leader'); } }}
              className={`group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md ${!user ? 'relative' : ''}`}
            >
              {!user && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <FileText className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-[#1e3a5f]">活动提交</h4>
              <p className="mt-1 text-xs text-gray-500">提交活动基本信息、查看审核状态</p>
            </Link>

            <Link
              href={user ? "/submit/scoring" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); handleRoleClick('leader'); } }}
              className={`group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1e3a5f] hover:shadow-md ${!user ? 'relative' : ''}`}
            >
              {!user && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
              )}
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
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">快捷查询</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href={user ? "/submit/status" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); handleRoleClick('leader'); } }}
              className={`flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-[#1e3a5f] hover:bg-gray-50 transition-colors ${!user ? 'relative' : ''}`}
            >
              {!user && <Lock className="h-4 w-4 text-gray-400" />}
              <FileText className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700">提交状态查询</span>
            </Link>
            <Link
              href="/leave/status"
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-[#1e3a5f] hover:bg-gray-50 transition-colors"
            >
              <UserCheck className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700">请假状态查询</span>
            </Link>
            <Link
              href={user ? "/evening-study" : "#"}
              onClick={(e) => { if (!user) { e.preventDefault(); setShowLoginModal(true); } }}
              className={`flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-[#1e3a5f] hover:bg-gray-50 transition-colors ${!user ? 'relative' : ''}`}
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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
          username,
          password,
          ...(isLogin ? {} : { displayName: displayName || username }),
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
            {isLogin ? '登录账号' : '注册账号'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
              placeholder="请输入用户名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
              placeholder="请输入密码"
            />
          </div>
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">显示名称（可选）</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
                placeholder="请输入显示名称"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#1e3a5f] py-2.5 text-sm font-medium text-white hover:bg-[#152a45] disabled:opacity-50 transition-colors"
          >
            {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
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
