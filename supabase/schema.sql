-- Run this once in the Supabase SQL editor before deploying the app.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  student_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'student',
  can_publish BOOLEAN NOT NULL DEFAULT false,
  can_score BOOLEAN NOT NULL DEFAULT false,
  can_submit_activity BOOLEAN NOT NULL DEFAULT false,
  can_view_submission_status BOOLEAN NOT NULL DEFAULT false,
  can_submit_scoring BOOLEAN NOT NULL DEFAULT false,
  can_review_leave BOOLEAN NOT NULL DEFAULT false,
  can_view_evening_study BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_scoring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_activity BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_submission_status BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  category TEXT NOT NULL,
  level TEXT NOT NULL,
  plan_file_url TEXT,
  record_file_url TEXT,
  leader_name TEXT NOT NULL,
  leader_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '正常活动',
  scoring_status TEXT NOT NULL DEFAULT '待赋分',
  scoring_table_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  full_name TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  category TEXT NOT NULL,
  level TEXT NOT NULL,
  plan_file_url TEXT,
  record_file_url TEXT,
  leader_name TEXT NOT NULL,
  leader_phone TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT '待审核',
  review_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  student_name TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  leave_image_url TEXT,
  activity_name TEXT,
  review_status TEXT NOT NULL DEFAULT '待审核',
  review_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evening_study_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date TEXT NOT NULL,
  weekday TEXT NOT NULL,
  class_name TEXT NOT NULL,
  classroom TEXT NOT NULL,
  checker_name TEXT,
  checker_phone TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evening_study_attendance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  schedule_id TEXT NOT NULL,
  date TEXT NOT NULL,
  class_name TEXT NOT NULL,
  total_count INTEGER NOT NULL,
  present_count INTEGER NOT NULL,
  absent_count INTEGER NOT NULL DEFAULT 0,
  discipline_status TEXT NOT NULL DEFAULT '良好',
  notes TEXT,
  checker_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read TEXT NOT NULL DEFAULT 'false',
  related_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
