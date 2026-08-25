const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
const BUSINESS_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getBusinessDate(date = new Date()): string {
  if (Number.isNaN(date.getTime())) throw new Error('日期无效');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year + '-' + values.month + '-' + values.day;
}

export function getUtcDayRangeForBusinessDate(date: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式无效');
  const [year, month, day] = date.split('-').map(Number);
  const startOfUtcDate = Date.UTC(year, month - 1, day);
  const normalized = new Date(startOfUtcDate);
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
    throw new Error('日期格式无效');
  }
  const start = new Date(startOfUtcDate - BUSINESS_UTC_OFFSET_MS);
  const end = new Date(startOfUtcDate + 24 * 60 * 60 * 1000 - BUSINESS_UTC_OFFSET_MS);
  return { start: start.toISOString(), end: end.toISOString() };
}
