export type ActivityStatusRecord = Record<string, unknown> & {
  id: string;
  full_name: string;
  start_time: string;
  end_time: string;
  category: string;
  level: string;
  leader_name: string;
  leader_phone: string;
  activity_id?: string | null;
  scope_type?: string | null;
  scope_name?: string | null;
  scope_names?: string | null;
};

function matchesApprovedActivity(submission: ActivityStatusRecord, activity: ActivityStatusRecord) {
  return submission.activity_id === activity.id;
}

export function mergeActivityStatusRecords(
  submissions: ActivityStatusRecord[],
  activities: ActivityStatusRecord[],
) {
  const linkedSubmissionIds = new Set<string>();

  for (const submission of submissions) {
    if (submission.review_status !== '已通过') continue;
    const linkedActivity = activities.find((activity) => matchesApprovedActivity(submission, activity));
    if (linkedActivity) linkedSubmissionIds.add(submission.id);
  }

  return [
    ...submissions
      .filter((submission) => !linkedSubmissionIds.has(submission.id))
      .map((submission) => ({ ...submission, source: 'submission' as const })),
    ...activities.map((activity) => ({
      ...activity,
      source: 'activity' as const,
      review_status: activity.status === '活动取消' ? '活动取消' : '已通过',
    })),
  ];
}
