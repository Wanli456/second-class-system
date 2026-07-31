'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GraduationCap, ArrowLeft, Search, RefreshCw, LogIn } from 'lucide-react';
import { ActivitySubmission, CATEGORY_COLORS, STATUS_COLORS } from '@/lib/types';

export default function SubmitStatusPage() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    setChecking(false);
  }, []);

  const handleSearch = async () => {
    if (!user?.phone) {
      alert('请先完善个人资料中的手机号');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/activities/submit?phone=${encodeURIComponent(user.phone)}`);
      const data = await res.json();
      if (data.success) setSubmissions(data.data);
      else alert(data.error || '查询失败');
    } finally {
      setLoading(false);
    }
  };

  // 登录检查
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0]">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0] p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#1e3a5f]/10">
            <LogIn className="h-6 w-6 text-[#1e3a5f]" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">需要登录</h2>
          <p className="mb-6 text-sm text-gray-500">活动负责人需要登录后才能查看提交状态</p>
          <Link
            href="/login?redirect=/submit/status"
            className="inline-flex w-full items-center justify-center rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a5f]/90"
          >
            登录/注册
          </Link>
          <Link href="/" className="mt-3 block text-sm text-gray-500 hover:text-[#1e3a5f]">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="rounded p-1 hover:bg-white/10">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <GraduationCap className="h-6 w-6" />
              <h1 className="text-lg font-bold">提交状态查询</h1>
            </div>
            <span className="text-sm text-white/80">{user.displayName || user.username}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Search */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">负责人手机号</label>
              <input
                type="text"
                value={user.phone || ''}
                readOnly
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                placeholder="请先在个人资料中填写手机号"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !user.phone}
              className="flex items-center gap-1 rounded-md bg-[#1e3a5f] px-4 py-2 text-sm text-white hover:bg-[#1e3a5f]/90 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              查询
            </button>
          </div>
          {!user.phone && (
            <p className="mt-2 text-xs text-amber-600">请先在个人资料中填写手机号</p>
          )}
        </div>

        {/* Results */}
        {searched && (
          <div className="space-y-3">
            {loading ? (
              <div className="py-8 text-center text-gray-400">查询中...</div>
            ) : submissions.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-8 text-center shadow-sm">
                <p className="text-gray-400">未找到该手机号提交的记录</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">共 {submissions.length} 条提交记录</h3>
                  <button
                    onClick={handleSearch}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#1e3a5f]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> 刷新
                  </button>
                </div>
                {submissions.map(s => (
                  <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">{s.full_name}</h4>
                          <span className={`rounded border px-1.5 py-0.5 text-xs ${CATEGORY_COLORS[s.category]}`}>
                            {s.category}
                          </span>
                          <span className="text-xs text-gray-500">{s.level}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {new Date(s.start_time).toLocaleString('zh-CN')} ~ {new Date(s.end_time).toLocaleString('zh-CN')}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">负责人：{s.leader_name} · {s.leader_phone}</p>
                      </div>
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-xs ${STATUS_COLORS[s.review_status]}`}>
                        {s.review_status}
                      </span>
                    </div>
                    {s.review_note && (
                      <div className="mt-2 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <span className="font-medium">审核备注：</span>{s.review_note}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
