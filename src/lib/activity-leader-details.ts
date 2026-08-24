export type ActivityLeaderDetail = {
  id: string;
  name: string;
  studentId: string;
  contactPhone: string | null;
};

type LeaderRecord = {
  id?: unknown;
  username?: unknown;
  student_id?: unknown;
  contact_phone?: unknown;
};

type ActivityLeaderRecord = {
  leader_details?: unknown;
  leader_ids?: unknown;
  leader_name?: unknown;
  leader_phone?: unknown;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseIds(value: unknown): string[] {
  const parsed = parseJsonArray(value);
  if (parsed.length) return parsed.map(text).filter(Boolean);
  return text(value).split(',').map((item) => item.trim()).filter(Boolean);
}

export function getActivityLeaderIds(record: ActivityLeaderRecord): string[] {
  return parseIds(record.leader_ids);
}

function normalizeDetail(value: unknown): ActivityLeaderDetail | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = text(record.id);
  const name = text(record.name ?? record.username);
  const studentId = text(record.studentId ?? record.student_id);
  if (!id && !name && !studentId) return null;
  return {
    id,
    name: name || '未命名负责人',
    studentId: studentId || '未填写',
    contactPhone: text(record.contactPhone ?? record.contact_phone) || null,
  };
}

export function serializeActivityLeaderDetails(details: ActivityLeaderDetail[]): string {
  return JSON.stringify(details.map((detail) => ({
    id: detail.id,
    name: detail.name,
    studentId: detail.studentId,
    contactPhone: detail.contactPhone || null,
  })));
}

export function getActivityLeaderDetails(record: ActivityLeaderRecord, leaderRecords: LeaderRecord[] = []): ActivityLeaderDetail[] {
  const stored = parseJsonArray(record.leader_details).map(normalizeDetail).filter((item): item is ActivityLeaderDetail => Boolean(item));
  if (stored.length) return stored;

  const byId = new Map(leaderRecords.map((leader) => [text(leader.id), leader]));
  const ids = parseIds(record.leader_ids);
  const names = text(record.leader_name).split('、').map((item) => item.trim()).filter(Boolean);
  if (!ids.length && (names.length || text(record.leader_phone))) {
    return [{
      id: '',
      name: names[0] || '未命名负责人',
      studentId: '未填写',
      contactPhone: text(record.leader_phone) || null,
    }];
  }
  return ids.map((id, index) => {
    const leader = byId.get(id);
    return {
      id,
      name: text(leader?.username) || names[index] || '未命名负责人',
      studentId: text(leader?.student_id) || '未填写',
      contactPhone: text(leader?.contact_phone) || (index === 0 && !leader ? text(record.leader_phone) : '') || null,
    };
  });
}
