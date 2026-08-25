'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { refreshCurrentUser } from '@/lib/client-api';

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
  canRegisterOtherCollege?: boolean;
  canReviewLeave?: boolean;
  canViewEveningStudy?: boolean;
  canStartGroupLeave?: boolean;
  canManageAttendanceWork?: boolean;
  canUploadLeave?: boolean;
  canQueryLeave?: boolean;
  canManageOriginalLeave?: boolean;
  canSubmitOriginalLeave?: boolean;
  department?: string | null;
  className?: string | null;
  contactPhone?: string | null;
  permissionOverrides?: string | null;
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  initialized: boolean;  // 新增：标记用户状态是否已初始化
  routeChanging: boolean;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  setRouteChanging: (changing: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

function readStoredUser(): User | null {
  if (typeof window === 'undefined') return null;

  try {
    const savedUser = window.localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) as User : null;
  } catch {
    window.localStorage.removeItem('user');
    return null;
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [routeChanging, setRouteChanging] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeUser = async () => {
      const storedUser = readStoredUser();
      if (storedUser) setUser(storedUser);

      try {
        const currentUser = await refreshCurrentUser<User>();
        if (!cancelled) setUser(currentUser);
      } finally {
        if (!cancelled) setInitialized(true);
      }
    };

    void initializeUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUser = async () => {
    setLoading(true);
    try {
      const currentUser = await refreshCurrentUser<User>();
      setUser(currentUser);
    } catch (error) {
      console.error('刷新用户信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 设置定时刷新（每5分钟刷新一次用户信息）
    const interval = setInterval(() => {
      refreshUser();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, initialized, routeChanging, refreshUser, setUser, setRouteChanging }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

// 用于页面级的loading状态
export function usePageLoading() {
  const { loading } = useUser();
  return { pageLoading: loading };
}
