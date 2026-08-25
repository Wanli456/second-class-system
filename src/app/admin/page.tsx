'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  GraduationCap, Lock, LogOut, Table, FileCheck, UserCheck, Award, Users,
  Plus, Pencil, Trash2, Eye, Check, X, Upload, FileText, Image as ImageIcon,
  ChevronDown, ChevronUp, Search, AlertCircle, Download, Building2, BookOpen,
  KeyRound, ShieldCheck, UserRound, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  Activity, ActivitySubmission,
  CATEGORIES, CATEGORY_DETAILS, LEVELS, REVIEW_STATUSES, LEAVE_TYPES,
  type Category,
  STATUS_COLORS,
} from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch, logoutCurrentUser, refreshCurrentUser } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { canOpenAdminTab, formatActivityScopes } from '@/lib/business-rules';
import { getDepartmentAutoPermissionKeys, hasPermission, hasPermissionOverride, isDepartmentAutoPermission, type PermissionKey } from '@/lib/department-permissions';
import { FilePreviewLink } from '@/components/FilePreviewDialog';
import { CategoryBadge } from '@/components/CategoryBadge';
import { ActivityLeaderDetails } from '@/components/ActivityLeaderDetails';
import { parseRosterWorkbook } from '@/lib/class-roster-import';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ReviewStatus = '待审核' | '已通过' | '已驳回';
type ScoringStatus = '待赋分' | '已赋分';
type AdminRole = 'admin' | 'leader' | 'class_leader' | 'student';
type AdminTab = 'activities' | 'review' | 'scoring' | 'users';
type UserPermission = 'canPublish' | 'canScore' | 'canSubmitActivity' | 'canViewSubmissionStatus' | 'canSubmitScoring' | 'canRegisterOtherCollege' | 'canReviewLeave' | 'canViewEveningStudy' | 'canStartGroupLeave' | 'canManageAttendanceWork' | 'canUploadLeave' | 'canQueryLeave' | 'canManageOriginalLeave' | 'canSubmitOriginalLeave';

const USER_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const ROLE_LABELS: Record<AdminRole, string> = {
  admin: '管理员',
  leader: '部门负责人',
  class_leader: '班级负责人',
  student: '学生',
};

const normalizeTab = (tab: string | null) => {
  if (tab === 'submissions') return 'review';
  return tab || '';
};

function canAccessAdminWorkspace(userData: UserData, requestedTab: string) {
  if (userData.role === 'admin') return true;
  if (requestedTab && requestedTab !== 'leave' && requestedTab !== 'leaves') {
    return canOpenAdminTab({
      role: userData.role,
      department: userData.department || null,
      can_publish: userData.canPublish,
      can_score: userData.canScore,
      can_review_leave: userData.canReviewLeave,
    }, requestedTab);
  }
  return hasPermission(userData, 'canPublish') || hasPermission(userData, 'canScore');
}

const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '未填写';

const matchesSearch = (query: string, values: readonly unknown[]) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return !normalizedQuery || values.some(value => String(value ?? '').toLocaleLowerCase().includes(normalizedQuery));
};

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
  leader_details?: string | null;
  category: string;
  category_primary?: string | null;
  category_secondary?: string | null;
  start_time?: string;
  end_time?: string;
  registration_start_time?: string | null;
  registration_end_time?: string | null;
  status: string;
  scope_names?: string | null;
  scope_type?: 'department' | 'class' | 'other_college' | null;
  scope_name?: string | null;
  activity_submitter_name?: string | null;
  activity_submitter_student_id?: string | null;
  scoring_material_submitter_name?: string | null;
  scoring_material_submitter_student_id?: string | null;
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
  canRegisterOtherCollege: boolean;
  canReviewLeave: boolean;
  canViewEveningStudy: boolean;
  canStartGroupLeave: boolean;
  canManageAttendanceWork: boolean;
  canUploadLeave: boolean;
  canQueryLeave: boolean;
  canManageOriginalLeave: boolean;
  canSubmitOriginalLeave: boolean;
  department?: string | null;
  className?: string | null;
  contactPhone?: string | null;
  permissionOverrides?: string | null;
  createdAt?: string;
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

