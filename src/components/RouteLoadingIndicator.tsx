'use client';

import { usePathname } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { useEffect, useRef } from 'react';

export function RouteLoadingIndicator() {
  const pathname = usePathname();
  const { routeChanging, setRouteChanging } = useUser();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setRouteChanging(false);
    }
  }, [pathname, setRouteChanging]);

  if (!routeChanging) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-teal-100" aria-label="页面加载中" role="progressbar">
      <div className="route-progress-bar h-full w-1/3 bg-teal-600" />
    </div>
  );
}
