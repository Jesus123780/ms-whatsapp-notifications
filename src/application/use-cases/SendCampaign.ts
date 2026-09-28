import { WhatsAppClientPort } from '../../domain/ports/WhatsAppClientPort';
import { MessageJobRepository } from '../../domain/ports/MessageJobRepository';
import { CampaignRepository } from '../../domain/ports/CampaignRepository';
import { SpreadsheetReader } from '../../domain/ports/SpreadsheetReader';
import { MessageJob, MessageJobStatus } from '../../domain/entities/MessageJob';
import { Campaign } from '../../domain/entities/Campaign';
import { Contact } from '../../domain/entities/Contact';
import { PhoneNormalizer } from '../../domain/services/PhoneNormalizer';
import { Logger } from '../../infrastructure/logger/Logger';
import { AppConfig, SendMode } from '../../infrastructure/config/env';
import { sleep, randomDelay } from '../../shared/utils/delay';
import { withRetry } from '../../shared/utils/retry';
import { CAMPAIGN_NAME } from '../../shared/constants/messages';
import { ConfigurationError } from '../../shared/errors';

export interface CampaignResult {
  total: number;
  sent: number;
  failed: number;
  notRegistered: number;
  skipped: number;
}

export class SendCampaign {
  private cancelled = false;

  constructor(
    private readonly whatsAppClient: WhatsAppClientPort,
    private readonly messageJobRepo: MessageJobRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly spreadsheetReader: SpreadsheetReader,
    private readonly phoneNormalizer: PhoneNormalizer,
    private readonly config: AppConfig,
  ) {
    this.setupGracefulShutdown();
  }

  async execute(message: string): Promise<CampaignResult> {
    // 1. Validate bulk send enabled
    if (!this.config.enableBulkSend) {
      throw new ConfigurationError(
        'El envío masivo está deshabilitado. Cambia ENABLE_BULK_SEND=true en .env',
      );
    }

    // 2. Read and normalize contacts
    const rawContacts = this.spreadsheetReader.read(this.config.excelPath);
    const { validContacts, duplicatesRemoved, invalidCount, totalRaw } =
      this.phoneNormalizer.normalize(rawContacts);

    // 3. Get or create campaign
    let campaign = this.campaignRepo.findByName(CAMPAIGN_NAME);
    if (!campaign) {
      campaign = this.campaignRepo.save(
        new Campaign({
          name: CAMPAIGN_NAME,
          message,
          imagePath: this.config.campaignImagePath,
        }),
      );
    }

    const campaignId = campaign.id as number;

    // 4. Filter already sent
    const pendingContacts = validContacts.filter((contact) => {
      const existing = this.messageJobRepo.findByCampaignAndPhone(
        campaignId,
        contact.normalizedPhone,
      );
      return !existing || existing.status !== MessageJobStatus.SENT;
    });

    const alreadySent = validContacts.length - pendingContacts.length;

    // 5. Apply limit
    const limit = this.config.maxMessagesPerRun;
    const contactsToSend =
      limit === 0 ? pendingContacts : pendingContacts.slice(0, limit);

    // 6. Show summary and request confirmation
    this.showSummary({
      totalRaw,
      validCount: validContacts.length,
      duplicatesRemoved,
      invalidCount,
      alreadySent,
      pendingCount: pendingContacts.length,
      limit,
      toSendCount: contactsToSend.length,
    });

    // Handle no-limit warning
    if (limit === 0) {
      Logger.warn('ADVERTENCIA: No existe límite de mensajes.');
      Logger.blank();
    }

    const confirmed = await this.waitForConfirmation();
    if (!confirmed) {
      Logger.warn('Envío cancelado por el usuario');
      return { total: 0, sent: 0, failed: 0, notRegistered: 0, skipped: 0 };
    }

    // 7. Send messages
    const result = await this.sendMessages(contactsToSend, campaign, message);

    // 8. Show final summary
    this.showFinalSummary(result);

    return result;
  }

