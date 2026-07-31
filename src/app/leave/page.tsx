'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GraduationCap, ArrowLeft, Send, Eye, AlertCircle } from 'lucide-react';
import { LEAVE_TYPES } from '@/lib/types';

export default function LeavePage() {
  const [form, setForm] = useState({
    student_id: '',
    class_name: '',
    student_name: '',
    leave_type: '',
    activity_name: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activityList, setActivityList] = useState<string[]>([]);

  // Fetch activity names for autocomplete
  useEffect(() => {
    if (form.leave_type === '活动公假') {
      fetch('/api/activities')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setActivityList(data.data.map((a: { full_name: string }) => a.full_name));
          }
        })
        .catch(() => {});
    }
  }, [form.leave_type]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!form.student_id || !form.class_name || !form.student_name || !form.leave_type) {
      alert('请填写所有必填项');
      return;
    }

    if (form.leave_type === '活动公假' && !form.activity_name) {
      alert('活动公假必须填写活动全称');
      return;
    }

    setSubmitting(true);
    try {
      // Upload image first if exists
      let imageUrl = null;
      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.success) imageUrl = uploadData.url;
      }

      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          leave_image_url: imageUrl,
          activity_name: form.leave_type === '活动公假' ? form.activity_name : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setForm({ student_id: '', class_name: '', student_name: '', leave_type: '', activity_name: '' });
        setImageFile(null);
        setImagePreview(null);
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
            <h1 className="text-lg font-bold">请假申请</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {success && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-700">
              请假申请提交成功！请前往
              <Link href="/leave/status" className="mx-1 font-medium underline">查询状态</Link>
              查看审核进度。
            </p>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">提交请假申请</h2>
          <p className="mb-6 text-sm text-gray-500">请填写请假信息并上传请假条图片</p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">学号 *</label>
                <input
                  type="text"
                  value={form.student_id}
                  onChange={(e) => setForm(f => ({ ...f, student_id: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="请输入学号"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">姓名 *</label>
                <input
                  type="text"
                  value={form.student_name}
                  onChange={(e) => setForm(f => ({ ...f, student_name: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="请输入姓名"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">班级 *</label>
              <input
                type="text"
                value={form.class_name}
                onChange={(e) => setForm(f => ({ ...f, class_name: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                placeholder="请输入班级"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">请假类型 *</label>
              <div className="flex gap-3">
                {LEAVE_TYPES.map(type => (
                  <label key={type} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="leave_type"
                      value={type}
                      checked={form.leave_type === type}
                      onChange={(e) => setForm(f => ({ ...f, leave_type: e.target.value, activity_name: '' }))}
                      className="h-4 w-4 text-[#1e3a5f]"
                    />
                    <span className="text-sm text-gray-700">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Activity name field - only for 活动公假 */}
            {form.leave_type === '活动公假' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  活动全称 *
                  <span className="ml-1 text-xs text-gray-400">（活动公假必须关联已有活动）</span>
                </label>
                <input
                  type="text"
                  value={form.activity_name}
                  onChange={(e) => setForm(f => ({ ...f, activity_name: e.target.value }))}
                  list="activity-names"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="请输入或选择活动全称"
                />
                <datalist id="activity-names">
                  {activityList.map(name => <option key={name} value={name} />)}
                </datalist>
                <div className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>若活动全称不存在于系统中，申请将被自动驳回</span>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">请假条图片</label>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  选择图片
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                {imagePreview && (
                  <img src={imagePreview} alt="预览" className="h-16 w-auto rounded border" />
                )}
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
              {submitting ? '提交中...' : '提交申请'}
            </button>
            <Link
              href="/leave/status"
              className="flex items-center gap-2 rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-4 w-4" />
              查看请假状态
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
