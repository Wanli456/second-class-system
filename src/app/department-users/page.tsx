'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader2, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type PermissionKey =
  | 'canPublish'
  | 'canScore'
  | 'canSubmitActivity'
  | 'canViewSubmissionStatus'
  | 'canSubmitScoring'
  | 'canReviewLeave'
  | 'canViewEveningStudy'
  | 'canStartGroupLeave'
  | 'canManageAttendanceWork'
  | 'canUploadLeave'
  | 'canQueryLeave'
  | 'canManageOriginalLeave';

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  canPublish: '活动审核',
  canScore: '活动赋分',
  canSubmitActivity: '活动提交',
  canViewSubmissionStatus: '查看提交状态',
  canSubmitScoring: '提交赋分材料',
  canReviewLeave: '假条查对',
  canViewEveningStudy: '晚自习查询',
  canStartGroupLeave: '发起集体请假',
  canManageAttendanceWork: '考勤工作安排',
  canUploadLeave: '上传请假',
  canQueryLeave: '请假查询',
  canManageOriginalLeave: '原始假条管理',
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

export default function DepartmentUsersPage() {
  const router = useRouter();
  const [department, setDepartment] = useState('');
  const [permissionKeys, setPermissionKeys] = useState<PermissionKey[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const storedUser = window.localStorage.getItem('user');
    if (!storedUser) {
      router.replace('/login?redirect=/department-users');
      return;
    }

    fetch('/api/department-users')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || '加载失败');
        setDepartment(data.data.department || '');
        setPermissionKeys(data.data.permissionKeys || []);
        setUsers(data.data.users || []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [router]);

  const updatePermission = (userId: string, key: PermissionKey, checked: boolean) => {
    setUsers((current) => current.map((item) => (
      item.id === userId
        ? { ...item, permissions: { ...item.permissions, [key]: checked } }
        : item
    )));
    setMessage('');
  };

  const saveUser = async (user: ManagedUser) => {
    setSavingId(user.id);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/department-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, permissions: user.permissions }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '保存失败');
      if (data.data) {
        setUsers((current) => current.map((item) => item.id === user.id ? data.data : item));
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

  return (
    <main className="text-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100" aria-label="返回首页"><ArrowLeft className="size-4" /></Link>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-700"><ShieldCheck className="size-4" />部门权限管理</div>
              <h1 className="mt-1 text-xl font-bold">{department}用户管理</h1>
              <p className="mt-1 text-sm text-slate-500">只能设置当前部门管理范围内用户的本部门权限。</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><Users className="size-4 text-teal-700" />共 {users.length} 人</div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

        {!error && users.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">当前没有可管理的用户。</div>
        ) : (
          <div className="space-y-4">
            {users.map((user) => (
              <section key={user.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{user.name}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{roleLabel(user.role)}</span></div>
                    <p className="mt-1 text-xs text-slate-500">学号：{user.studentId || '—'}　班级：{user.className || '—'}{user.department && user.department !== department ? '　部门：' + user.department : ''}</p>
                  </div>
                  <button type="button" onClick={() => saveUser(user)} disabled={savingId === user.id} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {savingId === user.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}保存权限
                  </button>
                </div>
                <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  {permissionKeys.map((key) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={Boolean(user.permissions[key])} onChange={(event) => updatePermission(user.id, key, event.target.checked)} className="size-4 accent-teal-700" />
                      <span>{PERMISSION_LABELS[key] || key}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