function normalizeRosterStudents(value: unknown): RosterStudent[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): RosterStudent[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? '').trim();
    const className = String(record.class_name ?? record.className ?? '').trim();
    const studentId = String(record.student_id ?? record.studentId ?? '').trim();
    const studentName = String(record.student_name ?? record.studentName ?? '').trim();
    if (!id || !className || !studentId || !studentName) return [];
    return [{ id, class_name: className, student_id: studentId, student_name: studentName }];
  });
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
  const [scoringList, setScoringList] = useState<ScoringActivity[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [reviewSearch, setReviewSearch] = useState('');
  const [scoringSearch, setScoringSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tabLoadingStates, setTabLoadingStates] = useState<Record<AdminTab, boolean>>({
    activities: false,
    review: false,
    scoring: false,
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
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [expandedScoring, setExpandedScoring] = useState<string | null>(null);
  const [scoringFile, setScoringFile] = useState<File | null>(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);

  // 权限计算必须与后端 auth.ts 中的 calculateUserPermissions 逻辑完全一致
  const isAdmin = user?.role === 'admin';
  const canPublish = hasPermission(user, 'canPublish');
  const canScore = hasPermission(user, 'canScore');

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
      canRegisterOtherCollege: globalUser.canRegisterOtherCollege || false,
      canReviewLeave: globalUser.canReviewLeave || false,
      canViewEveningStudy: globalUser.canViewEveningStudy || false,
      canStartGroupLeave: globalUser.canStartGroupLeave || false,
      canManageAttendanceWork: globalUser.canManageAttendanceWork || false,
      canUploadLeave: globalUser.canUploadLeave || false,
      canQueryLeave: globalUser.canQueryLeave || false,
      canManageOriginalLeave: globalUser.canManageOriginalLeave || false,
      canSubmitOriginalLeave: globalUser.canSubmitOriginalLeave || false,
      department: globalUser.department || null,
      className: globalUser.className || null,
      contactPhone: globalUser.contactPhone || null,
      permissionOverrides: globalUser.permissionOverrides || null,
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
      ...(isAdmin ? ['users' as const] : []),
    ];

    setActiveTab(
      requestedTab && availableTabs.includes(requestedTab as AdminTab)
        ? requestedTab
        : availableTabs[0] || '',
    );
  }, [authenticated, role, tabParam, isAdmin, canPublish, canScore]);

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

  const fetchScoring = useCallback(async () => {
    const res = await apiFetch('/api/scoring?status=all');
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
  }, [authenticated, role, activeTab, isAdmin, canPublish, canScore, activities.length, submissions.length, scoringList.length, users.length, fetchActivities, fetchSubmissions, fetchScoring, fetchUsers]);

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
  }, [activeTab, authenticated, canPublish, canScore, fetchActivities, fetchScoring, fetchSubmissions, fetchUsers, isAdmin, role]);

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

  const handleLogout = async () => {
    await logoutCurrentUser();
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
      canRegisterOtherCollege: 'canRegisterOtherCollege',
      canReviewLeave: 'canReviewLeave',
      canViewEveningStudy: 'canViewEveningStudy',
      canStartGroupLeave: 'canStartGroupLeave',
      canManageAttendanceWork: 'canManageAttendanceWork',
      canUploadLeave: 'canUploadLeave',
      canQueryLeave: 'canQueryLeave',
      canManageOriginalLeave: 'canManageOriginalLeave',
      canSubmitOriginalLeave: 'canSubmitOriginalLeave',
    };
    const apiField = apiFieldMap[permission];
    const targetUser = users.find((item) => item.id === userId);
    const isAutoPermission = targetUser ? isDepartmentAutoPermission(targetUser, permission as PermissionKey) : false;
    try {
      const res = await apiFetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isAutoPermission
          ? { userId, permissionOverrides: { [apiField]: value } }
          : { userId, [apiField]: value }),
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
      // 接口返回的是服务端计算后的完整用户信息。部门负责人切换部门时，
      // 必须同步其中的部门默认权限，否则页面会继续显示旧的权限状态。
      setUsers(previous => previous.map(item => item.id === userId
        ? { ...item, ...(data.data || { department }) }
        : item
      ));
      if (user?.id === userId && data.data) {
        const updatedUser = { ...user, ...data.data };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify({ ...JSON.parse(localStorage.getItem('user') || '{}'), ...data.data }));
      }
    } catch (error) {
      console.error('更新部门失败:', error);
      alert('更新部门失败');
    }
  };

  const handleUpdateContactPhone = async (userId: string, contactPhone: string | null) => {
    const res = await apiFetch('/api/auth', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, contactPhone }) });
    const data = await res.json();
    if (!data.success) { alert(data.error || '更新联系方式失败'); return; }
    setUsers((previous) => previous.map((item) => item.id === userId ? { ...item, contactPhone } : item));
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
  const filteredPendingSubmissions = pendingSubmissions.filter(s => matchesSearch(reviewSearch, [
    s.id,
    s.activity_id,
    s.full_name,
    s.leader_name,
    s.leader_phone,
    s.activity_submitter_name,
    s.activity_submitter_student_id,
    s.category,
    s.category_primary,
    s.category_secondary,
    s.level,
    s.scope_name,
    s.scope_names,
    s.review_status,
  ]));
  const filteredProcessedSubmissions = submissions.filter(s => s.review_status !== '待审核' && matchesSearch(reviewSearch, [
    s.id,
    s.activity_id,
    s.full_name,
    s.leader_name,
    s.leader_phone,
    s.activity_submitter_name,
    s.activity_submitter_student_id,
    s.category,
    s.category_primary,
    s.category_secondary,
    s.level,
    s.scope_name,
    s.scope_names,
    s.review_status,
  ]));
  const filteredScoringList = scoringList.filter(activity => matchesSearch(scoringSearch, [
    activity.id,
    activity.full_name,
    activity.leader_name,
    activity.leader_phone,
    activity.activity_submitter_name,
    activity.activity_submitter_student_id,
    activity.scoring_material_submitter_name,
    activity.scoring_material_submitter_student_id,
    activity.category,
    activity.category_primary,
    activity.category_secondary,
    activity.level,
    activity.scope_name,
    activity.scope_names,
    activity.scoring_status,
  ]));
  const filteredPendingScoring = filteredScoringList.filter(activity => activity.scoring_status === '待赋分');
  const filteredProcessedScoring = filteredScoringList.filter(activity => activity.scoring_status === '已赋分');

  const renderScoringCard = (a: ScoringActivity) => {
    const isExpanded = expandedScoring === a.id;
    const canConfirm = Boolean(a.scoring_table_url) && (a.level !== '校级' || Boolean(a.record_photo_url));

    return (
      <article key={a.id} className={cn(
        'overflow-hidden rounded-xl border bg-white shadow-sm transition-colors',
        a.scoring_status === '待赋分' ? 'border-amber-200' : 'border-slate-200',
      )}>
        <button
          type="button"
          onClick={() => setExpandedScoring(isExpanded ? null : a.id)}
          className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
          aria-expanded={isExpanded}
          aria-controls={`scoring-detail-${a.id}`}
        >
          <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold text-slate-950">{a.full_name}</span>
                {a.scope_type === 'other_college' && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                    其他学院登记 · 主办：{a.scope_name || '未填写'}
                  </span>
                )}
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[a.scoring_status] || 'bg-slate-100 text-slate-700')}>
                {a.scoring_status}
              </span>
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-mono tabular-nums text-slate-600">{a.id}</span>
              <CategoryBadge category={a.category} primary={a.category_primary} secondary={a.category_secondary} topLevelOnly />
              <span>{a.level}</span>
              <ActivityLeaderDetails record={a} compact />
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-slate-400">
            {isExpanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            <span className="sr-only">{isExpanded ? '收起详情' : '展开详情'}</span>
          </span>
        </button>
        {isExpanded && (
          <div id={`scoring-detail-${a.id}`} className="border-t border-slate-200 bg-slate-50/70 px-4 pb-4 pt-4">
            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
              <span>活动时间：{formatDateTime(a.start_time)} 至 {formatDateTime(a.end_time)}</span>
              <span className="text-sky-700">活动报名时间：{a.registration_start_time && a.registration_end_time ? `${formatDateTime(a.registration_start_time)} 至 ${formatDateTime(a.registration_end_time)}` : '未填写（历史记录）'}</span>
              <span className="flex items-center gap-2">分类：<CategoryBadge category={a.category} primary={a.category_primary} secondary={a.category_secondary} /></span>
              <span>{formatActivityScopes(a)}</span>
              <ActivityLeaderDetails record={a} />
              <span>实际赋分材料提交人：{a.scoring_material_submitter_name || '-'}{a.scoring_material_submitter_student_id ? `（${a.scoring_material_submitter_student_id}）` : ''}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-4 text-sm">
              {a.scope_type === 'other_college' && <div className="flex flex-wrap items-center gap-2"><Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">其他学院登记</Badge><span className="text-sm text-slate-600">主办学院：{a.scope_name || '未填写'}</span></div>}
              <div className="flex items-center gap-2"><span className="text-slate-500">赋分表：</span>{a.scoring_table_url ? <div className="flex items-center gap-2"><FilePreviewLink url={a.scoring_table_url} fileName={a.scoring_table_file_name} label="查看赋分表" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50" /><a href={a.scoring_table_url} download className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"><Download className="size-3" aria-hidden="true" />下载</a></div> : <span className="text-xs text-red-600">负责人尚未上传赋分表</span>}</div>
              {a.level === '校级' && <div className="flex items-center gap-2"><span className="text-slate-500">备案表照片：</span>{a.record_photo_url ? <div className="flex items-center gap-2"><FilePreviewLink url={a.record_photo_url} fileName={a.record_photo_file_name} label="查看备案表照片" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50" /><a href={a.record_photo_url} download className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"><Download className="size-3" aria-hidden="true" />下载</a></div> : <span className="text-xs text-red-600">未上传备案表照片（无法赋分）</span>}</div>}
            </div>
            {a.scoring_status === '待赋分' && <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4"><Button type="button" onClick={() => handleScoring(a.id, a.level)} disabled={scoringInProgress || !canConfirm} className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{scoringInProgress ? '处理中...' : '确认赋分'}</Button>{!canConfirm && <span className="text-xs text-amber-700">请等待负责人上传完整材料</span>}</div>}
          </div>
        )}
      </article>
    );
  };

  if (!initialized || !authResolved) {
    return <AuthLoadingScreen />;
  }

  // Login modal when not authenticated
  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
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
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-teal-700">管理工作台</p>
              <h1 className="mt-1 text-balance text-2xl font-semibold text-slate-950 sm:text-3xl">{activeTabLabel || ROLE_LABELS[role!]}</h1>
              <p className="mt-2 max-w-2xl text-pretty text-sm text-slate-500">集中处理活动、审核、赋分和请假记录。选择一项工作开始处理。</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="block text-xs text-slate-500">当前身份</span>
              <span className="mt-1 block font-medium text-slate-900">{user?.name || ROLE_LABELS[role!]}</span>
            </div>
          </div>
        </header>

        {/* Tabs Navigation */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <nav className="flex gap-1 overflow-x-auto p-2" aria-label="管理功能" role="tablist">
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`admin-panel-${tab.key}`}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:px-4 ${
                  activeTab === tab.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <tab.icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    activeTab === tab.key ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600'
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
              <section id="admin-panel-activities" role="tabpanel" aria-label="活动总表" className="space-y-5">
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-teal-700">活动台账</p>
                    <h2 className="text-balance text-xl font-semibold text-slate-950">活动总表</h2>
                    <p className="text-sm text-slate-500">查看活动状态、材料和负责人信息，支持直接编辑或删除。</p>
                  </div>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <div className="relative min-w-0 sm:w-64">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        type="text"
                        placeholder="搜索活动..."
                        aria-label="搜索活动"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                      />
                    </div>
                    <select aria-label="按分类筛选" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20">
                      <option value="">全部分类</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select aria-label="按活动状态筛选" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20">
                      <option value="">全部状态</option>
                      <option value="正常活动">正常活动</option>
                      <option value="活动取消">活动取消</option>
                    </select>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
                  >
                    <Plus className="size-4" aria-hidden="true" /> 新增活动
                  </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['活动总数', activities.length, 'text-slate-950'],
                    ['正常活动', activities.filter(activity => activity.status === '正常活动').length, 'text-emerald-700'],
                    ['活动取消', activities.filter(activity => activity.status === '活动取消').length, 'text-red-700'],
                    ['待赋分', activities.filter(activity => (activity.scoring_status || '待赋分') === '待赋分').length, 'text-amber-700'],
                  ].map(([label, value, color]) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', color)}>{value}</p>
                    </div>
                  ))}
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

                <div className="space-y-3">
                  {filteredActivities.map(a => {
                    const isExpanded = expandedActivity === a.id;
                    return (
                      <article key={a.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center gap-3 p-4">
                          <button
                            type="button"
                            onClick={() => setExpandedActivity(isExpanded ? null : a.id)}
                            className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
                            aria-expanded={isExpanded}
                            aria-controls={`activity-detail-${a.id}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-950">{a.full_name}</span>
                              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className="font-mono tabular-nums text-slate-600">{a.id}</span>
                                <CategoryBadge category={a.category} primary={a.category_primary} secondary={a.category_secondary} topLevelOnly />
                                <span>{a.level}</span>
                                <ActivityLeaderDetails record={a} compact />
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] || 'bg-slate-100 text-slate-700'}`}>{a.status}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.scoring_status] || 'bg-slate-100 text-slate-700'}`}>{a.scoring_status || '待赋分'}</span>
                              {isExpanded ? <ChevronUp className="size-4 text-slate-400" aria-hidden="true" /> : <ChevronDown className="size-4 text-slate-400" aria-hidden="true" />}
                            </span>
                          </button>
                          <div className="flex shrink-0 gap-1">
                            <button type="button" onClick={() => setEditActivity(a)} aria-label={`编辑${a.full_name}`} className="rounded-lg p-2 text-slate-400 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"><Pencil className="size-4" aria-hidden="true" /></button>
                            <button type="button" onClick={() => handleDeleteActivity(a.id)} aria-label={`删除${a.full_name}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"><Trash2 className="size-4" aria-hidden="true" /></button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div id={`activity-detail-${a.id}`} className="border-t border-slate-200 bg-slate-50/70 px-4 pb-4 pt-4">
                            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                              <span>活动时间：{formatDateTime(a.start_time)} 至 {formatDateTime(a.end_time)}</span>
                              <span className="text-sky-700">活动报名时间：{a.registration_start_time && a.registration_end_time ? `${formatDateTime(a.registration_start_time)} 至 ${formatDateTime(a.registration_end_time)}` : '未填写（历史记录）'}</span>
                              <span className="flex items-center gap-2">分类：<CategoryBadge category={a.category} primary={a.category_primary} secondary={a.category_secondary} /></span>
                              <span>活动级别：{a.level}</span>
                              <span>{formatActivityScopes(a)}</span>
                              <ActivityLeaderDetails record={a} />
                              <span>实际活动信息提交人：{a.activity_submitter_name || '-'}{a.activity_submitter_student_id ? `（${a.activity_submitter_student_id}）` : ''}</span>
                              <span>实际赋分材料提交人：{a.scoring_material_submitter_name || '-'}{a.scoring_material_submitter_student_id ? `（${a.scoring_material_submitter_student_id}）` : ''}</span>
                              <span>活动状态：{a.status}</span>
                              <span>赋分状态：{a.scoring_status || '待赋分'}</span>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                              {a.plan_file_url ? <FilePreviewLink url={a.plan_file_url} fileName={a.plan_file_name} label="策划书" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50" /> : <span className="text-xs text-slate-400">未上传策划书</span>}
                              {a.record_file_url ? <FilePreviewLink url={a.record_file_url} fileName={a.record_file_name} label="备案表" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50" /> : <span className="text-xs text-slate-400">未上传备案表</span>}
                              {a.scoring_table_url ? <FilePreviewLink url={a.scoring_table_url} fileName={a.scoring_table_file_name} label="赋分表" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50" /> : <span className="text-xs text-slate-400">未上传赋分表</span>}
                              {a.level === '校级' && (a.record_photo_url ? <FilePreviewLink url={a.record_photo_url} fileName={a.record_photo_file_name} label="备案表照片" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50" /> : <span className="text-xs text-slate-400">未上传备案表照片</span>)}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {filteredActivities.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-12 text-center text-slate-500"><p className="font-medium text-slate-700">暂无活动数据</p><p className="mt-1 text-sm">可以调整筛选条件，或点击“新增活动”创建第一条记录。</p></div>}
                </div>
              </section>
            )}

            {/* ===== 活动审核 ===== */}
            {activeTab === 'review' && canPublish && (
              <section id="admin-panel-review" role="tabpanel" aria-label="活动审核" className="space-y-5">
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
                  <div>
                    <p className="text-sm font-medium text-teal-700">提交审核</p>
                    <h2 className="mt-1 text-balance text-xl font-semibold text-slate-950">活动审核</h2>
                    <p className="mt-2 text-sm text-slate-500">核对活动信息与附件后，决定是否通过本次提交。</p>
                  </div>
                  <div className="relative w-full sm:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="search"
                      aria-label="搜索活动审核记录"
                      placeholder="搜索活动名称、活动 ID、负责人或提交人"
                      value={reviewSearch}
                      onChange={event => setReviewSearch(event.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {filteredPendingSubmissions.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-950">待审核</h3><p className="mt-1 text-sm text-slate-500">需要你处理的活动提交</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-amber-800">{filteredPendingSubmissions.length}</span></div>
                    <div className="space-y-2">
                      {filteredPendingSubmissions.map(s => {
                        const isExpanded = expandedSubmission === s.id;
                        return (
                          <div key={s.id} className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
                            <button type="button" onClick={() => setExpandedSubmission(isExpanded ? null : s.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-amber-50">
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-gray-900">{s.full_name}</span>
                                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500"><span>{s.leader_name}</span><span>{s.level}</span><CategoryBadge category={s.category} primary={s.category_primary} secondary={s.category_secondary} topLevelOnly /><span>提交于 {formatDateTime(s.created_at)}</span></span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2 text-xs text-amber-700"><span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium">待审核</span>{isExpanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}</span>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-amber-200 px-3 pb-3 pt-3">
                                <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                                  <span>活动时间：{formatDateTime(s.start_time)} 至 {formatDateTime(s.end_time)}</span>
                                  <span className="text-sky-700">活动报名时间：{s.registration_start_time && s.registration_end_time ? `${formatDateTime(s.registration_start_time)} 至 ${formatDateTime(s.registration_end_time)}` : '未填写（历史记录）'}</span>
                                  <span className="flex items-center gap-2"><span>分类</span><CategoryBadge category={s.category} primary={s.category_primary} secondary={s.category_secondary} /></span>
                                  <span>活动级别：{s.level}</span>
                                  <ActivityLeaderDetails record={s} />
                                  <span>{formatActivityScopes(s)}</span>
                                  <span>实际活动信息提交人：{s.activity_submitter_name || '-'}{s.activity_submitter_student_id ? `（${s.activity_submitter_student_id}）` : ''}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {s.plan_file_url ? <FilePreviewLink url={s.plan_file_url} fileName={s.plan_file_name} label="策划书" className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50" /> : <span className="text-xs text-gray-400">未上传策划书</span>}
                                  {s.record_file_url ? <FilePreviewLink url={s.record_file_url} fileName={s.record_file_name} label="备案表" className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50" /> : <span className="text-xs text-gray-400">未上传备案表</span>}
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-3">
                                  <input type="text" placeholder="审核备注（可选）" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} className="min-w-48 flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#1e3a5f] focus:outline-none" />
                                  <button onClick={() => handleReviewSubmission(s.id, '已通过')} className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"><Check className="size-3" />通过</button>
                                  <button onClick={() => handleReviewSubmission(s.id, '已驳回')} className="flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"><X className="size-3" />驳回</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredProcessedSubmissions.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-950">已处理</h3><p className="mt-1 text-sm text-slate-500">历史审核结果可展开查看详情</p></div><span className="rounded-full bg-slate-200 px-2.5 py-1 text-sm font-semibold tabular-nums text-slate-700">{filteredProcessedSubmissions.length}</span></div>
                    <div className="space-y-2">
                      {filteredProcessedSubmissions.map(s => {
                        const isExpanded = expandedSubmission === s.id;
                        return (
                          <div key={s.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <button type="button" onClick={() => setExpandedSubmission(isExpanded ? null : s.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-gray-50" aria-expanded={isExpanded}>
                              <span className="min-w-0"><span className="block truncate font-medium text-gray-900">{s.full_name}</span><span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500"><span>{s.leader_name}</span><CategoryBadge category={s.category} primary={s.category_primary} secondary={s.category_secondary} topLevelOnly /><span>{s.level}</span><span>{formatActivityScopes(s)}</span><span>实际活动信息提交人：{s.activity_submitter_name || '-'}</span></span></span>
                              <span className="flex shrink-0 items-center gap-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.review_status as ReviewStatus]}`}>{s.review_status}</span>{isExpanded ? <ChevronUp className="size-4 text-gray-400" /> : <ChevronDown className="size-4 text-gray-400" />}</span>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-gray-100 bg-gray-50/60 px-3 pb-3 pt-3">
                                <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                                  <span>活动时间：{formatDateTime(s.start_time)} 至 {formatDateTime(s.end_time)}</span>
                                  <span className="text-sky-700">活动报名时间：{s.registration_start_time && s.registration_end_time ? `${formatDateTime(s.registration_start_time)} 至 ${formatDateTime(s.registration_end_time)}` : '未填写（历史记录）'}</span>
                                  <span className="flex items-center gap-2">分类：<CategoryBadge category={s.category} primary={s.category_primary} secondary={s.category_secondary} /></span>
                                  <span>活动级别：{s.level}</span>
                                  <ActivityLeaderDetails record={s} />
                                  <span>{formatActivityScopes(s)}</span>
                                  <span>实际活动信息提交人：{s.activity_submitter_name || '-'}{s.activity_submitter_student_id ? `（${s.activity_submitter_student_id}）` : ''}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-200 pt-3">
                                  {s.plan_file_url ? <FilePreviewLink url={s.plan_file_url} fileName={s.plan_file_name} label="策划书" className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50" /> : <span className="text-xs text-gray-400">未上传策划书</span>}
                                  {s.record_file_url ? <FilePreviewLink url={s.record_file_url} fileName={s.record_file_name} label="备案表" className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-[#1e3a5f] hover:bg-blue-50" /> : <span className="text-xs text-gray-400">未上传备案表</span>}
                                  {s.review_note && <span className="text-xs text-gray-500">备注：{s.review_note}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {submissions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-12 text-center text-slate-500"><p className="font-medium text-slate-700">暂无提交记录</p><p className="mt-1 text-sm">新的活动提交会出现在这里。</p></div>
                ) : filteredPendingSubmissions.length === 0 && filteredProcessedSubmissions.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-8 text-center text-gray-500">没有匹配的活动审核记录</div>
                ) : null}
              </section>
            )}

            {/* ===== 活动赋分 ===== */}
            {activeTab === 'scoring' && canScore && (
              <section id="admin-panel-scoring" role="tabpanel" aria-label="活动赋分" className="space-y-5">
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
                  <div>
                    <p className="text-sm font-medium text-teal-700">材料核验</p>
                    <h2 className="mt-1 text-balance text-xl font-semibold text-slate-950">活动赋分</h2>
                    <p className="mt-2 text-sm text-slate-500">按处理状态查看活动，确认材料齐全后完成赋分。</p>
                  </div>
                  <div className="relative w-full sm:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="search"
                      aria-label="搜索活动赋分记录"
                      placeholder="搜索活动名称、活动 ID、负责人或提交人"
                      value={scoringSearch}
                      onChange={event => setScoringSearch(event.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <AlertCircle className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>材料要求：院系级活动仅需上传赋分表；校级活动需同时上传备案表照片和赋分表。</span>
                </p>

                <div className="space-y-5">
                  <section className="rounded-2xl border border-amber-200 bg-amber-50/35 p-4 sm:p-5" aria-labelledby="pending-scoring-title">
                    <div className="mb-4 flex items-center justify-between gap-3"><div><h3 id="pending-scoring-title" className="text-base font-semibold text-slate-950">待赋分</h3><p className="mt-1 text-sm text-slate-500">优先处理已提交完整材料的活动</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-amber-800">{filteredPendingScoring.length}</span></div>
                    <div className="space-y-3">
                      {filteredPendingScoring.map(renderScoringCard)}
                      {filteredPendingScoring.length === 0 && <div className="rounded-xl border border-dashed border-amber-300 bg-white px-3 py-10 text-center text-slate-500"><p className="font-medium text-slate-700">暂无待赋分活动</p><p className="mt-1 text-sm">负责人提交赋分材料后会出现在这里。</p></div>}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 sm:p-5" aria-labelledby="processed-scoring-title">
                    <div className="mb-4 flex items-center justify-between gap-3"><div><h3 id="processed-scoring-title" className="text-base font-semibold text-slate-950">已赋分</h3><p className="mt-1 text-sm text-slate-500">已完成赋分的活动记录</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-emerald-800">{filteredProcessedScoring.length}</span></div>
                    <div className="space-y-3">
                      {filteredProcessedScoring.map(renderScoringCard)}
                      {filteredProcessedScoring.length === 0 && <div className="rounded-xl border border-dashed border-emerald-300 bg-white px-3 py-10 text-center text-slate-500"><p className="font-medium text-slate-700">暂无已赋分记录</p><p className="mt-1 text-sm">完成赋分的活动会保留在这里。</p></div>}
                    </div>
                  </section>
                </div>

              </section>
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
                onUpdateContactPhone={handleUpdateContactPhone}
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
                                    <option value="leader">部门负责人</option>
                                    <option value="class_leader">班级负责人</option>
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
                                    <option value="leader">部门负责人</option>
                                    <option value="class_leader">班级负责人</option>
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
                                    <option value="leader">部门负责人</option>
                                    <option value="class_leader">班级负责人</option>
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
  onUpdateContactPhone,
  onChangePassword,
  onDeleteUser,
}: {
  users: UserData[];
  userSearch: string;
  onUserSearchChange: (value: string) => void;
  onUpdatePermission: (userId: string, permission: UserPermission, value: boolean) => Promise<void>;
  onUpdateRole: (userId: string, role: string) => Promise<void>;
  onUpdateDepartment: (userId: string, department: string | null) => Promise<void>;
  onUpdateContactPhone: (userId: string, contactPhone: string | null) => Promise<void>;
  onChangePassword: (userId: string, userName: string) => Promise<void>;
  onDeleteUser: (userId: string, userName: string) => Promise<void>;
}) {
  const [rosterClassName, setRosterClassName] = useState('');
  const [rosterText, setRosterText] = useState('');
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterError, setRosterError] = useState('');
  const [loadingRoster, setLoadingRoster] = useState(false);
  const rosterFileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [rosterDeleteTarget, setRosterDeleteTarget] = useState<RosterStudent | null>(null);
  const [departmentDeleteTarget, setDepartmentDeleteTarget] = useState<DepartmentRecord | null>(null);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [newDepartment, setNewDepartment] = useState('');
  const [departmentError, setDepartmentError] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState<number>(USER_PAGE_SIZE_OPTIONS[0]);

  const filteredUsers = users.filter((item) => {
    const keyword = userSearch.trim();
    return !keyword || item.name.includes(keyword) || item.studentId.includes(keyword) || (item.department || '').includes(keyword) || (item.className || '').includes(keyword);
  });
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const currentUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = filteredUsers.slice((currentUserPage - 1) * userPageSize, currentUserPage * userPageSize);
  const permissions: Array<{ key: UserPermission; label: string }> = [
    { key: 'canUploadLeave', label: '假条上传权限' },
    { key: 'canStartGroupLeave', label: '临时请假权限' },
    { key: 'canManageAttendanceWork', label: '考勤工作安排权限' },
    { key: 'canReviewLeave', label: '假条查对权限' },
    { key: 'canQueryLeave', label: '假条查看权限' },
    { key: 'canSubmitOriginalLeave', label: '提交原假条权限' },
    { key: 'canManageOriginalLeave', label: '假条对比权限' },
    { key: 'canPublish', label: '活动审核权限' },
    { key: 'canScore', label: '活动赋分权限' },
    { key: 'canSubmitScoring', label: '赋分材料权限' },
    { key: 'canRegisterOtherCollege', label: '其他学院登记权限' },
    { key: 'canViewEveningStudy', label: '晚自习查询权限' },
    { key: 'canSubmitActivity', label: '活动提交权限' },
    { key: 'canViewSubmissionStatus', label: '提交状态权限' },
  ];
  const roleTextStyles: Record<string, string> = {
    admin: 'text-red-600',
    leader: 'text-emerald-600',
    class_leader: 'text-sky-600',
    student: 'text-gray-600',
  };
  const roleTextColors: Record<string, string> = {
    admin: '#dc2626',
    leader: '#059669',
    class_leader: '#0284c7',
    student: '#4b5563',
  };

  const getEnabledPermissions = (item: UserData) => permissions.filter((permission) => item.role === 'admin' || item[permission.key]);

  const getPermissionSummary = (item: UserData) => {
    if (item.role === 'admin') return '全部权限';
    const autoKeys = new Set(getDepartmentAutoPermissionKeys(item));
    const overrideLabels = permissions
      .filter((permission) => hasPermissionOverride(item, permission.key as PermissionKey))
      .map((permission) => `${permission.label}${item[permission.key] ? '开' : '关'}`);
    const autoLabels = permissions
      .filter((permission) => autoKeys.has(permission.key as PermissionKey) && !hasPermissionOverride(item, permission.key as PermissionKey))
      .map((permission) => permission.label);
    const manualLabels = permissions
      .filter((permission) => !autoKeys.has(permission.key as PermissionKey) && !hasPermissionOverride(item, permission.key as PermissionKey) && item[permission.key])
      .map((permission) => permission.label);
    const parts: string[] = [];
    if (overrideLabels.length) parts.push(`手动覆盖：${overrideLabels.join('、')}`);
    if (autoLabels.length) parts.push(`部门自动：${autoLabels.join('、')}`);
    if (manualLabels.length) parts.push(`手动：${manualLabels.join('、')}`);
    return parts.length ? parts.join('；') : '未开通功能权限';
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

  useEffect(() => {
    setUserPage(1);
  }, [userSearch]);

  useEffect(() => {
    if (userPage > totalUserPages) setUserPage(totalUserPages);
  }, [totalUserPages, userPage]);

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
    setDepartmentError('');
    try {
      const response = await apiFetch(`/api/departments?id=${encodeURIComponent(department.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '删除部门失败');
      setDepartmentDeleteTarget(null);
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
    setLoadingRoster(true);
    setRosterError('');
    try {
      const parsed = parseRosterWorkbook(await file.arrayBuffer());
      const students = parsed.students.map(({ className, studentId, studentName }) => ({
        class_name: className || rosterClassName.trim(),
        student_id: studentId,
        student_name: studentName,
      }));
      if (!students.length) {
        const details = parsed.errors.slice(0, 3).join('；');
        throw new Error(details ? `未识别到有效学生数据：${details}` : '未识别到有效学生数据，请确认 Excel 中包含学号和姓名列');
      }
      const response = await apiFetch('/api/class-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '导入花名册失败');
      const savedStudents = normalizeRosterStudents(data.data);
      if (!savedStudents.length) throw new Error('服务器未返回已保存的花名册数据，请重试');
      const classNames = [...new Set(savedStudents.map((student) => student.class_name).filter(Boolean))];
      setRosterStudents(savedStudents);
      setRosterClassName(classNames.length === 1 ? classNames[0] : '');
      const skippedRows = parsed.errors.length ? `，${parsed.errors.length} 行因数据不完整未导入` : '';
      setRosterError(`已导入 ${savedStudents.length} 名学生，识别到 ${classNames.length || 1} 个班级${skippedRows}`);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : '导入花名册失败');
    } finally {
      setLoadingRoster(false);
    }
  };

  const roleMeta: Record<string, { label: string; icon: typeof ShieldCheck; badge: string; surface: string; text: string }> = {
    admin: {
      label: '管理员',
      icon: ShieldCheck,
      badge: 'border-red-200 bg-red-50 text-red-700',
      surface: 'border-red-200/80',
      text: 'text-red-600',
    },
    leader: {
      label: '部门负责人',
      icon: UserRound,
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      surface: 'border-emerald-200/80',
      text: 'text-emerald-600',
    },
    class_leader: {
      label: '班级负责人',
      icon: UserRound,
      badge: 'border-sky-200 bg-sky-50 text-sky-700',
      surface: 'border-sky-200/80',
      text: 'text-sky-600',
    },
    student: {
      label: '学生',
      icon: UserRound,
      badge: 'border-slate-200 bg-slate-100 text-slate-600',
      surface: 'border-slate-200',
      text: 'text-slate-600',
    },
  };
  const permissionedUserCount = users.filter((item) => item.role === 'admin' || getEnabledPermissions(item).length > 0).length;
  const roleCounts = {
    admin: users.filter((item) => item.role === 'admin').length,
    leader: users.filter((item) => item.role === 'leader').length,
    class_leader: users.filter((item) => item.role === 'class_leader').length,
    student: users.filter((item) => item.role === 'student').length,
  };
  const rosterClassNames = [...new Set(rosterStudents.map((student) => student.class_name).filter(Boolean))];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Users className="size-4" />
                </div>
                <div>
                  <h2 className="text-balance text-lg font-semibold text-slate-900">用户管理</h2>
                  <p className="text-pretty text-sm text-slate-500">统一维护账号角色、功能权限和人员归属</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs tabular-nums">
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600">共 {users.length} 人</span>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700">已配置权限 {permissionedUserCount} 人</span>
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600">匹配 {filteredUsers.length} 人</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums sm:min-w-72">
              <div className="rounded-lg border border-red-100 bg-red-50/70 px-3 py-2"><div className="font-semibold text-red-700">{roleCounts.admin}</div><div className="mt-0.5 text-red-600/80">管理员</div></div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2"><div className="font-semibold text-emerald-700">{roleCounts.leader}</div><div className="mt-0.5 text-emerald-600/80">负责人</div></div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><div className="font-semibold text-slate-700">{roleCounts.student}</div><div className="mt-0.5 text-slate-500">学生</div></div>
            </div>
          </div>
          <div className="relative mt-5 max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              aria-label="搜索用户"
              placeholder="搜索姓名、学号、部门或班级"
              value={userSearch}
              onChange={(event) => onUserSearchChange(event.target.value)}
              className="h-10 bg-white pl-9"
            />
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {filteredUsers.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {paginatedUsers.map((item) => {
                const meta = roleMeta[item.role] || roleMeta.student;
                const RoleIcon = meta.icon;
                const enabledCount = getEnabledPermissions(item).length;
                const autoPermissionKeys = new Set(getDepartmentAutoPermissionKeys(item));
                return (
                  <article key={item.id} className={cn('rounded-xl border bg-white p-4 shadow-sm', meta.surface)}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-full border bg-white', meta.text, meta.surface)}>
                          <RoleIcon className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-semibold text-slate-900">{item.name || '未命名用户'}</h3>
                            <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                          </div>
                          <p className="mt-1 truncate text-sm text-slate-500 tabular-nums">学号 {item.studentId || '-'}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2 sm:pt-0.5">
                        <Button type="button" variant="outline" size="sm" onClick={() => void onChangePassword(item.id, item.name)}>
                          <KeyRound className="size-3.5" />改密
                        </Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteTarget({ id: item.id, name: item.name })}>
                          <Trash2 className="size-3.5" />删除
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 border-y border-slate-100 py-3 sm:grid-cols-2">
                      <label className="min-w-0">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500">角色</span>
                        <select
                          aria-label={`${item.name}的角色`}
                          value={item.role}
                          onChange={(event) => void onUpdateRole(item.id, event.target.value)}
                          className={cn('h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200', meta.text)}
                        >
                          <option value="admin" style={{ color: roleTextColors.admin }}>管理员</option>
                          <option value="leader" style={{ color: roleTextColors.leader }}>部门负责人</option>
                          <option value="class_leader" style={{ color: roleTextColors.class_leader }}>班级负责人</option>
                          <option value="student" style={{ color: roleTextColors.student }}>学生</option>
                        </select>
                      </label>
                      <label className="min-w-0">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500">所属部门</span>
                        <select
                          aria-label={`${item.name}的所属部门`}
                          value={item.department || ''}
                          onChange={(event) => void onUpdateDepartment(item.id, event.target.value || null)}
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                        >
                          <option value="">未设置</option>
                          {departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}
                        </select>
                      </label>
                      <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                        <BookOpen className="size-4 shrink-0 text-slate-400" />
                        <span className="text-xs text-slate-500">所属班级</span>
                        <span className="truncate font-medium">{item.className || '未设置'}</span>
                      </div>
                      {(item.role === 'admin' || item.role === 'leader' || item.canSubmitActivity || item.canSubmitScoring) && <label className="min-w-0 sm:col-span-2">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500">联系方式（手机号/微信号）</span>
                        <input aria-label={`${item.name}的联系方式`} defaultValue={item.contactPhone || ''} onBlur={(event) => void onUpdateContactPhone(item.id, event.target.value.trim() || null)} placeholder="未填写" className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
                      </label>}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-4 text-slate-500" />
                          <h4 className="text-sm font-semibold text-slate-800">功能权限</h4>
                        </div>
                        <span className={cn('text-xs tabular-nums', item.role === 'admin' ? 'text-red-600' : 'text-slate-500')}>
                          {item.role === 'admin' ? '管理员默认全部开启' : `已开启 ${enabledCount}/${permissions.length} 项${autoPermissionKeys.size ? `（含部门自动 ${autoPermissionKeys.size} 项）` : ''}`}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {permissions.map((permission) => {
                          const checked = item.role === 'admin' || Boolean(item[permission.key]);
                          const isAuto = isDepartmentAutoPermission(item, permission.key as PermissionKey);
                          const isOverride = hasPermissionOverride(item, permission.key as PermissionKey);
                          const isDisabled = item.role === 'admin';
                          return (
                            <label key={permission.key} className="flex min-h-9 items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-2.5 py-2">
                              <span className={cn('min-w-0 text-xs', checked ? 'font-medium text-slate-700' : 'text-slate-500')}>
                                {permission.label}
                                {isOverride
                                  ? <span className="ml-1 text-[10px] text-orange-600">覆盖</span>
                                  : isAuto && <span className="ml-1 text-[10px] text-emerald-600">自动</span>}
                              </span>
                              <Switch
                                aria-label={`${item.name}的${permission.label}权限`}
                                checked={checked}
                                disabled={isDisabled}
                                onCheckedChange={(value) => void onUpdatePermission(item.id, permission.key, value)}
                              />
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-3 truncate text-xs text-slate-400" title={getPermissionSummary(item)}>
                        {item.role === 'admin' ? '系统角色拥有全部功能权限' : getPermissionSummary(item)}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 text-center">
              <Search className="size-5 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">没有匹配用户</p>
              <p className="mt-1 text-xs text-slate-500">换一个姓名、学号、部门或班级关键词试试</p>
            </div>
          )}
          {filteredUsers.length > 0 && (
            <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="tabular-nums">
                  显示 {(currentUserPage - 1) * userPageSize + 1}-{Math.min(currentUserPage * userPageSize, filteredUsers.length)} / {filteredUsers.length} 人
                </span>
                <label className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">每页</span>
                  <select
                    aria-label="用户列表每页数量"
                    value={userPageSize}
                    onChange={(event) => {
                      setUserPageSize(Number(event.target.value));
                      setUserPage(1);
                    }}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  >
                    {USER_PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option} 人</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="上一页用户"
                  disabled={currentUserPage <= 1}
                  onClick={() => setUserPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="size-4" />
                  <span className="hidden sm:inline">上一页</span>
                </Button>
                <span className="min-w-20 text-center text-sm tabular-nums text-slate-600">第 {currentUserPage} / {totalUserPages} 页</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="下一页用户"
                  disabled={currentUserPage >= totalUserPages}
                  onClick={() => setUserPage((page) => Math.min(totalUserPages, page + 1))}
                >
                  <span className="hidden sm:inline">下一页</span>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Building2 className="size-4" /></div>
          <div>
            <h2 className="text-balance text-base font-semibold text-slate-900">部门维护</h2>
            <p className="mt-1 text-pretty text-sm text-slate-500">部门名称用于活动主办、联办和人员归属选择。</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Input value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} placeholder="输入部门名称" aria-label="新部门名称" className="sm:max-w-sm" />
          <Button type="button" onClick={() => void addDepartment()}><Plus className="size-4" />新增部门</Button>
        </div>
        {departments.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {departments.map((department) => (
              <span key={department.id} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
                {department.name}
                <button type="button" title={`删除${department.name}`} aria-label={`删除${department.name}`} onClick={() => setDepartmentDeleteTarget(department)} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"><X className="size-3.5" /></button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">暂无部门，请先新增一个部门。</p>
        )}
        {departmentError && <p role="alert" className="mt-3 text-sm text-red-600">{departmentError}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><BookOpen className="size-4" /></div>
          <div>
            <h2 className="text-balance text-base font-semibold text-slate-900">班级花名册</h2>
            <p className="mt-1 text-pretty text-sm text-slate-500">为集体请假维护班级成员，重复学号会更新姓名。</p>
          </div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="roster-class-name">查看或手动录入的班级</label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Input id="roster-class-name" type="text" placeholder="例如：计算机2101" value={rosterClassName} onChange={(event) => setRosterClassName(event.target.value)} />
              <Button type="button" variant="outline" onClick={() => void loadRoster()} disabled={loadingRoster} className="shrink-0 lg:w-full">{loadingRoster ? '加载中...' : '查看花名册'}</Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">手动录入或查看已有成员时填写；Excel 导入会自动识别表内班级。</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="roster-text">批量录入（仍需填写班级）</label>
            <textarea id="roster-text" value={rosterText} onChange={(event) => setRosterText(event.target.value)} placeholder={'每行一名学生\n学号,姓名'} className="mt-1.5 min-h-28 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveRoster()} disabled={loadingRoster}><ShieldCheck className="size-4" />保存花名册</Button>
              <Button
                type="button"
                variant="outline"
                disabled={loadingRoster}
                onClick={(event) => {
                  event.stopPropagation();
                  rosterFileInputRef.current?.click();
                }}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Upload className="size-4" />导入 Excel
              </Button>
              <input
                ref={rosterFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  const file = event.target.files?.[0];
                  if (file) void importRosterFile(file);
                  event.target.value = '';
                }}
              />
            </div>
          </div>
        </div>
        {rosterError && <p role="alert" className={cn('mt-3 text-sm', rosterError.startsWith('已导入') ? 'text-emerald-600' : 'text-red-600')}>{rosterError}</p>}

        {rosterStudents.length > 0 ? (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{rosterClassNames.length === 1 ? `${rosterClassNames[0]} 成员` : `已识别 ${rosterClassNames.length} 个班级`}</h3>
              <span className="text-xs text-slate-500 tabular-nums">共 {rosterStudents.length} 人</span>
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2.5 text-left font-medium">班级</th><th className="px-3 py-2.5 text-left font-medium">学号</th><th className="px-3 py-2.5 text-left font-medium">姓名</th><th className="px-3 py-2.5 text-right font-medium">操作</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{rosterStudents.map((student) => <tr key={student.id}><td className="px-3 py-2.5 text-slate-700">{student.class_name}</td><td className="px-3 py-2.5 tabular-nums text-slate-700">{student.student_id}</td><td className="px-3 py-2.5 text-slate-700">{student.student_name}</td><td className="px-3 py-2.5 text-right"><Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setRosterDeleteTarget(student)}><Trash2 className="size-3.5" />移除</Button></td></tr>)}</tbody>
              </table>
            </div>
            <div className="space-y-2 sm:hidden">
              {rosterStudents.map((student) => <div key={student.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{student.student_name}</p><p className="mt-0.5 text-xs text-slate-500">{student.class_name}</p><p className="mt-0.5 text-xs text-slate-500 tabular-nums">{student.student_id}</p></div><Button type="button" variant="ghost" size="sm" className="shrink-0 text-red-600 hover:text-red-700" onClick={() => setRosterDeleteTarget(student)}><Trash2 className="size-3.5" />移除</Button></div>)}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">输入班级名称查看，或直接导入包含“班级、学号、姓名”列的 Excel</div>
        )}
      </section>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除用户</AlertDialogTitle><AlertDialogDescription>将删除“{deleteTarget?.name}”的账号。历史提交记录会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => deleteTarget && void onDeleteUser(deleteTarget.id, deleteTarget.name)} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(departmentDeleteTarget)} onOpenChange={(open) => !open && setDepartmentDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除部门</AlertDialogTitle><AlertDialogDescription>确认删除部门“{departmentDeleteTarget?.name}”？已产生的历史记录不会被删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => departmentDeleteTarget && void deleteDepartment(departmentDeleteTarget)} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(rosterDeleteTarget)} onOpenChange={(open) => !open && setRosterDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>移除花名册成员</AlertDialogTitle><AlertDialogDescription>将从 {rosterDeleteTarget?.class_name} 花名册中移除“{rosterDeleteTarget?.student_name}”。不会删除该学生的账号或历史记录。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void deleteRosterStudent()} className="bg-red-600 hover:bg-red-700">移除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
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
    registration_start_time: activity?.registration_start_time ? activity.registration_start_time.slice(0, 16) : '',
    registration_end_time: activity?.registration_end_time ? activity.registration_end_time.slice(0, 16) : '',
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
          <label className="mb-0.5 block text-xs font-medium text-gray-600">活动开始时间</label>
          <input type="datetime-local" value={form.start_time} onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">活动结束时间</label>
          <input type="datetime-local" value={form.end_time} onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">活动报名开始时间</label>
          <input type="datetime-local" value={form.registration_start_time} onChange={(e) => setForm(f => ({ ...f, registration_start_time: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">活动报名结束时间</label>
          <input type="datetime-local" value={form.registration_end_time} onChange={(e) => setForm(f => ({ ...f, registration_end_time: e.target.value }))}
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
        <button onClick={() => onSubmit({ ...form, start_time: new Date(form.start_time).toISOString(), end_time: new Date(form.end_time).toISOString(), registration_start_time: form.registration_start_time ? new Date(form.registration_start_time).toISOString() : null, registration_end_time: form.registration_end_time ? new Date(form.registration_end_time).toISOString() : null })}
          className="rounded bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1e3a5f]/90">保存</button>
        <button onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">取消</button>
      </div>
    </div>
  );
}

// Wrapper component with Suspense boundary for useSearchParams
export default function AdminPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-slate-50"><div className="text-gray-500">加载中...</div></div>}>
      <AdminPage />
    </Suspense>
  );
}
