// 假条起止时间统一按「本地墙钟」字符串（YYYY-MM-DDTHH:mm:ss）流转与入库，全链路不做时区换算。
// ponytail: 迁移前写入的旧数据按 UTC 墙钟存储，读出会差 8 小时；需要时手动执行一次性 UPDATE 修正。
export function normalizeDateTimeInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const normalized = `${match[1]}T${match[2]}:${match[3] ?? '00'}`;
  return Number.isNaN(new Date(normalized).getTime()) ? null : normalized;
}
