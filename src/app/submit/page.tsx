'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GraduationCap, ArrowLeft, Send, Eye, Upload, FileText } from 'lucide-react';
import { CATEGORIES, LEVELS } from '@/lib/types';

export default function SubmitPage() {
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

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', 'app-files');
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '上传失败');
    return data.url;
  };

  const handleSubmit = async () => {
    if (!form.full_name || !form.start_time || !form.end_time || !form.category || !form.level || !form.leader_name || !form.leader_phone) {
      alert('请填写所有必填项');
      return;
    }

    setSubmitting(true);
    try {
      let plan_file_url = '';
      let record_file_url = '';

      if (planFile) {
        plan_file_url = await uploadFile(planFile);
      }
      if (recordFile) {
        record_file_url = await uploadFile(recordFile);
      }

      const res = await fetch('/api/activities/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          plan_file_url,
          record_file_url,
          start_time: new Date(form.start_time).toISOString(),
          end_time: new Date(form.end_time).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
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

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded p-1 hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <GraduationCap className="h-6 w-6" />
            <h1 className="text-lg font-bold">活动信息提交</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {success && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-700">
              提交成功！您的活动信息已提交审核，请前往
              <Link href="/submit/status" className="mx-1 font-medium underline">查询状态</Link>
              查看处理进度。
            </p>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">提交活动信息</h2>
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
                <label className="mb-1 block text-sm font-medium text-gray-700">活动策划书</label>
                <div className="flex items-center gap-2">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f]">
                    <Upload className="h-4 w-4" />
                    {planFile ? planFile.name : '选择文件'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => setPlanFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">活动备案表</label>
                <div className="flex items-center gap-2">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f]">
                    <Upload className="h-4 w-4" />
                    {recordFile ? recordFile.name : '选择文件'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => setRecordFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-medium text-white hover:bg-[#1e3a5f]/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? '提交中...' : '提交活动'}
            </button>
            <Link
              href="/submit/status"
              className="flex items-center gap-2 rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-4 w-4" />
              查看提交状态
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
