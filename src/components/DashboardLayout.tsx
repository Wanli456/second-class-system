'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Send,
  Award,
  FileCheck,
  UserCheck,
  Moon,
  Users,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

interface User {
  id: string;
  username?: string;
  name?: string;
  studentId?: string;
  role: string;
  canPublish?: boolean;
  canScore?: boolean;
  canReviewLeave?: boolean;
  canViewEveningStudy?: boolean;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  user?: User | null;
  onLogout?: () => void;
  title?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRole?: string;
  requiredPermission?: keyof User;
}

const NAV_ITEMS: NavItem[] = [
  { label: '首页', href: '/', icon: LayoutDashboard },
  { label: '活动总表', href: '/admin?role=admin&tab=activities', icon: ClipboardList, requiredRole: 'admin' },
  { label: '活动审核', href: '/admin?role=publisher&tab=review', icon: FileCheck, requiredRole: 'publisher', requiredPermission: 'canPublish' },
  { label: '活动赋分', href: '/admin?role=scorer&tab=scoring', icon: Award, requiredRole: 'scorer', requiredPermission: 'canScore' },
  { label: '请假审核', href: '/admin?role=leave_reviewer&tab=leave', icon: UserCheck, requiredRole: 'leave_reviewer', requiredPermission: 'canReviewLeave' },
  { label: '用户管理', href: '/admin?role=admin&tab=users', icon: Users, requiredRole: 'admin' },
  { label: '活动提交', href: '/submit', icon: Send, requiredRole: 'leader', requiredPermission: 'canPublish' },
  { label: '提交状态', href: '/submit/status', icon: FileCheck },
  { label: '赋分材料', href: '/submit/scoring', icon: Award, requiredRole: 'leader', requiredPermission: 'canScore' },
  { label: '请假申请', href: '/leave', icon: FileCheck },
  { label: '请假状态', href: '/leave/status', icon: FileCheck },
  { label: '晚自习查询', href: '/evening-study', icon: Moon, requiredPermission: 'canViewEveningStudy' },
];

export function DashboardLayout({ children, user: providedUser, onLogout, title }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [currentQuery, setCurrentQuery] = React.useState('');
  const [storedUser, setStoredUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    if (providedUser) return;

    const savedUser = localStorage.getItem('user');
    if (!savedUser) return;

    try {
      setStoredUser(JSON.parse(savedUser) as User);
    } catch {
      localStorage.removeItem('user');
    }
  }, [providedUser]);

  React.useEffect(() => {
    setCurrentQuery(window.location.search);
  });

  const user = providedUser ?? storedUser;

  const canAccessItem = (item: NavItem): boolean => {
    if (!user) {
      // Public items
      return !item.requiredRole && !item.requiredPermission;
    }

    const roleAllowed = !item.requiredRole || user.role === 'admin' || user.role === item.requiredRole;
    const permissionAllowed = !item.requiredPermission || user.role === 'admin' || user[item.requiredPermission] === true;

    // A role or its matching permission is enough. This lets an admin grant
    // a capability to a student without changing the student's base role.
    if (item.requiredRole && item.requiredPermission) {
      return roleAllowed || permissionAllowed;
    }

    return roleAllowed && permissionAllowed;
  };

  const visibleItems = NAV_ITEMS.filter(canAccessItem);

  const roleLabel = user?.role === 'admin'
    ? '管理员'
    : user?.role === 'publisher'
      ? '发布干事'
      : user?.role === 'scorer'
        ? '赋分干事'
        : user?.role === 'leave_reviewer'
          ? '请假审核员'
          : user?.role === 'leader'
            ? '活动负责人'
            : '学生';

  const isItemActive = (href: string) => {
    const [itemPath, itemQuery] = href.split('?');
    if (pathname !== itemPath) return false;
    if (!itemQuery) return true;

    const currentSearchParams = new URLSearchParams(currentQuery);
    const expectedQuery = new URLSearchParams(itemQuery);
    return Array.from(expectedQuery.entries()).every(
      ([key, value]) => currentSearchParams.get(key) === value,
    );
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    if (onLogout) {
      onLogout();
    } else {
      setStoredUser(null);
    }
    router.push('/');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      {/* Brand */}
      <div className={cn(
        "flex h-[72px] items-center border-b border-slate-200 px-4",
        collapsed && "justify-center"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <ClipboardList className="h-4 w-4" strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-950">二课活动管理</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Activity Operations</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <ClipboardList className="h-4 w-4" strokeWidth={2.4} />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          工作区
        </div>
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => isMobile && setMobileOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={cn(
                    "h-4 w-4 flex-shrink-0",
                    isActive ? "text-teal-300" : "text-slate-400 group-hover:text-slate-700",
                  )} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      {user && (
        <div className={cn(
          "border-t border-slate-200 p-4",
          collapsed && "px-2"
        )}>
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <span className="text-sm font-medium">{user.name?.[0] || user.username?.[0] || 'U'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{user.name || user.username}</div>
                <div className="truncate text-xs text-slate-500">{roleLabel}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-8 w-8 text-gray-500 hover:text-gray-700"
                title="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <span className="text-sm font-medium">{user.name?.[0] || user.username?.[0] || 'U'}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-8 w-8 text-gray-500 hover:text-gray-700"
                title="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside
          className={cn(
            "relative flex flex-col border-r border-slate-200 bg-white transition-all duration-300",
            collapsed ? "w-16" : "w-64"
          )}
        >
          {sidebarContent}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-[84px] -right-3 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-slate-900"
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <ChevronLeft className={cn("h-3 w-3 transition-transform", collapsed && "rotate-180")} />
          </button>
        </aside>
      )}

      {/* Mobile Sidebar */}
      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>导航菜单</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-4">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                className="text-gray-600"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div>
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-600">二课工作台</p>
              <h1 className="text-lg font-bold tracking-tight text-slate-950">{title || '二课活动管理系统'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden sm:flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  <span className="text-xs font-medium">{user.name?.[0] || 'U'}</span>
                </div>
                <div>
                  <span className="block text-sm font-semibold leading-4 text-slate-800">{user.name || user.username}</span>
                  <span className="block text-[10px] leading-4 text-slate-400">{roleLabel}</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
