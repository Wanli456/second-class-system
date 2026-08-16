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
      // 最少显示100ms，避免闪烁
      const minDisplay = setTimeout(() => {
        setShowLoading(false);
      }, 100);

      return () => clearTimeout(minDisplay);
    } else {
      setShowLoading(false);
    }
  }, [routeChanging]);

  if (!showLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="h-1 bg-teal-600 animate-pulse"></div>
    </div>
  );
}