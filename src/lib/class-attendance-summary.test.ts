import assert from 'node:assert/strict';
import { summarizeClassAttendance } from './class-attendance-summary';

const result = summarizeClassAttendance(
  [
    { class_name: '计算机2101', student_id: '1' },
    { class_name: '计算机2101', student_id: '1' },
    { class_name: '计算机2101', student_id: '2' },
    { class_name: '计算机2102', student_id: '3' },
  ],
  [
    { class_name: '计算机2101', student_id: '1' },
    { class_name: '计算机2101', student_id: '1' },
    { class_name: '计算机2101', student_id: '9' },
  ],
  [
    { class_name: '计算机2102', total_count: 1, present_count: 0 },
  ],
);

assert.deepEqual(result, [
  {
    class_name: '计算机2101',
    expected_count: 2,
    present_count: 0,
    leave_count: 2,
    present_source: 'auto',
  },
  {
    class_name: '计算机2102',
    expected_count: 1,
    present_count: 0,
    leave_count: 0,
    present_source: 'recorded',
  },
]);

console.log('class attendance summary tests passed');
