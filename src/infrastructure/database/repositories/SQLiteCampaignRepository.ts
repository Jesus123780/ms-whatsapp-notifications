import Database from 'better-sqlite3';
import { Campaign } from '../../../domain/entities/Campaign';
import { CampaignRepository } from '../../../domain/ports/CampaignRepository';

interface CampaignRow {
  id: number;
  name: string;
  message: string;
  image_path: string;
  created_at: string;
}

export class SQLiteCampaignRepository implements CampaignRepository {
  constructor(private readonly db: Database.Database) {}

  save(campaign: Campaign): Campaign {
    const stmt = this.db.prepare(
      'INSERT INTO campaigns (name, message, image_path, created_at) VALUES (?, ?, ?, ?)',
    );

    const result = stmt.run(
      campaign.name,
      campaign.message,
      campaign.imagePath,
      campaign.createdAt.toISOString(),
    );

    return new Campaign({
      id: result.lastInsertRowid as number,
      name: campaign.name,
      message: campaign.message,
      imagePath: campaign.imagePath,
      createdAt: campaign.createdAt,
    });
  }

  findByName(name: string): Campaign | null {
    const stmt = this.db.prepare('SELECT * FROM campaigns WHERE name = ?');
    const row = stmt.get(name) as CampaignRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  findById(id: number): Campaign | null {
    const stmt = this.db.prepare('SELECT * FROM campaigns WHERE id = ?');
    const row = stmt.get(id) as CampaignRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: CampaignRow): Campaign {
    return new Campaign({
      id: row.id,
      name: row.name,
      message: row.message,
      imagePath: row.image_path,
      createdAt: new Date(row.created_at),
    });
  }
}
