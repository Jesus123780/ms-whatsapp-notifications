import fs from 'fs';
import { loadConfig } from '../../../infrastructure/config/env';
import { WhatsAppWebClient } from '../../../infrastructure/whatsapp/WhatsAppWebClient';
import { SQLiteDatabase } from '../../../infrastructure/database/SQLiteDatabase';
import { SQLiteCampaignRepository } from '../../../infrastructure/database/repositories/SQLiteCampaignRepository';
import { SQLiteMessageJobRepository } from '../../../infrastructure/database/repositories/SQLiteMessageJobRepository';
import { ExcelContactReader } from '../../../infrastructure/spreadsheet/ExcelContactReader';
import { SendTestMessage } from '../../../application/use-cases/SendTestMessage';
import { Logger } from '../../../infrastructure/logger/Logger';
import { RAFFLE_MESSAGE } from '../../../domain/messages/raffle-message';
import { APP_NAME } from '../../../shared/constants/messages';

async function main(): Promise<void> {
  const config = loadConfig();

  Logger.header(APP_NAME);
  Logger.info('Modo: TEST - Envío de prueba');
  Logger.blank();

  // 1. Validate config
  Logger.section('1. Validar configuración');
  Logger.success('.env cargado');

  // 2. Validate Excel
  Logger.section('2. Validar Excel');
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
  Logger.section('3. Validar imagen');
  if (!fs.existsSync(config.campaignImagePath)) {
    Logger.error(`Imagen no encontrada: ${config.campaignImagePath}`);
    process.exit(1);
  }

  const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const ext = config.campaignImagePath.toLowerCase().split('.').pop();
  if (!ext || !validExtensions.includes(`.${ext}`)) {
    Logger.error(`Extensión de imagen no válida: .${ext ?? 'none'}`);
    process.exit(1);
  }

  Logger.success(`Imagen encontrada: ${config.campaignImagePath}`);

  // 4. Initialize WhatsApp
  Logger.section('4. Inicializar WhatsApp');
  const whatsAppClient = new WhatsAppWebClient({
    clientId: config.whatsappClientId,
  });

  await whatsAppClient.initialize();

  // 5. Initialize database
  const database = new SQLiteDatabase();
  const campaignRepo = new SQLiteCampaignRepository(database.getConnection());
  const messageJobRepo = new SQLiteMessageJobRepository(database.getConnection());

  // 6. Execute test send
  const sendTest = new SendTestMessage(whatsAppClient, messageJobRepo, campaignRepo, config);

  await sendTest.execute(RAFFLE_MESSAGE);

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
