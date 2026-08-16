import type { Metadata } from 'next';
import './globals.css';
import { HideNButton } from '@/components/HideNButton';
import { UserProvider } from '@/contexts/UserContext';
import { RouteLoadingIndicator } from '@/components/RouteLoadingIndicator';

export const metadata: Metadata = {
  title: '二课活动管理系统',
  description: '第二课堂活动管理与请假申请系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[#f5f5f0] text-gray-900 antialiased">
        <UserProvider>
          <RouteLoadingIndicator />
          {children}
          <HideNButton />
        </UserProvider>
      </body>
    </html>
  );
}
