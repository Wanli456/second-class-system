import assert from 'node:assert/strict';
import { validateEveningAttendance, validateEveningSchedule } from './evening-study-validation';

assert.equal(validateEveningSchedule({ date: '2026-08-28', weekday: '星期五', class_name: '计科2101', classroom: 'A101' }), null);
assert.match(validateEveningSchedule({ date: '2026-02-30', weekday: '星期一', class_name: '计科2101', classroom: 'A101' }) || '', /日期/);

assert.deepEqual(validateEveningAttendance({ schedule_id: 'schedule-1', date: '2026-08-28', class_name: '计科2101', checker_name: '张三', total_count: 30, present_count: 30, absent_count: 0 }), { error: null, absentCount: 0 });
assert.match(validateEveningAttendance({ schedule_id: 'schedule-1', date: '2026-08-28', class_name: '计科2101', checker_name: '张三', total_count: 30, present_count: 29, absent_count: 0 }).error || '', /不一致/);

console.log('evening study validation tests passed');
