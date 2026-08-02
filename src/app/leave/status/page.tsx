'use client';

import { useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { Search, RefreshCw, Pencil } from 'lucide-react';
import { LeaveRequest, STATUS_COLORS } from '@/lib/types';

export default function LeaveStatusPage() {
  const [studentId, setStudentId] = useState('');
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!studentId.trim()) {
      alert('请输入学号');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/leave?student_id=${encodeURIComponent(studentId)}`);
      const data = await res.json();
      if (data.success) setLeaves(data.data);
      else alert(data.error || '查询失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="请假状态查询">
      <div className="space-y-4">
        {/* Search */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">学号</label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="请输入学号"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
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
            ) : leaves.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-8 text-center">
                <p className="text-gray-400">未找到该学号的请假记录</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">共 {leaves.length} 条请假记录</h3>
                  <button
                    onClick={handleSearch}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-teal-600"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> 刷新
                  </button>
                </div>
                {leaves.map(l => (
                  <div key={l.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 text-xs ${
                            l.leave_type === '事假' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                            l.leave_type === '病假' ? 'bg-sky-100 text-sky-700 border-sky-200' :
                            'bg-purple-100 text-purple-700 border-purple-200'
                          }`}>
                            {l.leave_type}
                          </span>
                          {l.activity_name && (
                            <span className="text-sm text-gray-600">活动：{l.activity_name}</span>
                          )}
                        </div>
                        <div className="mt-2 text-sm text-gray-500">
                          <div>提交时间：{new Date(l.created_at).toLocaleString('zh-CN')}</div>
                        </div>
                        {l.review_note && (
                          <div className="mt-2 rounded bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
                            <span className="font-medium">审核备注：</span>{l.review_note}
                          </div>
                        )}
                        {l.leave_image_url && (
                          <div className="mt-2">
                            <img src={l.leave_image_url} alt="请假条" className="h-16 w-auto rounded border" />
                          </div>
                        )}
                      </div>
                      <span className={`shrink-0 rounded border px-2 py-1 text-xs font-medium ${STATUS_COLORS[l.review_status]}`}>
                        {l.review_status}
                      </span>
                    </div>
                    {l.review_status !== '已通过' && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <Link
                          href={`/leave?requestId=${encodeURIComponent(l.id)}`}
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
