import { getActivityLeaderDetails } from '@/lib/activity-leader-details';

type ActivityLeaderRecord = {
  leader_details?: unknown;
  leader_ids?: unknown;
  leader_name?: unknown;
  leader_phone?: unknown;
};

export function ActivityLeaderDetails({ record, compact = false }: { record: ActivityLeaderRecord; compact?: boolean }) {
  const details = getActivityLeaderDetails(record);
  if (!details.length) return <span>负责人：{String(record.leader_name || '未填写')}</span>;
  return <span className={compact ? 'inline-flex flex-wrap gap-x-2 gap-y-1' : 'inline-flex flex-col gap-1'}>
    {!compact && <span>负责人：</span>}
    {details.map((leader) => <span key={`${leader.id}-${leader.studentId}`} className={compact ? undefined : 'pl-2'}>
      {leader.name}｜学号：{leader.studentId}｜联系方式：{leader.contactPhone || '未填写'}
    </span>)}
  </span>;
}
