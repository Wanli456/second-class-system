'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  GraduationCap, Lock, LogOut, Table, FileCheck, UserCheck, Award, Users,
  Plus, Pencil, Trash2, Eye, Check, X, Upload, FileText, Image as ImageIcon,
  ChevronDown, ChevronUp, Search, AlertCircle, Download,
} from 'lucide-react';
import {
  Activity, ActivitySubmission, LeaveRequest,
  CATEGORIES, LEVELS, REVIEW_STATUSES, LEAVE_TYPES,
  STATUS_COLORS,
} from '@/lib/types';

type ReviewStatus = '待审核' | '已通过' | '已驳回';
type LeaveStatus = '待审核' | '已通过' | '已驳回';
type ScoringStatus = '待赋分' | '已赋分';
type AdminRole = 'admin' | 'publisher' | 'scorer';

const ROLE_LABELS: Record<AdminRole, string> = {
  admin: '管理员',
  publisher: '发布干事',
  scorer: '赋分干事',
};

const ROLE_PASSWORDS: Record<AdminRole, string> = {
  admin: 'admin123',
  publisher: 'pub123',
  scorer: 'score123',
};

interface ScoringActivity {
  id: string;
  full_name: string;
  level: string;
  scoring_status: string;
  scoring_table_url: string | null;
  record_file_url: string | null;
  leader_name: string;
  leader_phone: string;
  category: string;
  status: string;
}

interface UserData {
  id: string;
  username: string;
  displayName: string;
  role: string;
  student_id?: string;
  canPublish?: boolean;
  canScore?: boolean;
}

