import tls from 'node:tls';

const SMTP_TIMEOUT_MS = 15000;

type SendEmailInput = { to: string; subject: string; text: string };

function readResponse(socket: tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      clearTimeout(timer);
    };
    const finish = (callback: () => void) => { cleanup(); callback(); };
    const timer = setTimeout(() => finish(() => reject(new Error('SMTP 响应超时'))), SMTP_TIMEOUT_MS);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) finish(() => resolve(buffer.trim()));
    };
    const onError = (error: Error) => finish(() => reject(error));
    const onClose = () => finish(() => reject(new Error('SMTP 连接已关闭')));
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

function encodedHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
}

/** 用 QQ 邮箱 SMTP（465 隐式 TLS）发送一封纯文本邮件。 */
export async function sendEmail(input: SendEmailInput) {
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;
  if (!user || !password || !from) throw new Error('SMTP 配置不完整');

  const socket = tls.connect({
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: Number(process.env.SMTP_PORT || 465),
  });
  socket.setTimeout(SMTP_TIMEOUT_MS);

  try {
    await readResponse(socket);
    const command = async (value: string, expected = 250) => {
      if (value) socket.write(`${value}\r\n`);
      const response = await readResponse(socket);
      const code = Number(response.slice(0, 3));
      if (code !== expected) throw new Error(`SMTP ${code}: ${response.split(/\r?\n/).pop()}`);
      return response;
    };

    await command(`EHLO ${from.split('@')[1] || 'localhost'}`);
    await command('AUTH LOGIN', 334);
    await command(Buffer.from(user, 'utf8').toString('base64'), 334);
    await command(Buffer.from(password, 'utf8').toString('base64'), 235);
    await command(`MAIL FROM:<${from}>`);
    await command(`RCPT TO:<${input.to}>`);
    await command('DATA', 354);
    socket.write([
      `From: ${from}`,
      `To: ${input.to}`,
      `Subject: ${encodedHeader(input.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      input.text.replace(/(^|\r\n)\./g, '$1..'),
      '.',
      '',
    ].join('\r\n'));
    const done = await readResponse(socket);
    if (Number(done.slice(0, 3)) !== 250) throw new Error(`SMTP 发送失败: ${done}`);
    await command('QUIT', 221);
  } finally {
    socket.destroy();
  }
}