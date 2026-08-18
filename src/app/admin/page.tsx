'use client';

import { useState, useEffect, useCallback, Fragment, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  GraduationCap, Lock, LogOut, Table, FileCheck, UserCheck, Award, Users,
  Plus, Pencil, Trash2, Eye, Check, X, Upload, FileText, Image as ImageIcon,
  ChevronDown, ChevronUp, Search, AlertCircle, Download,
} from 'lucide-react';
import {
  Activity, ActivitySubmission, LeaveRequest,
  CATEGORIES, CATEGORY_DETAILS, LEVELS, REVIEW_STATUSES, LEAVE_TYPES,
  formatCategoryPath, type Category,
  STATUS_COLORS,
} from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch, refreshCurrentUser } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { canOpenAdminTab, formatActivityScopes } from '@/lib/business-rules';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ReviewStatus = '待审核' | '已通过' | '已驳回';
type LeaveStatus = '待审核' | '已通过' | '已驳回';
type ScoringStatus = '待赋分' | '已赋分';
type AdminRole = 'admin' | 'leader' | 'student';
type AdminTab = 'activities' | 'review' | 'scoring' | 'leave' | 'users';
type UserPermission = 'canPublish' | 'canScore' | 'canSubmitActivity' | 'canViewSubmissionStatus' | 'canSubmitScoring' | 'canReviewLeave' | 'canViewEveningStudy' | 'canStartGroupLeave';

const ROLE_LABELS: Record<AdminRole, string> = {
  admin: '管理员',
  leader: '部门负责人',
  student: '学生',
};

const normalizeTab = (tab: string | null) => {
  if (tab === 'submissions') return 'review';
  if (tab === 'leaves') return 'leave';
  return tab || '';
};

function canAccessAdminWorkspace(userData: UserData, requestedTab: string) {
  if (userData.role === 'admin') return true;
  if (requestedTab) {
    return canOpenAdminTab({
      role: userData.role,
      can_publish: userData.canPublish,
      can_score: userData.canScore,
      can_review_leave: userData.canReviewLeave,
    }, requestedTab);
  }
  return userData.canPublish || userData.canScore || userData.canReviewLeave;
}

const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '未填写';

interface ScoringActivity {
  id: string;
  full_name: string;
  level: string;
  scoring_status: string;
  scoring_table_url: string | null;
  scoring_table_file_name: string | null;
  record_file_url: string | null;
  record_file_name: string | null;
  record_photo_url: string | null;
  record_photo_file_name: string | null;
  leader_name: string;
  leader_phone: string;
  category: string;
  category_primary?: string | null;
  category_secondary?: string | null;
  status: string;
  scope_names?: string | null;
  scope_type?: 'department' | 'class' | null;
  scope_name?: string | null;
}

interface UserData {
  id: string;
  studentId: string;
  name: string;
  role: string;
  canPublish: boolean;
  canScore: boolean;
  canSubmitActivity: boolean;
  canViewSubmissionStatus: boolean;
  canSubmitScoring: boolean;
  canReviewLeave: boolean;
  canViewEveningStudy: boolean;
  canStartGroupLeave: boolean;
  department?: string | null;
  className?: string | null;
  createdAt?: string;
}

interface LeaveGroup {
  id: string;
  class_name: string;
  applicant_user_id: string;
  applicant_name?: string | null;
  applicant_student_id?: string | null;
  leave_type: string;
  activity_id?: string | null;
  activity_name?: string | null;
  start_time: string;
  end_time: string;
  review_status: LeaveStatus;
  review_note?: string | null;
  member_count: number;
}

interface RosterStudent {
  id: string;
  class_name: string;
  student_id: string;
  student_name: string;
}

interface DepartmentRecord {
  id: string;
  name: string;
}

function AdminPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roleParam = searchParams.get('role') as AdminRole | null;
  const tabParam = searchParams.get('tab') as string | null;

  // 使用全局用户状态，避免重复 API 调用
  const { user: globalUser, loading: userLoading, initialized } = useUser();

  const [user, setUser] = useState<UserData | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(roleParam);
  const [loginError, setLoginError] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveGroups, setLeaveGroups] = useState<LeaveGroup[]>([]);
  const [scoringList, setScoringList] = useState<ScoringActivity[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tabLoadingStates, setTabLoadingStates] = useState<Record<AdminTab, boolean>>({
    activities: false,
    review: false,
    scoring: false,
    leave: false,
    users: false,
  });
  const [dataError, setDataError] = useState('');

  const [activeTab, setActiveTab] = useState(() => normalizeTab(tabParam));
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
  const [expandedLeaveGroup, setExpandedLeaveGroup] = useState<string | null>(null);
  const [leaveGroupMembers, setLeaveGroupMembers] = useState<Record<string, LeaveRequest[]>>({});

  // 权限计算必须与后端 auth.ts 中的 calculateUserPermissions 逻辑完全一致
  const isAdmin = user?.role === 'admin';
  const canPublish = isAdmin || user?.canPublish === true;
  const canScore = isAdmin || user?.canScore === true;
  const canReviewLeave = isAdmin || user?.canReviewLeave === true;

  useEffect(() => {
    if (roleParam && roleParam === 'admin') {
      setRole(roleParam as AdminRole);
    }
  }, [roleParam]);

  // 使用全局用户状态替代 refreshCurrentUser，避免重复 API 调用
  useEffect(() => {
    if (!initialized || userLoading) return;

    if (!globalUser) {
      setAuthResolved(true);
      setShowLoginModal(true);
      return;
    }

    // 转换为 UserData 类型
    const userData: UserData = {
      id: globalUser.id,
      studentId: globalUser.studentId || '',
      name: globalUser.name || globalUser.username || '',
      role: globalUser.role,
      canPublish: globalUser.canPublish || false,
      canScore: globalUser.canScore || false,
      canSubmitActivity: globalUser.canSubmitActivity || false,
      canViewSubmissionStatus: globalUser.canViewSubmissionStatus || false,
      canSubmitScoring: globalUser.canSubmitScoring || false,
      canReviewLeave: globalUser.canReviewLeave || false,
      canViewEveningStudy: globalUser.canViewEveningStudy || false,
      canStartGroupLeave: globalUser.canStartGroupLeave || false,
      department: globalUser.department || null,
      className: globalUser.className || null,
    };

    setUser(userData);
    const requestedTab = normalizeTab(tabParam);
    const hasWorkspaceAccess = canAccessAdminWorkspace(userData, requestedTab);

    // `role=admin` identifies the management workspace URL. It does not
    // change the user's base role or require the user to be an administrator.
    if (hasWorkspaceAccess && (!roleParam || roleParam === 'admin' || roleParam === userData.role)) {
      setAuthenticated(true);
      setRole(userData.role as AdminRole);
    } else if (roleParam) {
      setLoginError('当前账号没有该管理功能权限');
      setShowLoginModal(true);
    }
    setAuthResolved(true);
  }, [globalUser, userLoading, initialized, roleParam]);

  useEffect(() => {
    if (!authenticated || !role) return;

    const requestedTab = normalizeTab(tabParam);
    const availableTabs: AdminTab[] = [
      ...(isAdmin ? ['activities' as const] : []),
      ...(canPublish ? ['review' as const] : []),
      ...(canScore ? ['scoring' as const] : []),
      ...(canReviewLeave ? ['leave' as const] : []),
      ...(isAdmin ? ['users' as const] : []),
    ];

    setActiveTab(
      requestedTab && availableTabs.includes(requestedTab as AdminTab)
        ? requestedTab
        : availableTabs[0] || '',
    );
  }, [authenticated, role, tabParam, isAdmin, canPublish, canScore, canReviewLeave]);

  const fetchActivities = useCallback(async () => {
    const res = await apiFetch('/api/activities');
    const data = await res.json();
    if (data.success) {
      setActivities(data.data);
      return;
    }
    setDataError(data.error || `活动总表加载失败（HTTP ${res.status}）`);
  }, []);

  const fetchSubmissions = useCallback(async () => {
    const res = await apiFetch('/api/activities/review');
    const data = await res.json();
    if (data.success) {
      setSubmissions(data.data);
      return;
    }
    setDataError(data.error || `活动审核数据加载失败（HTTP ${res.status}）`);
  }, []);

  const fetchLeaves = useCallback(async () => {
    const res = await apiFetch('/api/leave?role=admin');
    const data = await res.json();
    if (data.success) {
      setLeaves(data.data || []);
      setLeaveGroups(data.groups || []);
      return;
    }
    setDataError(data.error || `请假审核数据加载失败（HTTP ${res.status}）`);
  }, []);

  const fetchScoring = useCallback(async () => {
    const res = await apiFetch('/api/scoring');
    const data = await res.json();
    if (data.success) {
      setScoringList(data.data);
      return;
    }
    setDataError(data.error || `活动赋分数据加载失败（HTTP ${res.status}）`);
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await apiFetch('/api/auth?admin=true');
    const data = await res.json();
    if (data.success) {
      setUsers(data.data);
      return;
    }
    setDataError(data.error || `用户管理数据加载失败（HTTP ${res.status}）`);
  }, []);

  // 按需加载数据，避免页面切换卡顿，使用数据缓存
  useEffect(() => {
    if (!authenticated || !role) return;

    // 根据当前激活的标签页加载数据
    const loadCurrentTabData = async () => {
      // 只在数据为空时才显示加载状态，避免页面切换时的闪烁
      const hasData = (() => {
        switch (activeTab) {
          case 'activities': return activities.length > 0;
          case 'review': return submissions.length > 0;
          case 'leave': return leaves.length > 0 || leaveGroups.length > 0;
          case 'scoring': return scoringList.length > 0;
          case 'users': return users.length > 0;
          default: return false;
        }
      })();

      if (!hasData) {
        setLoading(true);
      }
      setTabLoadingStates(prev => ({ ...prev, [activeTab]: true }));
      setDataError('');

      try {
        switch (activeTab) {
          case 'activities':
            if (isAdmin && activities.length === 0) await fetchActivities();
            break;
          case 'review':
            if (canPublish && submissions.length === 0) await fetchSubmissions();
            break;
          case 'leave':
            if (canReviewLeave && leaves.length === 0 && leaveGroups.length === 0) await fetchLeaves();
            break;
          case 'scoring':
            if (canScore && scoringList.length === 0) await fetchScoring();
            break;
          case 'users':
            if (isAdmin && users.length === 0) await fetchUsers();
            break;
        }
      } catch (error) {
        console.error('数据加载失败:', error);
        setDataError('数据加载失败，请重试');
      } finally {
        setLoading(false);
        setTabLoadingStates(prev => ({ ...prev, [activeTab]: false }));
      }
    };

    loadCurrentTabData();
  }, [authenticated, role, activeTab, isAdmin, canPublish, canScore, canReviewLeave, activities.length, submissions.length, leaves.length, leaveGroups.length, scoringList.length, users.length, fetchActivities, fetchSubmissions, fetchLeaves, fetchScoring, fetchUsers]);

  const retryCurrentTab = useCallback(async () => {
    if (!authenticated || !role || !activeTab) return;

    setDataError('');
    setLoading(true);
    setTabLoadingStates(previous => ({ ...previous, [activeTab]: true }));
    try {
      switch (activeTab) {
        case 'activities':
          if (isAdmin) await fetchActivities();
          break;
        case 'review':
          if (canPublish) await fetchSubmissions();
          break;
        case 'leave':
          if (canReviewLeave) await fetchLeaves();
          break;
        case 'scoring':
          if (canScore) await fetchScoring();
          break;
        case 'users':
          if (isAdmin) await fetchUsers();
          break;
      }
    } catch (error) {
      console.error('重试数据加载失败:', error);
      setDataError('数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
      setTabLoadingStates(previous => ({ ...previous, [activeTab]: false }));
    }
  }, [activeTab, authenticated, canPublish, canReviewLeave, canScore, fetchActivities, fetchLeaves, fetchScoring, fetchSubmissions, fetchUsers, isAdmin, role]);

  const handleLoginSuccess = (userData: UserData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    const requestedTab = normalizeTab(tabParam);
    const hasWorkspaceAccess = canAccessAdminWorkspace(userData, requestedTab);

    if (hasWorkspaceAccess && (!roleParam || roleParam === 'admin' || roleParam === userData.role)) {
      setAuthenticated(true);
      setRole(userData.role as AdminRole);
      setLoginError('');
      setShowLoginModal(false);
    } else if (roleParam) {
      setLoginError('当前账号没有该管理功能权限');
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
    const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
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
    if (level === '校级' && !activity.record_photo_url) {
      alert('校级活动需要备案表照片才能赋分，请等待负责人上传');
      return;
    }

    if (!confirm('确认该活动赋分材料齐全，完成赋分？')) {
      return;
    }

    setScoringInProgress(true);
    try {
      const res = await apiFetch('/api/scoring', {
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
      const res = await apiFetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        if (user?.id === userId && data.data) {
          const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
          const updatedUser = { ...savedUser, ...data.data };
          setUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          if (newRole !== 'admin') {
            setAuthenticated(false);
            router.push('/');
          }
        }
        fetchUsers();
      } else {
        alert(data.error || '更新角色失败');
      }
    } catch (error) {
      console.error('更新角色失败:', error);
      alert('更新角色失败');
    }
  };

  const handleUpdatePermission = async (userId: string, permission: UserPermission, value: boolean) => {
    const apiFieldMap = {
      canPublish: 'canPublish',
      canScore: 'canScore',
      canSubmitActivity: 'canSubmitActivity',
      canViewSubmissionStatus: 'canViewSubmissionStatus',
      canSubmitScoring: 'canSubmitScoring',
      canReviewLeave: 'canReviewLeave',
      canViewEveningStudy: 'canViewEveningStudy',
      canStartGroupLeave: 'canStartGroupLeave',
    };
    const apiField = apiFieldMap[permission];
    try {
      const res = await apiFetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, [apiField]: value }),
      });
      const data = await res.json();
      if (data.success) {
        // 只更新本地状态，避免页面跳动
        if (user?.id === userId && data.data) {
          const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
          const updatedUser = { ...savedUser, ...data.data };
          setUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
        setUsers(prev => prev.map(u =>
          u.id === userId ? { ...u, ...(data.data || { [permission]: value }) } : u
        ));
      } else {
        alert(data.error || '更新权限失败');
      }
    } catch (error) {
      console.error('更新权限失败:', error);
      alert('更新权限失败');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    try {
      const res = await apiFetch(`/api/auth?id=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || '删除用户失败');
      }
    } catch (error) {
      console.error('删除用户失败:', error);
      alert('删除用户失败');
    }
  };

  const handleChangePassword = async (userId: string, userName: string) => {
    const newPassword = prompt(`请输入"${userName}"的新密码（至少6位）：`);
    if (!newPassword) return;
    if (newPassword.length < 6) {
      alert('密码长度至少6位');
      return;
    }
    try {
      const res = await apiFetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password: newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        alert('密码修改成功');
      } else {
        alert(data.error || '修改密码失败');
      }
    } catch (error) {
      console.error('修改密码失败:', error);
      alert('修改密码失败');
    }
  };

  const handleReviewSubmission = async (id: string, status: ReviewStatus) => {
    const res = await apiFetch('/api/activities/review', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, review_status: status, review_note: reviewNote || null }),
    });
    const data = await res.json();
    if (data.success) {
      setReviewNote('');
      fetchSubmissions();
      if (isAdmin) fetchActivities();
    } else {
      alert(data.error);
    }
  };

  const handleReviewLeave = async (id: string, status: LeaveStatus, isGroup = false) => {
    const res = await apiFetch('/api/leave', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(isGroup ? { group_id: id } : { id }), review_status: status, review_note: reviewNote || null }),
    });
    const data = await res.json();
    if (data.success) {
      setReviewNote('');
      fetchLeaves();
    } else {
      alert(data.error);
    }
  };

  const handleUpdateDepartment = async (userId: string, department: string | null) => {
    try {
      const res = await apiFetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, department }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || '更新部门失败');
        return;
      }
      setUsers(previous => previous.map(item => item.id === userId ? { ...item, department } : item));
      if (user?.id === userId && data.data) {
        const updatedUser = { ...user, department };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify({ ...JSON.parse(localStorage.getItem('user') || '{}'), ...data.data }));
      }
    } catch (error) {
      console.error('更新部门失败:', error);
      alert('更新部门失败');
    }
  };

  const loadLeaveGroupMembers = async (groupId: string) => {
    if (leaveGroupMembers[groupId]) {
      setExpandedLeaveGroup(expandedLeaveGroup === groupId ? null : groupId);
      return;
    }
    const res = await apiFetch(`/api/leave?group_id=${encodeURIComponent(groupId)}`);
    const data = await res.json();
    if (!data.success) {
      alert(data.error || '加载集体请假成员失败');
      return;
    }
    setLeaveGroupMembers(prev => ({ ...prev, [groupId]: data.data || [] }));
    setExpandedLeaveGroup(groupId);
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('确认删除该活动？')) return;
    const res = await apiFetch(`/api/activities?id=${id}`, { method: 'DELETE' });
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
  const pendingLeaveGroups = leaveGroups.filter(group => group.review_status === '待审核');
  const pendingLeaveCount = pendingLeaves.length + pendingLeaveGroups.length;

  if (!initialized || !authResolved) {
    return <AuthLoadingScreen />;
  }

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
              {(['admin', 'leader', 'student'] as AdminRole[]).map(r => (
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

  const tabs = [
    ...(isAdmin ? [{ key: 'activities', label: '活动总表', icon: Table, count: activities.length }] : []),
    ...(canPublish ? [{ key: 'review', label: '活动审核', icon: FileCheck, count: pendingSubmissions.length }] : []),
    ...(canScore ? [{ key: 'scoring', label: '活动赋分', icon: Award, count: scoringList.filter(s => s.scoring_status === '待赋分').length }] : []),
    ...(canReviewLeave ? [{ key: 'leave', label: '请假审核', icon: UserCheck, count: pendingLeaveCount }] : []),
    ...(isAdmin ? [{ key: 'users', label: '用户管理', icon: Users, count: 0 }] : []),
  ];

  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey);
    // 不要使用 router.push()，避免触发整页重新渲染
    // 只在组件内部切换标签，保持 SPA 的流畅体验
  };

  const activeNavHref = activeTab
    ? `/admin?role=admin&tab=${activeTab}`
    : undefined;
  const activeTabLabel = tabs.find(tab => tab.key === activeTab)?.label;

  return (
    <DashboardLayout
      user={user}
      onLogout={handleLogout}
      activeNavHref={activeNavHref}
    >
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
            <p className="mt-1 text-sm text-gray-500">{activeTabLabel || ROLE_LABELS[role!]}</p>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex shrink-0 items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    activeTab === tab.key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {dataError && (
          <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>数据加载失败：{dataError}</span>
            <button
              type="button"
              onClick={() => void retryCurrentTab()}
              disabled={tabLoadingStates[activeTab as AdminTab]}
              className="shrink-0 font-medium text-red-800 underline underline-offset-2 hover:text-red-900 disabled:cursor-wait disabled:opacity-60"
            >
              {tabLoadingStates[activeTab as AdminTab] ? '重试中...' : '重试'}
            </button>
          </div>
        )}

        {/* Main Content */}
        {/* 优化：只在首次加载且没有数据时显示全局loading，避免切换时的闪烁 */}
        {loading && (() => {
          switch (activeTab) {
            case 'activities': return activities.length === 0;
            case 'review': return submissions.length === 0;
            case 'leave': return leaves.length === 0;
            case 'scoring': return scoringList.length === 0;
            case 'users': return users.length === 0;
            default: return true;
          }
        })() ? (
          <div className="py-20 text-center text-gray-400">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4">加载中...</p>
          </div>
        ) : (
          <>
            {/* ===== 活动总表 ===== */}
            {activeTab === 'activities' && isAdmin && (
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
                      const res = await apiFetch('/api/activities', {
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
                      const res = await apiFetch('/api/activities', {
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
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">联办单位</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">负责人</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-600">提交人</th>
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
                            <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">{formatCategoryPath(a.category, a.category_primary, a.category_secondary)}</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs">{a.level}</td>
                          <td className="px-3 py-2.5 text-xs">{formatActivityScopes(a)}</td>
                          <td className="px-3 py-2.5 text-xs">{a.leader_name}</td>
                          <td className="px-3 py-2.5 text-xs">{a.activity_submitter_name || '-'}{a.activity_submitter_student_id ? `（${a.activity_submitter_student_id}）` : ''}</td>
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
                        <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">暂无活动数据</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== 活动审核 ===== */}
            {activeTab === 'review' && canPublish && (
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
                                <span>分类: {formatCategoryPath(s.category, s.category_primary, s.category_secondary)}</span>
                                <span>级别: {s.level}</span>
                                <span>联办单位: {formatActivityScopes(s)}</span>
                                <span>提交人: {s.activity_submitter_name || '-'}{s.activity_submitter_student_id ? `（${s.activity_submitter_student_id}）` : ''}</span>
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
                                      <FileText className="h-3 w-3" /> {s.plan_file_name || '策划书（已上传）'}
                                    </a>
                                  ) : (
                                    <span className="text-xs text-gray-400">未上传策划书</span>
                                  )}
                                  {s.record_file_url ? (
                                    <a href={s.record_file_url} target="_blank" className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50">
                                      <FileText className="h-3 w-3" /> {s.record_file_name || '备案表（已上传）'}
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
                            <span className="ml-2 text-xs text-gray-500">{s.leader_name} | {formatCategoryPath(s.category, s.category_primary, s.category_secondary)} | {s.level} | {formatActivityScopes(s)} | 提交人：{s.activity_submitter_name || '-'}</span>
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
                                  <FileText className="h-3 w-3" /> {s.plan_file_name || '策划书（已上传）'}
                                </a>
                              ) : <span className="text-xs text-gray-400">未上传策划书</span>}
                              {s.record_file_url ? (
                                <a href={s.record_file_url} target="_blank" download className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50">
                                  <FileText className="h-3 w-3" /> {s.record_file_name || '备案表（已上传）'}
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
            {activeTab === 'leave' && canReviewLeave && (
              <div>
                <h2 className="mb-4 text-base font-semibold text-gray-800">请假审核</h2>

                {pendingLeaveGroups.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-3 text-sm font-medium text-gray-600">待审核集体请假 ({pendingLeaveGroups.length})</h3>
                    <div className="space-y-3">
                      {pendingLeaveGroups.map(group => (
                        <div key={group.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                              <span><span className="text-gray-500">班级:</span> {group.class_name}</span>
                              <span><span className="text-gray-500">成员:</span> {group.member_count} 人</span>
                              <span><span className="text-gray-500">发起人:</span> {group.applicant_name || '-'}{group.applicant_student_id ? `（${group.applicant_student_id}）` : ''}</span>
                              <span><span className="text-gray-500">类型:</span> {group.leave_type}</span>
                              {group.activity_name && <span><span className="text-gray-500">活动:</span> {group.activity_name}</span>}
                            </div>
                            <button onClick={() => void loadLeaveGroupMembers(group.id)} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
                              <Eye className="h-3.5 w-3.5" />{expandedLeaveGroup === group.id ? '收起成员' : '查看成员'}
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-gray-500">请假时间：{formatDateTime(group.start_time)} 至 {formatDateTime(group.end_time)}</p>
                          {expandedLeaveGroup === group.id && (
                            <div className="mt-3 rounded-md border border-amber-100 bg-white p-3">
                              <div className="flex flex-wrap gap-2">
                                {(leaveGroupMembers[group.id] || []).map(member => <span key={member.id} className="rounded border px-2 py-1 text-xs text-gray-600">{member.student_name}（{member.student_id}）</span>)}
                              </div>
                              {leaveGroupMembers[group.id]?.[0]?.leave_image_url && <a href={leaveGroupMembers[group.id][0].leave_image_url!} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs text-[#1e3a5f] hover:underline">{leaveGroupMembers[group.id][0].leave_image_name || '查看请假条'}</a>}
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-3">
                            <input type="text" placeholder="审核备注（可选）" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} className="min-w-48 flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#1e3a5f] focus:outline-none" />
                            <button onClick={() => handleReviewLeave(group.id, '已通过', true)} className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"><Check className="h-3 w-3" />整组通过</button>
                            <button onClick={() => handleReviewLeave(group.id, '已驳回', true)} className="flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"><X className="h-3 w-3" />整组驳回</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingLeaves.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-3 text-sm font-medium text-gray-600">待审核个人请假 ({pendingLeaves.length})</h3>
                    <div className="space-y-3">
                      {pendingLeaves.map(l => (
                        <div key={l.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div><span className="text-gray-500">学号:</span> {l.student_id}</div>
                            <div><span className="text-gray-500">姓名:</span> {l.student_name}</div>
                            <div><span className="text-gray-500">班级:</span> {l.class_name}</div>
                            <div><span className="text-gray-500">提交人:</span> {l.applicant_name || '-'}{l.applicant_student_id ? `（${l.applicant_student_id}）` : ''}</div>
                            <div><span className="text-gray-500">类型:</span> {l.leave_type}</div>
                            {l.activity_name && <div><span className="text-gray-500">活动:</span> {l.activity_name}</div>}
                          </div>
                          <p className="mt-2 text-xs text-gray-600">请假时间：{formatDateTime(l.start_time)} 至 {formatDateTime(l.end_time)}</p>

                          {/* 请假条图片 */}
                          {l.leave_image_url && (
                            <div className="mt-3">
                              <span className="text-xs text-gray-500">请假条截图：{l.leave_image_name || '已上传'}</span>
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
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">提交人</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">类型</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600">请假时间</th>
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
                              <td className="px-3 py-2.5 text-xs">{l.applicant_name || '-'}{l.applicant_student_id ? `（${l.applicant_student_id}）` : ''}</td>
                              <td className="px-3 py-2.5 text-xs">{l.leave_type}</td>
                              <td className="px-3 py-2.5 text-xs whitespace-nowrap">{formatDateTime(l.start_time)} 至 {formatDateTime(l.end_time)}</td>
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

                {leaveGroups.filter(group => group.review_status !== '待审核').length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 text-sm font-medium text-gray-600">已处理集体请假</h3>
                    <div className="space-y-2">
                      {leaveGroups.filter(group => group.review_status !== '待审核').map(group => (
                        <div key={group.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div><span className="font-medium">{group.class_name}集体请假</span><span className="ml-2 text-xs text-gray-500">{group.member_count} 人 | 发起人：{group.applicant_name || '-'} | {group.leave_type}{group.activity_name ? ` | ${group.activity_name}` : ''}</span></div>
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[group.review_status]}`}>{group.review_status}</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">请假时间：{formatDateTime(group.start_time)} 至 {formatDateTime(group.end_time)}{group.review_note ? ` | 审核备注：${group.review_note}` : ''}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {leaves.length === 0 && leaveGroups.length === 0 && (
                  <div className="py-16 text-center text-gray-400">暂无请假记录</div>
                )}
              </div>
            )}

            {/* ===== 活动赋分 ===== */}
            {activeTab === 'scoring' && canScore && (
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
                              <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">{formatCategoryPath(a.category, a.category_primary, a.category_secondary)}</span>
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
                                      <FileText className="h-3 w-3" /> {a.scoring_table_file_name || '赋分表（已上传）'}
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
                                            <FileText className="h-3 w-3" /> {a.scoring_table_file_name || '查看赋分表'}
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
                                        <span className="text-gray-500">备案表照片:</span>
                                        {a.record_photo_url ? (
                                          <div className="flex items-center gap-2">
                                          <a href={a.record_photo_url} target="_blank" className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[#1e3a5f] hover:bg-blue-50">
                                            <ImageIcon className="h-3 w-3" /> {a.record_photo_file_name || '查看备案表照片'}
                                          </a>
                                            <a href={a.record_photo_url} download className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-emerald-600 hover:bg-emerald-50">
                                              <Download className="h-3 w-3" /> 下载
                                            </a>
                                          </div>
                                        ) : (
                                          <span className="text-red-500">未上传备案表照片（无法赋分）</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 border-t border-gray-200 pt-3">
                                    <button
                                      onClick={() => handleScoring(a.id, a.level)}
                                       disabled={scoringInProgress || !a.scoring_table_url || (a.level === '校级' && !a.record_photo_url)}
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
                                    {(!a.scoring_table_url || (a.level === '校级' && !a.record_photo_url)) && (
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
            {activeTab === 'users' && isAdmin && (
              <UserManagement
                users={users}
                userSearch={userSearch}
                onUserSearchChange={setUserSearch}
                onUpdatePermission={handleUpdatePermission}
                onUpdateRole={handleUpdateRole}
                onUpdateDepartment={handleUpdateDepartment}
                onChangePassword={handleChangePassword}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {false && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-800">用户管理</h2>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="搜索姓名..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="rounded border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {/* 管理员 */}
                  {users.filter(u => u.role === 'admin' && (!userSearch || u.name?.includes(userSearch))).length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <span className="rounded bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">管理员</span>
                        <span className="text-gray-500 font-normal">({users.filter(u => u.role === 'admin').length}人)</span>
                      </h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">学号</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动审核权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动赋分权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">赋分材料权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">请假审核权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">晚自习查询权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动提交权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">提交状态权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.filter(u => u.role === 'admin' && (!userSearch || u.name?.includes(userSearch))).map((u) => (
                            <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-800">{u.name || '-'}</td>
                              <td className="px-3 py-2 text-gray-500">{u.studentId || '-'}</td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                    className="rounded border-gray-300 text-blue-600"
                                  />
                                  <span className="text-xs text-gray-500">已开启</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                    className="rounded border-gray-300 text-blue-600"
                                  />
                                  <span className="text-xs text-gray-500">已开启</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                    className="rounded border-gray-300 text-blue-600"
                                  />
                                  <span className="text-xs text-gray-500">已开启</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                    className="rounded border-gray-300 text-blue-600"
                                  />
                                  <span className="text-xs text-gray-500">已开启</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                    className="rounded border-gray-300 text-blue-600"
                                  />
                                  <span className="text-xs text-gray-500">已开启</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                    className="rounded border-gray-300 text-blue-600"
                                  />
                                  <span className="text-xs text-gray-500">已开启</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                    className="rounded border-gray-300 text-blue-600"
                                  />
                                  <span className="text-xs text-gray-500">已开启</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleChangePassword(u.id, u.name)}
                                    className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-50"
                                  >
                                    改密
                                  </button>
                                  <select
                                    value={u.role}
                                    onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                                    className="text-xs text-purple-600 border border-purple-200 rounded px-1.5 py-0.5 hover:bg-purple-50 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  >
                                    <option value="admin">管理员</option>
                                    <option value="leader">活动负责人</option>
                                    <option value="student">学生</option>
                                  </select>
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.name)}
                                    className="text-xs text-red-600 hover:text-red-800 px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50"
                                  >
                                    删除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 活动负责人 */}
                  {users.filter(u => u.role === 'leader' && (!userSearch || u.name?.includes(userSearch))).length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <span className="rounded bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-medium">活动负责人</span>
                        <span className="text-gray-500 font-normal">({users.filter(u => u.role === 'leader').length}人)</span>
                      </h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">学号</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动审核权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动赋分权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">赋分材料权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">请假审核权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">晚自习查询权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动提交权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">提交状态权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.filter(u => u.role === 'leader' && (!userSearch || u.name?.includes(userSearch))).map((u) => (
                            <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-800">{u.name || '-'}</td>
                              <td className="px-3 py-2 text-gray-500">{u.studentId || '-'}</td>
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
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canSubmitScoring || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canSubmitScoring', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canSubmitScoring ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canReviewLeave || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canReviewLeave', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canReviewLeave ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canViewEveningStudy || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canViewEveningStudy', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canViewEveningStudy ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canSubmitActivity || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canSubmitActivity', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canSubmitActivity ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canViewSubmissionStatus || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canViewSubmissionStatus', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canViewSubmissionStatus ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleChangePassword(u.id, u.name)}
                                    className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-50"
                                  >
                                    改密
                                  </button>
                                  <select
                                    value={u.role}
                                    onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                                    className="text-xs text-purple-600 border border-purple-200 rounded px-1.5 py-0.5 hover:bg-purple-50 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  >
                                    <option value="admin">管理员</option>
                                    <option value="leader">活动负责人</option>
                                    <option value="student">学生</option>
                                  </select>
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.name)}
                                    className="text-xs text-red-600 hover:text-red-800 px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50"
                                  >
                                    删除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 学生 */}
                  {users.filter(u => u.role === 'student' && (!userSearch || u.name?.includes(userSearch))).length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <span className="rounded bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">学生</span>
                        <span className="text-gray-500 font-normal">({users.filter(u => u.role === 'student').length}人)</span>
                      </h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">学号</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动审核权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动赋分权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">赋分材料权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">请假审核权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">晚自习查询权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">活动提交权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">提交状态权限</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.filter(u => u.role === 'student' && (!userSearch || u.name?.includes(userSearch))).map((u) => (
                            <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-800">{u.name || '-'}</td>
                              <td className="px-3 py-2 text-gray-500">{u.studentId || '-'}</td>
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
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canSubmitScoring || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canSubmitScoring', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canSubmitScoring ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canReviewLeave || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canReviewLeave', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canReviewLeave ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canViewEveningStudy || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canViewEveningStudy', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canViewEveningStudy ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canSubmitActivity || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canSubmitActivity', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canSubmitActivity ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={u.canViewSubmissionStatus || false}
                                    onChange={(e) => handleUpdatePermission(u.id, 'canViewSubmissionStatus', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-600">{u.canViewSubmissionStatus ? '已开启' : '未开启'}</span>
                                </label>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleChangePassword(u.id, u.name)}
                                    className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-50"
                                  >
                                    改密
                                  </button>
                                  <select
                                    value={u.role}
                                    onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                                    className="text-xs text-purple-600 border border-purple-200 rounded px-1.5 py-0.5 hover:bg-purple-50 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  >
                                    <option value="admin">管理员</option>
                                    <option value="leader">活动负责人</option>
                                    <option value="student">学生</option>
                                  </select>
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.name)}
                                    className="text-xs text-red-600 hover:text-red-800 px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50"
                                  >
                                    删除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {users.length === 0 && (
                    <div className="px-3 py-8 text-center text-gray-400">暂无用户</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function UserManagement({
  users,
  userSearch,
  onUserSearchChange,
  onUpdatePermission,
  onUpdateRole,
  onUpdateDepartment,
  onChangePassword,
  onDeleteUser,
}: {
  users: UserData[];
  userSearch: string;
  onUserSearchChange: (value: string) => void;
  onUpdatePermission: (userId: string, permission: UserPermission, value: boolean) => Promise<void>;
  onUpdateRole: (userId: string, role: string) => Promise<void>;
  onUpdateDepartment: (userId: string, department: string | null) => Promise<void>;
  onChangePassword: (userId: string, userName: string) => Promise<void>;
  onDeleteUser: (userId: string, userName: string) => Promise<void>;
}) {
  const [rosterClassName, setRosterClassName] = useState('');
  const [rosterText, setRosterText] = useState('');
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterError, setRosterError] = useState('');
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [rosterDeleteTarget, setRosterDeleteTarget] = useState<RosterStudent | null>(null);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [newDepartment, setNewDepartment] = useState('');
  const [departmentError, setDepartmentError] = useState('');

  const filteredUsers = users.filter((item) => {
    const keyword = userSearch.trim();
    return !keyword || item.name.includes(keyword) || item.studentId.includes(keyword) || (item.department || '').includes(keyword) || (item.className || '').includes(keyword);
  });
  const permissions: Array<{ key: UserPermission; label: string }> = [
    { key: 'canPublish', label: '活动审核' },
    { key: 'canScore', label: '活动赋分' },
    { key: 'canSubmitScoring', label: '赋分材料' },
    { key: 'canReviewLeave', label: '请假审核' },
    { key: 'canViewEveningStudy', label: '晚自习查询' },
    { key: 'canSubmitActivity', label: '活动提交' },
    { key: 'canViewSubmissionStatus', label: '提交状态' },
    { key: 'canStartGroupLeave', label: '班级集体请假发起' },
  ];
  const roleTextStyles: Record<string, string> = {
    admin: 'text-red-600',
    leader: 'text-emerald-600',
    student: 'text-gray-600',
  };
  const roleTextColors: Record<string, string> = {
    admin: '#dc2626',
    leader: '#059669',
    student: '#4b5563',
  };

  const getEnabledPermissions = (item: UserData) => permissions.filter((permission) => item.role === 'admin' || item[permission.key]);

  const getPermissionSummary = (item: UserData) => {
    if (item.role === 'admin') return '全部权限';
    const enabled = getEnabledPermissions(item).map((permission) => permission.label);
    return enabled.length ? enabled.join('、') : '未开通功能权限';
  };

  const loadRoster = async () => {
    const className = rosterClassName.trim();
    if (!className) {
      setRosterError('请先填写班级名称');
      return;
    }
    setLoadingRoster(true);
    setRosterError('');
    try {
      const response = await apiFetch(`/api/class-roster?class=${encodeURIComponent(className)}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '加载花名册失败');
      setRosterStudents(data.data || []);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : '加载花名册失败');
    } finally {
      setLoadingRoster(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await apiFetch('/api/departments?managed=true');
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '加载部门失败');
      setDepartments(data.data || []);
    } catch (error) {
      setDepartmentError(error instanceof Error ? error.message : '加载部门失败');
    }
  };

  useEffect(() => {
    void loadDepartments();
  }, []);

  const addDepartment = async () => {
    const name = newDepartment.trim();
    if (!name) {
      setDepartmentError('请输入部门名称');
      return;
    }
    setDepartmentError('');
    try {
      const response = await apiFetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '新增部门失败');
      setNewDepartment('');
      await loadDepartments();
    } catch (error) {
      setDepartmentError(error instanceof Error ? error.message : '新增部门失败');
    }
  };

  const deleteDepartment = async (department: DepartmentRecord) => {
    if (!confirm(`确认删除部门“${department.name}”？`)) return;
    setDepartmentError('');
    try {
      const response = await apiFetch(`/api/departments?id=${encodeURIComponent(department.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '删除部门失败');
      await loadDepartments();
    } catch (error) {
      setDepartmentError(error instanceof Error ? error.message : '删除部门失败');
    }
  };

  const saveRoster = async () => {
    const className = rosterClassName.trim();
    const lines = rosterText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const students = lines.map((line) => {
      const [studentId, studentName, ...rest] = line.split(/[，,]/).map(part => part.trim());
      return { student_id: studentId, student_name: [studentName, ...rest].filter(Boolean).join(',') };
    });
    if (!className || !students.length || students.some(student => !student.student_id || !student.student_name)) {
      setRosterError('请填写班级，并按“学号,姓名”格式每行录入一名学生');
      return;
    }
    setLoadingRoster(true);
    setRosterError('');
    try {
      const response = await apiFetch('/api/class-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className, students }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '保存花名册失败');
      setRosterText('');
      await loadRoster();
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : '保存花名册失败');
    } finally {
      setLoadingRoster(false);
    }
  };

  const deleteRosterStudent = async () => {
    if (!rosterDeleteTarget) return;
    const response = await apiFetch(`/api/class-roster?id=${encodeURIComponent(rosterDeleteTarget.id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!data.success) {
      setRosterError(data.error || '删除花名册成员失败');
      return;
    }
    setRosterStudents(previous => previous.filter(student => student.id !== rosterDeleteTarget.id));
    setRosterDeleteTarget(null);
  };

  const importRosterFile = async (file: File) => {
    const className = rosterClassName.trim();
    if (!className) {
      setRosterError('请先填写班级名称');
      return;
    }
    setLoadingRoster(true);
    setRosterError('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('Excel 中没有可读取的工作表');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const students = rows.map((row) => {
        const entries = Object.entries(row);
        const findValue = (aliases: string[]) => entries.find(([key]) => aliases.some((alias) => key.trim().toLowerCase().includes(alias)))?.[1];
        return {
          student_id: String(findValue(['学号', 'student_id', 'studentid', 'id']) ?? '').trim(),
          student_name: String(findValue(['姓名', 'student_name', 'studentname', 'name']) ?? '').trim(),
        };
      }).filter((student) => student.student_id && student.student_name);
      if (!students.length) throw new Error('未识别到有效数据，请确认首行包含“学号”和“姓名”列');
      const response = await apiFetch('/api/class-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className, students }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '导入花名册失败');
      await loadRoster();
      setRosterError(`已导入 ${students.length} 名学生`);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : '导入花名册失败');
    } finally {
      setLoadingRoster(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-800">用户管理</h2>
          <input type="search" placeholder="搜索姓名、学号或班级" value={userSearch} onChange={(event) => onUserSearchChange(event.target.value)} className="rounded border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-max text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">学号</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">角色</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">部门</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">班级</th>
                <th className="min-w-64 px-3 py-2 text-left font-medium text-gray-600">权限总览</th>
                {permissions.map(permission => <th key={permission.key} className="px-3 py-2 text-left font-medium text-gray-600">{permission.label}</th>)}
                <th className="px-3 py-2 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{item.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{item.studentId || '-'}</td>
                  <td className="px-3 py-2"><select aria-label={`${item.name}的角色`} value={item.role} onChange={(event) => void onUpdateRole(item.id, event.target.value)} className={`rounded border border-gray-200 bg-white px-2 py-1 text-xs ${roleTextStyles[item.role] || roleTextStyles.student}`}><option value="admin" style={{ color: roleTextColors.admin }}>管理员</option><option value="leader" style={{ color: roleTextColors.leader }}>部门负责人</option><option value="student" style={{ color: roleTextColors.student }}>学生</option></select></td>
                  <td className="px-3 py-2"><select value={item.department || ''} onChange={(event) => void onUpdateDepartment(item.id, event.target.value || null)} className="rounded border border-gray-200 bg-white px-2 py-1 text-xs"><option value="">未设置</option>{departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></td>
                  <td className="px-3 py-2 text-xs text-gray-600">{item.className || '-'}</td>
                  <td className="max-w-96 px-3 py-2 align-top"><div title={getPermissionSummary(item)}><div className="mb-1 text-[11px] font-medium text-gray-500">{item.role === 'admin' ? '系统全部权限' : `已开通 ${getEnabledPermissions(item).length} 项`}</div><div className="flex flex-wrap gap-1">{item.role === 'admin' ? <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">全部权限</span> : getEnabledPermissions(item).map((permission) => <span key={permission.key} className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{permission.label}</span>)}{item.role !== 'admin' && !getEnabledPermissions(item).length && <span className="text-xs text-gray-400">未开通功能权限</span>}</div></div></td>
                  {permissions.map(permission => <td key={permission.key} className="px-3 py-2"><label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap"><input type="checkbox" aria-label={`${item.name}的${permission.label}权限`} checked={item[permission.key]} disabled={item.role === 'admin'} onChange={(event) => void onUpdatePermission(item.id, permission.key, event.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed" /><span className="text-xs text-gray-600">{item[permission.key] ? '已开启' : '未开启'}</span></label></td>)}
                  <td className="px-3 py-2"><div className="flex gap-1"><button onClick={() => void onChangePassword(item.id, item.name)} className="rounded border border-blue-200 px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50">改密</button><button onClick={() => setDeleteTarget({ id: item.id, name: item.name })} className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50">删除</button></div></td>
                </tr>
              ))}
              {filteredUsers.length === 0 && <tr><td colSpan={15} className="px-3 py-8 text-center text-gray-400">没有匹配用户</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3"><h2 className="text-base font-semibold text-gray-800">部门维护</h2><p className="mt-1 text-sm text-gray-500">部门名称用于活动主办、联办和人员归属选择。</p></div>
        <div className="flex flex-wrap gap-2"><input value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} placeholder="输入部门名称" className="rounded border border-gray-300 px-3 py-2 text-sm" /><button onClick={() => void addDepartment()} className="inline-flex items-center gap-1 rounded bg-[#1e3a5f] px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" />新增部门</button></div>
        <div className="mt-3 flex flex-wrap gap-2">{departments.map((department) => <span key={department.id} className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700">{department.name}<button type="button" title={`删除${department.name}`} onClick={() => void deleteDepartment(department)} className="text-gray-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button></span>)}</div>
        {departmentError && <p className="mt-2 text-sm text-red-600">{departmentError}</p>}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4"><h2 className="text-base font-semibold text-gray-800">班级花名册</h2><p className="mt-1 text-sm text-gray-500">为集体请假维护班级成员。重复学号会更新姓名。</p></div>
        <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto]">
          <input type="text" placeholder="班级名称，例如：计算机2101" value={rosterClassName} onChange={(event) => setRosterClassName(event.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          <button onClick={() => void loadRoster()} disabled={loadingRoster} className="rounded bg-[#1e3a5f] px-3 py-2 text-sm font-medium text-white hover:bg-[#1e3a5f]/90 disabled:opacity-50">查看花名册</button>
        </div>
        <textarea value={rosterText} onChange={(event) => setRosterText(event.target.value)} placeholder={'批量导入，每行一名学生\n学号,姓名'} className="mt-3 min-h-28 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
        <div className="mt-3 flex flex-wrap items-center gap-3"><button onClick={() => void saveRoster()} disabled={loadingRoster} className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">保存花名册</button><label className="inline-flex cursor-pointer items-center gap-1 rounded border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"><Upload className="h-4 w-4" />导入 Excel<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importRosterFile(file); event.target.value = ''; }} /></label>{rosterError && <p className="text-sm text-red-600">{rosterError}</p>}</div>
        {rosterStudents.length > 0 && <div className="mt-4 overflow-x-auto rounded border border-gray-200"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left font-medium text-gray-600">学号</th><th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th><th className="px-3 py-2 text-right font-medium text-gray-600">操作</th></tr></thead><tbody className="divide-y divide-gray-100">{rosterStudents.map(student => <tr key={student.id}><td className="px-3 py-2">{student.student_id}</td><td className="px-3 py-2">{student.student_name}</td><td className="px-3 py-2 text-right"><button onClick={() => setRosterDeleteTarget(student)} className="text-xs text-red-600 hover:underline">移除</button></td></tr>)}</tbody></table></div>}
      </section>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除用户</AlertDialogTitle><AlertDialogDescription>将删除“{deleteTarget?.name}”的账号。历史提交记录会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => deleteTarget && void onDeleteUser(deleteTarget.id, deleteTarget.name)} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={Boolean(rosterDeleteTarget)} onOpenChange={(open) => !open && setRosterDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>移除花名册成员</AlertDialogTitle><AlertDialogDescription>将从 {rosterDeleteTarget?.class_name} 花名册中移除“{rosterDeleteTarget?.student_name}”。不会删除该学生的账号或历史记录。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void deleteRosterStudent()} className="bg-red-600 hover:bg-red-700">移除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
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
    category_primary: activity?.category_primary || '',
    category_secondary: activity?.category_secondary || '',
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
          <label className="mb-0.5 block text-xs font-medium text-gray-600">德智体美劳</label>
          <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value, category_primary: '', category_secondary: '' }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">请选择分类</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">一级分类</label>
          <select value={form.category_primary} onChange={(e) => setForm(f => ({ ...f, category_primary: e.target.value, category_secondary: '' }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" disabled={!form.category}>
            <option value="">请选择一级分类</option>
            {(CATEGORY_DETAILS[form.category as Category] ? Object.keys(CATEGORY_DETAILS[form.category as Category]) : []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">二级分类</label>
          <select value={form.category_secondary} onChange={(e) => setForm(f => ({ ...f, category_secondary: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" disabled={!form.category_primary}>
            <option value="">请选择二级分类</option>
            {(form.category && form.category_primary ? CATEGORY_DETAILS[form.category as Category]?.[form.category_primary] || [] : []).map((item) => <option key={item} value={item}>{item}</option>)}
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

// Wrapper component with Suspense boundary for useSearchParams
export default function AdminPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-gray-500">加载中...</div></div>}>
      <AdminPage />
    </Suspense>
  );
}
