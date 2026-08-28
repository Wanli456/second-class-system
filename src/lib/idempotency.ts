export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

export function readIdempotencyKey(headers: Pick<Headers, 'get'>): string | null {
  const value = headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() || '';
  if (!value || value.length > IDEMPOTENCY_KEY_MAX_LENGTH) return null;
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : null;
}

export function scopeIdempotencyKey(userId: string, key: string): string {
  return `${userId}:${key}`;
}