  private async sendMessages(
    contacts: Contact[],
    campaign: Campaign,
    message: string,
  ): Promise<CampaignResult> {
    const result: CampaignResult = {
      total: contacts.length,
      sent: 0,
      failed: 0,
      notRegistered: 0,
      skipped: 0,
    };

    Logger.blank();
    Logger.header('INICIANDO ENVÍO');

    for (let i = 0; i < contacts.length; i++) {
      if (this.cancelled) {
        Logger.warn('Cancelación solicitada. Deteniendo envío...');
        break;
      }

      const contact = contacts[i];
      if (!contact) continue;
      Logger.progress(i + 1, contacts.length, `${contact.name}`);

      // Check idempotency
      const existing = this.messageJobRepo.findByCampaignAndPhone(
        campaign.id as number,
        contact.normalizedPhone,
      );

      if (existing && existing.status === MessageJobStatus.SENT) {
        Logger.info('  Ya enviado anteriormente');
        result.skipped++;
        continue;
      }

      // Create job
      const job = new MessageJob({
        campaignId: campaign.id as number,
        name: contact.name,
        phoneOriginal: contact.phoneOriginal,
        phoneNormalized: contact.normalizedPhone,
        chatId: contact.chatId,
        status: MessageJobStatus.PROCESSING,
        messageType: this.config.sendMode,
      });

      const savedJob = this.messageJobRepo.save(job);

      // Validate number
      try {
        const numberId = await this.whatsAppClient.getNumberId(contact.normalizedPhone);
        if (!numberId) {
          savedJob.markAsNotRegistered();
          this.messageJobRepo.update(savedJob);
          Logger.info('  No registrado en WhatsApp');
          result.notRegistered++;
          continue;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        savedJob.markAsFailed(`Error validando número: ${errorMsg}`);
        this.messageJobRepo.update(savedJob);
        result.failed++;
        continue;
      }

      // Send with retry
      try {
        await withRetry(
          () => this.sendMessage(contact.chatId, message),
          {
            maxRetries: this.config.maxRetries,
            shouldRetry: (err) => !err.message.includes('NOT_REGISTERED'),
          },
        );

        savedJob.markAsSent();
        this.messageJobRepo.update(savedJob);
        Logger.success('Enviado');
        result.sent++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        savedJob.markAsFailed(errorMsg);
        this.messageJobRepo.update(savedJob);
        Logger.error(`Error: ${errorMsg}`);
        result.failed++;
      }

      // Delay before next contact (unless it's the last one)
      if (i < contacts.length - 1 && !this.cancelled) {
        const delay = randomDelay(
          this.config.minDelayBetweenMessagesMs,
          this.config.maxDelayBetweenMessagesMs,
        );
        Logger.info(`  Esperando ${(delay / 1000).toFixed(1)} segundos...`);
        await sleep(delay);
      }
    }

    return result;
  }

  private async sendMessage(chatId: string, message: string): Promise<void> {
    if (this.config.sendMode === SendMode.MEDIA_WITH_CAPTION) {
      await this.whatsAppClient.sendMedia(chatId, this.config.campaignImagePath, message);
    } else {
      await this.whatsAppClient.sendText(chatId, message);
      await sleep(this.config.delayBetweenTextAndImageMs);
      await this.whatsAppClient.sendMedia(chatId, this.config.campaignImagePath);
    }
  }

  private showSummary(data: {
    totalRaw: number;
    validCount: number;
    duplicatesRemoved: number;
    invalidCount: number;
    alreadySent: number;
    pendingCount: number;
    limit: number;
    toSendCount: number;
  }): void {
    Logger.header('RESUMEN DE CAMPAÑA');
    Logger.info(`Campaña: ${CAMPAIGN_NAME}`);
    Logger.blank();
    Logger.info(`Contactos Excel: ${data.totalRaw}`);
    Logger.info(`Contactos válidos: ${data.validCount}`);
    Logger.info(`Duplicados eliminados: ${data.duplicatesRemoved}`);
    Logger.info(`Inválidos: ${data.invalidCount}`);
    Logger.info(`Ya enviados: ${data.alreadySent}`);
    Logger.info(`Pendientes: ${data.pendingCount}`);
    Logger.blank();
    Logger.info(`Límite por ejecución: ${data.limit === 0 ? 'Sin límite' : data.limit}`);
    Logger.info(`Se enviarán: ${data.toSendCount}`);
    Logger.blank();
    Logger.info(
      `Delay: ${this.config.minDelayBetweenMessagesMs} - ${this.config.maxDelayBetweenMessagesMs} ms`,
    );
    Logger.info(`Imagen: ✓`);
    Logger.info(`WhatsApp: ✓ READY`);
    Logger.separator();
  }

  private showFinalSummary(result: CampaignResult): void {
    Logger.header('RESUMEN FINAL');
    Logger.info(`Total procesados: ${result.total}`);
    Logger.info(`Enviados: ${result.sent}`);
    Logger.info(`Fallidos: ${result.failed}`);
    Logger.info(`No registrados en WhatsApp: ${result.notRegistered}`);
    Logger.info(`Ya enviados (skipped): ${result.skipped}`);
    Logger.separator();
  }

  private waitForConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      Logger.blank();
      Logger.info('Escribe CONFIRMAR para comenzar:');
      Logger.blank();

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const readline = require('readline') as typeof import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('  > ', (answer: string) => {
        rl.close();
        resolve(answer.trim() === 'CONFIRMAR');
      });
    });
  }

  private setupGracefulShutdown(): void {
    process.on('SIGINT', () => {
      Logger.blank();
      Logger.warn('Cancelación solicitada.');
      Logger.info('Esperando finalizar la operación actual...');
      this.cancelled = true;
    });
  }
}
