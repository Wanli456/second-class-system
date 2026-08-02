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
  username: string;
  name: string;
  studentId?: string;
  role: string;
  canPublish?: boolean;
  canScore?: boolean;
  canReviewLeave?: boolean;
  canViewEveningStudy?: boolean;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
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
  { label: '活动审核', href: '/admin?role=publisher&tab=submissions', icon: FileCheck, requiredRole: 'publisher', requiredPermission: 'canPublish' },
  { label: '活动赋分', href: '/admin?role=scorer&tab=scoring', icon: Award, requiredRole: 'scorer', requiredPermission: 'canScore' },
  { label: '请假审核', href: '/admin?role=leave_reviewer&tab=leaves', icon: UserCheck, requiredRole: 'leave_reviewer', requiredPermission: 'canReviewLeave' },
  { label: '用户管理', href: '/admin?role=admin&tab=users', icon: Users, requiredRole: 'admin' },
  { label: '活动提交', href: '/submit', icon: Send },
  { label: '提交状态', href: '/submit/status', icon: FileCheck },
  { label: '赋分材料', href: '/submit/scoring', icon: Award },
  { label: '请假申请', href: '/leave', icon: FileCheck },
  { label: '请假状态', href: '/leave/status', icon: FileCheck },
  { label: '晚自习查询', href: '/evening-study', icon: Moon, requiredPermission: 'canViewEveningStudy' },
];

export function DashboardLayout({ children, user, onLogout, title }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  const canAccessItem = (item: NavItem): boolean => {
    if (!user) {
      // Public items
      return !item.requiredRole && !item.requiredPermission;
    }
    if (item.requiredRole && user.role !== 'admin' && user.role !== item.requiredRole) {
      return false;
    }
    if (item.requiredPermission && user.role !== 'admin' && !user[item.requiredPermission]) {
      return false;
    }
    return true;
  };

  const visibleItems = NAV_ITEMS.filter(canAccessItem);

  const handleLogout = () => {
    onLogout();
    router.push('/');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={cn(
        "flex h-16 items-center border-b border-gray-200 px-4",
        collapsed && "justify-center"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">二课活动管理</div>
              <div className="text-xs text-gray-500">University Activity System</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
            <ClipboardList className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '&') || pathname.startsWith(item.href + '?');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => isMobile && setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-teal-50 text-teal-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
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
          "border-t border-gray-200 p-4",
          collapsed && "px-2"
        )}>
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <span className="text-sm font-medium">{user.name?.[0] || user.username?.[0] || 'U'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{user.name || user.username}</div>
                <div className="truncate text-xs text-gray-500">
                  {user.role === 'admin' ? '管理员' : user.role === 'leader' ? '活动负责人' : '学生'}
                </div>
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
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700">
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
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside
          className={cn(
            "flex flex-col border-r border-gray-200 bg-white transition-all duration-300",
            collapsed ? "w-16" : "w-64"
          )}
        >
          {sidebarContent}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-20 -right-3 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-700 shadow-sm"
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
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
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
              <h1 className="text-lg font-semibold text-gray-900">{title || '二课活动管理系统'}</h1>
              <p className="text-xs text-gray-500 hidden sm:block">University Second Classroom Activity Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden sm:flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <span className="text-xs font-medium">{user.name?.[0] || 'U'}</span>
                </div>
                <span className="text-sm font-medium text-gray-700">{user.name || user.username}</span>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
