export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

const WALL_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

// 假条和活动起止时间按「本地墙钟」字符串流转与入库，全链路不做时区换算。
// ponytail: 迁移前写入的旧数据按 UTC 墙钟存储，读出会差 8 小时；需要时手动执行一次性 UPDATE 修正。
export function normalizeDateTimeInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(WALL_TIME_PATTERN);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute)
    || date.getUTCSeconds() !== Number(second)) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function formatDateInBusinessZone(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date).replace(/\//g, '-');
}

export function formatBusinessDateTime(value: unknown, fallback = '未填写'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const text = typeof value === 'string' ? value.trim() : '';
  const wallTime = text ? normalizeDateTimeInput(text) : null;
  if (wallTime) return wallTime.slice(0, 16).replace('T', ' ');
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : formatDateInBusinessZone(date);
}
