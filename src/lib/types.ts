export interface Activity {
  id: string;
  full_name: string;
  start_time: string;
  end_time: string;
  registration_start_time?: string | null;
  registration_end_time?: string | null;
  category: '德' | '智' | '体' | '美' | '劳';
  category_primary?: string | null;
  category_secondary?: string | null;
  level: '院系级' | '校级';
  plan_file_url: string | null;
  plan_file_name?: string | null;
  record_file_url: string | null;
  record_file_name?: string | null;
  record_photo_url?: string | null;
  record_photo_file_name?: string | null;
  leader_name: string;
  leader_phone: string;
  leader_details?: string | null;
  scope_names?: string | null;
  scope_type?: 'department' | 'class' | 'other_college' | null;
  scope_name?: string | null;
  activity_submitter_name?: string | null;
  activity_submitter_student_id?: string | null;
  scoring_material_submitter_name?: string | null;
  scoring_material_submitter_student_id?: string | null;
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
  registration_start_time?: string | null;
  registration_end_time?: string | null;
  category: '德' | '智' | '体' | '美' | '劳';
  category_primary?: string | null;
  category_secondary?: string | null;
  level: '院系级' | '校级';
  plan_file_url: string | null;
  plan_file_name?: string | null;
  record_file_url: string | null;
  record_file_name?: string | null;
  activity_id?: string | null;
  leader_name: string;
  leader_phone: string;
  leader_details?: string | null;
  scope_names?: string | null;
  scope_type?: 'department' | 'class' | 'other_college' | null;
  scope_name?: string | null;
  activity_submitter_name?: string | null;
  activity_submitter_student_id?: string | null;
  scoring_material_submitter_name?: string | null;
  scoring_material_submitter_student_id?: string | null;
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

export interface LeaveSlip {
  id: string;
  slip_type: '手写假条' | '二课活动请假' | '校级（且不为数经举办）假条' | '手机假条' | '其他请假';
  leave_type: '事假' | '病假' | '活动公假' | '社团' | '比赛' | '培训' | '虚拟工作室' | '临时请假';
  class_names: string;
  start_time: string | null;
  end_time: string | null;
  activity_id: string | null;
  activity_name: string | null;
  applicant_user_id: string;
  applicant_name: string | null;
  applicant_student_id: string | null;
  leave_image_url: string | null;
  leave_image_name: string | null;
  counselor_signature: boolean;
  official_seal: boolean;
  teacher_signature: boolean;
  is_late: boolean;
  review_status: '待查对' | '已通过' | '已驳回';
  review_note: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  original_slip_id: string | null;
  original_image_similarity?: number | null;
  original_image_difference_warning?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveSlipStudent {
  id: string;
  slip_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
}

export interface AttendanceWorkSchedule {
  date: string;
  weekday: '星期一' | '星期二' | '星期三' | '星期四' | '星期五' | '星期六' | '星期日';
  students: string[];
}

export interface AttendanceWorkArrangement {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  student_names: string;
  schedules: string;
  image_list: string;
  ocr_names: string;
  review_status: '待查对' | '已通过' | '已驳回';
  review_note: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string | null;
}

export interface OriginalLeaveSlip {
  id: string;
  activity_id: string | null;
  activity_name: string | null;
  class_names: string | null;
  student_names: string | null;
  start_time: string | null;
  end_time: string | null;
  image_url: string | null;
  image_name: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export const LEAVE_SLIP_TYPES = ['手写假条', '二课活动请假'] as const;
export const LEAVE_SLIP_REVIEW_STATUSES = ['待查对', '已通过', '已驳回'] as const;

export const CATEGORIES = ['德', '智', '体', '美', '劳'] as const;
export type Category = typeof CATEGORIES[number];

export const CATEGORY_DETAILS: Record<Category, Record<string, readonly string[]>> = {
  德: {
    思想政治: ['团组织生活', '政治追求', '“青”字号思政活动', '主题学习', '理论应用', '先进荣誉', '宣传思想'],
    公民道德: ['诚实守信', '道德担当', '道德实践', '校园文明', '公民道德扣分项'],
    社会责任: ['任职经历', '任职荣誉', '履职培训', '团队志愿服务', '志愿服务获奖', '公益服务', '无偿献血', '西部计划志愿者项目', '志愿服务违规行为', '军训教育'],
  },
  智: {
    科学精神: ['图书借阅', '学习兴趣', '线上阅读'],
    工匠精神: ['实习实训', '论文发表', '学术研究', '技能提升', '专业技能竞赛'],
    创新精神: ['SYB培训', '引航计划', '创新创业', '入驻创新创业俱乐部', '创新创业比赛'],
  },
  体: {
    身心健康: ['心理健康', '身体素养', '体育赛事裁判', '体育赛事活动获奖', '校园体育活动', '疾病预防'],
  },
  美: {
    艺术审美: ['人文修养', '文化艺术参赛', '文化艺术表演', '文化艺术主持', '文化艺术竞赛获奖', '校园文化艺术活动', '文化艺术活动违规'],
  },
  劳: {
    劳动精神: ['团队实践', '兼职活动', '勤工助学', '个人实践', '社会调研', '劳动锻炼', '宿舍劳动'],
    自我管理: ['个人发展规划'],
  },
};

export function formatCategoryPath(category: string, primary?: string | null, secondary?: string | null): string {
  return [category, primary, secondary].filter(Boolean).join(' / ');
}

export function formatCategoryPathWithMissing(category: string, primary?: string | null, secondary?: string | null): string {
  return [category, primary || '一级分类未记录', secondary || '二级分类未记录'].join(' / ');
}

export function isValidCategoryPath(category: string, primary?: string | null, secondary?: string | null): boolean {
  if (!CATEGORIES.includes(category as Category) || !primary || !secondary) return false;
  return Boolean(CATEGORY_DETAILS[category as Category]?.[primary]?.includes(secondary));
}
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
  canRegisterOtherCollege: boolean;
  canReviewLeave: boolean;
  canViewEveningStudy: boolean;
  canStartGroupLeave: boolean;
  canManageAttendanceWork: boolean;
  canUploadLeave: boolean;
  canQueryLeave: boolean;
  canManageOriginalLeave: boolean;
  canSubmitOriginalLeave: boolean;
}
