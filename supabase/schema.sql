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
  can_register_other_college BOOLEAN NOT NULL DEFAULT false,
  can_review_leave BOOLEAN NOT NULL DEFAULT false,
  can_view_evening_study BOOLEAN NOT NULL DEFAULT false,
  can_start_group_leave BOOLEAN NOT NULL DEFAULT false,
  can_manage_attendance_work BOOLEAN NOT NULL DEFAULT false,
 department TEXT,
 class_name TEXT,
  contact_phone TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_scoring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_register_other_college BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_original_leave BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_activity BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_submission_status BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_start_group_leave BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_attendance_work BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

UPDATE users SET role='student' WHERE role IN ('publisher','scorer','leave_reviewer');
INSERT INTO departments (name)
  SELECT DISTINCT TRIM(department) FROM users
  WHERE department IS NOT NULL AND TRIM(department) <> ''
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  registration_start_time TIMESTAMP,
  registration_end_time TIMESTAMP,
  category TEXT NOT NULL,
  category_primary TEXT,
  category_secondary TEXT,
  level TEXT NOT NULL,
  plan_file_url TEXT,
  plan_file_name TEXT,
  record_file_url TEXT,
  record_file_name TEXT,
  record_photo_url TEXT,
  record_photo_file_name TEXT,
  leader_name TEXT NOT NULL,
  leader_phone TEXT NOT NULL,
  scope_type TEXT DEFAULT 'department',
  scope_name TEXT,
  scope_names TEXT,
 leader_ids TEXT,
  leader_details TEXT,
  activity_submitter_id TEXT,
  activity_submitter_name TEXT,
  activity_submitter_student_id TEXT,
  scoring_material_submitter_id TEXT,
  scoring_material_submitter_name TEXT,
  scoring_material_submitter_student_id TEXT,
  status TEXT NOT NULL DEFAULT '正常活动',
  scoring_status TEXT NOT NULL DEFAULT '待赋分',
  scoring_table_url TEXT,
  scoring_table_file_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_id_counters (
  year_month TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  full_name TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  registration_start_time TIMESTAMP,
  registration_end_time TIMESTAMP,
  category TEXT NOT NULL,
  category_primary TEXT,
  category_secondary TEXT,
  level TEXT NOT NULL,
  plan_file_url TEXT,
  plan_file_name TEXT,
  record_file_url TEXT,
  record_file_name TEXT,
  leader_name TEXT NOT NULL,
  leader_phone TEXT NOT NULL,
  scope_type TEXT DEFAULT 'department',
  scope_name TEXT,
  scope_names TEXT,
 leader_ids TEXT,
  leader_details TEXT,
  activity_submitter_id TEXT,
  activity_submitter_name TEXT,
  activity_submitter_student_id TEXT,
  activity_id TEXT,
  scoring_material_submitter_id TEXT,
  scoring_material_submitter_name TEXT,
  scoring_material_submitter_student_id TEXT,
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
  leave_image_name TEXT,
  activity_name TEXT,
  activity_id TEXT,
  applicant_user_id TEXT,
  applicant_name TEXT,
  applicant_student_id TEXT,
  group_id TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  review_status TEXT NOT NULL DEFAULT '待审核',
  review_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_groups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_name TEXT NOT NULL,
  applicant_user_id TEXT NOT NULL,
  applicant_name TEXT,
  applicant_student_id TEXT,
  leave_type TEXT NOT NULL DEFAULT '活动公假',
  activity_name TEXT,
  activity_id TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  review_status TEXT NOT NULL DEFAULT '待审核',
  review_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE activities ADD COLUMN IF NOT EXISTS category_primary TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS category_secondary TEXT;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS category_primary TEXT;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS category_secondary TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS registration_start_time TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS registration_end_time TIMESTAMP;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS registration_start_time TIMESTAMP;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS registration_end_time TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS leader_details TEXT;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS leader_details TEXT;

CREATE TABLE IF NOT EXISTS leave_group_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  leave_request_id TEXT
);

CREATE TABLE IF NOT EXISTS class_roster (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_name TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(class_name, student_id)
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

ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_submitter_name TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_submitter_student_id TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS scoring_material_submitter_name TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS scoring_material_submitter_student_id TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS record_photo_url TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS record_photo_file_name TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS scope_names TEXT;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_submitter_name TEXT;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_submitter_student_id TEXT;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scoring_material_submitter_name TEXT;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scoring_material_submitter_student_id TEXT;

UPDATE activities a
SET scoring_material_submitter_name = u.username,
    scoring_material_submitter_student_id = u.student_id
FROM users u
WHERE a.scoring_material_submitter_id = u.id
  AND a.scoring_material_submitter_name IS NULL;

UPDATE activity_submissions s
SET scoring_material_submitter_name = u.username,
    scoring_material_submitter_student_id = u.student_id
FROM users u
WHERE s.scoring_material_submitter_id = u.id
  AND s.scoring_material_submitter_name IS NULL;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_id TEXT;
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scope_names TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applicant_name TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applicant_student_id TEXT;
ALTER TABLE leave_groups ADD COLUMN IF NOT EXISTS applicant_name TEXT;
ALTER TABLE leave_groups ADD COLUMN IF NOT EXISTS applicant_student_id TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS activity_id TEXT;
ALTER TABLE leave_groups ADD COLUMN IF NOT EXISTS activity_id TEXT;
