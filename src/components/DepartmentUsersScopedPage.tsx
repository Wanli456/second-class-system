'use client';

import { DepartmentUsers } from '@/components/DepartmentUsers';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useUser } from '@/contexts/UserContext';
import { logoutCurrentUser } from '@/lib/client-api';
import { isDepartmentUserManager } from '@/lib/department-user-management';

type Department = '学习竞技部' | '第二课堂认证中心';

type DepartmentUsersScopedPageProps = {
  department: Department;
  title: string;
};

export function DepartmentUsersScopedPage({ department, title }: DepartmentUsersScopedPageProps) {
  const { user, initialized, setUser } = useUser();

  if (!initialized) return <AuthLoadingScreen />;

  const canAccess = user?.role === 'admin' || (isDepartmentUserManager(user) && user?.department === department);
  const handleLogout = async () => {
    await logoutCurrentUser();
    setUser(null);
  };

  return (
    <DashboardLayout user={user} onLogout={handleLogout} title={title}>
      {canAccess ? (
        <DepartmentUsers managedDepartment={department} />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-balance text-lg font-semibold text-slate-950">无权访问该部门页面</h2>
          <p className="mt-2 text-pretty text-sm leading-6 text-slate-500">此页面仅供{department}部门负责人或归属该部门的管理员使用。</p>
        </section>
      )}
    </DashboardLayout>
  );
}
