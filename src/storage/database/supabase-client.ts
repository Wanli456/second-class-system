import { Pool, type QueryResultRow } from 'pg';
import { newDb, DataType } from 'pg-mem';
import { LOCAL_TEST_DATA_SQL } from './local-test-data';

const databaseUrl = process.env.PGDATABASE_URL?.trim();
const isProductionRuntime = process.env.NODE_ENV === 'production'
  && process.env.NEXT_PHASE !== 'phase-production-build';

if (isProductionRuntime && !databaseUrl) {
  throw new Error('生产环境缺少 PGDATABASE_URL，拒绝回退到内存数据库');
}

const useLocalTestDatabase = !databaseUrl;

type DatabasePool = {
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  connect: () => Promise<DatabaseClient>;
  end: () => Promise<void>;
};

export type DatabaseClient = Pick<DatabasePool, 'query'> & { release?: () => void };

type LocalDatabaseState = {
  db: ReturnType<typeof newDb>;
  pool: DatabasePool;
};

const runtimeGlobal = globalThis as typeof globalThis & {
  __secondClassLocalDatabase?: LocalDatabaseState;
};
const shouldInitializeLocalDb = useLocalTestDatabase && !runtimeGlobal.__secondClassLocalDatabase;

// Keep the same PostgreSQL API locally so the app can be tested without a paid service.
const localDb = useLocalTestDatabase
  ? runtimeGlobal.__secondClassLocalDatabase?.db ?? newDb({ autoCreateForeignKeyIndices: true })
  : null;

