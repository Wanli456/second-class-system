import { query } from '@/storage/database/supabase-client';
import { getActivityLeaderDetails, getActivityLeaderIds, serializeActivityLeaderDetails, type ActivityLeaderDetail } from '@/lib/activity-leader-details';

type ActivityRecord = Record<string, unknown>;

export async function hydrateActivityLeaderDetails<T extends ActivityRecord>(records: T[]): Promise<T[]> {
  const ids = [...new Set(records.flatMap((record) => getActivityLeaderIds(record)))];
  if (!ids.length) return records;
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
  const users = await query<{ id: string; username: string; student_id: string; contact_phone: string | null }>(`SELECT id,username,student_id,contact_phone FROM users WHERE id IN (${placeholders})`, ids);
  const byId = new Map(users.map((user) => [user.id, user]));
  return records.map((record) => {
    if (getActivityLeaderDetails(record).length) return record;
    const details: ActivityLeaderDetail[] = getActivityLeaderDetails(record, getActivityLeaderIds(record).map((id) => byId.get(id)).filter((user): user is typeof users[number] => Boolean(user)));
    return details.length ? { ...record, leader_details: serializeActivityLeaderDetails(details) } : record;
  });
}
