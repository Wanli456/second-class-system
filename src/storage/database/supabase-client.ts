import { Pool } from 'pg';
import { newDb, DataType } from 'pg-mem';

/**
 * 生产环境安全检查
 * 防止在生产环境中误用内存数据库导致数据丢失
 */
function checkProductionDatabaseConfig() {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.COZE_PROJECT_ENV === 'PROD';
  const hasDatabaseUrl = !!process.env.PGDATABASE_URL;

  if (isProduction && !hasDatabaseUrl) {
    throw new Error(
      '🚨 生产环境安全检查失败：缺少 PGDATABASE_URL 环境变量。\n' +
      '在生产环境中使用内存数据库会导致所有数据丢失！\n' +
      '请确保配置了 PGDATABASE_URL 环境变量后再启动服务。\n' +
      '本地开发可以忽略此错误。'
    );
  }
}

// 在模块加载时执行安全检查
try {
  checkProductionDatabaseConfig();
} catch (error) {
  // 在开发环境中给出警告而不是阻止启动
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️  ' + (error as Error).message);
    console.warn('继续使用本地测试数据库进行开发...');
  } else {
    // 生产环境直接抛出错误
    throw error;
  }
}

const useLocalTestDatabase = !process.env.PGDATABASE_URL;

// Keep the same PostgreSQL API locally so the app can be tested without a paid service.
const localDb = useLocalTestDatabase ? newDb({ autoCreateForeignKeyIndices: true }) : null;

if (localDb) {
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
      record_file_url TEXT,
      leader_name TEXT NOT NULL,
      leader_phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '正常活动',
      scoring_status TEXT NOT NULL DEFAULT '待赋分',
      scoring_table_url TEXT,
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
      record_file_url TEXT,
      leader_name TEXT NOT NULL,
      leader_phone TEXT NOT NULL,
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
      activity_name TEXT,
      review_status TEXT NOT NULL DEFAULT '待审核',
      review_note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
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
      can_submit_activity, can_view_submission_status, can_submit_scoring
    ) VALUES
      ('local-admin', '本地管理员', 'test123', '9000000001', 'admin', false, false, false, false, false, false),
      ('local-publisher', '本地发布干事', 'test123', '9000000002', 'publisher', true, false, false, false, false, false),
      ('local-scorer', '本地赋分干事', 'test123', '9000000003', 'scorer', false, true, false, false, false, false),
      ('local-leave-reviewer', '本地请假审核员', 'test123', '9000000004', 'leave_reviewer', false, false, true, false, false, false),
      ('local-leader', '本地负责人', 'test123', '9000000005', 'leader', false, false, false, true, true, true),
      ('local-student', '本地学生', 'test123', '9000000006', 'student', false, false, false, false, false, false);
  `);

  console.log('🟢 本地开发模式：使用内存测试数据库（重启后数据清空）');
  console.log('🔑 测试账户：');
  console.log('   - 管理员：学号 9000000001 / 密码 test123');
  console.log('   - 发布干事：学号 9000000002 / 密码 test123');
  console.log('   - 赋分干事：学号 9000000003 / 密码 test123');
  console.log('   - 请假审核员：学号 9000000004 / 密码 test123');
  console.log('   - 活动负责人：学号 9000000005 / 密码 test123');
  console.log('   - 学生：学号 9000000006 / 密码 test123');
  console.log('💡 如需持久化数据，请配置 PGDATABASE_URL 环境变量');
}

const pool = useLocalTestDatabase
  ? new (localDb!.adapters.createPg().Pool)()
  : new Pool({
      connectionString: process.env.PGDATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

export async function ensureDatabaseSchema() {
  if (useLocalTestDatabase) return;

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_activity BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_submission_status BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_submit_scoring BOOLEAN NOT NULL DEFAULT false;
  `);
}

// 通用查询函数
export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const result = await pool.query(sql, params);
  return result.rows as any[];
}

// 单行查询
export async function queryOne(sql: string, params: any[] = []): Promise<any | null> {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// 关闭连接池（用于优雅关闭）
export async function closePool() {
  await pool.end();
}
