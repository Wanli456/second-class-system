import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { ensureDatabaseSchema } from '@/storage/database/supabase-client';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // 生产环境安全检查：确保 PGDATABASE_URL 已配置
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.env.PGDATABASE_URL) {
    console.error(
      '🚨 生产环境安全检查失败：缺少 PGDATABASE_URL 环境变量。\n' +
      '请确保在部署环境中配置了 PGDATABASE_URL。'
    );
    process.exit(1);
  }

  try {
    await ensureDatabaseSchema();
  } catch (error) {
    console.error('Database schema migration failed:', error);
    process.exit(1);
  }

  const server = createServer(async (req, res) => {
    try {
      if (dev) res.setHeader('Cache-Control', 'no-store, max-age=0');
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : 'production'
      }`,
    );
  });
});
