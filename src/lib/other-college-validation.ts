import { normalizeDateTimeInput } from './datetime';

export function isValidDateRange(startTime: string, endTime: string): boolean {
  const start = normalizeDateTimeInput(startTime);
  const end = normalizeDateTimeInput(endTime);
  return Boolean(start && end && end > start);
}
