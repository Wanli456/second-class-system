export function isValidDateRange(startTime: string, endTime: string): boolean {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}
