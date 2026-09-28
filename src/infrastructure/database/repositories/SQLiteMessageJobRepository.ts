import Database from 'better-sqlite3';
import { MessageJob, MessageJobStatus } from '../../../domain/entities/MessageJob';
import { MessageJobRepository } from '../../../domain/ports/MessageJobRepository';

interface MessageJobRow {
  id: number;
  campaign_id: number;
  name: string;
  phone_original: string;
  phone_normalized: string;
  chat_id: string;
  status: string;
  error_message: string | null;
  message_type: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export class SQLiteMessageJobRepository implements MessageJobRepository {
  constructor(private readonly db: Database.Database) {}

  save(job: MessageJob): MessageJob {
    const stmt = this.db.prepare(`
      INSERT INTO message_jobs
        (campaign_id, name, phone_original, phone_normalized, chat_id, status, error_message, message_type, sent_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      job.campaignId,
      job.name,
      job.phoneOriginal,
      job.phoneNormalized,
      job.chatId,
      job.status,
      job.errorMessage ?? null,
      job.messageType,
      job.sentAt?.toISOString() ?? null,
      job.createdAt.toISOString(),
      job.updatedAt.toISOString(),
    );

    return new MessageJob({
      id: result.lastInsertRowid as number,
      campaignId: job.campaignId,
      name: job.name,
      phoneOriginal: job.phoneOriginal,
      phoneNormalized: job.phoneNormalized,
      chatId: job.chatId,
      status: job.status,
      errorMessage: job.errorMessage,
      messageType: job.messageType,
      sentAt: job.sentAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  }

  update(job: MessageJob): void {
    const stmt = this.db.prepare(`
      UPDATE message_jobs
      SET status = ?, error_message = ?, sent_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      job.status,
      job.errorMessage ?? null,
      job.sentAt?.toISOString() ?? null,
      job.updatedAt.toISOString(),
      job.id,
    );
  }

  findByCampaignAndPhone(campaignId: number, phoneNormalized: string): MessageJob | null {
    const stmt = this.db.prepare(
      'SELECT * FROM message_jobs WHERE campaign_id = ? AND phone_normalized = ?',
    );
    const row = stmt.get(campaignId, phoneNormalized) as MessageJobRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  findByCampaignAndStatus(campaignId: number, status: MessageJobStatus): MessageJob[] {
    const stmt = this.db.prepare(
      'SELECT * FROM message_jobs WHERE campaign_id = ? AND status = ?',
    );
    const rows = stmt.all(campaignId, status) as MessageJobRow[];
    return rows.map((row) => this.mapRow(row));
  }

  countByCampaignAndStatus(campaignId: number, status: MessageJobStatus): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM message_jobs WHERE campaign_id = ? AND status = ?',
    );
    const result = stmt.get(campaignId, status) as { count: number };
    return result.count;
  }

  private mapRow(row: MessageJobRow): MessageJob {
    return new MessageJob({
      id: row.id,
      campaignId: row.campaign_id,
      name: row.name,
      phoneOriginal: row.phone_original,
      phoneNormalized: row.phone_normalized,
      chatId: row.chat_id,
      status: row.status as MessageJobStatus,
      errorMessage: row.error_message ?? undefined,
      messageType: row.message_type,
      sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
