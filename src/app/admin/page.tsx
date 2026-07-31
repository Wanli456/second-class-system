'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  GraduationCap, ArrowLeft, Plus, Search, Edit2, Trash2,
  CheckCircle, XCircle, Clock, Eye, X, Filter, FileText
} from 'lucide-react';
import {
  Activity, ActivitySubmission, LeaveRequest,
  CATEGORIES, LEVELS, ACTIVITY_STATUSES, LEAVE_TYPES, REVIEW_STATUSES,
  CATEGORY_COLORS, STATUS_COLORS
} from '@/lib/types';

type Tab = 'activities' | 'submissions' | 'leaves';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('activities');
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Admin password check (simple auth for demo)
  const handleLogin = () => {
    if (password === 'admin123') {
      setIsAdmin(true);
      setPasswordError('');
    } else {
      setPasswordError('管理员密码错误');
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f5f5f0]">
        <header className="bg-[#1e3a5f] text-white">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="rounded p-1 hover:bg-white/10">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <GraduationCap className="h-6 w-6" />
              <h1 className="text-lg font-bold">管理员登录</h1>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-md px-4 py-16">
          <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="mb-6 text-xl font-semibold text-gray-900">管理员验证</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">管理员密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="请输入管理员密码"
                />
                {passwordError && <p className="mt-1 text-sm text-red-600">{passwordError}</p>}
              </div>
              <button
                onClick={handleLogin}
                className="w-full rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a5f]/90"
              >
                登录
              </button>
              <p className="text-center text-xs text-gray-400">默认密码: admin123</p>
            </div>
          </div>
        </main>
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
              <h1 className="text-lg font-bold">管理后台</h1>
            </div>
            <button onClick={() => setIsAdmin(false)} className="text-sm text-blue-200 hover:text-white">
              退出
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="flex gap-6">
            {[
              { key: 'activities' as Tab, label: '活动总表', icon: Clock },
              { key: 'submissions' as Tab, label: '活动审核', icon: CheckCircle },
              { key: 'leaves' as Tab, label: '请假审核', icon: FileText },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'border-[#1e3a5f] text-[#1e3a5f]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {activeTab === 'activities' && <ActivityTable />}
        {activeTab === 'submissions' && <SubmissionReview />}
        {activeTab === 'leaves' && <LeaveReview />}
      </main>
    </div>
  );
}

// ==================== 活动总表 ====================
function ActivityTable() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [filter, setFilter] = useState({ category: '', status: '', keyword: '' });

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.category) params.set('category', filter.category);
      if (filter.status) params.set('status', filter.status);
      if (filter.keyword) params.set('keyword', filter.keyword);
      const res = await fetch(`/api/activities?${params}`);
      const data = await res.json();
      if (data.success) setActivities(data.data);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该活动？')) return;
    const res = await fetch(`/api/activities?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) fetchActivities();
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索活动名称"
            value={filter.keyword}
            onChange={(e) => setFilter(f => ({ ...f, keyword: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-[#1e3a5f] focus:outline-none"
          />
        </div>
        <select
          value={filter.category}
          onChange={(e) => setFilter(f => ({ ...f, category: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">全部分类</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">全部状态</option>
          {ACTIVITY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => { setEditingActivity(null); setShowForm(true); }}
          className="flex items-center gap-1 rounded-md bg-[#1e3a5f] px-3 py-1.5 text-sm text-white hover:bg-[#1e3a5f]/90"
        >
          <Plus className="h-4 w-4" /> 新增活动
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">活动ID</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">活动全称</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">分类</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">级别</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">时间</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">负责人</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">状态</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400">加载中...</td></tr>
            ) : activities.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400">暂无活动数据</td></tr>
            ) : activities.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{a.id}</td>
                <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[200px] truncate">{a.full_name}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${CATEGORY_COLORS[a.category]}`}>
                    {a.category}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-600">{a.level}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">
                  <div>{new Date(a.start_time).toLocaleDateString('zh-CN')}</div>
                  <div>{new Date(a.end_time).toLocaleDateString('zh-CN')}</div>
                </td>
                <td className="px-3 py-2.5 text-gray-600">{a.leader_name}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${STATUS_COLORS[a.status]}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingActivity(a); setShowForm(true); }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-[#1e3a5f]"
                      title="编辑"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Activity Form Modal */}
      {showForm && (
        <ActivityFormModal
          activity={editingActivity}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchActivities(); }}
        />
      )}
    </div>
  );
}

