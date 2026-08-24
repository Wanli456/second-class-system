'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader2, Search, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DepartmentClassRosterManager } from '@/components/DepartmentClassRosterManager';
import { apiFetch } from '@/lib/client-api';
import type { DepartmentUserManagementDepartment } from '@/lib/department-user-management';

type PermissionKey =
  | 'canPublish'
  | 'canScore'
  | 'canSubmitActivity'
  | 'canViewSubmissionStatus'
  | 'canSubmitScoring'
  | 'canRegisterOtherCollege'
  | 'canReviewLeave'
  | 'canViewEveningStudy'
  | 'canStartGroupLeave'
  | 'canManageAttendanceWork'
  | 'canUploadLeave'
  | 'canQueryLeave'
  | 'canManageOriginalLeave'
  | 'canSubmitOriginalLeave';

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  canPublish: '活动审核权限',
  canScore: '活动赋分权限',
  canSubmitActivity: '活动提交权限',
  canViewSubmissionStatus: '查看提交状态权限',
  canSubmitScoring: '赋分材料权限',
  canRegisterOtherCollege: '其他学院登记权限',
  canReviewLeave: '假条查对权限',
  canViewEveningStudy: '晚自习查询权限',
  canStartGroupLeave: '临时请假权限',
  canManageAttendanceWork: '考勤工作安排权限',
  canUploadLeave: '假条上传权限',
  canQueryLeave: '请假查询权限',
  canSubmitOriginalLeave: '提交原假条权限',
  canManageOriginalLeave: '假条对比权限',
};

const PERMISSION_HINTS: Record<PermissionKey, string> = {
  canPublish: '允许查看并审核活动提交材料。',
  canScore: '允许进入活动赋分并确认赋分结果。',
  canSubmitActivity: '允许提交本学院的活动申请与相关材料。',
  canViewSubmissionStatus: '允许查询已提交活动的审核进度和结果。',
  canSubmitScoring: '允许为活动提交赋分表等赋分材料。',
  canRegisterOtherCollege: '允许登记其他学院校级活动的备案表和赋分材料。',
  canReviewLeave: '允许核对假条图片与请假信息是否一致。',
  canViewEveningStudy: '允许查询晚自习请假及班级考勤情况。',
  canStartGroupLeave: '允许发起本班学生的临时或集体请假。',
  canManageAttendanceWork: '允许安排当天各班考勤人员和考勤工作。',
  canUploadLeave: '允许代班级学生上传请假材料。',
  canQueryLeave: '允许查看和查询系统内全部已提交假条。',
  canSubmitOriginalLeave: '允许提交活动方归档用的原假条。',
  canManageOriginalLeave: '允许将上传假条与已归档的活动方原假条进行对比，并维护原假条。',
};

type ManagedUser = {
  id: string;
  name: string;
  studentId: string | null;
  role: string | null;
  department: string | null;
  className: string | null;
  permissions: Partial<Record<PermissionKey, boolean>>;
};

