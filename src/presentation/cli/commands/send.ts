import fs from 'fs';
import { loadConfig } from '../../../infrastructure/config/env';
import { WhatsAppWebClient } from '../../../infrastructure/whatsapp/WhatsAppWebClient';
import { SQLiteDatabase } from '../../../infrastructure/database/SQLiteDatabase';
import { SQLiteCampaignRepository } from '../../../infrastructure/database/repositories/SQLiteCampaignRepository';
import { SQLiteMessageJobRepository } from '../../../infrastructure/database/repositories/SQLiteMessageJobRepository';
import { ExcelContactReader } from '../../../infrastructure/spreadsheet/ExcelContactReader';
import { PhoneNormalizer } from '../../../domain/services/PhoneNormalizer';
import { SendCampaign } from '../../../application/use-cases/SendCampaign';
import { Logger } from '../../../infrastructure/logger/Logger';
import { RAFFLE_MESSAGE } from '../../../domain/messages/raffle-message';
import { APP_NAME } from '../../../shared/constants/messages';
import { ConfigurationError } from '../../../shared/errors';

async function main(): Promise<void> {
  const config = loadConfig();

  Logger.header(APP_NAME);
  Logger.info('Modo: BULK - Envío masivo');
  Logger.blank();

  // 1. Validate bulk send is enabled
  if (!config.enableBulkSend) {
    Logger.error('El envío masivo está deshabilitado.');
    Logger.info('Para habilitarlo, cambia ENABLE_BULK_SEND=true en .env');
    process.exit(1);
  }

  // 2. Validate Excel
  Logger.section('Validar Excel');
  if (!fs.existsSync(config.excelPath)) {
    Logger.error(`Archivo no encontrado: ${config.excelPath}`);
    process.exit(1);
  }

  const excelReader = new ExcelContactReader();
  const info = excelReader.getInfo(config.excelPath);
  Logger.success(`Archivo: ${info.fileName}`);
  Logger.success(`Hoja: ${info.sheetName}`);
  Logger.success(`Columnas: ${info.columns.join(', ')}`);
  Logger.success(`Registros: ${info.totalRows}`);

  // 3. Validate image
  Logger.section('Validar imagen');
  if (!fs.existsSync(config.campaignImagePath)) {
    Logger.error(`Imagen no encontrada: ${config.campaignImagePath}`);
    process.exit(1);
  }
  Logger.success(`Imagen encontrada: ${config.campaignImagePath}`);

  // 4. Initialize WhatsApp
  Logger.section('Inicializar WhatsApp');
  const whatsAppClient = new WhatsAppWebClient({
    clientId: config.whatsappClientId,
  });

  await whatsAppClient.initialize();

  if (!whatsAppClient.isReady()) {
    Logger.error('WhatsApp no está listo');
    process.exit(1);
  }

  // 5. Initialize database and services
  const database = new SQLiteDatabase();
  const campaignRepo = new SQLiteCampaignRepository(database.getConnection());
  const messageJobRepo = new SQLiteMessageJobRepository(database.getConnection());
  const phoneNormalizer = new PhoneNormalizer();

  // 6. Execute campaign
  const sendCampaign = new SendCampaign(
    whatsAppClient,
    messageJobRepo,
    campaignRepo,
    excelReader,
    phoneNormalizer,
    config,
  );

  try {
    await sendCampaign.execute(RAFFLE_MESSAGE);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      Logger.error(error.message);
    } else {
      Logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  // Cleanup
  Logger.blank();
  Logger.info('Cerrando conexiones...');
  await whatsAppClient.destroy();
  database.close();
  Logger.success('Finalizado');
  process.exit(0);
}

main().catch((error) => {
  Logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
