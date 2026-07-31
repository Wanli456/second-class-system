'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GraduationCap, ArrowLeft, Upload, FileText, Search, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [activityName, setActivityName] = useState('');
  const [searched, setSearched] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [scoringFile, setScoringFile] = useState<File | null>(null);
  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');

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
        setScoringFile(null);
        setRecordFile(null);
        setSelectedActivityId('');
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

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded p-1 hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <GraduationCap className="h-6 w-6" />
            <h1 className="text-lg font-bold">赋分材料提交</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">查询活动</h2>
          <p className="mb-4 text-sm text-gray-500">输入活动名称关键字，查询已审核通过的活动，提交赋分材料</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              placeholder="输入活动名称关键字"
              className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#15304d] disabled:opacity-50"
            >
              {loading ? '查询中...' : '查询'}
            </button>
          </div>
        </div>

        {searched && activities.length === 0 && !loading && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">暂无已审核通过的活动</p>
            <p className="mt-1 text-xs text-gray-400">请先提交活动信息并等待审核通过</p>
          </div>
        )}

        {activities.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-base font-semibold text-gray-900">提交赋分材料</h3>
              
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">选择活动 *</label>
                <select
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
                >
                  <option value="">请选择活动</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} - {a.full_name} ({a.level})
                      {a.scoring_status === '已赋分' ? ' [已赋分]' : ''}
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
                        <a href={selectedActivity.record_file_url} target="_blank" className="text-[#1e3a5f] underline">
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
                  活动赋分表 *
                </label>
                <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
                  <Upload className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <input
                    type="file"
                    id="scoring-file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setScoringFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <label
                    htmlFor="scoring-file"
                    className="cursor-pointer text-sm text-[#1e3a5f] hover:underline"
                  >
                    点击上传赋分表
                  </label>
                  <p className="mt-1 text-xs text-gray-400">支持 PDF、JPG、PNG 格式</p>
                  {scoringFile && (
                    <p className="mt-2 text-xs text-emerald-600">已选择: {scoringFile.name}</p>
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
                      className="cursor-pointer text-sm text-[#1e3a5f] hover:underline"
                    >
                      点击上传备案表
                    </label>
                    <p className="mt-1 text-xs text-gray-400">支持 PDF、JPG、PNG 格式</p>
                    {recordFile && (
                      <p className="mt-2 text-xs text-emerald-600">已选择: {recordFile.name}</p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleSubmitScoring}
                disabled={uploadingId !== null || !selectedActivityId || !scoringFile}
                className="w-full rounded-md bg-[#1e3a5f] py-2.5 text-sm font-medium text-white hover:bg-[#15304d] disabled:opacity-50"
              >
                {uploadingId ? '提交中...' : '提交赋分材料'}
              </button>
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
      </main>
    </div>
  );
}