if (localDb && shouldInitializeLocalDb) {
  localDb.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: DataType.text,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  localDb.public.none(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
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
      can_upload_leave BOOLEAN NOT NULL DEFAULT false,
      can_query_leave BOOLEAN NOT NULL DEFAULT false,
      can_manage_original_leave BOOLEAN NOT NULL DEFAULT false,
      can_submit_original_leave BOOLEAN NOT NULL DEFAULT false,
      department TEXT,
      class_name TEXT,
      contact_phone TEXT,
      permission_overrides TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE departments (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE activities (
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
      idempotency_key TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE activity_id_counters (
      year_month TEXT PRIMARY KEY,
      next_number INTEGER NOT NULL
    );

    CREATE TABLE activity_submissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
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
       idempotency_key TEXT,
       review_status TEXT NOT NULL DEFAULT '待审核',
      review_note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE leave_requests (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
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

    CREATE TABLE leave_groups (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
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

    CREATE TABLE leave_group_members (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      leave_request_id TEXT
    );

    CREATE TABLE class_roster (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      class_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(class_name, student_id)
    );

    CREATE TABLE evening_study_schedules (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      date TEXT NOT NULL,
      weekday TEXT NOT NULL,
      class_name TEXT NOT NULL,
      classroom TEXT NOT NULL,
      checker_name TEXT,
      checker_phone TEXT,
       notes TEXT,
       idempotency_key TEXT,
       created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE evening_study_attendance (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      schedule_id TEXT NOT NULL,
      date TEXT NOT NULL,
      class_name TEXT NOT NULL,
      total_count INTEGER NOT NULL,
      present_count INTEGER NOT NULL,
      absent_count INTEGER NOT NULL DEFAULT 0,
      discipline_status TEXT NOT NULL DEFAULT '良好',
      notes TEXT,
       checker_name TEXT NOT NULL,
       idempotency_key TEXT,
       created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE notifications (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_read TEXT NOT NULL DEFAULT 'false',
      related_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Stable accounts for local previews; this database is never used when PGDATABASE_URL is configured.
  localDb.public.none(`
    INSERT INTO users (
      id, username, password, student_id, role,
      can_publish, can_score, can_review_leave,
      can_submit_activity, can_view_submission_status, can_submit_scoring,
      can_start_group_leave, can_manage_attendance_work, department, class_name
    ) VALUES
      ('local-admin', '本地管理员', 'test123', '9000000001', 'admin', false, false, false, false, false, false, true, true, '学生会', '计算机2101'),
      ('local-publisher', '本地活动审核员', 'test123', '9000000002', 'student', true, false, false, false, false, false, false, false, '学生会', '计算机2101'),
      ('local-scorer', '本地活动赋分员', 'test123', '9000000003', 'student', false, true, false, false, false, false, false, false, '学生会', '计算机2101'),
      ('local-leave-reviewer', '本地请假审核员', 'test123', '9000000004', 'student', false, false, true, false, false, false, false, false, '学生会', '计算机2101'),
      ('local-leader', '本地负责人', 'test123', '9000000005', 'leader', false, false, false, true, true, true, true, true, '学生会', '计算机2101'),
      ('local-student', '本地学生', 'test123', '9000000006', 'student', false, false, false, false, false, false, false, false, '学生会', '计算机2101'),
      ('local-sports-leader', '本地竞技部负责人', 'test123', '9000000008', 'leader', false, false, false, false, false, false, false, false, '学习竞技部', '计算机2101'),
      ('local-certification-leader', '本地认证中心负责人', 'test123', '9000000009', 'leader', false, false, false, false, false, false, false, false, '第二课堂认证中心', '计算机2101');

    INSERT INTO class_roster (class_name, student_id, student_name) VALUES
      ('计算机2101', '9000000001', '本地管理员'),
      ('计算机2101', '9000000002', '本地发布干事'),
      ('计算机2101', '9000000003', '本地赋分干事'),
      ('计算机2101', '9000000004', '本地请假审核员'),
      ('计算机2101', '9000000005', '本地负责人'),
      ('计算机2101', '9000000006', '本地学生'),
      ('计算机2101', '9000000007', '本地未注册学生'),
      ('计算机2101', '9000000008', '本地竞技部负责人'),
      ('计算机2101', '9000000009', '本地认证中心负责人');

    INSERT INTO departments (name) VALUES
      ('学生会'),
      ('学习竞技部'),
      ('第二课堂认证中心')
    ON CONFLICT (name) DO NOTHING;
  `);

  localDb.public.none(LOCAL_TEST_DATA_SQL);

  console.log('🟢 本地开发模式：使用内存测试数据库（重启后数据清空）');
  console.log('🔑 测试账户：');
  console.log('   - 管理员：学号 9000000001 / 密码 test123');
  console.log('   - 活动审核权限：学号 9000000002 / 密码 test123');
  console.log('   - 活动赋分权限：学号 9000000003 / 密码 test123');
  console.log('   - 请假审核权限：学号 9000000004 / 密码 test123');
  console.log('   - 部门负责人：学号 9000000005 / 密码 test123');
  console.log('   - 学生：学号 9000000006 / 密码 test123');
  console.log('   - 学习竞技部负责人：学号 9000000008 / 密码 test123（自动获得假条/考勤/晚自习权限）');
  console.log('   - 第二课堂认证中心负责人：学号 9000000009 / 密码 test123（自动获得活动提交/审核/赋分/状态权限）');
  console.log('💡 如需持久化数据，请配置 PGDATABASE_URL 环境变量');
}

const pool: DatabasePool = useLocalTestDatabase
  ? runtimeGlobal.__secondClassLocalDatabase?.pool ?? new (localDb!.adapters.createPg().Pool)() as DatabasePool
  : new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      options: '-c timezone=Asia/Shanghai',
    }) as DatabasePool;

if (useLocalTestDatabase && !runtimeGlobal.__secondClassLocalDatabase) {
  runtimeGlobal.__secondClassLocalDatabase = { db: localDb!, pool };
}

let schemaInitialization: Promise<void> | null = null;

async function executeSchemaSql(sql: string): Promise<void> {
  if (useLocalTestDatabase) {
    localDb!.public.none(sql);
    return;
  }
  await pool.query(sql);
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name=$1`,
    [tableName],
  );
  return result.rows.length > 0;
}

async function migrateDatabaseSchema(): Promise<void> {
  const uuidDefault = useLocalTestDatabase ? 'gen_random_uuid()' : 'gen_random_uuid()::text';

  // Run the compatibility changes before copying users into departments. Older
  // local processes can keep the same pg-mem instance during hot reloads.
  if (!(await tableExists('activity_id_counters'))) {
    await executeSchemaSql(`
      CREATE TABLE activity_id_counters (
        year_month TEXT PRIMARY KEY,
        next_number INTEGER NOT NULL
      );
    `);
  }

  await executeSchemaSql(`
    UPDATE users SET role='student' WHERE role IN ('publisher','scorer','leave_reviewer');
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_publish BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_score BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_activity BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_submission_status BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_scoring BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_register_other_college BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_review_leave BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_evening_study BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_start_group_leave BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_attendance_work BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_upload_leave BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_query_leave BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_original_leave BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_original_leave BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS class_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_overrides TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scope_type TEXT DEFAULT 'department';
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS category_primary TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS category_secondary TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scope_name TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scope_names TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS leader_ids TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS leader_details TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_submitter_id TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_submitter_name TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_submitter_student_id TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scoring_material_submitter_id TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scoring_material_submitter_name TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scoring_material_submitter_student_id TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS plan_file_name TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS record_file_name TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS record_photo_url TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS record_photo_file_name TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS scoring_table_file_name TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS registration_start_time TIMESTAMP;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS registration_end_time TIMESTAMP;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS activities_idempotency_key_idx ON activities (idempotency_key);
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scope_type TEXT DEFAULT 'department';
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS category_primary TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS category_secondary TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scope_name TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scope_names TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS leader_ids TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS leader_details TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_submitter_id TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_submitter_name TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_submitter_student_id TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scoring_material_submitter_id TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scoring_material_submitter_name TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scoring_material_submitter_student_id TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS plan_file_name TEXT;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS record_file_name TEXT;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_id TEXT;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scoring_table_file_name TEXT;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS registration_start_time TIMESTAMP;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS registration_end_time TIMESTAMP;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
     CREATE UNIQUE INDEX IF NOT EXISTS activity_submissions_idempotency_key_idx ON activity_submissions (idempotency_key);
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applicant_user_id TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applicant_name TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applicant_student_id TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS group_id TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;
     ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_image_name TEXT;
     ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS activity_id TEXT;
  `);

  const scoringActivitySnapshots = await query<{ id: string; scoring_material_submitter_id: string }>(
    'SELECT id, scoring_material_submitter_id FROM activities WHERE scoring_material_submitter_id IS NOT NULL AND scoring_material_submitter_name IS NULL',
  );
  for (const activity of scoringActivitySnapshots) {
    const submitter = await queryOne<{ username: string; student_id: string }>('SELECT username, student_id FROM users WHERE id=$1', [activity.scoring_material_submitter_id]);
    if (submitter) await query('UPDATE activities SET scoring_material_submitter_name=$1, scoring_material_submitter_student_id=$2 WHERE id=$3', [submitter.username, submitter.student_id, activity.id]);
  }
  const scoringSubmissionSnapshots = await query<{ id: string; scoring_material_submitter_id: string }>(
    'SELECT id, scoring_material_submitter_id FROM activity_submissions WHERE scoring_material_submitter_id IS NOT NULL AND scoring_material_submitter_name IS NULL',
  );
  for (const submission of scoringSubmissionSnapshots) {
    const submitter = await queryOne<{ username: string; student_id: string }>('SELECT username, student_id FROM users WHERE id=$1', [submission.scoring_material_submitter_id]);
    if (submitter) await query('UPDATE activity_submissions SET scoring_material_submitter_name=$1, scoring_material_submitter_student_id=$2 WHERE id=$3', [submitter.username, submitter.student_id, submission.id]);
  }

  // Link legacy approved submissions to their single matching activity so the
  // status page can rely on the hidden activity ID without guessing at render time.
  const legacySubmissions = await query<{
    id: string;
    full_name: string;
    start_time: string;
    end_time: string;
    category: string;
    level: string;
    leader_name: string;
    leader_phone: string;
    scope_type: string | null;
    scope_name: string | null;
    scope_names: string | null;
  }>('SELECT id,full_name,start_time,end_time,category,level,leader_name,leader_phone,scope_type,scope_name,scope_names FROM activity_submissions WHERE review_status=$1 AND activity_id IS NULL', ['已通过']);
  for (const submission of legacySubmissions) {
    const candidates = await query<{ id: string }>(
      `SELECT id FROM activities
       WHERE full_name=$1 AND start_time=$2 AND end_time=$3 AND category=$4 AND level=$5
         AND leader_name=$6 AND leader_phone=$7
         AND COALESCE(scope_type, '')=COALESCE($8, '')
         AND COALESCE(scope_name, '')=COALESCE($9, '')
         AND COALESCE(scope_names, '')=COALESCE($10, '')`,
      [submission.full_name, submission.start_time, submission.end_time, submission.category, submission.level, submission.leader_name, submission.leader_phone, submission.scope_type, submission.scope_name, submission.scope_names],
    );
    if (candidates.length === 1) await query('UPDATE activity_submissions SET activity_id=$1 WHERE id=$2', [candidates[0].id, submission.id]);
  }

  if (!(await tableExists('leave_groups'))) {
    await executeSchemaSql(`
      CREATE TABLE leave_groups (
      id TEXT PRIMARY KEY DEFAULT ${uuidDefault},
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
    `);
  }

  await executeSchemaSql(`
    ALTER TABLE leave_groups ADD COLUMN IF NOT EXISTS applicant_name TEXT;
    ALTER TABLE leave_groups ADD COLUMN IF NOT EXISTS applicant_student_id TEXT;
    ALTER TABLE leave_groups ADD COLUMN IF NOT EXISTS activity_id TEXT;
  `);

  if (!(await tableExists('leave_group_members'))) {
    await executeSchemaSql(`
      CREATE TABLE leave_group_members (
      id TEXT PRIMARY KEY DEFAULT ${uuidDefault},
      group_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      leave_request_id TEXT
      );
    `);
  }

  await executeSchemaSql(`
    ALTER TABLE leave_group_members ADD COLUMN IF NOT EXISTS leave_request_id TEXT;
  `);

  if (!(await tableExists('class_roster'))) {
    await executeSchemaSql(`
      CREATE TABLE class_roster (
      id TEXT PRIMARY KEY DEFAULT ${uuidDefault},
      class_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(class_name, student_id)
      );
    `);
  }

  await executeSchemaSql(`
    ALTER TABLE class_roster ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE class_roster ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS class_roster_class_student_key ON class_roster (class_name, student_id);
  `);

  if (!(await tableExists('leave_slips'))) {
    await executeSchemaSql(`
    CREATE TABLE leave_slips (
        id TEXT PRIMARY KEY DEFAULT ${uuidDefault},
        slip_type TEXT NOT NULL DEFAULT 'handwritten',
        leave_type TEXT NOT NULL DEFAULT '事假',
        class_names TEXT NOT NULL,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        activity_id TEXT,
        activity_name TEXT,
        applicant_user_id TEXT NOT NULL,
        applicant_name TEXT,
        applicant_student_id TEXT,
        leave_image_url TEXT,
        leave_image_name TEXT,
        image_list TEXT NOT NULL DEFAULT '[]',
        ocr_names TEXT NOT NULL DEFAULT '[]',
        image_hashes TEXT NOT NULL DEFAULT '[]',
        duplicate_of_slip_id TEXT,
        duplicate_score INT,
        duplicate_warning TEXT,
        original_image_similarity INT,
        original_image_difference_warning TEXT,
        counselor_signature BOOLEAN NOT NULL DEFAULT false,
        official_seal BOOLEAN NOT NULL DEFAULT false,
        teacher_signature BOOLEAN NOT NULL DEFAULT false,
         is_late BOOLEAN NOT NULL DEFAULT false,
         idempotency_key TEXT,
         review_status TEXT NOT NULL DEFAULT '待查对',
        review_note TEXT,
        reviewed_by_user_id TEXT,
        reviewed_by_name TEXT,
        reviewed_at TIMESTAMP,
        original_slip_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  await executeSchemaSql(`
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS class_names TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS counselor_signature BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS official_seal BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS teacher_signature BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS original_slip_id TEXT;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS image_list TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS ocr_names TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS image_hashes TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS duplicate_of_slip_id TEXT;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS duplicate_score INT;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS duplicate_warning TEXT;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS original_image_similarity INT;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS original_image_difference_warning TEXT;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS reviewed_by_user_id TEXT;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
    ALTER TABLE leave_slips ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS leave_slips_idempotency_key_idx ON leave_slips (idempotency_key);
  `);

  if (!(await tableExists('leave_slip_students'))) {
    await executeSchemaSql(`
      CREATE TABLE leave_slip_students (
        id TEXT PRIMARY KEY DEFAULT ${uuidDefault},
        slip_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        class_name TEXT NOT NULL
      );
    `);
  }
  await executeSchemaSql(`CREATE UNIQUE INDEX IF NOT EXISTS leave_slip_students_slip_student_idx ON leave_slip_students (slip_id, student_id);`);

  if (!(await tableExists('original_leave_slips'))) {
    await executeSchemaSql(`
    CREATE TABLE original_leave_slips (
        id TEXT PRIMARY KEY DEFAULT ${uuidDefault},
        activity_id TEXT,
        activity_name TEXT,
        class_names TEXT,
        student_names TEXT,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        image_url TEXT,
        image_name TEXT,
        image_list TEXT NOT NULL DEFAULT '[]',
        ocr_names TEXT NOT NULL DEFAULT '[]',
        image_hashes TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
         created_by_user_id TEXT,
         created_by_name TEXT,
         idempotency_key TEXT,
         created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  await executeSchemaSql(`
    ALTER TABLE original_leave_slips ADD COLUMN IF NOT EXISTS image_list TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE original_leave_slips ADD COLUMN IF NOT EXISTS ocr_names TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE original_leave_slips ADD COLUMN IF NOT EXISTS image_hashes TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE original_leave_slips ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS original_leave_slips_idempotency_key_idx ON original_leave_slips (idempotency_key);
  `);

  if (!(await tableExists('attendance_work_arrangements'))) {
    await executeSchemaSql(`
    CREATE TABLE attendance_work_arrangements (
        id TEXT PRIMARY KEY DEFAULT ${uuidDefault},
        name TEXT NOT NULL DEFAULT '考勤工作安排',
        start_date TEXT,
        end_date TEXT,
        student_names TEXT NOT NULL DEFAULT '[]',
        schedules TEXT NOT NULL DEFAULT '[]',
        image_list TEXT NOT NULL DEFAULT '[]',
        ocr_names TEXT NOT NULL DEFAULT '[]',
        review_status TEXT NOT NULL DEFAULT '待查对',
        review_note TEXT,
        reviewed_by_user_id TEXT,
        reviewed_by_name TEXT,
        reviewed_at TIMESTAMP,
        created_by_user_id TEXT,
        created_by_name TEXT,
        idempotency_key TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  await executeSchemaSql(`
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '考勤工作安排';
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS start_date TEXT;
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS end_date TEXT;
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS student_names TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS schedules TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS image_list TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS ocr_names TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT '待查对';
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS review_note TEXT;
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS reviewed_by_user_id TEXT;
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS created_by_name TEXT;
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE attendance_work_arrangements ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS attendance_work_arrangements_idempotency_key_idx ON attendance_work_arrangements (idempotency_key);
  `);

  await ensureDepartmentsTable();
}

export function ensureDatabaseSchema(): Promise<void> {
  if (!schemaInitialization) {
    schemaInitialization = migrateDatabaseSchema().catch((error: unknown) => {
      schemaInitialization = null;
      throw error;
    });
  }
  return schemaInitialization;
}

// 部门功能独立迁移，保证热更新或旧本地进程也能补齐新增表。
export async function ensureDepartmentsTable() {
  const departmentIdDefault = useLocalTestDatabase ? 'gen_random_uuid()' : 'gen_random_uuid()::text';
  await executeSchemaSql('ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT');
  const table = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name='departments'`,
  );
  if (table.rows.length === 0) {
    await executeSchemaSql(`
      CREATE TABLE departments (
        id TEXT PRIMARY KEY DEFAULT ${departmentIdDefault},
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  await pool.query(`
    INSERT INTO departments (name)
      SELECT DISTINCT department FROM users
      WHERE department IS NOT NULL AND department <> ''
      ON CONFLICT (name) DO NOTHING;
  `);
}

// 通用查询函数
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

// 单行查询
export async function queryOne<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

// pg-mem 把无时区 TIMESTAMP 解析为 UTC，生产 pg 按服务器本地时区解析；
// 读取假条起止时间时按各自约定对称还原成「墙钟」字符串（YYYY-MM-DDTHH:mm:ss），
// 前端因此不需要再判断服务器时区。ponytail: 若未来更换数据库驱动，需要重新核对解析约定。
export function toWallTimeString(value: unknown): string | null {
  if (!(value instanceof Date)) return null;
  if (useLocalTestDatabase) return value.toISOString().slice(0, 19);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

// 把查询结果行中的 start_time/end_time（驱动返回的 Date）还原成墙钟字符串。
export function withWallTime<T extends QueryResultRow>(row: T): T {
  return { ...row, start_time: toWallTimeString(row.start_time), end_time: toWallTimeString(row.end_time) } as T;
}

export function withWallTimes<T extends QueryResultRow>(rows: T[]): T[] {
  return rows.map(withWallTime);
}

export async function withTransaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release?.();
  }
}

export async function lockTransactionKey(client: DatabaseClient, key: string): Promise<void> {
  // pg-mem has no advisory-lock implementation; production PostgreSQL does.
  if (useLocalTestDatabase) return;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

// 关闭连接池（用于优雅关闭）
export async function closePool() {
  await pool.end();
}