export default function AdminPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roleParam = searchParams.get('role') as AdminRole | null;

  const [user, setUser] = useState<UserData | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(roleParam);
  const [loginError, setLoginError] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [scoringList, setScoringList] = useState<ScoringActivity[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('');
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [expandedScoring, setExpandedScoring] = useState<string | null>(null);
  const [scoringFile, setScoringFile] = useState<File | null>(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);

  useEffect(() => {
    if (roleParam && ['admin', 'publisher', 'scorer'].includes(roleParam)) {
      setRole(roleParam as AdminRole);
    }
  }, [roleParam]);

  // Check if user is logged in
  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const userData = JSON.parse(stored);
      setUser(userData);
      // Admin can access all roles
      if (userData.role === 'admin') {
        setAuthenticated(true);
        setRole('admin');
      } else if (roleParam === 'publisher' && userData.canPublish) {
        setAuthenticated(true);
        setRole('publisher');
      } else if (roleParam === 'scorer' && userData.canScore) {
        setAuthenticated(true);
        setRole('scorer');
      } else if (roleParam && userData.role === roleParam) {
        setAuthenticated(true);
      } else if (roleParam) {
        setLoginError(`当前账号没有${ROLE_LABELS[roleParam]}权限`);
        setShowLoginModal(true);
      }
    } else {
      setShowLoginModal(true);
    }
  }, [roleParam]);

  useEffect(() => {
    if (authenticated && role) {
      if (role === 'scorer') {
        setActiveTab('scoring');
      } else if (role === 'publisher') {
        setActiveTab('review');
      } else {
        setActiveTab('activities');
      }
    }
  }, [authenticated, role]);

  const fetchActivities = useCallback(async () => {
    const res = await fetch('/api/activities');
    const data = await res.json();
    if (data.success) setActivities(data.data);
  }, []);

  const fetchSubmissions = useCallback(async () => {
    const res = await fetch('/api/activities/review');
    const data = await res.json();
    if (data.success) setSubmissions(data.data);
  }, []);

  const fetchLeaves = useCallback(async () => {
    const res = await fetch('/api/leave?role=admin');
    const data = await res.json();
    if (data.success) setLeaves(data.data);
  }, []);

  const fetchScoring = useCallback(async () => {
    const res = await fetch('/api/scoring');
    const data = await res.json();
    if (data.success) setScoringList(data.data);
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/auth?list=all');
    const data = await res.json();
    if (data.success) setUsers(data.data);
  }, []);

  useEffect(() => {
    if (!authenticated || !role) return;
    setLoading(true);
    Promise.all([
      role === 'admin' ? fetchActivities() : Promise.resolve(),
      (role === 'admin' || role === 'publisher') ? fetchSubmissions() : Promise.resolve(),
      role === 'admin' ? fetchLeaves() : Promise.resolve(),
      (role === 'admin' || role === 'scorer') ? fetchScoring() : Promise.resolve(),
      role === 'admin' ? fetchUsers() : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [authenticated, role, fetchActivities, fetchSubmissions, fetchLeaves, fetchScoring, fetchUsers]);

  const handleLoginSuccess = (userData: UserData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    // Admin can access all roles and see all tabs
    if (userData.role === 'admin') {
      setAuthenticated(true);
      setRole('admin'); // Admin sees all tabs
      setLoginError('');
      setShowLoginModal(false);
    } else if (roleParam === 'publisher' && userData.canPublish) {
      setAuthenticated(true);
      setRole('publisher');
      setLoginError('');
      setShowLoginModal(false);
    } else if (roleParam === 'scorer' && userData.canScore) {
      setAuthenticated(true);
      setRole('scorer');
      setLoginError('');
      setShowLoginModal(false);
    } else if (roleParam && userData.role === roleParam) {
      setAuthenticated(true);
      setRole(roleParam);
      setLoginError('');
      setShowLoginModal(false);
    } else if (roleParam) {
      setLoginError(`当前账号没有${ROLE_LABELS[roleParam]}权限`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setAuthenticated(false);
    setRole(null);
    setShowLoginModal(true);
  };

  const handleGoHome = () => {
    router.push('/');
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

  const handleScoring = async (activityId: string, level: string) => {
    const activity = scoringList.find(a => a.id === activityId);
    if (!activity) {
      alert('活动不存在');
      return;
    }

    // 检查是否已上传赋分表
    if (!activity.scoring_table_url) {
      alert('活动负责人尚未上传赋分表，无法赋分');
      return;
    }

    // 校级活动需要备案表
    if (level === '校级' && !activity.record_file_url) {
      alert('校级活动需要活动备案表才能赋分，请等待负责人上传');
      return;
    }

    if (!confirm('确认该活动赋分材料齐全，完成赋分？')) {
      return;
    }

    setScoringInProgress(true);
    try {
      const res = await fetch('/api/scoring', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activityId }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || '赋分成功');
        setExpandedScoring(null);
        fetchScoring();
      } else {
        alert(data.error || '赋分失败');
      }
    } finally {
      setScoringInProgress(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || '更新角色失败');
      }
    } catch (error) {
      console.error('更新角色失败:', error);
      alert('更新角色失败');
    }
  };

  const handleUpdatePermission = async (userId: string, permission: 'canPublish' | 'canScore', value: boolean) => {
    const apiField = permission === 'canPublish' ? 'can_publish' : 'can_score';
    try {
      const res = await fetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, [apiField]: value }),
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || '更新权限失败');
      }
    } catch (error) {
      console.error('更新权限失败:', error);
      alert('更新权限失败');
    }
  };

  const handleReviewSubmission = async (id: string, status: ReviewStatus) => {
    const res = await fetch('/api/activities/review', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, review_status: status, review_note: reviewNote || null }),
    });
    const data = await res.json();
    if (data.success) {
      setReviewNote('');
      fetchSubmissions();
      if (role === 'admin') fetchActivities();
    } else {
      alert(data.error);
    }
  };

  const handleReviewLeave = async (id: string, status: LeaveStatus) => {
    const res = await fetch('/api/leave', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, review_status: status, review_note: reviewNote || null }),
    });
    const data = await res.json();
    if (data.success) {
      setReviewNote('');
      fetchLeaves();
    } else {
      alert(data.error);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('确认删除该活动？')) return;
    const res = await fetch(`/api/activities?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) fetchActivities();
    else alert(data.error);
  };

  const filteredActivities = activities.filter(a => {
    const matchSearch = !searchTerm || a.full_name.includes(searchTerm) || a.id.includes(searchTerm) || a.leader_name.includes(searchTerm);
    const matchCategory = !filterCategory || a.category === filterCategory;
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  const pendingSubmissions = submissions.filter(s => s.review_status === '待审核');
  const pendingLeaves = leaves.filter(l => l.review_status === '待审核');

  // Login modal when not authenticated
  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0]">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[#1e3a5f]/10">
              <Lock className="h-6 w-6 text-[#1e3a5f]" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">管理后台登录</h2>
            <p className="mt-1 text-sm text-gray-500">
              {role ? ROLE_LABELS[role] : '请选择角色'}
            </p>
          </div>

          {!role ? (
            <div className="space-y-3">
              {(['admin', 'publisher', 'scorer'] as AdminRole[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className="w-full rounded-md border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
              <Link href="/" className="mt-3 block text-center text-sm text-gray-500 hover:text-[#1e3a5f]">返回首页</Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">请使用账号登录以访问{ROLE_LABELS[role]}功能</p>
              <Link
                href={`/login?redirect=/admin?role=${role}`}
                className="block w-full rounded-md bg-[#1e3a5f] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#1e3a5f]/90"
              >
                登录/注册
              </Link>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setRole(null); setLoginError(''); }}
                  className="text-sm text-gray-500 hover:text-[#1e3a5f]"
                >
                  切换角色
                </button>
                <Link href="/" className="text-sm text-gray-500 hover:text-[#1e3a5f]">返回首页</Link>
              </div>
              {loginError && <p className="text-center text-xs text-red-500">{loginError}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Build tabs based on role and permissions
  const isAdmin = role === 'admin';
  const canPublish = isAdmin || user?.canPublish === true;
  const canScore = isAdmin || user?.canScore === true;

  const tabs = [
    ...(isAdmin ? [{ key: 'activities', label: '活动总表', icon: Table, count: activities.length }] : []),
    ...(canPublish ? [{ key: 'review', label: '活动审核', icon: FileCheck, count: pendingSubmissions.length }] : []),
    ...(isAdmin ? [{ key: 'leave', label: '请假审核', icon: UserCheck, count: pendingLeaves.length }] : []),
    ...(canScore ? [{ key: 'scoring', label: '活动赋分', icon: Award, count: scoringList.filter(s => s.scoring_status === '待赋分').length }] : []),
    ...(isAdmin ? [{ key: 'users', label: '用户管理', icon: Users, count: 0 }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-6 w-6" />
              <div>
                <h1 className="text-lg font-bold">管理后台</h1>
                <p className="text-xs text-blue-200">{ROLE_LABELS[role!]}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleGoHome} className="rounded p-1.5 text-sm text-blue-200 hover:bg-white/10 hover:text-white">首页</button>
              <button onClick={handleLogout} className="flex items-center gap-1 rounded p-1.5 text-sm text-blue-200 hover:bg-white/10 hover:text-white">
                <LogOut className="h-4 w-4" /> 退出
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4">
          <nav className="flex gap-6">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 border-b-2 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-[#1e3a5f] text-[#1e3a5f]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    activeTab === tab.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading ? (
          <div className="py-20 text-center text-gray-400">加载中...</div>
        ) : (
          <>
            {/* ===== 活动总表 ===== */}
            {activeTab === 'activities' && role === 'admin' && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="搜索活动..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-[#1e3a5f] focus:outline-none"
                      />
                    </div>
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                      <option value="">全部分类</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                      <option value="">全部状态</option>
                      <option value="正常活动">正常活动</option>
                      <option value="活动取消">活动取消</option>
                    </select>
                  </div>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1.5 rounded-md bg-[#1e3a5f] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1e3a5f]/90"
                  >
                    <Plus className="h-4 w-4" /> 新增活动
                  </button>
                </div>

                {showAddForm && (
                  <ActivityForm
                    onSubmit={async (data) => {
                      const res = await fetch('/api/activities', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                      });
                      const result = await res.json();
                      if (result.success) { setShowAddForm(false); fetchActivities(); }
                      else alert(result.error);
                    }}
                    onCancel={() => setShowAddForm(false)}
                  />
                )}

                {editActivity && (
                  <ActivityForm
                    activity={editActivity}
                    onSubmit={async (data) => {
                      const res = await fetch('/api/activities', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: editActivity.id, ...data }),
                      });
                      const result = await res.json();
                      if (result.success) { setEditActivity(null); fetchActivities(); }
                      else alert(result.error);
                    }}
                    onCancel={() => setEditActivity(null)}
                  />
                )}

                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">活动ID</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">活动全称</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">时间</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">分类</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">级别</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">负责人</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">状态</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">赋分</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredActivities.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 font-mono text-xs">{a.id}</td>
                          <td className="px-3 py-2.5 font-medium">{a.full_name}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">
                            {new Date(a.start_time).toLocaleDateString()} ~ {new Date(a.end_time).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">{a.category}</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs">{a.level}</td>
                          <td className="px-3 py-2.5 text-xs">{a.leader_name}</td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-700'}`}>
                              {a.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[a.scoring_status] || 'bg-gray-100 text-gray-700'}`}>
                              {a.scoring_status || '待赋分'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1">
                              <button onClick={() => setEditActivity(a)} className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDeleteActivity(a.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredActivities.length === 0 && (
                        <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">暂无活动数据</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== 活动审核 ===== */}
            {activeTab === 'review' && (role === 'admin' || role === 'publisher') && (
              <div>
                <h2 className="mb-4 text-base font-semibold text-gray-800">活动审核</h2>

                {pendingSubmissions.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-3 text-sm font-medium text-gray-600">待审核 ({pendingSubmissions.length})</h3>
                    <div className="space-y-3">
                      {pendingSubmissions.map(s => (
                        <div key={s.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{s.full_name}</h4>
                              <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                                <span>负责人: {s.leader_name}</span>
                                <span>电话: {s.leader_phone}</span>
                                <span>分类: {s.category}</span>
                                <span>级别: {s.level}</span>
                                <span>提交时间: {new Date(s.created_at).toLocaleDateString()}</span>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {new Date(s.start_time).toLocaleString()} ~ {new Date(s.end_time).toLocaleString()}
                              </div>

                              {/* 展开查看文件 */}
                              <button
                                onClick={() => setExpandedSubmission(expandedSubmission === s.id ? null : s.id)}
                                className="mt-2 flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline"
                              >
                                <FileText className="h-3 w-3" />
                                {expandedSubmission === s.id ? '收起文件' : '查看策划书/备案表'}
                                {expandedSubmission === s.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>

                              {expandedSubmission === s.id && (
                                <div className="mt-2 flex flex-wrap gap-3">
                                  {s.plan_file_url ? (
                                    <a href={s.plan_file_url} target="_blank" className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50">
                                      <FileText className="h-3 w-3" /> 策划书
                                    </a>
                                  ) : (
                                    <span className="text-xs text-gray-400">未上传策划书</span>
                                  )}
                                  {s.record_file_url ? (
                                    <a href={s.record_file_url} target="_blank" className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50">
                                      <FileText className="h-3 w-3" /> 备案表
                                    </a>
                                  ) : (
                                    <span className="text-xs text-gray-400">未上传备案表</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              placeholder="审核备注（可选）"
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#1e3a5f] focus:outline-none"
                            />
                            <button
                              onClick={() => handleReviewSubmission(s.id, '已通过')}
                              className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              <Check className="h-3 w-3" /> 通过
                            </button>
                            <button
                              onClick={() => handleReviewSubmission(s.id, '已驳回')}
                              className="flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                            >
                              <X className="h-3 w-3" /> 驳回
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {submissions.filter(s => s.review_status !== '待审核').length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-gray-600">已处理</h3>
                    <div className="space-y-2">
                      {submissions.filter(s => s.review_status !== '待审核').map(s => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
                          <div>
                            <span className="font-medium text-gray-900">{s.full_name}</span>
                            <span className="ml-2 text-xs text-gray-500">{s.leader_name} | {s.category} | {s.level}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.review_status as ReviewStatus]}`}>
                              {s.review_status}
                            </span>
                            <button
                              onClick={() => setExpandedSubmission(expandedSubmission === s.id ? null : s.id)}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {expandedSubmission === s.id && (
                            <div className="mt-2 flex flex-wrap gap-3 border-t pt-2">
                              {s.plan_file_url ? (
                                <a href={s.plan_file_url} target="_blank" download className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50">
                                  <FileText className="h-3 w-3" /> 策划书
                                </a>
                              ) : <span className="text-xs text-gray-400">未上传策划书</span>}
                              {s.record_file_url ? (
                                <a href={s.record_file_url} target="_blank" download className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50">
                                  <FileText className="h-3 w-3" /> 备案表
                                </a>
                              ) : <span className="text-xs text-gray-400">未上传备案表</span>}
                              {s.review_note && <span className="text-xs text-gray-500">备注: {s.review_note}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {submissions.length === 0 && (
                  <div className="py-16 text-center text-gray-400">暂无提交记录</div>
                )}
              </div>
            )}

            {/* ===== 请假审核 ===== */}
            {activeTab === 'leave' && role === 'admin' && (
              <div>
                <h2 className="mb-4 text-base font-semibold text-gray-800">请假审核</h2>

                {pendingLeaves.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-3 text-sm font-medium text-gray-600">待审核 ({pendingLeaves.length})</h3>
                    <div className="space-y-3">
                      {pendingLeaves.map(l => (
                        <div key={l.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div><span className="text-gray-500">学号:</span> {l.student_id}</div>
                            <div><span className="text-gray-500">姓名:</span> {l.student_name}</div>
                            <div><span className="text-gray-500">班级:</span> {l.class_name}</div>
                            <div><span className="text-gray-500">类型:</span> {l.leave_type}</div>
                            {l.activity_name && <div><span className="text-gray-500">活动:</span> {l.activity_name}</div>}
                          </div>

                          {/* 请假条图片 */}
                          {l.leave_image_url && (
                            <div className="mt-3">
                              <span className="text-xs text-gray-500">请假条截图:</span>
                              <div className="mt-1">
                                <a href={l.leave_image_url} target="_blank" className="inline-block">
                                  <img
                                    src={l.leave_image_url}
                                    alt="请假条"
                                    className="max-h-40 rounded border border-gray-200 hover:border-[#1e3a5f]"
                                  />
                                </a>
                              </div>
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              placeholder="审核备注（可选）"
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#1e3a5f] focus:outline-none"
                            />
                            <button
                              onClick={() => handleReviewLeave(l.id, '已通过')}
                              className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              <Check className="h-3 w-3" /> 通过
                            </button>
                            <button
                              onClick={() => handleReviewLeave(l.id, '已驳回')}
                              className="flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                            >
                              <X className="h-3 w-3" /> 驳回
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {leaves.filter(l => l.review_status !== '待审核').length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-gray-600">已处理</h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">学号</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">姓名</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">班级</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">类型</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">活动</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">请假条</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">状态</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">备注</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {leaves.filter(l => l.review_status !== '待审核').map(l => (
                            <tr key={l.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5">{l.student_id}</td>
                              <td className="px-3 py-2.5">{l.student_name}</td>
                              <td className="px-3 py-2.5 text-xs">{l.class_name}</td>
                              <td className="px-3 py-2.5 text-xs">{l.leave_type}</td>
                              <td className="px-3 py-2.5 text-xs">{l.activity_name || '-'}</td>
                              <td className="px-3 py-2.5">
                                {l.leave_image_url ? (
                                  <a href={l.leave_image_url} target="_blank" className="text-[#1e3a5f] hover:underline">
                                    <ImageIcon className="h-4 w-4" />
                                  </a>
                                ) : '-'}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[l.review_status as LeaveStatus]}`}>
                                  {l.review_status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-gray-500">{l.review_note || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {leaves.length === 0 && (
                  <div className="py-16 text-center text-gray-400">暂无请假记录</div>
                )}
              </div>
            )}

            {/* ===== 活动赋分 ===== */}
            {activeTab === 'scoring' && (role === 'admin' || role === 'scorer') && (
              <div>
                <h2 className="mb-4 text-base font-semibold text-gray-800">活动赋分</h2>

                <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span>院系级活动：仅需上传赋分表即可赋分</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span>校级活动：需要备案表照片 + 赋分表才能赋分</span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">活动ID</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">活动全称</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">分类</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">级别</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">负责人</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">赋分状态</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {scoringList.map(a => (
                        <Fragment key={a.id}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-mono text-xs">{a.id}</td>
                            <td className="px-3 py-2.5 font-medium">{a.full_name}</td>
                            <td className="px-3 py-2.5">
                              <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">{a.category}</span>
                            </td>
                            <td className="px-3 py-2.5 text-xs">{a.level}</td>
                            <td className="px-3 py-2.5 text-xs">{a.leader_name}</td>
                            <td className="px-3 py-2.5">
                              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[a.scoring_status] || 'bg-gray-100 text-gray-700'}`}>
                                {a.scoring_status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              {a.scoring_status === '待赋分' ? (
                                <button
                                  onClick={() => setExpandedScoring(expandedScoring === a.id ? null : a.id)}
                                  className="flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700"
                                >
                                  <Eye className="h-3 w-3" /> 查看材料
                                </button>
                              ) : (
                                <div className="flex gap-2">
                                  {a.scoring_table_url && (
                                    <a href={a.scoring_table_url} target="_blank" download className="flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline">
                                      <FileText className="h-3 w-3" /> 赋分表
                                    </a>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          {expandedScoring === a.id && a.scoring_status === '待赋分' && (
                            <tr className="bg-amber-50/50">
                              <td colSpan={7} className="px-3 py-3">
                                <div className="space-y-3">
                                  <p className="text-xs font-medium text-gray-700">赋分材料（请查看并下载确认）：</p>
                                  <div className="flex flex-wrap gap-3 text-xs">
                                    {/* 赋分表 */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">赋分表:</span>
                                      {a.scoring_table_url ? (
                                        <div className="flex items-center gap-2">
                                          <a href={a.scoring_table_url} target="_blank" className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[#1e3a5f] hover:bg-blue-50">
                                            <FileText className="h-3 w-3" /> 查看
                                          </a>
                                          <a href={a.scoring_table_url} download className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-emerald-600 hover:bg-emerald-50">
                                            <Download className="h-3 w-3" /> 下载
                                          </a>
                                        </div>
                                      ) : (
                                        <span className="text-red-500">负责人尚未上传赋分表</span>
                                      )}
                                    </div>
                                    {/* 备案表（校级需要） */}
                                    {a.level === '校级' && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-gray-500">备案表:</span>
                                        {a.record_file_url ? (
                                          <div className="flex items-center gap-2">
                                            <a href={a.record_file_url} target="_blank" className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[#1e3a5f] hover:bg-blue-50">
                                              <FileText className="h-3 w-3" /> 查看
                                            </a>
                                            <a href={a.record_file_url} download className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-emerald-600 hover:bg-emerald-50">
                                              <Download className="h-3 w-3" /> 下载
                                            </a>
                                          </div>
                                        ) : (
                                          <span className="text-red-500">未上传备案表（无法赋分）</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 border-t border-gray-200 pt-3">
                                    <button
                                      onClick={() => handleScoring(a.id, a.level)}
                                      disabled={scoringInProgress || !a.scoring_table_url || (a.level === '校级' && !a.record_file_url)}
                                      className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      {scoringInProgress ? '处理中...' : '确认赋分'}
                                    </button>
                                    <button
                                      onClick={() => setExpandedScoring(null)}
                                      className="text-xs text-gray-500 hover:text-gray-700"
                                    >
                                      取消
                                    </button>
                                    {(!a.scoring_table_url || (a.level === '校级' && !a.record_file_url)) && (
                                      <span className="text-xs text-amber-600">请等待负责人上传完整材料</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                      {scoringList.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">暂无可赋分活动</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-4 text-base font-semibold text-gray-800">用户管理</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">学号</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">角色</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">发布活动</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">活动赋分</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">注册时间</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800">{u.username}</td>
                          <td className="px-3 py-2 text-gray-500">{u.student_id || '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                              u.role === 'admin' ? 'bg-red-100 text-red-700' :
                              u.role === 'leader' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {u.role === 'admin' ? '管理员' : u.role === 'leader' ? '活动负责人' : '学生'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={u.canPublish || false}
                                onChange={(e) => handleUpdatePermission(u.id, 'canPublish', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs text-gray-600">{u.canPublish ? '已开启' : '未开启'}</span>
                            </label>
                          </td>
                          <td className="px-3 py-2">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={u.canScore || false}
                                onChange={(e) => handleUpdatePermission(u.id, 'canScore', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs text-gray-600">{u.canScore ? '已开启' : '未开启'}</span>
                            </label>
                          </td>
                          <td className="px-3 py-2 text-gray-500">-</td>
                          <td className="px-3 py-2">
                            <select
                              value={u.role}
                              onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                              className="rounded border border-gray-200 px-2 py-1 text-xs"
                            >
                              <option value="student">学生</option>
                              <option value="leader">活动负责人</option>
                              <option value="admin">管理员</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">暂无用户</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ===== Activity Form Component =====
function ActivityForm({ activity, onSubmit, onCancel }: {
  activity?: Activity;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    full_name: activity?.full_name || '',
    start_time: activity?.start_time ? activity.start_time.slice(0, 16) : '',
    end_time: activity?.end_time ? activity.end_time.slice(0, 16) : '',
    category: activity?.category || '',
    level: activity?.level || '',
    leader_name: activity?.leader_name || '',
    leader_phone: activity?.leader_phone || '',
    status: activity?.status || '正常活动' as string,
  });

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">
        {activity ? `编辑活动 ${activity.id}` : '新增活动'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-xs font-medium text-gray-600">活动全称</label>
          <input type="text" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-[#1e3a5f] focus:outline-none" />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">开始时间</label>
          <input type="datetime-local" value={form.start_time} onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">结束时间</label>
          <input type="datetime-local" value={form.end_time} onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">二课分类</label>
          <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">活动级别</label>
          <select value={form.level} onChange={(e) => setForm(f => ({ ...f, level: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm">
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">负责人</label>
          <input type="text" value={form.leader_name} onChange={(e) => setForm(f => ({ ...f, leader_name: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">负责人电话</label>
          <input type="text" value={form.leader_phone} onChange={(e) => setForm(f => ({ ...f, leader_phone: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">活动状态</label>
          <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="正常活动">正常活动</option>
            <option value="活动取消">活动取消</option>
          </select>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onSubmit({ ...form, start_time: new Date(form.start_time).toISOString(), end_time: new Date(form.end_time).toISOString() })}
          className="rounded bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1e3a5f]/90">保存</button>
        <button onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">取消</button>
      </div>
    </div>
  );
}
