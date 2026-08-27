const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

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

// 假条起止时间按本地墙钟入库，日过滤边界也取本地墙钟零点，不做时区换算。
export function getDayRangeForBusinessDate(date: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式无效');
  const [year, month, day] = date.split('-').map(Number);
  const startOfUtcDate = Date.UTC(year, month - 1, day);
  const normalized = new Date(startOfUtcDate);
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
    throw new Error('日期格式无效');
  }
  const next = new Date(startOfUtcDate + 24 * 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, '0');
  const nextDate = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  return { start: `${date}T00:00:00`, end: `${nextDate}T00:00:00` };
}
