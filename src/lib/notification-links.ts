interface NotificationLinkInput {
  type: string;
  related_id?: string | null;
}

const TARGET_LABELS: Record<string, string> = {
  leave_approved: '查看请假记录',
  leave_rejected: '查看请假记录',
  activity_approved: '查看活动记录',
  activity_rejected: '查看活动提交',
  activity_scored: '查看赋分记录',
};

export function getNotificationTargetLabel(type: string): string | null {
  return TARGET_LABELS[type] || null;
}

export function getNotificationHref(notification: NotificationLinkInput): string | null {
  const relatedId = notification.related_id?.trim();
  if (!relatedId) return null;

  const encodedId = encodeURIComponent(relatedId);
  switch (notification.type) {
    case 'leave_approved':
    case 'leave_rejected':
      return `/leave/status?requestId=${encodedId}`;
    case 'activity_approved':
      return `/submit/status?activityId=${encodedId}`;
    case 'activity_rejected':
      return `/submit/status?submissionId=${encodedId}`;
    case 'activity_scored':
      return `/submit/scoring?activityId=${encodedId}`;
    default:
      return null;
  }
}
