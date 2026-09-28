import { MessageJob, MessageJobStatus } from '../entities/MessageJob';

export interface MessageJobRepository {
  save(job: MessageJob): MessageJob;
  update(job: MessageJob): void;
  findByCampaignAndPhone(campaignId: number, phoneNormalized: string): MessageJob | null;
  findByCampaignAndStatus(campaignId: number, status: MessageJobStatus): MessageJob[];
  countByCampaignAndStatus(campaignId: number, status: MessageJobStatus): number;
}
