export interface Activity {
  id: string;
  full_name: string;
  start_time: string;
  end_time: string;
  category: '德' | '智' | '体' | '美' | '劳';
  level: '院系级' | '校级';
  plan_file_url: string | null;
  plan_file_name?: string | null;
  record_file_url: string | null;
  record_file_name?: string | null;
  leader_name: string;
  leader_phone: string;
  scope_names?: string | null;
  scope_type?: 'department' | 'class' | null;
  scope_name?: string | null;
  activity_submitter_name?: string | null;
  activity_submitter_student_id?: string | null;
  status: '正常活动' | '活动取消';
  scoring_status: '待赋分' | '已赋分';
  scoring_table_url: string | null;
  scoring_table_file_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivitySubmission {
  id: string;
  full_name: string;
  start_time: string;
  end_time: string;
  category: '德' | '智' | '体' | '美' | '劳';
  level: '院系级' | '校级';
  plan_file_url: string | null;
  plan_file_name?: string | null;
  record_file_url: string | null;
  record_file_name?: string | null;
  leader_name: string;
  leader_phone: string;
  scope_names?: string | null;
  scope_type?: 'department' | 'class' | null;
  scope_name?: string | null;
  activity_submitter_name?: string | null;
  activity_submitter_student_id?: string | null;
  review_status: '待审核' | '已通过' | '已驳回';
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequest {
  id: string;
  student_id: string;
  class_name: string;
  student_name: string;
  leave_type: '事假' | '病假' | '活动公假';
  leave_image_url: string | null;
  leave_image_name?: string | null;
  applicant_name?: string | null;
  applicant_student_id?: string | null;
  activity_name: string | null;
  activity_id?: string | null;
  group_id?: string | null;
  applicant_user_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  review_status: '待审核' | '已通过' | '已驳回';
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export const CATEGORIES = ['德', '智', '体', '美', '劳'] as const;
export const LEVELS = ['院系级', '校级'] as const;
export const ACTIVITY_STATUSES = ['正常活动', '活动取消'] as const;
export const LEAVE_TYPES = ['事假', '病假', '活动公假'] as const;
export const REVIEW_STATUSES = ['待审核', '已通过', '已驳回'] as const;
export const SCORING_STATUSES = ['待赋分', '已赋分'] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  '德': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  '智': 'bg-sky-100 text-sky-700 border-sky-200',
  '体': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '美': 'bg-amber-100 text-amber-700 border-amber-200',
  '劳': 'bg-red-100 text-red-700 border-red-200',
};

export const STATUS_COLORS: Record<string, string> = {
  '正常活动': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '活动取消': 'bg-red-100 text-red-700 border-red-200',
  '待审核': 'bg-amber-100 text-amber-700 border-amber-200',
  '已通过': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '已驳回': 'bg-red-100 text-red-700 border-red-200',
  '待赋分': 'bg-amber-100 text-amber-700 border-amber-200',
  '已赋分': 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export interface UserData {
  id: string;
  studentId: string;
  name: string;
  role: 'student' | 'leader' | 'admin';
  canPublish: boolean;
  canScore: boolean;
  canSubmitActivity: boolean;
  canViewSubmissionStatus: boolean;
  canSubmitScoring: boolean;
  canReviewLeave: boolean;
  canViewEveningStudy: boolean;
  canStartGroupLeave: boolean;
}
