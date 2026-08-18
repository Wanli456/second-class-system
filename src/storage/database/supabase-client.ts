import { Pool, type QueryResultRow } from 'pg';
import { newDb, DataType } from 'pg-mem';

const useLocalTestDatabase = !process.env.PGDATABASE_URL;

type DatabasePool = {
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  connect: () => Promise<DatabaseClient>;
  end: () => Promise<void>;
};

type DatabaseClient = Pick<DatabasePool, 'query'> & { release?: () => void };

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
      can_review_leave BOOLEAN NOT NULL DEFAULT false,
      can_view_evening_study BOOLEAN NOT NULL DEFAULT false,
      can_start_group_leave BOOLEAN NOT NULL DEFAULT false,
      department TEXT,
      class_name TEXT,
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
      category TEXT NOT NULL,
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
      activity_submitter_id TEXT,
      activity_submitter_name TEXT,
      activity_submitter_student_id TEXT,
      scoring_material_submitter_id TEXT,
      status TEXT NOT NULL DEFAULT '正常活动',
      scoring_status TEXT NOT NULL DEFAULT '待赋分',
      scoring_table_url TEXT,
      scoring_table_file_name TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE activity_submissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      category TEXT NOT NULL,
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
      activity_submitter_id TEXT,
      activity_submitter_name TEXT,
      activity_submitter_student_id TEXT,
      activity_id TEXT,
      scoring_material_submitter_id TEXT,
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
      can_start_group_leave, department, class_name
    ) VALUES
      ('local-admin', '本地管理员', 'test123', '9000000001', 'admin', false, false, false, false, false, false, true, '学生会', '计算机2101'),
      ('local-publisher', '本地活动审核员', 'test123', '9000000002', 'student', true, false, false, false, false, false, false, '学生会', '计算机2101'),
      ('local-scorer', '本地活动赋分员', 'test123', '9000000003', 'student', false, true, false, false, false, false, false, '学生会', '计算机2101'),
      ('local-leave-reviewer', '本地请假审核员', 'test123', '9000000004', 'student', false, false, true, false, false, false, false, '学生会', '计算机2101'),
      ('local-leader', '本地负责人', 'test123', '9000000005', 'leader', false, false, false, true, true, true, true, '学生会', '计算机2101'),
      ('local-student', '本地学生', 'test123', '9000000006', 'student', false, false, false, false, false, false, false, '学生会', '计算机2101');

    INSERT INTO class_roster (class_name, student_id, student_name) VALUES
      ('计算机2101', '9000000001', '本地管理员'),
      ('计算机2101', '9000000002', '本地发布干事'),
      ('计算机2101', '9000000003', '本地赋分干事'),
      ('计算机2101', '9000000004', '本地请假审核员'),
      ('计算机2101', '9000000005', '本地负责人'),
      ('计算机2101', '9000000006', '本地学生'),
      ('计算机2101', '9000000007', '本地未注册学生');

    INSERT INTO departments (name) VALUES ('学生会') ON CONFLICT (name) DO NOTHING;
  `);

  console.log('🟢 本地开发模式：使用内存测试数据库（重启后数据清空）');
  console.log('🔑 测试账户：');
  console.log('   - 管理员：学号 9000000001 / 密码 test123');
  console.log('   - 活动审核权限：学号 9000000002 / 密码 test123');
  console.log('   - 活动赋分权限：学号 9000000003 / 密码 test123');
  console.log('   - 请假审核权限：学号 9000000004 / 密码 test123');
  console.log('   - 部门负责人：学号 9000000005 / 密码 test123');
  console.log('   - 学生：学号 9000000006 / 密码 test123');
  console.log('💡 如需持久化数据，请配置 PGDATABASE_URL 环境变量');
}

const pool: DatabasePool = useLocalTestDatabase
  ? runtimeGlobal.__secondClassLocalDatabase?.pool ?? new (localDb!.adapters.createPg().Pool)() as DatabasePool
  : new Pool({
      connectionString: process.env.PGDATABASE_URL,
      ssl: { rejectUnauthorized: false },
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
  await executeSchemaSql(`
    UPDATE users SET role='student' WHERE role IN ('publisher','scorer','leave_reviewer');
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_publish BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_score BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_activity BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_submission_status BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_scoring BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_review_leave BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_evening_study BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_start_group_leave BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS class_name TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scope_type TEXT DEFAULT 'department';
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scope_name TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scope_names TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS leader_ids TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_submitter_id TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_submitter_name TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_submitter_student_id TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS scoring_material_submitter_id TEXT;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS plan_file_name TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS record_file_name TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS record_photo_url TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS record_photo_file_name TEXT;
     ALTER TABLE activities ADD COLUMN IF NOT EXISTS scoring_table_file_name TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scope_type TEXT DEFAULT 'department';
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scope_name TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scope_names TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS leader_ids TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_submitter_id TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_submitter_name TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_submitter_student_id TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scoring_material_submitter_id TEXT;
    ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS plan_file_name TEXT;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS record_file_name TEXT;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_id TEXT;
     ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS scoring_table_file_name TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applicant_user_id TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applicant_name TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applicant_student_id TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS group_id TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_image_name TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS activity_id TEXT;
  `);

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

// 关闭连接池（用于优雅关闭）
export async function closePool() {
  await pool.end();
}
