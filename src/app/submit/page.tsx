'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, ArrowLeft, Send, Eye, Upload, FileText, LogIn } from 'lucide-react';
import { CATEGORIES, LEVELS } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import { apiFetch, refreshCurrentUser } from '@/lib/client-api';

export default function SubmitPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({
    full_name: '',
    start_time: '',
    end_time: '',
    category: '',
    level: '',
    leader_name: '',
    leader_phone: '',
  });
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resubmissionId, setResubmissionId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    refreshCurrentUser().then((currentUser) => {
      if (currentUser) setUser(currentUser);
    });
    setSubmissionId(new URLSearchParams(window.location.search).get('submissionId'));
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!submissionId) return;

    apiFetch(`/api/activities/submit?submission_id=${encodeURIComponent(submissionId)}`)
      .then((res) => res.json())
      .then((data) => {
        const submission = data.success ? data.data?.[0] : null;
        if (!submission) {
          alert('未找到原活动提交记录');
          router.replace('/submit');
          return;
        }
        if (submission.review_status === '已通过') {
          alert('该活动已审核通过，不能重新提交');
          router.replace('/submit');
          return;
        }

        setResubmissionId(submission.id);
        setForm({
          full_name: submission.full_name,
          start_time: new Date(submission.start_time).toISOString().slice(0, 16),
          end_time: new Date(submission.end_time).toISOString().slice(0, 16),
          category: submission.category,
          level: submission.level,
          leader_name: submission.leader_name,
          leader_phone: submission.leader_phone,
        });
      })
      .catch(() => alert('读取原活动提交记录失败'));
  }, [router, submissionId]);

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', 'app-files');
    const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '上传失败');
    return data.url;
  };

  const handleSubmit = async () => {
    if (!form.full_name || !form.start_time || !form.end_time || !form.category || !form.level || !form.leader_name || !form.leader_phone) {
      alert('请填写所有必填项');
      return;
    }
    if (!planFile) {
      alert('请上传活动策划书');
      return;
    }
    if (!recordFile) {
      alert('请上传活动备案表');
      return;
    }

    setSubmitting(true);
    try {
      const plan_file_url = await uploadFile(planFile);
      const record_file_url = await uploadFile(recordFile);

      const res = await apiFetch('/api/activities/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...(resubmissionId ? { submission_id: resubmissionId } : {}),
          plan_file_url,
          record_file_url,
          start_time: new Date(form.start_time).toISOString(),
          end_time: new Date(form.end_time).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setResubmissionId(null);
        if (submissionId) router.replace('/submit');
        setForm({ full_name: '', start_time: '', end_time: '', category: '', level: '', leader_name: '', leader_phone: '' });
        setPlanFile(null);
        setRecordFile(null);
      } else {
        alert(data.error || '提交失败');
      }
    } finally {
      setSubmitting(false);
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
          <p className="mb-6 text-sm text-gray-500">活动负责人需要登录后才能提交活动</p>
          <Link
            href="/login?redirect=/submit"
            className="inline-flex w-full items-center justify-center rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a5f]/90"
          >
            登录/注册
          </Link>
          <Link href="/" className="mt-3 block text-sm text-gray-500 hover:text-[#1e3a5f]">返回首页</Link>
        </div>
      </div>
    );
  }

  if (user.role !== 'admin' && user.canSubmitActivity !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0] p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">暂无活动提交权限</h2>
          <p className="mb-6 text-sm text-gray-500">请联系管理员开通活动发布权限。</p>
          <Link href="/" className="inline-flex w-full items-center justify-center rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a5f]/90">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      user={user}
    >
      <div className="mx-auto max-w-2xl">
        {success && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-700">
              提交成功！您的活动信息已进入审核队列，请前往
              <Link href="/submit/status" className="mx-1 font-medium underline">查询状态</Link>
              查看处理进度。
            </p>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">{resubmissionId ? '重新提交活动信息' : '提交活动信息'}</h2>
          <p className="mb-6 text-sm text-gray-500">请填写活动信息并上传相关文件，提交后将由管理员审核并录入活动总表</p>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">活动全称 *</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                placeholder="请输入活动全称"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">开始时间 *</label>
                <input
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">结束时间 *</label>
                <input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">二课分类 *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">请选择分类</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">活动级别 *</label>
                <select
                  value={form.level}
                  onChange={(e) => setForm(f => ({ ...f, level: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">请选择级别</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">负责人姓名 *</label>
                <input
                  type="text"
                  value={form.leader_name}
                  onChange={(e) => setForm(f => ({ ...f, leader_name: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="请输入负责人姓名"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">负责人电话 *</label>
                <input
                  type="text"
                  value={form.leader_phone}
                  onChange={(e) => setForm(f => ({ ...f, leader_phone: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="请输入负责人电话"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">活动策划书 *</label>
                <label className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm ${planFile ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f]'}`}>
                  <Upload className="h-4 w-4" />
                  <span className="truncate">{planFile ? planFile.name : '选择文件'}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => setPlanFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">活动备案表 *</label>
                <label className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm ${recordFile ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f]'}`}>
                  <Upload className="h-4 w-4" />
                  <span className="truncate">{recordFile ? recordFile.name : '选择文件'}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => setRecordFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
            {user.canSubmitScoring && (
              <p className="text-xs text-gray-500">
                以上为电子档。活动审核通过后，赋分表和备案表纸质版照片请通过
                <Link href="/submit/scoring" className="font-medium text-[#1e3a5f] underline">赋分材料提交</Link>
                入口上传
              </p>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-medium text-white hover:bg-[#1e3a5f]/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? '提交中...' : resubmissionId ? '重新提交活动' : '提交活动'}
            </button>
            {user.canViewSubmissionStatus && (
              <Link
                href="/submit/status"
                className="flex items-center gap-2 rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Eye className="h-4 w-4" />
                查看提交状态
              </Link>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
