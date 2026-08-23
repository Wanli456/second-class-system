'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { useUser } from '@/contexts/UserContext';
import { NotificationBell } from '@/components/NotificationBell';

interface User {
  id: string;
  username?: string;
  name?: string;
  studentId?: string;
  role: string;
  canPublish?: boolean;
  canScore?: boolean;
  canSubmitActivity?: boolean;
  canViewSubmissionStatus?: boolean;
  canSubmitScoring?: boolean;
  canReviewLeave?: boolean;
  canViewEveningStudy?: boolean;
  canStartGroupLeave?: boolean;
  canManageAttendanceWork?: boolean;
  canUploadLeave?: boolean;
  canQueryLeave?: boolean;
  canManageOriginalLeave?: boolean;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  user?: User | null;
  onLogout?: () => void;
  title?: string;
  activeNavHref?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRole?: string;
  requiredPermission?: keyof User;
  requiredAnyPermissions?: Array<keyof User>;
}

// 独立的导航项组件，使用 React.memo 避免不必要的重新渲染
const NavItemComponent = React.memo(({
  item,
  isActive,
  collapsed,
  isMobile,
  onMobileClose,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  isMobile: boolean;
  onMobileClose: () => void;
  onNavigate: (href: string) => void;
}) => {
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        onClick={(event) => {
          if (isMobile) onMobileClose();

          // Preserve normal browser behaviors such as opening a link in a new tab.
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) return;

          event.preventDefault();
          if (!isActive) onNavigate(item.href);
        }}
        className={cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-slate-900 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
          collapsed && "justify-center px-2"
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon className={cn(
          "size-4 flex-shrink-0",
          isActive ? "text-teal-300" : "text-slate-400 group-hover:text-slate-700",
        )} />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    </li>
  );
});

NavItemComponent.displayName = 'NavItemComponent';

const NAV_ITEMS: NavItem[] = [
  { label: '首页', href: '/', icon: LayoutDashboard },
  { label: '活动总表', href: '/admin?role=admin&tab=activities', icon: ClipboardList, requiredRole: 'admin' },
  { label: '活动审核', href: '/admin?role=admin&tab=review', icon: FileCheck, requiredPermission: 'canPublish' },
  { label: '活动赋分', href: '/admin?role=admin&tab=scoring', icon: Award, requiredPermission: 'canScore' },
  { label: '用户管理', href: '/admin?role=admin&tab=users', icon: Users, requiredRole: 'admin' },
  { label: '活动提交', href: '/submit', icon: Send, requiredPermission: 'canSubmitActivity' },
  { label: '提交状态', href: '/submit/status', icon: FileCheck, requiredPermission: 'canViewSubmissionStatus' },
  { label: '赋分材料', href: '/submit/scoring', icon: Award, requiredPermission: 'canSubmitScoring' },
  { label: '我的假条', href: '/leave-slip/mine', icon: FileCheck },
  { label: '假条上传', href: '/leave-slip/upload', icon: FileCheck, requiredPermission: 'canUploadLeave' },
  { label: '临时请假', href: '/leave-slip/temporary', icon: Send, requiredPermission: 'canStartGroupLeave' },
  { label: '假条查对', href: '/leave-slip/review', icon: UserCheck, requiredPermission: 'canReviewLeave' },
  { label: '假条查询', href: '/leave-slip/query', icon: Moon, requiredPermission: 'canQueryLeave' },
  { label: '原假条', href: '/leave-slip/originals', icon: FileCheck, requiredPermission: 'canManageOriginalLeave' },
  { label: '考勤工作安排', href: '/attendance-work', icon: ClipboardList, requiredAnyPermissions: ['canManageAttendanceWork', 'canReviewLeave'] },
  { label: '晚自习查询', href: '/evening-study', icon: Moon, requiredAnyPermissions: ['canViewEveningStudy', 'canQueryLeave'] },
];

