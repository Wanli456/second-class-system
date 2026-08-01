import { Pool } from 'pg';

// 使用扣子平台的本地 PostgreSQL 数据库
const pool = new Pool({
  connectionString: process.env.PGDATABASE_URL,
});

// 通用查询函数
export async function query(sql: string, params: any[] = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// 单行查询
export async function queryOne(sql: string, params: any[] = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// 关闭连接池（用于优雅关闭）
export async function closePool() {
  await pool.end();
}
