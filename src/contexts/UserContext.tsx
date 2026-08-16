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
  canReviewLeave?: boolean;
  canViewEveningStudy?: boolean;
  sessionToken?: string;
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  routeChanging: boolean;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  setRouteChanging: (changing: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  // 同步从 localStorage 初始化用户状态，避免页面切换时的加载闪烁
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) as User : null;
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [routeChanging, setRouteChanging] = useState(false);

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
    <UserContext.Provider value={{ user, loading, routeChanging, refreshUser, setUser, setRouteChanging }}>
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