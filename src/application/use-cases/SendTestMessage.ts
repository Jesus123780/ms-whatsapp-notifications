import { WhatsAppClientPort } from '../../domain/ports/WhatsAppClientPort';
import { MessageJobRepository } from '../../domain/ports/MessageJobRepository';
import { CampaignRepository } from '../../domain/ports/CampaignRepository';
import { MessageJob, MessageJobStatus } from '../../domain/entities/MessageJob';
import { Campaign } from '../../domain/entities/Campaign';
import { PhoneNumber } from '../../domain/value-objects/PhoneNumber';
import { Logger } from '../../infrastructure/logger/Logger';
import { AppConfig, SendMode } from '../../infrastructure/config/env';
import { sleep } from '../../shared/utils/delay';
import { CAMPAIGN_NAME } from '../../shared/constants/messages';

export class SendTestMessage {
  constructor(
    private readonly whatsAppClient: WhatsAppClientPort,
    private readonly messageJobRepo: MessageJobRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly config: AppConfig,
  ) {}

  async execute(message: string): Promise<void> {
    const phoneNumber = PhoneNumber.create(this.config.testPhone);
    
    Logger.section('CONTACTO DE PRUEBA');
    Logger.info(`Nombre: ${this.config.testName}`);
    Logger.info(`Teléfono: ${phoneNumber.formatted}`);
    Logger.info(`Chat ID: ${phoneNumber.chatId}`);
    Logger.blank();

    // Validate number exists in WhatsApp
    Logger.info('Validando WhatsApp...');
    const numberId = await this.whatsAppClient.getNumberId(phoneNumber.value);

    if (!numberId) {
      Logger.error('El número no está registrado en WhatsApp');
      return;
    }

    // Always use the @c.us format for sending messages
    const actualChatId = `${phoneNumber.value}@c.us`;

    Logger.success(`Número registrado en WhatsApp`);
    Logger.blank();

    // Show preview
    Logger.header('PREVIEW DEL ENVÍO');
    Logger.info(`Nombre: ${this.config.testName}`);
    Logger.info(`Teléfono: ${phoneNumber.formatted}`);
    Logger.blank();
    Logger.info('Mensaje:');
    Logger.blank();
    console.log(message);
    Logger.blank();
    Logger.info(`Imagen: ${this.config.campaignImagePath}`);
    Logger.separator();

    // Wait for confirmation
    const confirmed = await this.waitForConfirmation();
    if (!confirmed) {
      Logger.warn('Envío cancelado por el usuario');
      return;
    }

    // Get or create campaign
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

    // Check idempotency
   const existingJob = this.messageJobRepo.findByCampaignAndPhone(
     campaignId,
     phoneNumber.value,
   );

   if (existingJob && existingJob.status === MessageJobStatus.SENT) {
     Logger.warn('Este contacto ya recibió esta campaña anteriormente');
     return;
   }

    // Create and save job
    const job = new MessageJob({
      campaignId,
      name: this.config.testName,
      phoneOriginal: this.config.testPhone,
      phoneNormalized: phoneNumber.value,
      chatId: actualChatId,
      status: MessageJobStatus.PROCESSING,
      messageType: this.config.sendMode,
    });

    const savedJob = this.messageJobRepo.save(job);

    // Send message
    Logger.blank();
    Logger.info('Enviando...');
    Logger.info(`Chat ID: ${actualChatId}`);
    Logger.info(`Modo: ${this.config.sendMode}`);

    try {
      await this.sendMessage(actualChatId, message);
      savedJob.markAsSent();
      this.messageJobRepo.update(savedJob);
      Logger.success('Mensaje enviado correctamente');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      savedJob.markAsFailed(errorMsg);
      this.messageJobRepo.update(savedJob);
      Logger.error(`Error enviando mensaje: ${errorMsg}`);
    }
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

  private waitForConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      Logger.blank();
      Logger.info('¿Enviar mensaje de prueba?');
      Logger.blank();
      Logger.info('Escribe: ENVIAR');
      Logger.blank();

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const readline = require('readline') as typeof import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('  > ', (answer: string) => {
        rl.close();
        resolve(answer.trim() === 'ENVIAR');
      });
    });
  }
}