function roleLabel(role: string | null) {
  return role === 'leader' ? '部门负责人' : role === 'class_leader' ? '班级负责人' : '成员';
}
export function DepartmentUsers({ managedDepartment }: { managedDepartment?: DepartmentUserManagementDepartment }) {
  const router = useRouter();
  const [department, setDepartment] = useState('');
  const [permissionKeys, setPermissionKeys] = useState<PermissionKey[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [roleChanges, setRoleChanges] = useState<Record<string, 'student' | 'class_leader'>>({});
  const [nameQuery, setNameQuery] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const redirectToLogin = () => {
    window.localStorage.removeItem('user');
    router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
  };

  useEffect(() => {
    const storedUser = window.localStorage.getItem('user');
    if (!storedUser) {
      redirectToLogin();
      return;
    }

    const endpoint = managedDepartment
      ? '/api/department-users?department=' + encodeURIComponent(managedDepartment)
      : '/api/department-users';

    apiFetch(endpoint)
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
        if (!res.ok || !data.success) throw new Error(data.error || '加载失败');
        setDepartment(data.data.department || '');
        setPermissionKeys(data.data.permissionKeys || []);
        setUsers(data.data.users || []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [managedDepartment, router]);

  const updatePermission = (userId: string, key: PermissionKey, checked: boolean) => {
    setUsers((current) => current.map((item) => (
      item.id === userId
        ? { ...item, permissions: { ...item.permissions, [key]: checked } }
        : item
    )));
    setMessage('');
  };

  const updateRole = (userId: string, role: 'student' | 'class_leader') => {
    setUsers((current) => current.map((item) => item.id === userId ? { ...item, role } : item));
    setRoleChanges((current) => ({ ...current, [userId]: role }));
    setMessage('');
  };

  const saveUser = async (user: ManagedUser) => {
    setSavingId(user.id);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch('/api/department-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          permissions: user.permissions,
          department: managedDepartment,
          ...(roleChanges[user.id] ? { role: roleChanges[user.id] } : {}),
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (!res.ok || !data.success) throw new Error(data.error || '保存失败');
      if (data.data) {
        setUsers((current) => current.map((item) => item.id === user.id ? data.data : item));
        setRoleChanges((current) => {
          const next = { ...current };
          delete next[user.id];
          return next;
        });
      }
      setMessage('已保存 ' + user.name + ' 的权限');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />正在加载用户列表…</div>;
  }

  const normalizedNameQuery = nameQuery.trim().toLocaleLowerCase();
  const visibleUsers = normalizedNameQuery
    ? users.filter((user) => user.name.toLocaleLowerCase().includes(normalizedNameQuery))
    : users;

  return (
    <main className="text-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100" aria-label="返回首页"><ArrowLeft className="size-4" /></Link>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-700"><ShieldCheck className="size-4" />部门权限管理</div>
              <h1 className="mt-1 text-xl font-bold">{department}用户管理</h1>
              <p className="mt-1 text-sm text-slate-500">学习竞技部可管理所有学生与班级负责人，并设置班级负责人及相关业务权限。</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><Users className="size-4 text-teal-700" />共 {users.length} 人</div>
        </div>

        {!error && (
          <label className="mb-4 flex max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
            <Search className="size-4 shrink-0 text-slate-400" />
            <span className="sr-only">按姓名搜索用户</span>
            <input
              type="search"
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="按姓名搜索用户"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>
        )}

        {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

        {!error && users.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">当前没有可管理的用户。</div>
        ) : !error && visibleUsers.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">未找到姓名包含“{nameQuery.trim()}”的用户。</div>
        ) : (
          <div className="space-y-4">
            {visibleUsers.map((user) => (
              <section key={user.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{user.name}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{roleLabel(user.role)}</span></div>
                    <p className="mt-1 text-xs text-slate-500">学号：{user.studentId || '—'}　班级：{user.className || '—'}{user.department && user.department !== department ? '　部门：' + user.department : ''}</p>
                    {managedDepartment === '学习竞技部' && (
                      <label className="mt-3 flex w-fit items-center gap-2 text-sm text-slate-700">
                        账号角色
                        <select
                          value={user.role === 'class_leader' ? 'class_leader' : 'student'}
                          onChange={(event) => updateRole(user.id, event.target.value as 'student' | 'class_leader')}
                          disabled={savingId === user.id}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                        >
                          <option value="student">学生</option>
                          <option value="class_leader">班级负责人（自动获得假条上传权限）</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <button type="button" onClick={() => saveUser(user)} disabled={savingId === user.id} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {savingId === user.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}保存权限
                  </button>
                </div>
                <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  {permissionKeys.map((key) => (
                    <label key={key} title={PERMISSION_HINTS[key]} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={Boolean(user.permissions[key])} onChange={(event) => updatePermission(user.id, key, event.target.checked)} className="size-4 accent-teal-700" />
                      <span>{PERMISSION_LABELS[key] || key}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {managedDepartment === '学习竞技部' && <DepartmentClassRosterManager onUnauthorized={redirectToLogin} />}
      </div>
    </main>
  );
}
