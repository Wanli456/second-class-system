'use client';

import { usePathname } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { useEffect, useState } from 'react';

export function RouteLoadingIndicator() {
  const pathname = usePathname();
  const { routeChanging } = useUser();
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    // 路由切换时显示loading
    if (routeChanging) {
      setShowLoading(true);
      // 最少显示300ms，避免闪烁
      const minDisplay = setTimeout(() => {
        setShowLoading(false);
      }, 300);

      return () => clearTimeout(minDisplay);
    } else {
      setShowLoading(false);
    }
  }, [routeChanging]);

  if (!showLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-teal-600 border-r-transparent"></div>
        <p className="text-sm font-medium text-gray-600">页面切换中...</p>
      </div>
    </div>
  );
}