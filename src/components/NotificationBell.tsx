'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, ExternalLink, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/client-api';
import { getNotificationHref, getNotificationTargetLabel } from '@/lib/notification-links';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  is_read: string;
  related_id?: string | null;
  created_at: string;
}

type DeleteTarget =
  | { type: 'single'; notification: Notification }
  | { type: 'all' };

export function NotificationBell({ userId }: { userId: string | null }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let active = true;

    const fetchNotifications = async () => {
      try {
        const res = await apiFetch(`/api/notifications?userId=${userId}`, { signal: controller.signal });
        const data = await res.json();
        if (active && data.success) {
          setNotifications(data.data);
          setUnreadCount(data.unreadCount);
        }
      } catch (error) {
        if (!controller.signal.aborted) console.error('获取通知失败:', error);
      }
    };

    fetchNotifications();
    // 每 30 秒刷新一次
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [userId]);

  const markAsRead = async (notificationId: string) => {
    try {
      await apiFetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      setNotifications(current => current.map(n =>
        n.id === notificationId ? { ...n, is_read: 'true' } : n
      ));
      setUnreadCount(current => {
        const notification = notifications.find(item => item.id === notificationId);
        return notification?.is_read === 'false' ? Math.max(0, current - 1) : current;
      });
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiFetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, markAllRead: true }),
      });
      setNotifications(notifications.map(n => ({ ...n, is_read: 'true' })));
      setUnreadCount(0);
    } catch (error) {
      console.error('全部标记已读失败:', error);
    }
  };

  const openNotification = async (notification: Notification) => {
    const href = getNotificationHref(notification);
    if (notification.is_read === 'false') await markAsRead(notification.id);
    setIsOpen(false);
    if (href) router.push(href);
  };

  const openDeleteDialog = (target: DeleteTarget) => {
    setDeleteError(null);
    setDeleteTarget(target);
  };

  const deleteNotifications = async () => {
    if (!deleteTarget || !userId) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const body = deleteTarget.type === 'all'
        ? { userId, deleteAll: true }
        : { notificationId: deleteTarget.notification.id };
      const response = await apiFetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '删除通知失败');
      }

      if (deleteTarget.type === 'all') {
        setNotifications([]);
        setUnreadCount(0);
      } else {
        const deletedNotification = deleteTarget.notification;
        setNotifications(current => current.filter(notification => notification.id !== deletedNotification.id));
        if (deletedNotification.is_read === 'false') {
          setUnreadCount(current => Math.max(0, current - 1));
        }
      }
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除通知失败';
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-label={isOpen ? '关闭通知' : '打开通知'}
        aria-expanded={isOpen}
        className="relative size-9 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Bell className="mx-auto size-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 flex max-h-[min(32rem,calc(100dvh-7rem))] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-3">
            <h3 className="font-semibold text-gray-900">通知</h3>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  全部已读
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => openDeleteDialog({ type: 'all' })}
                  type="button"
                  aria-label="清空所有通知"
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                  清空
                </button>
              )}
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="shrink-0 p-4 text-center text-sm text-gray-500">
              暂无通知
            </div>
          ) : (
            <div className="min-h-0 overflow-y-auto divide-y divide-gray-100">
              {notifications.map((notification) => (
                (() => {
                  const href = getNotificationHref(notification);
                  const targetLabel = getNotificationTargetLabel(notification.type);

                  return <div
                    key={notification.id}
                    className={cn(
                      'p-3',
                      notification.is_read === 'false' && 'bg-blue-50',
                    )}
                  >
                  <div className="flex justify-between items-start">
                    <button
                      type="button"
                      disabled={!href}
                      onClick={() => void openNotification(notification)}
                      aria-label={href ? `打开通知“${notification.title}”关联记录` : notification.title}
                      className={cn(
                        'min-w-0 flex-1 text-left',
                        href && 'cursor-pointer rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-600',
                        !href && 'cursor-default',
                      )}
                    >
                      <h4 className="break-words text-pretty text-sm font-medium text-gray-900">
                        {notification.title}
                      </h4>
                      <p className="mt-1 line-clamp-3 break-words text-pretty text-xs text-gray-600">
                        {notification.content}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-gray-400">
                        {new Date(notification.created_at).toLocaleString('zh-CN')}
                      </p>
                      {href && targetLabel && (
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                          <ExternalLink className="size-3.5" />
                          {targetLabel}
                        </span>
                      )}
                      {!href && targetLabel && (
                        <span className="mt-2 inline-flex text-xs text-gray-400">
                          {notification.related_id ? '关联记录暂不可用' : '历史通知未绑定记录'}
                        </span>
                      )}
                    </button>
                    <div className="ml-2 flex shrink-0 items-start gap-1">
                      {notification.is_read === 'false' && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void markAsRead(notification.id);
                          }}
                          type="button"
                          aria-label={`将通知“${notification.title}”标记为已读`}
                          className="size-7 rounded p-1 hover:bg-gray-200"
                        >
                          <Check className="size-4 text-gray-400" />
                        </button>
                      )}
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openDeleteDialog({ type: 'single', notification });
                        }}
                        type="button"
                        aria-label={`删除通知“${notification.title}”`}
                        title="删除通知"
                        className="size-7 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  </div>;
                })()
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === 'all' ? '清空所有通知？' : '删除这条通知？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'all'
                ? '清空后当前账号的所有通知都会被删除，且无法恢复。'
                : '删除后这条通知将从当前账号中移除，且无法恢复。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-red-600" role="alert">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteNotifications();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