export function DashboardLayout({ children, user: providedUser, onLogout, title, activeNavHref }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [pendingNavHref, setPendingNavHref] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  // 使用全局用户状态，避免重复API调用和跨页面卡顿
  const globalUser = useUser();
  const { setRouteChanging } = globalUser;
  const user = providedUser ?? globalUser.user;

  // 使用 Next.js useSearchParams 替代 window.location.search，避免同步阻塞
  const currentSearchParams = React.useMemo(() => searchParams, [searchParams]);
  const currentRoute = `${pathname}?${currentSearchParams.toString()}`;
  const previousRoute = React.useRef(currentRoute);

  React.useEffect(() => {
    if (previousRoute.current === currentRoute) return;
    previousRoute.current = currentRoute;
    setPendingNavHref(null);
    setRouteChanging(false);
  }, [currentRoute, setRouteChanging]);

  const canAccessItem = React.useCallback((item: NavItem): boolean => {
    if (!user) {
      // 未登录时只保留首页，避免公开侧边栏展示权限敏感或需登录的项目。
      return item.label === '首页';
    }

    const roleAllowed = !item.requiredRole || user.role === 'admin' || user.role === item.requiredRole;
    const permissionAllowed = !item.requiredPermission || user.role === 'admin' || user[item.requiredPermission] === true;
    const anyPermissionAllowed = !item.requiredAnyPermissions?.length || user.role === 'admin' || item.requiredAnyPermissions.some((permission) => user[permission] === true);

    // A role or its matching permission is enough. This lets an admin grant
    // a capability to a student without changing the student's base role.
    if (item.requiredRole && item.requiredPermission) {
      return roleAllowed || permissionAllowed;
    }

    return roleAllowed && permissionAllowed && anyPermissionAllowed;
  }, [user]);

  const visibleItems = React.useMemo(() => NAV_ITEMS.filter(canAccessItem), [canAccessItem]);

  const getNavGroup = (href: string) => {
    if (href === '/') return '工作台';
    if (href.startsWith('/leave-slip')) return '假条管理';
    if (href.startsWith('/leave')) return '请假';
    if (href.startsWith('/submit')) return '活动';
    if (href.startsWith('/admin')) return '管理';
    return '查询';
  };

  const roleLabel = React.useMemo(() => {
    if (!user) return '访客';
    switch (user.role) {
      case 'admin': return '系统管理员';
      case 'leader': return '部门负责人';
      case 'class_leader': return '班级负责人';
      case 'student': return '学生';
      default: return '学生';
    }
  }, [user]);

  // 使用useMemo缓存所有导航项的激活状态，避免每次渲染都重复计算
  const activeItemsMap = React.useMemo(() => {
    const map = new Map<string, boolean>();

    NAV_ITEMS.forEach(item => {
      if (activeNavHref) {
        map.set(item.href, item.href === activeNavHref);
        return;
      }

      const [itemPath, itemQuery] = item.href.split('?');
      if (pathname !== itemPath) {
        map.set(item.href, false);
        return;
      }
      if (!itemQuery) {
        map.set(item.href, true);
        return;
      }

      const expectedQuery = new URLSearchParams(itemQuery);
      const isActive = Array.from(expectedQuery.entries()).every(
        ([key, value]) => currentSearchParams.get(key) === value,
      );
      map.set(item.href, isActive);
    });

    return map;
  }, [pathname, activeNavHref, currentSearchParams]);

  const isItemActive = (href: string) => activeItemsMap.get(href) ?? false;

  const handleNavigation = React.useCallback((href: string) => {
    setPendingNavHref(href);
    setRouteChanging(true);
    startTransition(() => router.push(href));
  }, [router, setRouteChanging, startTransition]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    if (onLogout) {
      onLogout();
    } else {
      globalUser.setUser(null);
    }
    startTransition(() => {
      router.push('/');
    });
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
              <div className="text-sm font-bold text-slate-950">二课活动管理</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase text-slate-400">Activity Operations</div>
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
        <div className="mb-3 px-3 text-[10px] font-bold uppercase text-slate-400">
          工作区
        </div>
        <ul className="space-y-1">
          {visibleItems.map((item, index) => {
            const isActive = isItemActive(item.href);
            return (
              <React.Fragment key={item.href}>
                {!collapsed && (index === 0 || getNavGroup(item.href) !== getNavGroup(visibleItems[index - 1].href)) && (
                  <li className={cn("px-3 pb-1 text-[10px] font-semibold text-slate-400", index > 0 && "pt-4")}>
                    {getNavGroup(item.href)}
                  </li>
                )}
                <NavItemComponent
                  item={item}
                  isActive={pendingNavHref ? pendingNavHref === item.href : isActive}
                  collapsed={collapsed}
                  isMobile={isMobile}
                  onMobileClose={() => setMobileOpen(false)}
                  onNavigate={handleNavigation}
                />
              </React.Fragment>
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
                aria-label="退出登录"
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
                aria-label="退出登录"
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
    <div className="fixed inset-0 flex h-dvh min-h-0 w-full overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside
          className={cn(
            "relative flex flex-col border-r border-slate-200 bg-white transition-all duration-300",
            collapsed ? "w-16" : "w-60"
          )}
        >
          {sidebarContent}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-[84px] -right-3 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-slate-900"
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-4">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                className="text-gray-600"
                aria-label="打开导航菜单"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div>
              <p className="mb-0.5 text-[10px] font-bold uppercase text-teal-600">二课工作台</p>
              <h1 className="text-lg font-bold text-slate-950">{title || '二课活动管理系统'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell userId={user?.id ?? null} />
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
        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
