import { loadConfig } from '../../../infrastructure/config/env';
import { WhatsAppWebClient } from '../../../infrastructure/whatsapp/WhatsAppWebClient';
import { HttpServer } from '../../http/HttpServer';
import { SQLiteDatabase } from '../../../infrastructure/database/SQLiteDatabase';
import { SQLiteCampaignRepository } from '../../../infrastructure/database/repositories/SQLiteCampaignRepository';
import { SQLiteMessageJobRepository } from '../../../infrastructure/database/repositories/SQLiteMessageJobRepository';
import { Logger } from '../../../infrastructure/logger/Logger';
import { APP_NAME } from '../../../shared/constants/messages';

let isShuttingDown = false;
let activeClient: WhatsAppWebClient | null = null;

async function main(): Promise<void> {
  const config = loadConfig();

  // Prevent unhandled errors from crashing the server
  process.on('uncaughtException', (error) => {
    Logger.warn(`Error no controlado: ${error.message}`);
  });
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    Logger.warn(`Promise rechazada: ${message}`);
  });

  Logger.header(APP_NAME);
  Logger.info('Modo: HTTP Server + WhatsApp');
  Logger.blank();

  // Initialize database
  const database = new SQLiteDatabase();
  const campaignRepo = new SQLiteCampaignRepository(database.getConnection());
  const messageJobRepo = new SQLiteMessageJobRepository(database.getConnection());

  const httpServer = new HttpServer({
    port: config.httpPort,
    corsOrigin: config.corsOrigin,
    minDelayMs: config.minDelayBetweenMessagesMs,
    maxDelayMs: config.maxDelayBetweenMessagesMs,
    maxMessagesPerRun: config.maxMessagesPerRun,
  });

  httpServer.setDependencies({
    getWhatsAppClient: () => activeClient,
    messageJobRepo,
    campaignRepo,
  });

  await httpServer.start();

  process.on('SIGINT', () => {
    isShuttingDown = true;
    Logger.blank();
    Logger.info('Cerrando...');
    database.close();
    void httpServer.stop().then(() => {
      Logger.success('Servidor cerrado correctamente');
      process.exit(0);
    });
  });

  Logger.blank();
  Logger.info('Inicializando WhatsApp...');
  Logger.info('Escanea el QR desde tu app React o desde la terminal.');
  Logger.blank();

  await connectionLoop(config.whatsappClientId, httpServer);
}

async function connectionLoop(clientId: string, httpServer: HttpServer): Promise<void> {
  while (!isShuttingDown) {
    const whatsAppClient = new WhatsAppWebClient({
      clientId,
      qrObservers: [httpServer],
    });

    activeClient = whatsAppClient;

    try {
      await whatsAppClient.initialize();
      Logger.blank();
      Logger.success('Sesión activa. El servidor HTTP sigue corriendo.');

      await waitForDisconnect(whatsAppClient);

      Logger.warn('Sesión WhatsApp desconectada. Reconectando...');
    } catch (error) {
      if (whatsAppClient.isReady()) {
        await waitForDisconnect(whatsAppClient);
        Logger.warn('Sesión WhatsApp desconectada. Reconectando...');
      } else {
        const message = error instanceof Error ? error.message : String(error);
        Logger.warn(`WhatsApp no se conectó: ${message}`);
      }
    }

    activeClient = null;

    if (isShuttingDown) break;

    try {
      await whatsAppClient.destroy();
    } catch {
      // Ignore destroy errors
    }

    Logger.info('Generando nuevo QR en 2 segundos...');
    Logger.blank();
    await delay(2_000);
  }
}

function waitForDisconnect(client: WhatsAppWebClient): Promise<void> {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (!client.isReady() || isShuttingDown) {
        clearInterval(check);
        resolve();
      }
    }, 2000);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  Logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
