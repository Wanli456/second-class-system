'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { Search, RefreshCw, Pencil } from 'lucide-react';
import { CATEGORIES, LEVELS, REVIEW_STATUSES, STATUS_COLORS, CATEGORY_COLORS } from '@/lib/types';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { formatActivityScopes } from '@/lib/business-rules';

interface Submission {
  id: string;
  full_name: string;
  start_time: string;
  end_time: string;
  category: string;
  level: string;
  leader_name: string;
  leader_phone: string;
  scope_names?: string | null;
  scope_type?: 'department' | 'class' | null;
  scope_name?: string | null;
  review_status: string;
  review_note?: string;
  plan_file_url?: string;
  plan_file_name?: string;
  record_file_url?: string;
  record_file_name?: string;
  created_at: string;
  source?: 'submission' | 'activity';
}

interface CurrentUser {
  id: string;
  name?: string;
  username?: string;
  role: string;
  canViewSubmissionStatus?: boolean;
}

export default function SubmitStatusPage() {
  const { user, initialized } = useUser();
  const [keyword, setKeyword] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const canView = user && (user.role === 'admin' || user.canViewSubmissionStatus === true);

  useEffect(() => {
    if (!initialized || !user || !canView) return;
    const params = new URLSearchParams(window.location.search);
    const submissionId = params.get('submissionId');
    const activityId = params.get('activityId');
    const id = submissionId || activityId;
    if (!id) return;
    const endpoint = submissionId
      ? `/api/activities/submit?target_submission_id=${encodeURIComponent(submissionId)}`
      : `/api/activities/submit?activity_id=${encodeURIComponent(activityId || '')}`;
    setTargetId(id);
    setLoading(true);
    setSearched(true);
    apiFetch(endpoint)
      .then(res => res.json())
      .then(result => setSubmissions(result.success ? result.data || [] : []))
      .catch(err => console.error('读取通知关联记录失败:', err))
      .finally(() => setLoading(false));
  }, [initialized, user, canView]);

  useEffect(() => {
    if (!targetId || loading || !submissions.length) return;
    document.getElementById(`submission-record-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, submissions, targetId]);

  if (!initialized) {
    return <AuthLoadingScreen />;
  }

  if (!canView) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">暂无活动提交权限</h2>
          <p className="mb-6 text-sm text-gray-500">请联系管理员开通活动发布权限。</p>
          <Link href="/" className="inline-flex w-full justify-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await apiFetch(`/api/activities/submit?keyword=${encodeURIComponent(keyword.trim())}`);
      const result = await res.json();
      if (result.success) {
        setSubmissions(result.data);
      }
    } catch (err) {
      console.error('查询失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="提交状态查询" user={user}>
      <div className="space-y-4">
        {/* Search */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="mb-2 block text-sm font-medium text-gray-700">按活动名称查询</label>
          <div className="flex gap-2">
            <input
              aria-label="按活动名称查询"
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入活动名称关键字..."
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !keyword.trim()}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white hover:bg-teal-800 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              查询
            </button>
          </div>
        </div>

        {!searched && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Search className="mx-auto size-8 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">输入活动名称开始查询</h3>
            <p className="mt-1 text-sm text-slate-500">例如：校园文化节、志愿服务活动</p>
          </div>
        )}

        {/* Results */}
        {searched && (
          <div className="space-y-3">
            {loading ? (
              <div className="py-8 text-center text-gray-400">查询中...</div>
            ) : submissions.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-8 text-center">
                <p className="text-gray-400">未找到相关提交记录</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">共 {submissions.length} 条提交记录</h3>
                  <button
                    onClick={handleSearch}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-teal-600"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> 刷新
                  </button>
                </div>
                {submissions.map(s => (
                  <div id={`submission-record-${s.id}`} key={s.id} className={`rounded-lg border border-gray-200 bg-white p-4 ${s.id === targetId ? 'border-teal-500 ring-2 ring-teal-100' : ''}`}>
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
                        <p className="mt-0.5 text-xs text-gray-500">联办单位：{formatActivityScopes(s)}</p>
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
                    {(s.plan_file_url || s.record_file_url) && (
                      <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
                        {s.plan_file_url && <a href={s.plan_file_url} target="_blank" rel="noreferrer" className="text-teal-700 underline" title={s.plan_file_name || '策划书'}>{s.plan_file_name || '策划书（已上传）'}</a>}
                        {s.record_file_url && <a href={s.record_file_url} target="_blank" rel="noreferrer" className="text-teal-700 underline" title={s.record_file_name || '备案表'}>{s.record_file_name || '备案表（已上传）'}</a>}
                      </div>
                    )}
                    {s.source === 'submission' && s.review_status !== '已通过' && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <Link
                          href={`/submit?submissionId=${encodeURIComponent(s.id)}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
                        >
                          <Pencil className="h-3.5 w-3.5" /> 重新提交
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
