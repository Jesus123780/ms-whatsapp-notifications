import { Campaign } from '../entities/Campaign';

export interface CampaignRepository {
  save(campaign: Campaign): Campaign;
  findByName(name: string): Campaign | null;
  findById(id: number): Campaign | null;
}
