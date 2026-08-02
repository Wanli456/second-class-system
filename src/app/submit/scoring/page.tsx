'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { GraduationCap, Upload, FileText, Search, CheckCircle2, AlertCircle, LogIn } from 'lucide-react';
import { LEVELS, SCORING_STATUSES } from '@/lib/types';

interface Activity {
  id: string;
  full_name: string;
  level: string;
  category: string;
  leader_name: string;
  leader_phone: string;
  scoring_status: string;
  scoring_table_url: string | null;
  record_file_url: string | null;
}

export default function SubmitScoringPage() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [activityName, setActivityName] = useState('');
  const [searched, setSearched] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [scoringFile, setScoringFile] = useState<File | null>(null);
  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [submittedActivityId, setSubmittedActivityId] = useState<string | null>(null);
  const [showResubmit, setShowResubmit] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    setChecking(false);
  }, []);

  const handleSearch = async () => {
    if (!activityName) {
      alert('请输入活动名称');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/activities?keyword=${encodeURIComponent(activityName)}`);
      const data = await res.json();
      if (data.success) {
        setActivities(data.data);
      } else {
        alert(data.error || '查询失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', 'app-files');
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '上传失败');
    return data.url;
  };

  const handleSubmitScoring = async () => {
    if (!selectedActivityId) {
      alert('请选择要提交赋分材料的活动');
      return;
    }
    if (!scoringFile) {
      alert('请上传活动赋分表');
      return;
    }

    const activity = activities.find(a => a.id === selectedActivityId);
    if (!activity) return;

    // 检查是否已赋分
    if (activity.scoring_status === '已赋分') {
      alert('该活动已赋分，不可重复提交');
      return;
    }

    // 校级活动需要备案表
    if (activity.level === '校级' && !recordFile && !activity.record_file_url) {
      alert('校级活动需要上传备案表照片');
      return;
    }

    setUploadingId(selectedActivityId);
    try {
      const scoring_table_url = await uploadFile(scoringFile);
      let record_file_url = activity.record_file_url;
      if (recordFile) {
        record_file_url = await uploadFile(recordFile);
      }

      const res = await fetch('/api/activities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedActivityId,
          scoring_table_url,
          record_file_url,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('赋分材料提交成功！');
        setSubmittedActivityId(selectedActivityId);
        setScoringFile(null);
        setRecordFile(null);
        setSelectedActivityId('');
        setShowResubmit(false);
        // Refresh activities
        handleSearch();
      } else {
        alert(data.error || '提交失败');
      }
    } finally {
      setUploadingId(null);
    }
  };

  const selectedActivity = activities.find(a => a.id === selectedActivityId);

  // 登录检查
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
            <LogIn className="h-6 w-6 text-teal-600" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">需要登录</h2>
          <p className="mb-6 text-sm text-gray-500">活动负责人需要登录后才能提交赋分材料</p>
          <Link
            href="/login?redirect=/submit/scoring"
            className="inline-flex w-full items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            登录/注册
          </Link>
          <Link href="/" className="mt-3 block text-sm text-gray-500 hover:text-teal-600">返回首页</Link>
        </div>
      </div>
    );
  }

  if (user.role !== 'admin' && user.role !== 'leader' && !user.canScore) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">暂无赋分材料权限</h2>
          <p className="mb-6 text-sm text-gray-500">请联系管理员开通赋分材料权限。</p>
          <Link href="/" className="inline-flex w-full items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout title="赋分材料提交" user={user}>
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">查询活动</h2>
          <p className="mb-4 text-sm text-gray-500">输入活动名称关键字，查询已审核通过的活动，提交赋分材料</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              placeholder="输入活动名称关键字"
              className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>

        {searched && activities.length === 0 && !loading && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">暂无已审核通过的活动</p>
            <p className="mt-1 text-xs text-gray-400">请先提交活动信息并等待审核通过</p>
          </div>
        )}

        {activities.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-base font-semibold text-gray-900">提交赋分材料</h3>
              
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">选择活动 *</label>
                <select
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                >
                  <option value="">请选择活动</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.scoring_status === '已赋分'}>
                      {a.id} - {a.full_name} ({a.level})
                      {a.scoring_status === '已赋分' ? ' [已赋分，不可提交]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedActivity && (
                <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">活动级别</span>
                      <span className="font-medium">{selectedActivity.level}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">赋分状态</span>
                      <span className={`font-medium ${selectedActivity.scoring_status === '已赋分' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {selectedActivity.scoring_status}
                      </span>
                    </div>
                    {selectedActivity.record_file_url && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">备案表</span>
                        <a href={selectedActivity.record_file_url} target="_blank" className="text-teal-600 underline">
                          已上传
                        </a>
                      </div>
                    )}
                  </div>
                  {selectedActivity.level === '校级' && !selectedActivity.record_file_url && (
                    <p className="mt-2 text-xs text-amber-600">
                      * 校级活动需要上传备案表照片
                    </p>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  活动赋分表 *（Excel 格式）
                </label>
                <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
                  <Upload className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <input
                    type="file"
                    id="scoring-file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setScoringFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <label
                    htmlFor="scoring-file"
                    className="cursor-pointer text-sm text-teal-600 hover:underline"
                  >
                    点击上传赋分表
                  </label>
                  <p className="mt-1 text-xs text-gray-400">仅支持 Excel 格式（.xlsx, .xls）</p>
                  {scoringFile && (
                    <p className="mt-2 text-xs text-emerald-600">已选择：{scoringFile.name}</p>
                  )}
                </div>
              </div>

              {selectedActivity?.level === '校级' && !selectedActivity?.record_file_url && (
                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    活动备案表照片 *
                  </label>
                  <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
                    <Upload className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    <input
                      type="file"
                      id="record-file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setRecordFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label
                      htmlFor="record-file"
                      className="cursor-pointer text-sm text-teal-600 hover:underline"
                    >
                      点击上传备案表
                    </label>
                    <p className="mt-1 text-xs text-gray-400">支持 PDF、JPG、PNG 格式</p>
                    {recordFile && (
                      <p className="mt-2 text-xs text-emerald-600">已选择：{recordFile.name}</p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleSubmitScoring}
                disabled={uploadingId !== null || !selectedActivityId || !scoringFile}
                className="w-full rounded-md bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {uploadingId ? '提交中...' : '提交赋分材料'}
              </button>

              {/* 重新提交按钮 */}
              {submittedActivityId && !showResubmit && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">赋分材料已提交</span>
                  </div>
                  <p className="mt-2 text-xs text-emerald-600">
                    如发现提交材料有误，可点击下方按钮重新提交
                  </p>
                  <button
                    onClick={() => {
                      setShowResubmit(true);
                      setSelectedActivityId(submittedActivityId);
                    }}
                    className="mt-3 w-full rounded-md border border-emerald-300 bg-white py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    重新提交
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-base font-semibold text-gray-900">我的活动列表</h3>
              <div className="space-y-3">
                {activities.map((a) => (
                  <div key={a.id} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{a.full_name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {a.id} | {a.category} | {a.level}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          a.scoring_status === '已赋分' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {a.scoring_status}
                        </span>
                        {a.scoring_table_url && (
                          <span className="text-xs text-emerald-600">已提交材料</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