function ActivityFormModal({ activity, onClose, onSaved }: {
  activity: Activity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: activity?.full_name || '',
    start_time: activity ? activity.start_time.slice(0, 16) : '',
    end_time: activity ? activity.end_time.slice(0, 16) : '',
    category: activity?.category || '',
    level: activity?.level || '',
    leader_name: activity?.leader_name || '',
    leader_phone: activity?.leader_phone || '',
    status: activity?.status || '正常活动' as string,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
      };

      const url = '/api/activities';
      const method = activity ? 'PUT' : 'POST';
      if (activity) (payload as Record<string, unknown>).id = activity.id;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) onSaved();
      else alert(data.error || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {activity ? '编辑活动' : '新增活动'}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {activity && (
          <div className="mb-4 rounded bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-500">活动ID：</span>
            <span className="font-mono font-medium">{activity.id}</span>
            <span className="ml-2 text-xs text-gray-400">（不可修改）</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">活动全称 *</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">开始时间 *</label>
              <input
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">结束时间 *</label>
              <input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">二课分类 *</label>
              <select
                value={form.category}
                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">请选择</option>
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
                <option value="">请选择</option>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">负责人 *</label>
              <input
                type="text"
                value={form.leader_name}
                onChange={(e) => setForm(f => ({ ...f, leader_name: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">负责人电话 *</label>
              <input
                type="text"
                value={form.leader_phone}
                onChange={(e) => setForm(f => ({ ...f, leader_phone: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">活动状态</label>
            <select
              value={form.status}
              onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {ACTIVITY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-[#1e3a5f] px-4 py-2 text-sm text-white hover:bg-[#1e3a5f]/90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 活动审核 ====================
function SubmissionReview() {
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/activities/review${params}`);
      const data = await res.json();
      if (data.success) setSubmissions(data.data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  const handleReview = async (id: string, status: string) => {
    const note = status === '已驳回' ? prompt('请输入驳回原因：') : '';
    if (status === '已驳回' && note === null) return;

    const res = await fetch('/api/activities/review', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, review_status: status, review_note: note }),
    });
    const data = await res.json();
    if (data.success) fetchSubmissions();
    else alert(data.error || '操作失败');
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">全部状态</option>
          {REVIEW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="py-8 text-center text-gray-400">加载中...</div>
        ) : submissions.length === 0 ? (
          <div className="py-8 text-center text-gray-400">暂无提交记录</div>
        ) : submissions.map(s => (
          <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-gray-900">{s.full_name}</h4>
                  <span className={`rounded border px-1.5 py-0.5 text-xs ${CATEGORY_COLORS[s.category]}`}>
                    {s.category}
                  </span>
                  <span className="text-xs text-gray-500">{s.level}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-500">
                  <span>负责人：{s.leader_name}</span>
                  <span>电话：{s.leader_phone}</span>
                  <span>开始：{new Date(s.start_time).toLocaleString('zh-CN')}</span>
                  <span>结束：{new Date(s.end_time).toLocaleString('zh-CN')}</span>
                </div>
                {s.review_note && (
                  <div className="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-500">
                    备注：{s.review_note}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_COLORS[s.review_status]}`}>
                  {s.review_status}
                </span>
                {s.review_status === '待审核' && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleReview(s.id, '已通过')}
                      className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                    >
                      <CheckCircle className="h-3 w-3" /> 通过
                    </button>
                    <button
                      onClick={() => handleReview(s.id, '已驳回')}
                      className="flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                    >
                      <XCircle className="h-3 w-3" /> 驳回
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 请假审核 ====================
function LeaveReview() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ role: 'admin' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/leave?${params}`);
      const data = await res.json();
      if (data.success) setLeaves(data.data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  const handleReview = async (id: string, status: string) => {
    const res = await fetch('/api/leave', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, review_status: status, review_note: reviewNote || null }),
    });
    const data = await res.json();
    if (data.success) {
      setReviewingId(null);
      setReviewNote('');
      fetchLeaves();
    } else alert(data.error || '操作失败');
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">全部状态</option>
          {REVIEW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="py-8 text-center text-gray-400">加载中...</div>
        ) : leaves.length === 0 ? (
          <div className="py-8 text-center text-gray-400">暂无请假记录</div>
        ) : leaves.map(l => (
          <div key={l.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-gray-900">{l.student_name}</h4>
                  <span className="text-sm text-gray-500">{l.student_id}</span>
                  <span className="text-sm text-gray-500">{l.class_name}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-xs ${
                    l.leave_type === '事假' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                    l.leave_type === '病假' ? 'bg-sky-100 text-sky-700 border-sky-200' :
                    'bg-purple-100 text-purple-700 border-purple-200'
                  }`}>
                    {l.leave_type}
                  </span>
                </div>
                {l.activity_name && (
                  <div className="mt-1 text-sm text-gray-600">
                    关联活动：{l.activity_name}
                  </div>
                )}
                {l.leave_image_url && (
                  <div className="mt-2">
                    <img src={l.leave_image_url} alt="请假条" className="h-20 w-auto rounded border" />
                  </div>
                )}
                {l.review_note && (
                  <div className="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-500">
                    备注：{l.review_note}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_COLORS[l.review_status]}`}>
                  {l.review_status}
                </span>
                {l.review_status === '待审核' && (
                  reviewingId === l.id ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        placeholder="审核备注（可选）"
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleReview(l.id, '已通过')}
                          className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                        >
                          通过
                        </button>
                        <button
                          onClick={() => handleReview(l.id, '已驳回')}
                          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                        >
                          驳回
                        </button>
                        <button
                          onClick={() => { setReviewingId(null); setReviewNote(''); }}
                          className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReviewingId(l.id)}
                      className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                    >
                      <Eye className="h-3 w-3" /> 审核
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
