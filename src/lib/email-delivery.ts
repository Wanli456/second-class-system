import { query } from '@/storage/database/supabase-client';
import { sendEmail, smtpConfigured } from '@/lib/email-smtp';

type DeliveryRow = {
  id: string;
  recipient_email: string;
  subject: string;
  content: string;
  retry_count: number;
};

/**
 * 投递待发邮件。
 *
 * 业务请求只负责入队，这里再真正连 SMTP：邮件失败不会影响业务，
 * 失败最多重试 3 次，下次有通知产生时会顺带重试。
 */
export async function processEmailDeliveries(limit = 5) {
  if (!smtpConfigured()) return { sent: 0, failed: 0 };
  const deliveries = await query<DeliveryRow>(
    "SELECT id,recipient_email,subject,content,retry_count FROM email_deliveries WHERE status='pending' OR (status='failed' AND retry_count<3) ORDER BY created_at LIMIT $1",
    [limit],
  );
  const sent: string[] = [];
  const failed: string[] = [];
  for (const delivery of deliveries) {
    try {
      await sendEmail({ to: delivery.recipient_email, subject: delivery.subject, text: delivery.content });
      sent.push(delivery.id);
    } catch (error) {
      failed.push(delivery.id);
      console.error('邮件发送失败:', delivery.id, error instanceof Error ? error.message : error);
    }
  }
  const ids = (list: string[]) => list.map((_, index) => '$' + (index + 1)).join(',');
  if (sent.length) {
    await query(`UPDATE email_deliveries SET status='success',last_error=NULL,updated_at=NOW() WHERE id IN (${ids(sent)})`, sent);
  }
  if (failed.length) {
    await query(`UPDATE email_deliveries SET status='failed',retry_count=retry_count+1,last_error='SMTP 发送失败',updated_at=NOW() WHERE id IN (${ids(failed)})`, failed);
  }
  return { sent: sent.length, failed: failed.length };
}