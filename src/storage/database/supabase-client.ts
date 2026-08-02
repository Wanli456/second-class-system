import { Pool } from 'pg';
import { newDb, DataType } from 'pg-mem';

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

  console.log('PGDATABASE_URL 未配置，当前使用本地测试数据库；重启开发服务器后数据会清空。');
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
