export const OTHER_COLLEGES = [
  '智能制造学院',
  '机械工程学院',
  '药品与环境工程学院',
  '应用化工学院',
] as const;

export type OtherCollege = typeof OTHER_COLLEGES[number];

export function isOtherCollege(value: string): value is OtherCollege {
  return OTHER_COLLEGES.includes(value as OtherCollege);
}

export function createOtherCollegeActivityId(date = new Date(), random = Math.random()): string {
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const suffix = Math.floor(random * (36 ** 6)).toString(36).padStart(6, '0');
  return `OC${yearMonth}${suffix}`;
}
