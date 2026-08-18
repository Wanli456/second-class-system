import { pgTable, serial, timestamp, varchar, text, index, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 二课活动总表
export const activities = pgTable(
  "activities",
  {
    id: varchar("id", { length: 20 }).primaryKey(),
    full_name: varchar("full_name", { length: 255 }).notNull(),
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }).notNull(),
    category: varchar("category", { length: 10 }).notNull(), // 德智体美劳
    category_primary: varchar("category_primary", { length: 50 }),
    category_secondary: varchar("category_secondary", { length: 100 }),
    level: varchar("level", { length: 20 }).notNull(), // 院系级/校级
    plan_file_url: text("plan_file_url"),
    plan_file_name: text("plan_file_name"),
    record_file_url: text("record_file_url"),
    record_file_name: text("record_file_name"),
    record_photo_url: text("record_photo_url"),
    record_photo_file_name: text("record_photo_file_name"),
    leader_name: varchar("leader_name", { length: 50 }).notNull(),
    leader_phone: varchar("leader_phone", { length: 20 }).notNull(),
    scope_type: varchar("scope_type", { length: 20 }).default("department"),
    scope_name: varchar("scope_name", { length: 100 }),
    scope_names: text("scope_names"),
    leader_ids: text("leader_ids"),
    activity_submitter_id: varchar("activity_submitter_id", { length: 36 }),
    activity_submitter_name: varchar("activity_submitter_name", { length: 50 }),
    activity_submitter_student_id: varchar("activity_submitter_student_id", { length: 20 }),
    scoring_material_submitter_id: varchar("scoring_material_submitter_id", { length: 36 }),
    status: varchar("status", { length: 20 }).notNull().default("正常活动"), // 正常活动/活动取消
    scoring_status: varchar("scoring_status", { length: 20 }).notNull().default("待赋分"), // 待赋分/已赋分
    scoring_table_url: text("scoring_table_url"), // 活动赋分表
    scoring_table_file_name: text("scoring_table_file_name"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activities_category_idx").on(table.category),
    index("activities_status_idx").on(table.status),
    index("activities_leader_phone_idx").on(table.leader_phone),
    index("activities_start_time_idx").on(table.start_time),
    index("activities_scoring_status_idx").on(table.scoring_status),
  ]
);

// 活动提交记录（负责人提交，管理员审核后写入总表）
export const activity_submissions = pgTable(
  "activity_submissions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    full_name: varchar("full_name", { length: 255 }).notNull(),
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }).notNull(),
    category: varchar("category", { length: 10 }).notNull(),
    category_primary: varchar("category_primary", { length: 50 }),
    category_secondary: varchar("category_secondary", { length: 100 }),
    level: varchar("level", { length: 20 }).notNull(),
    plan_file_url: text("plan_file_url"),
    plan_file_name: text("plan_file_name"),
    record_file_url: text("record_file_url"),
    record_file_name: text("record_file_name"),
    leader_name: varchar("leader_name", { length: 50 }).notNull(),
    leader_phone: varchar("leader_phone", { length: 20 }).notNull(),
    scope_type: varchar("scope_type", { length: 20 }).default("department"),
    scope_name: varchar("scope_name", { length: 100 }),
    scope_names: text("scope_names"),
    leader_ids: text("leader_ids"),
    activity_submitter_id: varchar("activity_submitter_id", { length: 36 }),
    activity_submitter_name: varchar("activity_submitter_name", { length: 50 }),
    activity_submitter_student_id: varchar("activity_submitter_student_id", { length: 20 }),
    scoring_material_submitter_id: varchar("scoring_material_submitter_id", { length: 36 }),
    review_status: varchar("review_status", { length: 20 }).notNull().default("待审核"), // 待审核/已通过/已驳回
    review_note: text("review_note"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activity_submissions_review_status_idx").on(table.review_status),
    index("activity_submissions_leader_phone_idx").on(table.leader_phone),
    index("activity_submissions_created_at_idx").on(table.created_at),
  ]
);

