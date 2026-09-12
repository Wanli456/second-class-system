import type { AuthUser } from '@/lib/auth';
import { query, type DatabaseClient } from '@/storage/database/supabase-client';

export type AuditLogInput = {
  actor?: Pick<AuthUser, 'id'> & Partial<Pick<AuthUser, 'username' | 'student_id'>> | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
};

const SENSITIVE_DETAIL_KEY = /(password|passphrase|secret|token|api[_-]?key|hash|attachment|file.*url|image.*url|\burl\b|ocr|name|student|phone|ip)/i;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE_DETAIL_KEY.test(key))
    .map(([key, item]) => [key, sanitizeValue(item, depth + 1)])
    .filter(([, item]) => item !== undefined));
}

export function sanitizeAuditDetails(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  return sanitizeValue(details) as Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput, client?: DatabaseClient): Promise<void> {
  const executor = client ?? { query };
  const actorName = input.actor?.username
    ? `${input.actor.username}${input.actor.student_id ? `（${input.actor.student_id}）` : ''}`
    : null;
  await executor.query(
    `INSERT INTO audit_logs (actor_user_id, actor_name, action, resource_type, resource_id, details, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [input.actor?.id || null, actorName, input.action, input.resourceType, input.resourceId || null, JSON.stringify(sanitizeAuditDetails(input.details)), null],
  );
}

export * from './audit-log-labels';
