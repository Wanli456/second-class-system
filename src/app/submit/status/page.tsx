'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Search, RefreshCw } from 'lucide-react';
import { CATEGORIES, LEVELS, REVIEW_STATUSES, STATUS_COLORS, CATEGORY_COLORS } from '@/lib/types';

interface Submission {
  id: string;
  full_name: string;
  start_time: string;
  end_time: string;
  category: string;
  level: string;
  leader_name: string;
  leader_phone: string;
  review_status: string;
  review_note?: string;
  plan_file_url?: string;
  record_file_url?: string;
  created_at: string;
}

export default function SubmitStatusPage() {
  const [keyword, setKeyword] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/activities/submit?keyword=${encodeURIComponent(keyword.trim())}`);
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
    <DashboardLayout title="提交状态查询">
      <div className="space-y-4">
        {/* Search */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">按活动名称查询</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入活动名称关键字..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !keyword.trim()}
              className="flex items-center gap-1 rounded-md bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              查询
            </button>
          </div>
        </div>

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
                  <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4">
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
      </div>
    </DashboardLayout>
  );
}