// 请假申请表
export const leave_requests = pgTable(
  "leave_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    student_id: varchar("student_id", { length: 20 }).notNull(),
    class_name: varchar("class_name", { length: 50 }).notNull(),
    student_name: varchar("student_name", { length: 50 }).notNull(),
    leave_type: varchar("leave_type", { length: 20 }).notNull(), // 事假/病假/活动公假
    leave_image_url: text("leave_image_url"),
    leave_image_name: text("leave_image_name"),
    activity_name: varchar("activity_name", { length: 255 }),
    activity_id: varchar("activity_id", { length: 32 }),
    applicant_user_id: varchar("applicant_user_id", { length: 36 }),
    applicant_name: varchar("applicant_name", { length: 50 }),
    applicant_student_id: varchar("applicant_student_id", { length: 20 }),
    group_id: varchar("group_id", { length: 36 }),
    start_time: timestamp("start_time", { withTimezone: true }),
    end_time: timestamp("end_time", { withTimezone: true }),
    review_status: varchar("review_status", { length: 20 }).notNull().default("待审核"), // 待审核/已通过/已驳回
    review_note: text("review_note"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("leave_requests_student_id_idx").on(table.student_id),
    index("leave_requests_review_status_idx").on(table.review_status),
    index("leave_requests_leave_type_idx").on(table.leave_type),
    index("leave_requests_created_at_idx").on(table.created_at),
  ]
);

// 集体请假组及组内学生明细
export const leave_groups = pgTable("leave_groups", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  class_name: varchar("class_name", { length: 50 }).notNull(),
  applicant_user_id: varchar("applicant_user_id", { length: 36 }).notNull(),
  applicant_name: varchar("applicant_name", { length: 50 }),
  applicant_student_id: varchar("applicant_student_id", { length: 20 }),
  leave_type: varchar("leave_type", { length: 20 }).notNull().default("活动公假"),
  activity_name: varchar("activity_name", { length: 255 }),
  activity_id: varchar("activity_id", { length: 32 }),
  start_time: timestamp("start_time", { withTimezone: true }).notNull(),
  end_time: timestamp("end_time", { withTimezone: true }).notNull(),
  review_status: varchar("review_status", { length: 20 }).notNull().default("待审核"),
  review_note: text("review_note"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leave_group_members = pgTable("leave_group_members", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  group_id: varchar("group_id", { length: 36 }).notNull(),
  student_id: varchar("student_id", { length: 20 }).notNull(),
  student_name: varchar("student_name", { length: 50 }).notNull(),
  class_name: varchar("class_name", { length: 50 }).notNull(),
  leave_request_id: varchar("leave_request_id", { length: 36 }),
});

export const class_roster = pgTable("class_roster", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  class_name: varchar("class_name", { length: 50 }).notNull(),
  student_id: varchar("student_id", { length: 20 }).notNull(),
  student_name: varchar("student_name", { length: 50 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const departments = pgTable("departments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("departments_name_idx").on(table.name)]);

// 晚自习安排表
export const evening_study_schedules = pgTable(
  "evening_study_schedules",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    date: varchar("date", { length: 10 }).notNull(), // 日期 YYYY-MM-DD
    weekday: varchar("weekday", { length: 10 }).notNull(), // 星期几
    class_name: varchar("class_name", { length: 50 }).notNull(), // 班级
    classroom: varchar("classroom", { length: 50 }).notNull(), // 教室
    checker_name: varchar("checker_name", { length: 50 }), // 检查人员
    checker_phone: varchar("checker_phone", { length: 20 }), // 检查人员电话
    notes: text("notes"), // 备注
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("evening_study_date_idx").on(table.date),
    index("evening_study_class_idx").on(table.class_name),
  ]
);

// 晚自习考勤记录表
export const evening_study_attendance = pgTable(
  "evening_study_attendance",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    schedule_id: varchar("schedule_id", { length: 36 }).notNull(), // 关联的安排ID
    date: varchar("date", { length: 10 }).notNull(), // 日期
    class_name: varchar("class_name", { length: 50 }).notNull(), // 班级
    total_count: serial("total_count").notNull(), // 应到人数
    present_count: serial("present_count").notNull(), // 实到人数
    absent_count: serial("absent_count").notNull().default(0), // 缺勤人数
    discipline_status: varchar("discipline_status", { length: 20 }).notNull().default("良好"), // 纪律状况：优秀/良好/一般/较差
    notes: text("notes"), // 备注
    checker_name: varchar("checker_name", { length: 50 }).notNull(), // 检查人员
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("evening_attendance_date_idx").on(table.date),
    index("evening_attendance_class_idx").on(table.class_name),
    index("evening_attendance_schedule_idx").on(table.schedule_id),
  ]
);

// 通知表
export const notifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(), // 接收通知的用户 ID
    type: varchar("type", { length: 50 }).notNull(), // activity_approved / activity_scored / leave_approved / leave_rejected
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content").notNull(),
    is_read: varchar("is_read", { length: 5 }).notNull().default("false"), // "true" / "false"
    related_id: varchar("related_id", { length: 50 }), // 关联的业务 ID（活动 ID 或请假 ID）
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.user_id),
    index("notifications_is_read_idx").on(table.is_read),
    index("notifications_created_at_idx").on(table.created_at),
  ]
);
